"""Round-trip tests for Gray code decode + TPS mesh fit against a simulated
(non-flat) projection surface — no real camera/projector needed. This is
what stands in for hardware-in-the-loop validation of `structured_light.py`
until Module 2 is exercised against a real Scan Room pass.
"""

from __future__ import annotations

import numpy as np
import pytest

from cv_engine.calibration.structured_light import (
    NUDGE_CANONICAL_POSITIONS,
    GrayCodePatternSet,
    apply_manual_nudge,
    decode_correspondence,
    fit_deformation_mesh,
    identity_mesh,
)

PROJECTOR_SIZE = (64, 48)  # small on purpose: keeps the test fast
CAMERA_SIZE = (80, 60)


def _simulate_warp(camera_w: int, camera_h: int, projector_w: int, projector_h: int):
    """A synthetic camera<->projector mapping standing in for a physically
    warped wall: a smooth, non-affine (quadratic bulge) distortion, so the
    TPS fit has real nonlinearity to recover, not just an affine map a
    cheaper homography could already solve.
    """
    cam_x = np.arange(camera_w)
    cam_y = np.arange(camera_h)
    grid_x, grid_y = np.meshgrid(cam_x, cam_y)

    norm_x = grid_x / (camera_w - 1)
    norm_y = grid_y / (camera_h - 1)

    bulge = 0.06 * np.sin(norm_x * np.pi) * np.sin(norm_y * np.pi)
    proj_x = np.clip((norm_x + bulge) * (projector_w - 1), 0, projector_w - 1)
    proj_y = np.clip((norm_y + bulge) * (projector_h - 1), 0, projector_h - 1)
    return proj_x, proj_y


def _capture_patterns(pattern_set: GrayCodePatternSet, proj_x: np.ndarray, proj_y: np.ndarray):
    """Renders what the camera would see for each projected pattern, given
    the known projector->camera warp: sample each pattern at the
    per-camera-pixel projector coordinate the warp maps to.
    """
    captured = []
    for pattern in pattern_set.patterns:
        sampled = pattern[proj_y.round().astype(int), proj_x.round().astype(int)]
        captured.append(sampled.astype(np.uint8))
    return captured


def test_gray_code_round_trip_recovers_known_warp():
    projector_w, projector_h = PROJECTOR_SIZE
    camera_w, camera_h = CAMERA_SIZE

    pattern_set = GrayCodePatternSet.generate(projector_w, projector_h)
    proj_x, proj_y = _simulate_warp(camera_w, camera_h, projector_w, projector_h)
    captured_frames = _capture_patterns(pattern_set, proj_x, proj_y)

    correspondence = decode_correspondence(captured_frames, pattern_set, shadow_threshold=40)

    assert correspondence.shape == (camera_h, camera_w, 2)
    assert not np.isnan(correspondence).all()

    decoded_x = correspondence[..., 0]
    decoded_y = correspondence[..., 1]
    valid = ~np.isnan(decoded_x)

    # The white/black reference frames are identical for every camera pixel
    # in this noiseless simulation, so every pixel should decode — no
    # shadow region to exclude.
    assert valid.mean() > 0.99

    assert np.abs(decoded_x[valid] - proj_x[valid]).mean() < 1.0
    assert np.abs(decoded_y[valid] - proj_y[valid]).mean() < 1.0


def test_fit_deformation_mesh_recovers_smooth_warp():
    projector_w, projector_h = PROJECTOR_SIZE
    camera_w, camera_h = CAMERA_SIZE

    pattern_set = GrayCodePatternSet.generate(projector_w, projector_h)
    proj_x, proj_y = _simulate_warp(camera_w, camera_h, projector_w, projector_h)
    captured_frames = _capture_patterns(pattern_set, proj_x, proj_y)
    correspondence = decode_correspondence(captured_frames, pattern_set)

    mesh = fit_deformation_mesh(correspondence, projector_resolution=PROJECTOR_SIZE, mesh_resolution=9)

    assert mesh.shape == (9, 9, 2)
    assert np.all(mesh >= 0.0) and np.all(mesh <= 1.0)

    # A flat/unwarped input surface (perfect identity mapping) should fit
    # back to (near) the identity mesh — sanity check that the fit isn't
    # introducing spurious distortion of its own.
    identity_proj_x, identity_proj_y = np.meshgrid(
        np.linspace(0, projector_w - 1, camera_w), np.linspace(0, projector_h - 1, camera_h)
    )
    flat_frames = _capture_patterns(pattern_set, identity_proj_x, identity_proj_y)
    flat_correspondence = decode_correspondence(flat_frames, pattern_set)
    flat_mesh = fit_deformation_mesh(
        flat_correspondence, projector_resolution=PROJECTOR_SIZE, mesh_resolution=9
    )
    np.testing.assert_allclose(flat_mesh, identity_mesh(9), atol=0.05)


def test_decode_correspondence_rejects_frame_count_mismatch():
    pattern_set = GrayCodePatternSet.generate(*PROJECTOR_SIZE)
    with pytest.raises(ValueError):
        decode_correspondence(pattern_set.patterns[:-1], pattern_set)


def test_fit_deformation_mesh_requires_minimum_samples():
    all_nan = np.full((10, 10, 2), np.nan, dtype=np.float32)
    with pytest.raises(ValueError):
        fit_deformation_mesh(all_nan, projector_resolution=PROJECTOR_SIZE)


@pytest.mark.parametrize("point_count", [4, 9])
def test_apply_manual_nudge_is_a_no_op_when_untouched(point_count):
    base = identity_mesh(17)
    canonical = np.array(NUDGE_CANONICAL_POSITIONS[point_count])

    nudged = apply_manual_nudge(base, canonical, point_count, mesh_resolution=17)

    np.testing.assert_allclose(nudged, base, atol=1e-6)


def test_apply_manual_nudge_moves_the_dragged_corner_exactly():
    base = identity_mesh(17)
    canonical = np.array(NUDGE_CANONICAL_POSITIONS[4])

    # Drag the top-left handle (index 0, canonical (0,0)) inward.
    dragged = canonical.copy()
    dragged[0] = (0.1, 0.08)

    nudged = apply_manual_nudge(base, dragged, point_count=4, mesh_resolution=17)

    # The mesh's corner grid node sits exactly at the canonical handle
    # position, so the RBF fit (which interpolates exactly at its sample
    # points) should reproduce the drag exactly there.
    np.testing.assert_allclose(nudged[0, 0], dragged[0], atol=1e-4)

    # The opposite corner (bottom-right, untouched) should be essentially
    # unaffected — the correction should fade out with distance from the
    # dragged handle, not smear evenly across the whole mesh.
    np.testing.assert_allclose(nudged[-1, -1], base[-1, -1], atol=0.02)


def test_apply_manual_nudge_rejects_wrong_point_count():
    base = identity_mesh(9)
    with pytest.raises(ValueError):
        apply_manual_nudge(base, np.zeros((4, 2)), point_count=5, mesh_resolution=9)


def test_apply_manual_nudge_rejects_mismatched_target_shape():
    base = identity_mesh(9)
    with pytest.raises(ValueError):
        apply_manual_nudge(base, np.zeros((3, 2)), point_count=4, mesh_resolution=9)
