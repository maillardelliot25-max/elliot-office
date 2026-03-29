"""
JARVIS — Screen Vision
======================
Captures your screen and sends to Claude.
Jarvis can see what you're looking at.

Usage:
- You send /screen to Jarvis via Telegram → it sees your screen
- Or Jarvis auto-captures when needed (e.g. "check my code error")
"""

import base64
import io
import logging
from datetime import datetime
from PIL import ImageGrab, Image

logger = logging.getLogger("jarvis.screen")


class ScreenVision:
    """
    Captures screen and encodes for Claude Vision.
    Works on Windows, macOS, Linux.
    """

    def capture(self, region: tuple = None) -> str:
        """
        Take a screenshot.
        region = (x, y, width, height) or None for full screen.
        Returns base64-encoded PNG string.
        """
        try:
            if region:
                x, y, w, h = region
                screenshot = ImageGrab.grab(bbox=(x, y, x + w, y + h))
            else:
                screenshot = ImageGrab.grab()

            # Resize if too large (Claude max ~5MB)
            max_dim = 1920
            if screenshot.width > max_dim or screenshot.height > max_dim:
                screenshot.thumbnail((max_dim, max_dim), Image.LANCZOS)

            # Convert to base64
            buffer = io.BytesIO()
            screenshot.save(buffer, format="PNG", optimize=True)
            img_bytes = buffer.getvalue()
            b64 = base64.b64encode(img_bytes).decode("utf-8")

            logger.info(f"[SCREEN] Captured {screenshot.width}x{screenshot.height} ({len(img_bytes)//1024}KB)")
            return b64

        except Exception as e:
            logger.error(f"[SCREEN] Capture failed: {e}")
            raise

    def capture_from_bytes(self, image_bytes: bytes) -> str:
        """
        Encode any image bytes as base64 (for Telegram photo messages).
        """
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        logger.info(f"[SCREEN] Encoded {len(image_bytes)//1024}KB image")
        return b64

    def save_screenshot(self, b64: str, filename: str = None) -> str:
        """Save screenshot to disk for debugging."""
        if not filename:
            filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        path = f"./logs/{filename}"
        img_bytes = base64.b64decode(b64)
        with open(path, "wb") as f:
            f.write(img_bytes)
        logger.info(f"[SCREEN] Saved to {path}")
        return path
