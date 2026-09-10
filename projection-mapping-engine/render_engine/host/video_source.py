"""Software video decode for a zone's Visual Style / assigned media (spec
§3E: hardware-decoded multi-stream playback with seamless looping).

Uses OpenCV's `cv2.VideoCapture` — a real, working, cross-platform decode
path (backed by ffmpeg on most OpenCV builds), just not the *hardware-
accelerated* one the spec calls for (`mpv` on Windows/desktop, `ExoPlayer`
on Android). Frames this reads feed directly into
`render_engine.host.renderer.ZoneCompositor.render_zone`'s `visual_style`
parameter — same array shape/dtype as a photo loaded by
`cv_engine.canvas.canvas_ingest`, so a zone's content source (a still image
or a looping video) is interchangeable from the compositor's point of view.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


class VideoTextureSource:
    """Reads a video file frame-by-frame as RGB float32 arrays in [0, 1],
    looping back to the start when it reaches the end (§3E.2's "seamless
    video looping") unless `loop=False`.
    """

    def __init__(self, path: Path, loop: bool = True):
        self.path = Path(path)
        self._capture = cv2.VideoCapture(str(self.path))
        if not self._capture.isOpened():
            raise RuntimeError(f"could not open video: {self.path}")

        self.loop = loop
        self.frame_count = int(self._capture.get(cv2.CAP_PROP_FRAME_COUNT))
        self.fps = self._capture.get(cv2.CAP_PROP_FPS) or 30.0
        self.frame_index = -1  # index of the frame most recently returned; see below

    def read_frame(self) -> np.ndarray:
        """Returns the next frame. Raises `StopIteration` at end-of-stream
        if `loop` is `False`; otherwise seeks back to frame 0 and returns
        that frame instead of ever returning an empty read to the caller.

        `self.frame_index` always ends up as the 0-based index of the
        frame this call returns — both the normal-advance path and the
        loop-back path set it explicitly, so a caller can't observe it
        skipping or repeating an index across a loop boundary.
        """
        ok, frame_bgr = self._capture.read()
        if not ok:
            if not self.loop:
                raise StopIteration(f"end of video: {self.path}")
            self._capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame_bgr = self._capture.read()
            if not ok:
                raise RuntimeError(f"could not read a frame even after looping: {self.path}")
            self.frame_index = 0
        else:
            self.frame_index += 1

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        return (rgb.astype(np.float32) / 255.0)

    def release(self) -> None:
        self._capture.release()

    def __enter__(self) -> "VideoTextureSource":
        return self

    def __exit__(self, *exc_info) -> None:
        self.release()
