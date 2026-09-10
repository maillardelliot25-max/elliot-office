"""Pixel-level verification of the committed GLSL shaders, rendered for
real through `render_engine/host/renderer.py` against a GL context —
llvmpipe (Mesa's software rasterizer) behind Xvfb in CI/this sandbox, a real
GPU wherever one's available. This is not a mock of the render engine: it
compiles and executes the exact `.vert`/`.frag` files under `shaders/`.

Needs a GL-capable environment. Skipped (not failed) if
`moderngl.create_context(standalone=True)` can't find one — e.g. no X
server/Xvfb and no EGL. To run locally on Linux without a GPU:
`Xvfb :99 -screen 0 1280x1024x24 & DISPLAY=:99 python -m pytest render_engine/tests/`.
"""

from __future__ import annotations

import numpy as np
import pytest

moderngl = pytest.importorskip("moderngl")

from render_engine.host.renderer import (  # noqa: E402
    EdgeBlendPass,
    ZoneCompositor,
    create_headless_context,
    read_fbo_rgba,
)

MESH_RESOLUTION = 9  # small on purpose: keeps software-rendered tests fast
OUTPUT_SIZE = (64, 48)  # (width, height)


@pytest.fixture(scope="module")
def ctx():
    try:
        context = create_headless_context()
    except Exception as exc:  # pragma: no cover - environment-dependent
        pytest.skip(f"no GL context available: {exc}")
    yield context
    context.release()


@pytest.fixture
def compositor(ctx):
    instance = ZoneCompositor(ctx, mesh_resolution=MESH_RESOLUTION)
    yield instance
    instance.release()


@pytest.fixture
def target_fbo(ctx):
    fbo = ctx.framebuffer(color_attachments=[ctx.texture(OUTPUT_SIZE, 4, dtype="f4")])
    fbo.use()
    ctx.clear(0.0, 0.0, 0.0, 0.0)
    yield fbo
    fbo.release()


def _identity_mesh(resolution: int = MESH_RESOLUTION) -> np.ndarray:
    coords = np.linspace(0.0, 1.0, resolution, dtype=np.float32)
    grid_x, grid_y = np.meshgrid(coords, coords)
    return np.stack([grid_x, grid_y], axis=-1)


def _solid(color: tuple[float, float, float], size=OUTPUT_SIZE) -> np.ndarray:
    width, height = size
    return np.ones((height, width, 3), dtype=np.float32) * np.array(color, dtype=np.float32)


def _full_mask(size=OUTPUT_SIZE) -> np.ndarray:
    width, height = size
    return np.ones((height, width), dtype=np.float32)


