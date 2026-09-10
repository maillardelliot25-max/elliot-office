from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from render_engine.host.video_source import VideoTextureSource

FRAME_COLORS_BGR = [
    (0, 0, 255),    # red
    (0, 255, 0),    # green
    (255, 0, 0),    # blue
    (0, 255, 255),  # yellow
    (255, 255, 0),  # cyan
]
FRAME_SIZE = (32, 24)  # width, height


@pytest.fixture
def synthetic_video(tmp_path: Path) -> Path:
    video_path = tmp_path / "zone_loop.avi"
    writer = cv2.VideoWriter(
        str(video_path), cv2.VideoWriter_fourcc(*"MJPG"), 10.0, FRAME_SIZE
    )
    assert writer.isOpened()
    for color in FRAME_COLORS_BGR:
        frame = np.full((FRAME_SIZE[1], FRAME_SIZE[0], 3), color, dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return video_path


def _dominant_rgb(frame: np.ndarray) -> np.ndarray:
    return frame[FRAME_SIZE[1] // 2, FRAME_SIZE[0] // 2]


def test_reads_frames_in_order(synthetic_video: Path):
    source = VideoTextureSource(synthetic_video)
    try:
        assert source.frame_count == len(FRAME_COLORS_BGR)
        for expected_index, bgr in enumerate(FRAME_COLORS_BGR):
            expected_rgb = np.array(bgr[::-1], dtype=np.float32) / 255.0
            frame = source.read_frame()
            assert frame.dtype == np.float32
            assert frame.max() <= 1.0 and frame.min() >= 0.0
            assert source.frame_index == expected_index
            # MJPEG is lossy, so allow a little tolerance rather than an
            # exact match.
            np.testing.assert_allclose(_dominant_rgb(frame), expected_rgb, atol=0.03)
    finally:
        source.release()


def test_loops_back_to_the_first_frame_by_default(synthetic_video: Path):
    source = VideoTextureSource(synthetic_video)
    try:
        for _ in FRAME_COLORS_BGR:
            source.read_frame()  # consume the whole clip once

        looped_frame = source.read_frame()
        expected_first_frame_rgb = np.array(FRAME_COLORS_BGR[0][::-1], dtype=np.float32) / 255.0
        np.testing.assert_allclose(_dominant_rgb(looped_frame), expected_first_frame_rgb, atol=0.03)
        assert source.frame_index == 0, "frame_index should reflect the looped-back frame (0), not skip or repeat"
    finally:
        source.release()


def test_reading_through_multiple_loops_cycles_correctly(synthetic_video: Path):
    source = VideoTextureSource(synthetic_video)
    try:
        n = len(FRAME_COLORS_BGR)
        for i in range(2 * n + 2):
            frame = source.read_frame()
            expected_rgb = np.array(FRAME_COLORS_BGR[i % n][::-1], dtype=np.float32) / 255.0
            np.testing.assert_allclose(_dominant_rgb(frame), expected_rgb, atol=0.03)
    finally:
        source.release()


def test_raises_stop_iteration_at_end_when_looping_disabled(synthetic_video: Path):
    source = VideoTextureSource(synthetic_video, loop=False)
    try:
        for _ in FRAME_COLORS_BGR:
            source.read_frame()
        with pytest.raises(StopIteration):
            source.read_frame()
    finally:
        source.release()


def test_raises_on_missing_file(tmp_path: Path):
    with pytest.raises(RuntimeError):
        VideoTextureSource(tmp_path / "does_not_exist.avi")


def test_context_manager_releases(synthetic_video: Path):
    with VideoTextureSource(synthetic_video) as source:
        source.read_frame()
    # No direct way to assert the underlying capture is released short of
    # inspecting cv2 internals; this just exercises the __enter__/__exit__
    # path without raising.
