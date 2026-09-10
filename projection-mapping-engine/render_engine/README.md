# Render Engine (Module 3)

GPU compositor that turns each Zone's Visual Style + mask into pixels on the
display daemon's output surface (Module 1), at 60 FPS.

## Shaders

- `shaders/mesh_warp.vert` / `shaders/mesh_warp.frag` — per-zone draw: warps
  a tessellated grid by the Scan Room calibration mesh, then composites that
  zone's video/procedural output through its Focus/Cutout mask with ambient
  color correction and audio-reactive modulation.
- `shaders/fullscreen_quad.vert` — passthrough vertex stage for full-frame
  passes that aren't warped by the calibration mesh.
- `shaders/edge_blend.frag` — final full-output pass for multi-projector
  setups (§3G), applied after all zones for that projector are composited.

## Host renderer (`host/renderer.py`)

A real ModernGL host renderer that compiles and runs the shaders above —
not a mock. It provides:

- `create_headless_context()` — an off-screen GL context (used by the test
  suite and viable as-is for a desktop sidecar render process).
- `GridGeometry` — the tessellated grid `mesh_warp.vert` expects, built at
  a given calibration-mesh resolution, with vertices placed at texel
  centers of the warp-mesh texture so NEAREST-filtered lookups are exact,
  not blurred, at every grid node.
- `ZoneCompositor` — uploads a calibration mesh, a zone's Visual Style, and
  its mask as textures, and draws one zone into a target framebuffer per
  `render_zone()` call. Call it once per zone, back-to-front, into the same
  framebuffer with blending on to composite a whole projector's output.
- `EdgeBlendPass` — runs the multi-projector cosine-ramp pass over an
  already-composited projector output.

**This has been verified against a real GL pipeline**, not just written:
`render_engine/tests/test_renderer.py` renders through the exact committed
shader files on Mesa's llvmpipe software rasterizer (`moderngl.create_
context(standalone=True)` behind Xvfb — no GPU required) and checks the
actual output pixels. Run it yourself:

```bash
pip install -r requirements-dev.txt
Xvfb :99 -screen 0 1280x1024x24 &
DISPLAY=:99 python -m pytest tests/ -v   # 8 passed
```

Tests skip (not fail) if no GL-capable environment is available, so this
doesn't break a CI box without Xvfb/a GPU — it just won't have verified
this piece.

What those 8 tests actually pin down: a solid zone with a full mask round-
trips through an identity warp exactly; masking gates alpha per-pixel
(Focus semantics); zone opacity mutes regardless of mask; **displacing one
calibration-mesh control point moves content away from its old screen
position and to the new one** (i.e. the warp is real, not a no-op);
`u_colorCorrection` applies its per-channel gain exactly; `u_bass` pulses
brightness by the documented factor; and the edge-blend cosine ramp
produces ~0 / ~0.5 / ~1.0 gain at the start / midpoint / end of an overlap
region, in both fade directions.

One real bug this caught: `mesh_warp.vert` originally declared a
`u_outputResolution` uniform that nothing in the shader body used. GLSL
compilers strip unreferenced uniforms, so the host's `program["u_output
Resolution"] = ...` raised a `KeyError` the moment it actually ran against
a compiled shader — a bug that no amount of reading the GLSL by eye would
have caught, since the shader "looked" fine. Removed the dead uniform
rather than wire up an unused value.

## What's still open

The pieces above are real and tested; what's left is exclusively things
this environment has no way to exercise:

1. **Attaching to the actual projector output surface** instead of an
   off-screen framebuffer — the HWND `DisplayDaemon::SendToProjector`
   returns on Windows (a WGL context bound to that HWND), or the
   `SurfaceView` inside `ProjectorPresentation` on Android (an EGL
   surface). Everything in `renderer.py` below `create_headless_context()`
   is unchanged either way, since it only depends on having *some*
   `moderngl.Context` — this is a context-creation swap, not a rewrite.
2. **Video decode into `u_visualStyle`** — hardware-accelerated `mpv`
   embedding on Windows/desktop, `ExoPlayer` on Android (§3E). Needs real
   video files and a platform video stack this sandbox doesn't have.
3. **Live audio FFT** feeding `u_bass`/`u_mids`/`u_treble` every frame
   (§3I, `PortAudio`/Web Audio) — needs an audio input device.
4. **Driving this from the Flutter shell / `cv_engine`** — today
   `ZoneCompositor`/`EdgeBlendPass` are called directly in tests; wiring
   them into a real per-frame render loop reading live zone state over
   `cv_engine`'s control connection (or a separate frame-data channel, per
   ARCHITECTURE.md §3) is the next integration step once 1–3 land.
