"""Scan Room — structured-light auto-calibration (spec §3C).

Sweeps binary Gray code patterns through the projector, decodes the camera's
view of each pattern to recover a projector-pixel -> camera-pixel
correspondence, and fits a homography + thin-plate-spline mesh warp from
that correspondence. The result is a 33x33 deformation mesh tensor saved to
`calibration_matrix.json`, which `render_engine`'s warp shader samples as a
per-vertex displacement lookup.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

MESH_RESOLUTION = 33  # §3C.5: "localized 33x33 deformation mesh tensor"


@dataclass
class GrayCodePatternSet:
    """The sequence of patterns projected during a Scan Room pass."""

    width: int
    height: int
    patterns: list[np.ndarray] = field(default_factory=list)

    @classmethod
    def generate(cls, width: int, height: int) -> "GrayCodePatternSet":
        """Builds the full horizontal + vertical Gray code sweep for a
        projector output of `width` x `height`, plus the all-white /
        all-black reference frames used for shadow masking during decode.
        """
        pattern_set = cls(width=width, height=height)

        n_bits_h = int(np.ceil(np.log2(width)))
        n_bits_v = int(np.ceil(np.log2(height)))

        pattern_set.patterns.append(np.full((height, width), 255, dtype=np.uint8))
        pattern_set.patterns.append(np.zeros((height, width), dtype=np.uint8))

        for bit in range(n_bits_h):
            columns = np.arange(width)
            gray = columns ^ (columns >> 1)
            stripe = ((gray >> bit) & 1).astype(np.uint8) * 255
            pattern_set.patterns.append(np.tile(stripe, (height, 1)))

        for bit in range(n_bits_v):
            rows = np.arange(height)
            gray = rows ^ (rows >> 1)
            stripe = ((gray >> bit) & 1).astype(np.uint8) * 255
            pattern_set.patterns.append(np.tile(stripe.reshape(-1, 1), (1, width)))

        return pattern_set


def _frame_to_gray(frame: np.ndarray) -> np.ndarray:
    if frame.ndim == 3:
        return frame.astype(np.float32).mean(axis=2)
    return frame.astype(np.float32)


def _decode_gray_bits(frames: list[np.ndarray], threshold: np.ndarray) -> np.ndarray:
    """Reads one Gray-code bit plane per frame (bit `i` <-> `frames[i]`,
    matching `GrayCodePatternSet.generate`'s LSB-first stripe order) and
    packs them into a per-pixel integer Gray code value.
    """
    gray_code = np.zeros(threshold.shape, dtype=np.int64)
    for bit_index, frame in enumerate(frames):
        lit = _frame_to_gray(frame) > threshold
        gray_code |= lit.astype(np.int64) << bit_index
    return gray_code


def _gray_to_binary(gray_code: np.ndarray) -> np.ndarray:
    """Standard Gray-code -> binary conversion (successive XOR of
    right-shifted copies), vectorized over a whole image at once.
    """
    binary = gray_code.copy()
    shifted = gray_code.copy()
    while np.any(shifted != 0):
        shifted = shifted >> 1
        binary ^= shifted
    return binary


def decode_correspondence(
    captured_frames: list[np.ndarray],
    pattern_set: GrayCodePatternSet,
    shadow_threshold: int = 40,
) -> np.ndarray:
    """Decodes camera-captured Gray code frames back into projector pixel
    coordinates for every camera pixel.

    `captured_frames` must be the camera's view of each pattern in
    `pattern_set.patterns`, in the same order: [white, black, h-bit-0,
    h-bit-1, ..., v-bit-0, v-bit-1, ...].

    Returns an array of shape (camera_h, camera_w, 2) holding the decoded
    (projector_x, projector_y) for each camera pixel, or NaN where the
    surface was in shadow / outside the projected area. `shadow_threshold`
    is the minimum white-minus-black brightness delta for a pixel to be
    considered lit; pixels captured with fixed exposure/gain (no
    auto-exposure) give the most reliable threshold.

    Per-pixel bit decisions are thresholded against the average of that
    pixel's white and black reference brightness rather than a fixed global
    level, so the decode tolerates uneven ambient lighting and non-uniform
    wall reflectance across the frame.
    """
    if len(captured_frames) != len(pattern_set.patterns):
        raise ValueError(
            f"expected {len(pattern_set.patterns)} captured frames "
            f"(one per pattern), got {len(captured_frames)}"
        )

    n_bits_h = int(np.ceil(np.log2(pattern_set.width)))
    n_bits_v = int(np.ceil(np.log2(pattern_set.height)))

    white = _frame_to_gray(captured_frames[0])
    black = _frame_to_gray(captured_frames[1])
    threshold = (white + black) / 2.0
    valid = (white - black) > shadow_threshold

    h_frames = captured_frames[2 : 2 + n_bits_h]
    v_frames = captured_frames[2 + n_bits_h : 2 + n_bits_h + n_bits_v]

    proj_x = _gray_to_binary(_decode_gray_bits(h_frames, threshold))
    proj_y = _gray_to_binary(_decode_gray_bits(v_frames, threshold))

    in_range = (proj_x < pattern_set.width) & (proj_y < pattern_set.height)

    correspondence = np.stack([proj_x, proj_y], axis=-1).astype(np.float32)
    correspondence[~(valid & in_range)] = np.nan
    return correspondence


def fit_deformation_mesh(
    correspondence: np.ndarray,
    projector_resolution: tuple[int, int],
    mesh_resolution: int = MESH_RESOLUTION,
    max_samples: int = 4000,
) -> np.ndarray:
    """Fits a `mesh_resolution` x `mesh_resolution` x 2 deformation mesh from
    a decoded projector<->camera correspondence map (§3C.4).

    The mesh is indexed by a *regular grid over the camera's image plane*
    (the same coordinate space segmentation masks are computed in, so a
    mask and the warp mesh line up without a second registration step) and
    stores, at each grid node, the normalized [0,1] projector UV that
    should be sampled there — exactly what `mesh_warp.vert`'s
    `u_warpMesh` expects.

    Uses a thin-plate-spline radial basis fit (§3C.4's "Thin Plate Spline /
    TPS Mesh Warp Map") over the valid correspondence samples, since the
    Gray-code decode only gives exact correspondences at pixels that were
    unambiguously lit — everywhere else (occlusion, shadow, sensor noise)
    needs interpolation.
    """
    from scipy.interpolate import RBFInterpolator

    camera_h, camera_w = correspondence.shape[:2]
    valid_mask = ~np.isnan(correspondence).any(axis=-1)

    if valid_mask.sum() < 16:
        raise ValueError(
            "not enough valid correspondence samples to fit a warp mesh "
            "(surface too dark, camera misaligned, or projector not in view?)"
        )

    ys, xs = np.nonzero(valid_mask)
    if len(xs) > max_samples:
        rng = np.random.default_rng(0)
        keep = rng.choice(len(xs), size=max_samples, replace=False)
        ys, xs = ys[keep], xs[keep]

    camera_points = np.stack(
        [xs / max(camera_w - 1, 1), ys / max(camera_h - 1, 1)], axis=-1
    )
    projector_w, projector_h = projector_resolution
    projector_points = correspondence[ys, xs] / np.array(
        [max(projector_w - 1, 1), max(projector_h - 1, 1)]
    )

    interpolator = RBFInterpolator(
        camera_points, projector_points, kernel="thin_plate_spline"
    )

    coords = np.linspace(0.0, 1.0, mesh_resolution)
    grid_x, grid_y = np.meshgrid(coords, coords)
    query = np.stack([grid_x.ravel(), grid_y.ravel()], axis=-1)

    fitted = interpolator(query).reshape(mesh_resolution, mesh_resolution, 2)
    return np.clip(fitted, 0.0, 1.0).astype(np.float32)


def save_calibration(mesh: np.ndarray, path: Path) -> None:
    """Writes `calibration_matrix.json`: the deformation mesh Module 3's
    warp shader loads as a vertex displacement lookup texture.
    """
    if mesh.shape != (MESH_RESOLUTION, MESH_RESOLUTION, 2):
        raise ValueError(
            f"expected mesh shape ({MESH_RESOLUTION}, {MESH_RESOLUTION}, 2), "
            f"got {mesh.shape}"
        )
    payload = {
        "meshResolution": MESH_RESOLUTION,
        "mesh": mesh.tolist(),
    }
    path.write_text(json.dumps(payload))


def load_calibration(path: Path) -> np.ndarray:
    payload = json.loads(path.read_text())
    mesh = np.array(payload["mesh"], dtype=np.float32)
    if mesh.shape != (MESH_RESOLUTION, MESH_RESOLUTION, 2):
        raise ValueError(f"corrupt calibration file at {path}: unexpected mesh shape")
    return mesh


def identity_mesh(mesh_resolution: int = MESH_RESOLUTION) -> np.ndarray:
    """A no-op deformation mesh (flat wall, no warp needed) — the default
    Module 4 loads before the operator has run Scan Room at all.
    """
    coords = np.linspace(0.0, 1.0, mesh_resolution, dtype=np.float32)
    grid_x, grid_y = np.meshgrid(coords, coords)
    return np.stack([grid_x, grid_y], axis=-1)
