"""Audio-Reactive Engine (spec §3I).

Turns a raw PCM audio buffer into the three normalized band-energy values
`mesh_warp.frag` binds as `u_bass`/`u_mids`/`u_treble`: Bass (20Hz-250Hz),
Mids (250Hz-4kHz), Treble (4kHz-20kHz).

The FFT band-energy math (`compute_band_energies`) needs only a buffer of
samples and a sample rate — it's implemented and tested here against
synthetic tones. Live capture (`PortAudioSource`) needs an actual
microphone/line-in device this environment doesn't have, so it stays a
thin, honest stub: the interface real capture would fill in, not a
placeholder blocking the math around it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

BASS_RANGE_HZ = (20.0, 250.0)
MIDS_RANGE_HZ = (250.0, 4_000.0)
TREBLE_RANGE_HZ = (4_000.0, 20_000.0)


def _band_energy(magnitudes: np.ndarray, freqs: np.ndarray, low_hz: float, high_hz: float) -> float:
    """Peak FFT bin magnitude in [low_hz, high_hz).

    Peak rather than an RMS average across the band: the three bands span
    very different widths (Bass is ~230Hz, Treble is ~16kHz), so averaging
    a concentrated tone's energy over a much wider band systematically
    reads quieter the wider the band is — a loud kick drum and an equally
    loud cymbal would report very different-looking energy purely from
    band width, not loudness. Peak tracks "how loud is the loudest thing
    in this band" independent of the band's width, which is both what a
    simple spectrum-style visualizer conventionally does and what keeps a
    narrowband test tone and broadband musical content scoring comparably.
    """
    in_band = (freqs >= low_hz) & (freqs < high_hz)
    if not np.any(in_band):
        return 0.0
    return float(np.max(magnitudes[in_band]))


def compute_band_energies(
    samples: np.ndarray,
    sample_rate: int,
    reference_amplitude: float = 0.5,
) -> tuple[float, float, float]:
    """Computes normalized (bass, mids, treble) energy in `samples`
    (mono PCM, float in roughly [-1, 1]) via a windowed FFT.

    A Hann window is applied before the FFT to reduce spectral leakage
    from `samples` not being an exact multiple of each band frequency's
    period — without it, a pure sine tone smears energy into neighboring
    bands and the band separation this function exists for gets muddy.

    `reference_amplitude` is the RMS magnitude treated as "full scale"
    (band energy == 1.0); it's a mixing-level calibration constant an
    operator could expose as a sensitivity control, not a physical
    constant — the default (0.5) is tuned so a full-amplitude sine tone in
    a band saturates that band to ~1.0 (see
    `render_engine/tests/test_audio_engine.py`).
    """
    if samples.ndim != 1:
        raise ValueError(f"expected mono samples (1-D array), got shape {samples.shape}")
    if len(samples) < 2:
        raise ValueError("need at least 2 samples to run an FFT")

    window = np.hanning(len(samples))
    windowed = samples.astype(np.float64) * window

    spectrum = np.fft.rfft(windowed)
    magnitudes = np.abs(spectrum) / (np.sum(window) / 2.0)
    freqs = np.fft.rfftfreq(len(samples), d=1.0 / sample_rate)

    bass = _band_energy(magnitudes, freqs, *BASS_RANGE_HZ) / reference_amplitude
    mids = _band_energy(magnitudes, freqs, *MIDS_RANGE_HZ) / reference_amplitude
    treble = _band_energy(magnitudes, freqs, *TREBLE_RANGE_HZ) / reference_amplitude

    return (
        float(np.clip(bass, 0.0, 1.0)),
        float(np.clip(mids, 0.0, 1.0)),
        float(np.clip(treble, 0.0, 1.0)),
    )


@dataclass
class AudioReactiveEngine:
    """Smooths raw per-frame band energies with an attack/release envelope
    so `u_bass`/`u_mids`/`u_treble` don't jitter frame-to-frame the way a
    raw FFT would — a visual pulse should rise fast on a beat and decay
    smoothly, not flicker with every buffer's noise floor.
    """

    sample_rate: int = 44_100
    attack: float = 0.6   # how much of a rising value to accept per push (0-1)
    release: float = 0.15  # how much of a falling value to accept per push (0-1)
    reference_amplitude: float = 0.5

    _bass: float = field(default=0.0, init=False)
    _mids: float = field(default=0.0, init=False)
    _treble: float = field(default=0.0, init=False)

    def push_samples(self, samples: np.ndarray) -> tuple[float, float, float]:
        raw_bass, raw_mids, raw_treble = compute_band_energies(
            samples, self.sample_rate, self.reference_amplitude
        )
        self._bass = self._smooth(self._bass, raw_bass)
        self._mids = self._smooth(self._mids, raw_mids)
        self._treble = self._smooth(self._treble, raw_treble)
        return self._bass, self._mids, self._treble

    def _smooth(self, previous: float, target: float) -> float:
        rate = self.attack if target > previous else self.release
        return previous + (target - previous) * rate

    @property
    def levels(self) -> tuple[float, float, float]:
        return self._bass, self._mids, self._treble


class PortAudioSource:
    """Live microphone/line-in capture (§3I: `PortAudio`/Web Audio).

    Needs an actual audio input device, which this environment doesn't
    have — implementing this for real means wrapping `sounddevice` or
    `pyaudio`'s callback-based stream API to push fixed-size buffers into
    an [AudioReactiveEngine]. Left as an explicit stub rather than faked,
    since there's no way to validate a capture implementation without
    hardware to capture from.
    """

    def __init__(self, sample_rate: int = 44_100, block_size: int = 1024):
        self.sample_rate = sample_rate
        self.block_size = block_size

    def read_block(self) -> np.ndarray:
        raise NotImplementedError(
            "live audio capture needs a real input device; "
            "use compute_band_energies()/AudioReactiveEngine directly with "
            "recorded or synthetic sample buffers instead"
        )
