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


def decode_correspondence(
    captured_frames: list[np.ndarray],
    pattern_set: GrayCodePatternSet,
    shadow_threshold: int = 40,
) -> np.ndarray:
    """Decodes camera-captured Gray code frames back into projector pixel
    coordinates for every camera pixel.

    Returns an array of shape (camera_h, camera_w, 2) holding the decoded
    (projector_x, projector_y) for each camera pixel, or NaN where the
    surface was in shadow / outside the projected area
    (`shadow_threshold` separates lit vs. unlit pixels in the white/black
    reference pair).

    TODO(Module 2): implement the bit-plane decode + Gray-to-binary
    conversion once real camera capture is wired in; the pattern generation
    above (and the calibration file shape below) is what Module 3's shader
    and `venue_profile.py` are built against, so those interfaces are
    stable ahead of this decode implementation landing.
    """
    raise NotImplementedError("Gray code decode pending real camera integration")


def fit_deformation_mesh(
    correspondence: np.ndarray,
    mesh_resolution: int = MESH_RESOLUTION,
) -> np.ndarray:
    """Fits a `mesh_resolution` x `mesh_resolution` x 2 deformation mesh
    (thin-plate-spline control points, in normalized [0,1] projector UV
    space) from a decoded projector<->camera correspondence map.
    """
    raise NotImplementedError("TPS mesh fit pending real camera integration")


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