def test_solid_zone_round_trips_through_identity_warp(compositor, target_fbo):
    visual = _solid((1.0, 0.5, 0.25))
    compositor.render_zone(
        target_fbo, warp_mesh=_identity_mesh(), visual_style=visual, zone_mask=_full_mask()
    )
    pixels = read_fbo_rgba(target_fbo)

    width, height = OUTPUT_SIZE
    for y, x in [(height // 2, width // 2), (0, 0), (height - 1, width - 1)]:
        np.testing.assert_allclose(pixels[y, x], [1.0, 0.5, 0.25, 1.0], atol=1e-5)


def test_zone_mask_gates_alpha_left_versus_right(compositor, target_fbo):
    width, height = OUTPUT_SIZE
    mask = np.zeros((height, width), dtype=np.float32)
    mask[:, : width // 2] = 1.0  # left half focused in, right half focused out

    compositor.render_zone(
        target_fbo, warp_mesh=_identity_mesh(), visual_style=_solid((1, 1, 1)), zone_mask=mask
    )
    pixels = read_fbo_rgba(target_fbo)

    assert pixels[height // 2, 5, 3] == pytest.approx(1.0)
    assert pixels[height // 2, -5, 3] == pytest.approx(0.0)


def test_zone_opacity_mutes_regardless_of_mask(compositor, target_fbo):
    compositor.render_zone(
        target_fbo,
        warp_mesh=_identity_mesh(),
        visual_style=_solid((1, 1, 1)),
        zone_mask=_full_mask(),
        zone_opacity=0.0,
    )
    pixels = read_fbo_rgba(target_fbo)
    assert np.all(pixels[..., 3] == 0.0)


def test_warp_mesh_displaces_content_to_the_target_position(compositor, target_fbo):
    """Pulling one grid node's target UV inward should move content away
    from its original screen position and toward the new one — validates
    that `u_warpMesh` is actually driving vertex displacement, not a no-op.
    """
    width, height = OUTPUT_SIZE
    warped = _identity_mesh().copy()
    warped[0, 0] = [0.3, 0.3]  # top-left grid node's target moved inward

    compositor.render_zone(
        target_fbo,
        warp_mesh=warped,
        visual_style=_solid((1, 0, 0)),
        zone_mask=_full_mask(),
    )
    pixels = read_fbo_rgba(target_fbo)

    assert pixels[0, 0, 3] == pytest.approx(0.0), "content should have pulled away from (0,0)"
    moved_x, moved_y = int(0.3 * width), int(0.3 * height)
    assert pixels[moved_y, moved_x, 3] == pytest.approx(1.0), "content should have arrived at the new position"


def test_color_correction_applies_per_channel_gain(compositor, target_fbo):
    compositor.render_zone(
        target_fbo,
        warp_mesh=_identity_mesh(),
        visual_style=_solid((0.4, 0.4, 0.4)),
        zone_mask=_full_mask(),
        color_correction=(2.0, 1.0, 0.5),
    )
    pixels = read_fbo_rgba(target_fbo)
    width, height = OUTPUT_SIZE
    np.testing.assert_allclose(
        pixels[height // 2, width // 2, :3], [0.8, 0.4, 0.2], atol=1e-5
    )


def test_bass_uniform_pulses_brightness(compositor, target_fbo):
    compositor.render_zone(
        target_fbo,
        warp_mesh=_identity_mesh(),
        visual_style=_solid((0.4, 0.4, 0.4)),
        zone_mask=_full_mask(),
        bass=1.0,
    )
    pixels = read_fbo_rgba(target_fbo)
    width, height = OUTPUT_SIZE
    np.testing.assert_allclose(
        pixels[height // 2, width // 2, :3], [0.54, 0.54, 0.54], atol=1e-5
    )


@pytest.fixture
def edge_blend(ctx):
    instance = EdgeBlendPass(ctx)
    yield instance
    instance.release()


def test_edge_blend_cosine_ramp_across_overlap(edge_blend, target_fbo):
    edge_blend.render(
        target_fbo,
        _solid((1.0, 1.0, 1.0)),
        overlap_start=0.5,
        overlap_end=1.0,
        fade_to_start=False,
    )
    pixels = read_fbo_rgba(target_fbo)
    width, height = OUTPUT_SIZE
    row = height // 2

    gain_before_overlap = pixels[row, 0, 0]
    gain_at_start = pixels[row, int(0.5 * width), 0]
    gain_at_midpoint = pixels[row, int(0.75 * width), 0]
    gain_at_end = pixels[row, width - 1, 0]

    assert gain_before_overlap == pytest.approx(1.0, abs=1e-3)
    assert gain_at_start == pytest.approx(0.0, abs=0.05)
    assert gain_at_midpoint == pytest.approx(0.5, abs=0.05)
    assert gain_at_end == pytest.approx(1.0, abs=0.05)


def test_edge_blend_fade_to_start_reverses_the_ramp(edge_blend, target_fbo):
    edge_blend.render(
        target_fbo,
        _solid((1.0, 1.0, 1.0)),
        overlap_start=0.0,
        overlap_end=0.5,
        fade_to_start=True,
    )
    pixels = read_fbo_rgba(target_fbo)
    width, height = OUTPUT_SIZE
    row = height // 2

    assert pixels[row, 0, 0] == pytest.approx(1.0, abs=0.05)
    assert pixels[row, int(0.5 * width) - 1, 0] == pytest.approx(0.0, abs=0.05)
