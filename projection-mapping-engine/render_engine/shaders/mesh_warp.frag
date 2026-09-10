#version 330 core
// Module 3 — per-zone composite fragment stage.
//
// One draw per zone: samples that zone's Visual Style (video frame or
// procedural shader output), multiplies by its mask (already Focus/Cutout
// inverted upstream by cv_engine.segmentation.mask_engine.compute_output_mask
// — this shader never branches on Focus vs. Cutout, it just multiplies),
// applies ambient wall color correction, and modulates with audio-reactive
// uniforms. Zones are blended back-to-front by the compositor that invokes
// this shader per zone.

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_visualStyle;    // zone's video frame / procedural shader render target
uniform sampler2D u_zoneMask;       // M(x,y) in [0,1], already Focus/Cutout resolved (§3D.4)
uniform float u_zoneOpacity;        // 0.0 when zone mode is "mute" (§1.2), else 1.0

// Ambient wall color correction (§3H): G_channel = 255 / C_wall_channel,
// precomputed on the CPU from the calibration white-frame capture and
// passed in as a per-channel gain.
uniform vec3 u_colorCorrection;

// Audio-reactive engine (§3I): normalized [0,1] FFT band energies.
uniform float u_bass;
uniform float u_mids;
uniform float u_treble;

void main() {
    vec4 visual = texture(u_visualStyle, v_uv);
    float mask = texture(u_zoneMask, v_uv).r;

    vec3 corrected = clamp(visual.rgb * u_colorCorrection, 0.0, 1.0);

    // Bass drives brightness pulse, treble drives a subtle hue push — kept
    // as a single cheap multiply/add so every Visual Style gets audio
    // reactivity for free without each shader re-deriving it.
    float pulse = 1.0 + u_bass * 0.35;
    vec3 reactive = corrected * pulse;
    reactive += vec3(u_treble * 0.05, u_mids * 0.02, 0.0);

    float alpha = visual.a * mask * u_zoneOpacity;
    fragColor = vec4(reactive, alpha);
}
