"""Highlight Target / Cutout Mode — local segmentation (spec §3D).

Two backends behind the same [SegmentationResult] contract:

- [ClassicalSegmentationEngine]: OpenCV GrabCut seeded from the operator's
  tap point, filtered to the connected component under that point. Needs no
  model download, so it's what "Highlight Target" runs on out of the box —
  genuinely satisfies "zero cloud/internet required" rather than just
  deferring to a future model bundle.
- [SegmentationEngine]: the quantized SAM/YOLOv8-Seg ONNX path from the
  original spec, for when a bundled model raises mask quality beyond what
  GrabCut can do on cluttered scenes. Still pending a bundled model file.

Both turn their output into the Focus/Cutout mask matrix the render engine
multiplies against a zone's Visual Style.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import cv2
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


class ClassicalSegmentationEngine:
    """Point-seeded GrabCut segmentation — the default "Highlight Target"
    backend, requiring no bundled model.

    The operator's tap point seeds a generously-sized rectangle (GrabCut
    needs a rect or explicit fg/bg pixel hints to initialize); after
    GrabCut converges, the result is filtered down to just the connected
    foreground component under the tap point, so a false-positive
    foreground blob elsewhere in frame (e.g. another high-contrast object)
    never leaks into the mask.
    """

    def __init__(self, iterations: int = 5, box_fraction: float = 0.4):
        self.iterations = iterations
        self.box_fraction = box_fraction

    def segment_at_point(
        self, frame: np.ndarray, point_xy: tuple[int, int]
    ) -> SegmentationResult:
        height, width = frame.shape[:2]
        point_x, point_y = point_xy
        if not (0 <= point_x < width and 0 <= point_y < height):
            raise ValueError(f"point {point_xy} is outside the frame ({width}x{height})")

        box_w = max(int(width * self.box_fraction), 20)
        box_h = max(int(height * self.box_fraction), 20)
        x0 = int(np.clip(point_x - box_w // 2, 0, max(width - box_w, 0)))
        y0 = int(np.clip(point_y - box_h // 2, 0, max(height - box_h, 0)))
        box_w = min(box_w, width - x0)
        box_h = min(box_h, height - y0)
        rect = (x0, y0, box_w, box_h)

        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        grabcut_mask = np.zeros((height, width), dtype=np.uint8)
        background_model = np.zeros((1, 65), dtype=np.float64)
        foreground_model = np.zeros((1, 65), dtype=np.float64)

        cv2.grabCut(
            frame_bgr,
            grabcut_mask,
            rect,
            background_model,
            foreground_model,
            self.iterations,
            cv2.GC_INIT_WITH_RECT,
        )
        foreground = np.where(
            (grabcut_mask == cv2.GC_FGD) | (grabcut_mask == cv2.GC_PR_FGD), 1, 0
        ).astype(np.uint8)

        num_labels, labels = cv2.connectedComponents(foreground)
        target_label = labels[point_y, point_x]

        if target_label == 0:
            # The tap point itself didn't land on GrabCut's foreground
            # estimate (e.g. the operator tapped a near-uniform surface);
            # fall back to the full seed rectangle rather than returning
            # an empty mask.
            mask = np.zeros((height, width), dtype=np.float32)
            mask[y0 : y0 + box_h, x0 : x0 + box_w] = 1.0
            return SegmentationResult(mask=mask, confidence=0.3)

        mask = (labels == target_label).astype(np.float32)
        return SegmentationResult(mask=mask, confidence=0.7)


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
