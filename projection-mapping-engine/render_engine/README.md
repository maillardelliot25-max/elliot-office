# Render Engine (Module 3)

GPU compositor that turns each Zone's Visual Style + mask into pixels on the
display daemon's output surface (Module 1), at 60 FPS.

## Shaders

- `shaders/mesh_warp.vert` / `shaders/mesh_warp.frag` — per-zone draw: warps
  a tessellated grid by the Scan Room calibration mesh, then composites that
  zone's video/procedural output through its Focus/Cutout mask with ambient
  color correction and audio-reactive modulation.
- `shaders/edge_blend.frag` — final full-output pass for multi-projector
  setups (§3G), applied after all zones for that projector are composited.

## Host integration (not yet implemented in this pass)

The shaders above are host-agnostic GLSL; they need a host renderer to:

1. Own the GL context created against the Module 1 output surface (the HWND
   from `DisplayDaemon::SendToProjector` on Windows, or the `SurfaceView`
   inside `ProjectorPresentation` on Android).
2. Decode video assets via hardware acceleration (`mpv` embedding on
   Windows/desktop, `ExoPlayer` on Android) into a texture per zone, per
   spec §3E — this is what `u_visualStyle` samples.
3. Upload `calibration_matrix.json` (from `cv_engine.calibration
   .structured_light`) as `u_warpMesh`, and each zone's mask (from
   `cv_engine.segmentation.mask_engine.compute_output_mask`) as
   `u_zoneMask`, once per change (not once per frame — masks and the warp
   mesh are stable between Scan Room / Highlight Target actions).
4. Run the audio FFT (§3I, `PortAudio`/Web Audio) and feed `u_bass`,
   `u_mids`, `u_treble` every frame.

**Recommended stack**: ModernGL (Python) for the desktop sidecar path, or a
Flutter `Texture`/`flutter_gl` bridge if the render loop is pulled into the
Dart process instead — this is an open architecture decision for whoever
picks up host integration next, since it changes whether `cv_engine` and
the renderer share a process.
