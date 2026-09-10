"""Flexible Canvas Ingestion Engine (spec §3B).

Two ways to get a photo of the venue into the segmentation pipeline: a live
camera feed, or a pre-captured photo/video uploaded ahead of the event
("Load Wall Photo"). Both paths normalize to the same frame shape so
`segmentation.mask_engine` never needs to know which one was used.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

SUPPORTED_PHOTO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".heic", ".heif"}
SUPPORTED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm"}

# Projector output resolutions this engine targets (spec §3B.2).
STANDARD_RESOLUTIONS = {
    "1080p": (1920, 1080),
    "4k": (3840, 2160),
}


class LiveCameraSource:
    """Wraps a UVC/USB camera (or RTSP stream) for the "Scan Room" and
    live-preview flows.
    """

    def __init__(self, device_index_or_url: int | str = 0):
        self._capture = cv2.VideoCapture(device_index_or_url)
        if not self._capture.isOpened():
            raise RuntimeError(f"could not open camera source: {device_index_or_url}")

    def read_frame(self) -> np.ndarray:
        ok, frame = self._capture.read()
        if not ok:
            raise RuntimeError("camera read failed — device disconnected?")
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    def release(self) -> None:
        self._capture.release()


def load_uploaded_photo(path: Path) -> np.ndarray:
    """Loads a "Load Wall Photo" upload (PNG/JPEG/HEIC) as an RGB array.

    HEIC support comes from `pillow-heif` registering itself as a Pillow
    plugin (see requirements.txt) — cv2 alone can't decode HEIC.
    """
    ext = path.suffix.lower()
    if ext not in SUPPORTED_PHOTO_EXTENSIONS:
        raise ValueError(f"unsupported photo format: {ext}")

    if ext in {".heic", ".heif"}:
        import pillow_heif
        from PIL import Image

        pillow_heif.register_heif_opener()
        with Image.open(path) as image:
            return np.array(image.convert("RGB"))

    frame_bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if frame_bgr is None:
        raise ValueError(f"could not decode image: {path}")
    return cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)


def extract_preview_frame(video_path: Path, at_seconds: float = 0.0) -> np.ndarray:
    """Pulls a single frame from an uploaded venue walkthrough video, for
    off-site segmentation ahead of load-in.
    """
    if video_path.suffix.lower() not in SUPPORTED_VIDEO_EXTENSIONS:
        raise ValueError(f"unsupported video format: {video_path.suffix}")

    capture = cv2.VideoCapture(str(video_path))
    try:
        capture.set(cv2.CAP_PROP_POS_MSEC, at_seconds * 1000)
        ok, frame_bgr = capture.read()
        if not ok:
            raise ValueError(f"could not read frame at {at_seconds}s from {video_path}")
        return cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    finally:
        capture.release()


def normalize_to_projector_resolution(
    frame: np.ndarray, target_resolution: tuple[int, int]
) -> np.ndarray:
    """Letterboxes/crops `frame` to match the connected projector's native
    resolution (§3B.2), preserving aspect ratio so masks computed on this
    frame line up 1:1 with the warp shader's output canvas.
    """
    target_w, target_h = target_resolution
    source_h, source_w = frame.shape[:2]

    scale = max(target_w / source_w, target_h / source_h)
    resized = cv2.resize(
        frame, (round(source_w * scale), round(source_h * scale)), interpolation=cv2.INTER_AREA
    )

    resized_h, resized_w = resized.shape[:2]
    x0 = (resized_w - target_w) // 2
    y0 = (resized_h - target_h) // 2
    return resized[y0 : y0 + target_h, x0 : x0 + target_w]
