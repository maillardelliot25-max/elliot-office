"""Highlight Target / Cutout Mode — local AI segmentation (spec §3D).

Runs a quantized segmentation model (SAM or YOLOv8-Seg) fully on-device via
ONNX Runtime — no cloud call, matching the "zero cloud/internet required"
requirement — and turns its output into the Focus/Cutout mask matrix the
render engine multiplies against a zone's Visual Style.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np

try:
    import onnxruntime as ort
except ImportError:  # pragma: no cover - onnxruntime is a runtime-only dep
    ort = None  # type: ignore[assignment]

ZoneMode = Literal["focus", "cutout", "mute"]


@dataclass
class SegmentationResult:
    """One target object's binary mask, in the coordinate space of the
    input frame it was segmented from.
    """

    mask: np.ndarray  # float32[H, W] in [0, 1] — M(x, y) from §3D.3
    label: str | None = None
    confidence: float = 0.0


class SegmentationEngine:
    """Thin wrapper around an ONNX segmentation model.

    Model choice (SAM vs. YOLOv8-Seg) is an inference-time detail behind
    this class's interface: callers pass a frame and a point/box prompt
    (matching SAM's promptable-segmentation UX, which is what "tap the
    picture frame to Highlight Target" needs) and get back a
    [SegmentationResult].
    """

    def __init__(self, model_path: Path, providers: list[str] | None = None):
        if ort is None:
            raise RuntimeError(
                "onnxruntime is not installed; run `pip install -r requirements.txt`"
            )
        self._session = ort.InferenceSession(
            str(model_path),
            providers=providers or ["CPUExecutionProvider"],
        )

    def segment_at_point(
        self, frame: np.ndarray, point_xy: tuple[int, int]
    ) -> SegmentationResult:
        """Runs promptable segmentation seeded at a single tap point —
        the "Highlight Target" gesture: the operator taps the picture
        frame / TV / pillar on screen and this returns its mask.

        TODO(Module 2): wire the actual SAM/YOLOv8-Seg pre/post-processing
        (image encoder pass, prompt encoder, mask decoder, upsampling to
        `frame`'s resolution) once a quantized model is bundled with the
        app. The mask contract below (`compute_output_mask`) is what
        Module 3's shader is built against, independent of which model
        produces `mask`.
        """
        raise NotImplementedError("Segmentation inference pending bundled ONNX model")


def compute_output_mask(mask: np.ndarray, mode: ZoneMode) -> np.ndarray:
    """Applies the Focus/Cutout/Mute logic from §3D.4.

    Focus:  output = M          (visuals appear only inside the target)
    Cutout: output = 1.0 - M    (visuals appear everywhere except the target)
    Mute:   output = 0          (zone contributes nothing)

    This is the single place the invert-matrix logic lives — both the
    Dart UI's `ZoneMode` and the GLSL `u_zoneMask` uniform are named to
    make this function's mapping obvious at every layer.
    """
    if mode == "focus":
        return mask
    if mode == "cutout":
        return 1.0 - mask
    if mode == "mute":
        return np.zeros_like(mask)
    raise ValueError(f"unknown zone mode: {mode!r}")
