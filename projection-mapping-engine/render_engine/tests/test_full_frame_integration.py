"""End-to-end integration test tying Module 2 (calibration + masks) and
Module 3 (video decode, audio-reactive engine, GL compositor) together into
one real composited frame — not each piece tested in isolation, but the
actual data contracts between them: a calibration mesh written by
`cv_engine.calibration.structured_light.save_calibration` and read back by
`load_calibration` feeds `ZoneCompositor` directly; a mask produced by
`cv_engine.segmentation.mask_engine.compute_output_mask` gates a zone's
video loop; `AudioReactiveEngine`'s smoothed levels drive the same
`u_bass` uniform `test_renderer.py` checks in isolation.

Needs a GL-capable environment, same as `test_renderer.py` — skips
cleanly without one.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

moderngl = pytest.importorskip("moderngl")

from cv_engine.calibration.structured_light import (  # noqa: E402
    MESH_RESOLUTION as CALIBRATION_MESH_RESOLUTION,
    identity_mesh,
    load_calibration,
    save_calibration,
)
from cv_engine.segmentation.mask_engine import compute_output_mask  # noqa: E402
from render_engine.audio.audio_engine import AudioReactiveEngine  # noqa: E402
from render_engine.host.renderer import (  # noqa: E402
    ZoneCompositor,
    create_headless_context,
    read_fbo_rgba,
)
from render_engine.host.video_source import VideoTextureSource  # noqa: E402

OUTPUT_SIZE = (64, 48)
MESH_RESOLUTION = 9


@pytest.fixture(scope="module")
def ctx():
    try:
        context = create_headless_context()
    except Exception as exc:  # pragma: no cover - environment-dependent
        pytest.skip(f"no GL context available: {exc}")
    yield context
    context.release()


def _write_solid_video(path: Path, color_bgr: tuple[int, int, int], size=(16, 12)) -> None:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 10.0, size)
    assert writer.isOpened()
    frame = np.full((size[1], size[0], 3), color_bgr, dtype=np.uint8)
    for _ in range(3):
        writer.write(frame)
    writer.release()


def test_calibration_file_round_trip_feeds_the_compositor_directly(ctx, tmp_path: Path):
    """The exact JSON file cv_engine writes is what the renderer loads —
    not a mesh array handed directly in Python, but a real file round trip
    through the same `save_calibration`/`load_calibration` functions
    `cv_engine.main`'s `save_calibration`/`nudge_corners` commands use.
    """
    calibration_path = tmp_path / "calibration_matrix.json"
    save_calibration(identity_mesh(CALIBRATION_MESH_RESOLUTION), calibration_path)
    loaded_mesh = load_calibration(calibration_path)

    compositor = ZoneCompositor(ctx, mesh_resolution=CALIBRATION_MESH_RESOLUTION)
    fbo = ctx.framebuffer(color_attachments=[ctx.texture(OUTPUT_SIZE, 4, dtype="f4")])
    fbo.use()
    ctx.clear(0, 0, 0, 0)

    width, height = OUTPUT_SIZE
    visual = np.full((height, width, 3), (0.2, 0.6, 0.9), dtype=np.float32)
    mask = np.ones((height, width), dtype=np.float32)

    compositor.render_zone(fbo, warp_mesh=loaded_mesh, visual_style=visual, zone_mask=mask)
    pixels = read_fbo_rgba(fbo)
    np.testing.assert_allclose(pixels[height // 2, width // 2, :3], [0.2, 0.6, 0.9], atol=1e-5)

    compositor.release()
    fbo.release()


def test_two_zones_with_video_loops_and_focus_masks_composite_correctly(ctx, tmp_path: Path):
    """Two zones, each backed by a real (tiny) video file and a mask
    produced by `compute_output_mask`, composited back-to-front into one
    framebuffer — the left half should show zone A's video, the right half
    zone B's, exactly like an operator assigning different loops to a
    Wall Deck and a Picture Frame Deck side by side.
    """
    width, height = OUTPUT_SIZE

    wall_video_path = tmp_path / "wall_loop.avi"
    frame_video_path = tmp_path / "frame_loop.avi"
    _write_solid_video(wall_video_path, color_bgr=(0, 0, 255))    # red in RGB
    _write_solid_video(frame_video_path, color_bgr=(255, 0, 0))   # blue in RGB

    wall_source = VideoTextureSource(wall_video_path)
    frame_source = VideoTextureSource(frame_video_path)

    raw_wall_mask = np.zeros((height, width), dtype=np.float32)
    raw_wall_mask[:, : width // 2] = 1.0  # "Highlight Target" covering the left half
    wall_mask = compute_output_mask(raw_wall_mask, "focus")
    frame_mask = compute_output_mask(raw_wall_mask, "cutout")  # right half, by inversion

    compositor = ZoneCompositor(ctx, mesh_resolution=MESH_RESOLUTION)
    fbo = ctx.framebuffer(color_attachments=[ctx.texture(OUTPUT_SIZE, 4, dtype="f4")])
    fbo.use()
    ctx.clear(0, 0, 0, 0)

    mesh = identity_mesh(MESH_RESOLUTION)
    try:
        compositor.render_zone(
            fbo, warp_mesh=mesh, visual_style=wall_source.read_frame(), zone_mask=wall_mask
        )
        compositor.render_zone(
            fbo, warp_mesh=mesh, visual_style=frame_source.read_frame(), zone_mask=frame_mask
        )
        pixels = read_fbo_rgba(fbo)

        left_pixel = pixels[height // 2, width // 4, :3]
        right_pixel = pixels[height // 2, 3 * width // 4, :3]
        np.testing.assert_allclose(left_pixel, [1.0, 0.0, 0.0], atol=0.05)
        np.testing.assert_allclose(right_pixel, [0.0, 0.0, 1.0], atol=0.05)
    finally:
        wall_source.release()
        frame_source.release()
        compositor.release()
        fbo.release()


def test_audio_reactive_engine_levels_drive_the_bass_uniform(ctx):
    """The same smoothed levels `AudioReactiveEngine` would feed a live
    render loop, used here to drive `u_bass` for real, then checked
    against the exact pulse formula `mesh_warp.frag` documents.
    """
    width, height = OUTPUT_SIZE
    engine = AudioReactiveEngine(sample_rate=44_100)

    sample_rate = 44_100
    t = np.arange(4096) / sample_rate
    loud_bass_tone = 0.5 * np.sin(2 * np.pi * 100 * t)
    for _ in range(15):  # let the attack/release envelope converge
        bass, _, _ = engine.push_samples(loud_bass_tone)

    compositor = ZoneCompositor(ctx, mesh_resolution=MESH_RESOLUTION)
    fbo = ctx.framebuffer(color_attachments=[ctx.texture(OUTPUT_SIZE, 4, dtype="f4")])
    fbo.use()
    ctx.clear(0, 0, 0, 0)

    gray = np.full((height, width, 3), 0.4, dtype=np.float32)
    mask = np.ones((height, width), dtype=np.float32)
    compositor.render_zone(fbo, warp_mesh=identity_mesh(MESH_RESOLUTION), visual_style=gray, zone_mask=mask, bass=bass)
    pixels = read_fbo_rgba(fbo)

    expected = 0.4 * (1.0 + bass * 0.35)
    np.testing.assert_allclose(pixels[height // 2, width // 2, :3], [expected] * 3, atol=1e-4)

    compositor.release()
    fbo.release()
