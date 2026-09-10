#version 330 core
// Multi-projector edge blending (spec §3G) — a final compositing pass
// applied to each projector's full output (after mesh_warp.frag has
// composited all of that projector's zones), not per-zone.
//
// The overlap region between two adjacent projector outputs is given a
// cosine falloff ramp so the seam disappears instead of showing a hard
// brightness step or a visible double-exposed strip.

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_projectorOutput;

// Overlap region on this projector's own output, in normalized UV: e.g. a
// projector blended on its right edge with its left neighbor supplies
// u_overlapStart/End near x=1.0; one blended on its left edge supplies them
// near x=0.0. Only one axis (x or y) is blended per uniform set — call this
// shader twice (horizontally then vertically) for a 2x2 projector grid.
uniform float u_overlapStart;
uniform float u_overlapEnd;
uniform bool u_fadeToStart; // true: ramp 1->0 across the overlap; false: 0->1

float cosineRamp(float t) {
    // 0 at t=0, 1 at t=1, smooth (not linear) so no visible slope
    // discontinuity at the overlap boundary.
    return 0.5 - 0.5 * cos(t * 3.14159265);
}

void main() {
    vec4 color = texture(u_projectorOutput, v_uv);

    float gain = 1.0;
    if (v_uv.x >= u_overlapStart && v_uv.x <= u_overlapEnd) {
        float t = (v_uv.x - u_overlapStart) / max(u_overlapEnd - u_overlapStart, 1e-5);
        gain = u_fadeToStart ? (1.0 - cosineRamp(t)) : cosineRamp(t);
    }

    fragColor = vec4(color.rgb * gain, color.a);
}
