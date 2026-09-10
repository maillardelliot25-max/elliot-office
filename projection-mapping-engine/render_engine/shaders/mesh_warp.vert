#version 330 core
// Module 3 — mesh warp vertex stage (spec §3C).
//
// The render surface is a tessellated grid matching the calibration mesh
// resolution (33x33 control points, MESH_RESOLUTION in
// cv_engine/calibration/structured_light.py). Each vertex is displaced by
// the corresponding control point loaded from calibration_matrix.json, so a
// warped wall surface is one draw call, not a per-pixel remap.

layout(location = 0) in vec2 a_gridPosition;   // grid position in [0,1]^2, generated once at mesh build time
layout(location = 1) in vec2 a_gridUV;         // matches a_gridPosition; passed through for content sampling

uniform sampler2D u_warpMesh;   // MESH_RESOLUTION x MESH_RESOLUTION, RG32F: displaced (x, y) in [0,1] UV space
// No output-resolution uniform needed: `warped` is already a normalized
// [0,1] UV covering the full output canvas, so the clip-space conversion
// below doesn't need pixel dimensions — a non-square aspect ratio is
// handled by the compositor sizing the target framebuffer/window, not by
// this shader.

out vec2 v_uv;

void main() {
    vec2 warped = texture(u_warpMesh, a_gridPosition).xy;

    // warped is normalized projector-surface UV; convert to clip space.
    vec2 clip = warped * 2.0 - 1.0;
    clip.y = -clip.y; // flip to match standard top-left-origin UV convention

    gl_Position = vec4(clip, 0.0, 1.0);
    v_uv = a_gridUV;
}
