#version 330 core
// Passthrough vertex stage for any full-frame pass that isn't warped by the
// calibration mesh — currently just `edge_blend.frag`'s final compositing
// pass, which operates on an already-warped projector output.

layout(location = 0) in vec2 a_position; // clip-space quad corners, [-1,1]^2
layout(location = 1) in vec2 a_uv;

out vec2 v_uv;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_uv = a_uv;
}
