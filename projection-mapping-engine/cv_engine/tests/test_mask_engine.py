from __future__ import annotations

import numpy as np
import pytest

from cv_engine.segmentation.mask_engine import (
    ClassicalSegmentationEngine,
    compute_output_mask,
)


def _synthetic_picture_frame_scene(width=200, height=150):
    """A dark wall with a bright rectangular "picture frame" — enough
    contrast for GrabCut to separate without any model, mirroring the
    "tap the picture frame" Highlight Target gesture.
    """
    frame = np.full((height, width, 3), (40, 35, 60), dtype=np.uint8)  # dim wall
    frame[40:100, 60:140] = (230, 220, 200)  # bright frame
    center = (100, 70)
    ground_truth = np.zeros((height, width), dtype=bool)
    ground_truth[40:100, 60:140] = True
    return frame, center, ground_truth


def test_classical_segmentation_recovers_high_contrast_target():
    frame, center, ground_truth = _synthetic_picture_frame_scene()
    engine = ClassicalSegmentationEngine()

    result = engine.segment_at_point(frame, center)

    assert result.mask.shape == frame.shape[:2]
    predicted = result.mask > 0.5

    intersection = np.logical_and(predicted, ground_truth).sum()
    union = np.logical_or(predicted, ground_truth).sum()
    iou = intersection / union
    assert iou > 0.6, f"expected a reasonable overlap with the true target, got IoU={iou:.2f}"


def test_classical_segmentation_rejects_out_of_bounds_point():
    frame, _, _ = _synthetic_picture_frame_scene()
    engine = ClassicalSegmentationEngine()
    with pytest.raises(ValueError):
        engine.segment_at_point(frame, (10_000, 10_000))


@pytest.mark.parametrize(
    "mode,expected_fn",
    [
        ("focus", lambda m: m),
        ("cutout", lambda m: 1.0 - m),
        ("mute", lambda m: np.zeros_like(m)),
    ],
)
def test_compute_output_mask_modes(mode, expected_fn):
    mask = np.array([[0.0, 0.5], [1.0, 0.25]], dtype=np.float32)
    np.testing.assert_allclose(compute_output_mask(mask, mode), expected_fn(mask))


def test_compute_output_mask_rejects_unknown_mode():
    mask = np.zeros((2, 2), dtype=np.float32)
    with pytest.raises(ValueError):
        compute_output_mask(mask, "invert")  # type: ignore[arg-type]
