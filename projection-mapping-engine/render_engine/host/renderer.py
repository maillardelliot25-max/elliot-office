"""ModernGL host renderer for the render engine (Module 3).

Loads the exact `.vert`/`.frag` files in `render_engine/shaders/`, builds the
tessellated warp grid geometry `mesh_warp.vert` expects, uploads calibration
mesh / mask / content data as textures, and composites zones into an
off-screen framebuffer.

This is deliberately split from *where the GL context comes from*:
[create_headless_context] gives an off-screen context useful for automated
testing (see `render_engine/tests/test_renderer.py`) and for a desktop
sidecar render process. Attaching to the actual projector output surface —
the HWND `DisplayDaemon::SendToProjector` returns on Windows, or the
`SurfaceView` inside `ProjectorPresentation` on Android — is a platform-
specific context-creation swap (WGL bound to that HWND; an Android
`GLSurfaceView`/EGL surface); everything below `create_headless_context` in
this module (grid geometry, texture upload, the composite draw calls) is
unchanged either way, since it only depends on having *some*
`moderngl.Context`.

Coordinate convention (confirmed empirically by `test_renderer.py`, not just
asserted here): both the calibration mesh and content/mask images use a
top-left-origin UV space (row 0 = top of image, matching `numpy`'s natural
array order and `cv_engine`'s camera-space frames). Texture data is
uploaded row-major with no vertical flip; `mesh_warp.vert`'s `clip.y =
-clip.y` is what converts that into OpenGL's bottom-left-origin clip space.
Framebuffer reads in this module undo that flip on the way back out, so
callers only ever see top-left-origin arrays.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import moderngl
import numpy as np

SHADER_DIR = Path(__file__).resolve().parent.parent / "shaders"


def create_headless_context() -> moderngl.Context:
    """An off-screen GL context for testing / desktop sidecar rendering.

    Requires *some* GL-capable environment (a GPU, or Mesa's llvmpipe
    software rasterizer behind an X server / Xvfb) — it is not a substitute
    for attaching to the real projector output surface in production.
    """
    return moderngl.create_context(standalone=True)


def _read_shader(name: str) -> str:
    return (SHADER_DIR / name).read_text()


def read_fbo_rgba(fbo: moderngl.Framebuffer) -> np.ndarray:
    """Reads an FBO's color attachment back as a top-left-origin
    float32[H, W, 4] array in [0, 1].

    OpenGL's `glReadPixels` returns row 0 = the bottom of the rendered
    image; this flips it so a caller reading `pixels[0, 0]` gets the same
    corner they'd call "top-left" for any input image in this codebase.
    """
    width, height = fbo.size
    raw = fbo.read(components=4, dtype="f4")
    pixels = np.frombuffer(raw, dtype=np.float32).reshape(height, width, 4)
    return np.flipud(pixels).copy()


def _upload_rgba_texture(ctx: moderngl.Context, image: np.ndarray) -> moderngl.Texture:
    """Uploads a top-left-origin float32[H, W, 4] (or [H, W, 3]) array in
    [0, 1] as an RGBA texture, linear-filtered, clamped to edge.
    """
    if image.ndim != 3 or image.shape[2] not in (3, 4):
        raise ValueError(f"expected an [H, W, 3-or-4] array, got shape {image.shape}")
    height, width = image.shape[:2]
    if image.shape[2] == 3:
        alpha = np.ones((height, width, 1), dtype=np.float32)
        image = np.concatenate([image, alpha], axis=-1)

    texture = ctx.texture((width, height), 4, image.astype(np.float32).tobytes(), dtype="f4")
    texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
    texture.repeat_x = False
    texture.repeat_y = False
    return texture


def _upload_scalar_texture(ctx: moderngl.Context, image: np.ndarray) -> moderngl.Texture:
    """Uploads a top-left-origin float32[H, W] array as a single-channel
    (R32F) texture — used for zone masks.
    """
    if image.ndim != 2:
        raise ValueError(f"expected an [H, W] array, got shape {image.shape}")
    height, width = image.shape
    texture = ctx.texture((width, height), 1, image.astype(np.float32).tobytes(), dtype="f4")
    texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
    texture.repeat_x = False
    texture.repeat_y = False
    return texture


def _upload_warp_mesh_texture(ctx: moderngl.Context, mesh: np.ndarray) -> moderngl.Texture:
    """Uploads a `[R, R, 2]` calibration mesh as an RG32F texture, using
    NEAREST filtering — see `GridGeometry`'s texel-center alignment for why
    that gives exact (not blurred) control-point lookups.
    """
    if mesh.ndim != 3 or mesh.shape[2] != 2:
        raise ValueError(f"expected an [R, R, 2] mesh, got shape {mesh.shape}")
    resolution = mesh.shape[0]
    texture = ctx.texture((resolution, resolution), 2, mesh.astype(np.float32).tobytes(), dtype="f4")
    texture.filter = (moderngl.NEAREST, moderngl.NEAREST)
    texture.repeat_x = False
    texture.repeat_y = False
    return texture


@dataclass
class GridGeometry:
    """The tessellated grid `mesh_warp.vert` renders, built once per
    calibration mesh resolution and reused across zones/frames.

    Grid vertices are placed at *texel centers* of an R x R warp-mesh
    texture — `(i + 0.5) / R` rather than `i / (R - 1)` — so that with
    NEAREST filtering, `texture(u_warpMesh, a_gridPosition)` in the vertex
    shader reads back the exact control-point value for vertex `i`, with no
    filtering blur at the grid's own boundary. `a_gridUV` (content/mask
    sampling) uses the same buffer, matching `mesh_warp.vert`'s comment
    that the two attributes are meant to coincide.
    """

    vbo: moderngl.Buffer
    ibo: moderngl.Buffer
    index_count: int

    @classmethod
    def build(cls, ctx: moderngl.Context, resolution: int) -> "GridGeometry":
        coords = (np.arange(resolution, dtype=np.float32) + 0.5) / resolution
        grid_x, grid_y = np.meshgrid(coords, coords)
        vertices = np.stack([grid_x, grid_y], axis=-1).reshape(-1, 2).astype(np.float32)

        indices = []
        for row in range(resolution - 1):
            for col in range(resolution - 1):
                i0 = row * resolution + col
                i1 = row * resolution + col + 1
                i2 = (row + 1) * resolution + col
                i3 = (row + 1) * resolution + col + 1
                indices.extend([i0, i2, i1, i1, i2, i3])
        index_array = np.array(indices, dtype=np.uint32)

        vbo = ctx.buffer(vertices.tobytes())
        ibo = ctx.buffer(index_array.tobytes())
        return cls(vbo=vbo, ibo=ibo, index_count=len(index_array))

    def release(self) -> None:
        self.vbo.release()
        self.ibo.release()


class ZoneCompositor:
    """Renders one zone (`mesh_warp.vert` + `mesh_warp.frag`) into a target
    framebuffer. Call `render_zone` once per zone, back-to-front, into the
    same FBO with blending enabled to composite a whole projector's output —
    matching `mesh_warp.frag`'s own docstring on how zones stack.
    """

    def __init__(self, ctx: moderngl.Context, mesh_resolution: int = 33):
        self.ctx = ctx
        self.mesh_resolution = mesh_resolution
        self.program = ctx.program(
            vertex_shader=_read_shader("mesh_warp.vert"),
            fragment_shader=_read_shader("mesh_warp.frag"),
        )
        self.grid = GridGeometry.build(ctx, mesh_resolution)
        # a_gridPosition and a_gridUV are meant to coincide (see
        # mesh_warp.vert's comment), so both attributes are bound to the
        # same buffer as two independent content entries rather than
        # duplicating the data.
        self.vao = ctx.vertex_array(
            self.program,
            [
                (self.grid.vbo, "2f", "a_gridPosition"),
                (self.grid.vbo, "2f", "a_gridUV"),
            ],
            self.grid.ibo,
        )

    def render_zone(
        self,
        target: moderngl.Framebuffer,
        *,
        warp_mesh: np.ndarray,
        visual_style: np.ndarray,
        zone_mask: np.ndarray,
        zone_opacity: float = 1.0,
        color_correction: tuple[float, float, float] = (1.0, 1.0, 1.0),
        bass: float = 0.0,
        mids: float = 0.0,
        treble: float = 0.0,
    ) -> None:
        if warp_mesh.shape[0] != self.mesh_resolution:
            raise ValueError(
                f"warp_mesh resolution {warp_mesh.shape[0]} does not match "
                f"this compositor's grid resolution {self.mesh_resolution}"
            )

        warp_texture = _upload_warp_mesh_texture(self.ctx, warp_mesh)
        visual_texture = _upload_rgba_texture(self.ctx, visual_style)
        mask_texture = _upload_scalar_texture(self.ctx, zone_mask)

        try:
            warp_texture.use(location=0)
            visual_texture.use(location=1)
            mask_texture.use(location=2)

            self.program["u_warpMesh"] = 0
            self.program["u_visualStyle"] = 1
            self.program["u_zoneMask"] = 2
            self.program["u_zoneOpacity"] = float(zone_opacity)
            self.program["u_colorCorrection"] = tuple(float(v) for v in color_correction)
            self.program["u_bass"] = float(bass)
            self.program["u_mids"] = float(mids)
            self.program["u_treble"] = float(treble)

            target.use()
            self.ctx.enable(moderngl.BLEND)
            self.ctx.blend_func = (moderngl.SRC_ALPHA, moderngl.ONE_MINUS_SRC_ALPHA)
            self.vao.render(moderngl.TRIANGLES)
        finally:
            warp_texture.release()
            visual_texture.release()
            mask_texture.release()

    def release(self) -> None:
        self.vao.release()
        self.grid.release()
        self.program.release()


class EdgeBlendPass:
    """Final full-output compositing pass (`edge_blend.frag`) for
    multi-projector setups — applied after `ZoneCompositor` has drawn all
    of one projector's zones, not per-zone.
    """

    def __init__(self, ctx: moderngl.Context):
        self.ctx = ctx
        self.program = ctx.program(
            vertex_shader=_read_shader("fullscreen_quad.vert"),
            fragment_shader=_read_shader("edge_blend.frag"),
        )
        # Clip-space quad covering the whole viewport, with UVs matching
        # this module's top-left-origin convention (v=0 at the top row of
        # the source texture).
        quad = np.array(
            [
                [-1.0, 1.0, 0.0, 0.0],
                [-1.0, -1.0, 0.0, 1.0],
                [1.0, 1.0, 1.0, 0.0],
                [1.0, -1.0, 1.0, 1.0],
            ],
            dtype=np.float32,
        )
        self.vbo = ctx.buffer(quad.tobytes())
        self.vao = ctx.vertex_array(
            self.program, [(self.vbo, "2f 2f", "a_position", "a_uv")]
        )

    def render(
        self,
        target: moderngl.Framebuffer,
        source_rgba: np.ndarray,
        *,
        overlap_start: float,
        overlap_end: float,
        fade_to_start: bool,
    ) -> None:
        source_texture = _upload_rgba_texture(self.ctx, source_rgba)
        try:
            source_texture.use(location=0)
            self.program["u_projectorOutput"] = 0
            self.program["u_overlapStart"] = float(overlap_start)
            self.program["u_overlapEnd"] = float(overlap_end)
            self.program["u_fadeToStart"] = bool(fade_to_start)

            target.use()
            self.ctx.disable(moderngl.BLEND)
            self.vao.render(moderngl.TRIANGLE_STRIP)
        finally:
            source_texture.release()

    def release(self) -> None:
        self.vao.release()
        self.vbo.release()
        self.program.release()
