"""Validates the FFT band-energy math against synthetic tones — no
microphone needed, since `compute_band_energies` only needs a sample
buffer and a sample rate.
"""

from __future__ import annotations

import numpy as np
import pytest

from render_engine.audio.audio_engine import (
    AudioReactiveEngine,
    PortAudioSource,
    compute_band_energies,
)

SAMPLE_RATE = 44_100
WINDOW_SAMPLES = 4096


def _tone(freq_hz: float, amplitude: float = 0.5, n: int = WINDOW_SAMPLES) -> np.ndarray:
    t = np.arange(n) / SAMPLE_RATE
    return amplitude * np.sin(2 * np.pi * freq_hz * t)


@pytest.mark.parametrize(
    "freq_hz,expected_band",
    [(100, "bass"), (1_000, "mids"), (8_000, "treble")],
)
def test_pure_tone_activates_only_its_own_band(freq_hz, expected_band):
    bass, mids, treble = compute_band_energies(_tone(freq_hz), SAMPLE_RATE)
    levels = {"bass": bass, "mids": mids, "treble": treble}

    assert levels[expected_band] > 0.85, f"{expected_band} tone should strongly activate {expected_band}"
    for band, value in levels.items():
        if band != expected_band:
            assert value < 0.05, f"{freq_hz}Hz tone leaked into {band}: {value}"


def test_silence_is_zero_everywhere():
    silence = np.zeros(WINDOW_SAMPLES)
    assert compute_band_energies(silence, SAMPLE_RATE) == (0.0, 0.0, 0.0)


def test_response_scales_roughly_linearly_with_amplitude():
    loud_bass, _, _ = compute_band_energies(_tone(100, amplitude=0.5), SAMPLE_RATE)
    quiet_bass, _, _ = compute_band_energies(_tone(100, amplitude=0.05), SAMPLE_RATE)
    assert quiet_bass < loud_bass
    assert quiet_bass == pytest.approx(loud_bass / 10, rel=0.15)


def test_all_bands_saturate_similarly_for_full_scale_tones():
    """The three bands span very different widths (Bass ~230Hz, Treble
    ~16kHz) — this guards against a band-width-dependent scaling bug where
    a full-scale tone in a wide band reads much quieter than the same
    tone in a narrow band.
    """
    bass, _, _ = compute_band_energies(_tone(100), SAMPLE_RATE)
    _, mids, _ = compute_band_energies(_tone(1_000), SAMPLE_RATE)
    _, _, treble = compute_band_energies(_tone(8_000), SAMPLE_RATE)

    values = [bass, mids, treble]
    assert max(values) - min(values) < 0.1


def test_rejects_non_mono_input():
    stereo = np.zeros((WINDOW_SAMPLES, 2))
    with pytest.raises(ValueError):
        compute_band_energies(stereo, SAMPLE_RATE)


def test_rejects_too_few_samples():
    with pytest.raises(ValueError):
        compute_band_energies(np.array([0.1]), SAMPLE_RATE)


def test_audio_reactive_engine_attacks_fast_and_releases_slowly():
    engine = AudioReactiveEngine(sample_rate=SAMPLE_RATE, attack=0.6, release=0.15)

    bass, _, _ = engine.push_samples(_tone(100))
    assert 0.0 < bass < 0.95, "one push shouldn't instantly jump to the raw target"

    for _ in range(10):
        bass, _, _ = engine.push_samples(_tone(100))
    assert bass > 0.9, "repeated loud input should converge close to the raw target"

    silence = np.zeros(WINDOW_SAMPLES)
    bass_after_one_silent_push, _, _ = engine.push_samples(silence)
    assert bass_after_one_silent_push < bass, "should start decaying"
    assert bass_after_one_silent_push > bass * 0.5, "release should be gradual, not instant"


def test_audio_reactive_engine_starts_at_zero():
    engine = AudioReactiveEngine()
    assert engine.levels == (0.0, 0.0, 0.0)


def test_port_audio_source_read_block_is_an_explicit_stub():
    source = PortAudioSource()
    with pytest.raises(NotImplementedError):
        source.read_block()
