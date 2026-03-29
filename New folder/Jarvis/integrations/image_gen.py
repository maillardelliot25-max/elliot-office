"""
JARVIS — Nanobanana Image & Video Generation
=============================================
Nanobanana = Google's Gemini native image generation
  - Nano Banana 2 (latest): gemini-3.1-flash-image-preview
  - Nano Banana:             gemini-2.5-flash-image
  - Nano Banana Pro:         gemini-3-pro-image-preview
Video:
  - Veo 3.1:                 veo-3.0-generate-preview ($0.75/sec)

One API key covers all of these.
Get key FREE at: https://aistudio.google.com
"""

import asyncio
import base64
import logging
import os
import time
from datetime import datetime
from pathlib import Path

from google import genai
from google.genai import types

from config.settings import settings

logger = logging.getLogger("jarvis.image_gen")

# Model identifiers
NANOBANANA_2   = "gemini-3.1-flash-image-preview"   # latest, fastest
NANOBANANA     = "gemini-2.5-flash-image"            # original
NANOBANANA_PRO = "gemini-3-pro-image-preview"        # highest quality
VEO_31         = "veo-3.0-generate-preview"          # video


class NanobananaGenerator:
    """
    Full nanobanana + Veo integration for Jarvis.

    Capabilities:
    - Text → image (Nano Banana 2)
    - Image + text → edited image
    - Multi-turn image editing (conversational)
    - Text → video (Veo 3.1, paid)
    - Image → video (Veo 3.1, paid)
    """

    def __init__(self):
        key = settings.GOOGLE_API_KEY
        if not key:
            logger.warning("[NANOBANANA] No GOOGLE_API_KEY set. Get one FREE at https://aistudio.google.com")
            self.client = None
        else:
            self.client = genai.Client(api_key=key)
            logger.info("[NANOBANANA] Initialized — Nano Banana 2 (gemini-3.1-flash-image-preview) + Veo 3.1")

        os.makedirs("./generated", exist_ok=True)

    # ── IMAGE GENERATION ─────────────────────────────────────────────────────

    async def generate_image(
        self,
        prompt: str,
        quality: str = "fast",   # "fast" | "pro"
        reference_image_path: str = None
    ) -> dict:
        """
        Generate an image from a text prompt using Nanobanana.

        quality="fast" → Nano Banana 2 (gemini-3.1-flash-image-preview) — fastest
        quality="pro"  → Nano Banana Pro (gemini-3-pro-image-preview) — best quality
        """
        if not self.client:
            return {"success": False, "error": "No GOOGLE_API_KEY. Get one free at https://aistudio.google.com"}

        model = NANOBANANA_2 if quality != "pro" else NANOBANANA_PRO
        logger.info(f"[NANOBANANA] Generating image with {model}: {prompt[:80]}")

        try:
            contents = []

            # Add reference image if provided
            if reference_image_path:
                with open(reference_image_path, "rb") as f:
                    img_bytes = f.read()
                contents.append(
                    types.Part.from_bytes(data=img_bytes, mime_type="image/png")
                )
                contents.append(f"Edit this image: {prompt}")
            else:
                contents.append(prompt)

            # Run in executor (SDK is sync)
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_modalities=["TEXT", "IMAGE"]
                    )
                )
            )

            # Extract image from response
            for part in response.candidates[0].content.parts:
                if part.inline_data is not None:
                    filename = f"nanobanana_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                    path = f"./generated/{filename}"
                    with open(path, "wb") as f:
                        f.write(part.inline_data.data)

                    logger.info(f"[NANOBANANA] Image saved: {path}")
                    return {
                        "success":    True,
                        "image_path": path,
                        "model":      model,
                        "prompt":     prompt
                    }

            # Only text returned (rare)
            text = response.text or "Image generated but no data returned."
            return {"success": False, "error": text}

        except Exception as e:
            logger.error(f"[NANOBANANA] Image generation failed: {e}")
            return {"success": False, "error": str(e)}

    async def edit_image(self, image_path: str, instruction: str) -> dict:
        """Edit an existing image with a natural language instruction."""
        return await self.generate_image(
            prompt=instruction,
            reference_image_path=image_path
        )

    # ── VIDEO GENERATION (Veo 3.1) ───────────────────────────────────────────

    async def generate_video(
        self,
        prompt: str,
        image_path: str = None,   # optional — image-to-video
        aspect_ratio: str = "16:9",
        duration_seconds: int = 8
    ) -> dict:
        """
        Generate a video using Veo 3.1.

        Pricing: $0.75 per second of video output.
        8-second video = $6.00

        Supports:
        - Text → video
        - Image → video
        - Portrait (9:16) or landscape (16:9)
        """
        if not self.client:
            return {"success": False, "error": "No GOOGLE_API_KEY set."}

        logger.info(f"[VEO] Generating {duration_seconds}s video: {prompt[:80]}")

        try:
            config = types.GenerateVideosConfig(
                aspect_ratio=aspect_ratio,
                number_of_videos=1
            )

            contents = prompt

            # Image-to-video
            if image_path and os.path.exists(image_path):
                with open(image_path, "rb") as f:
                    img_bytes = f.read()
                image_part = types.Image(
                    image_bytes=img_bytes,
                    mime_type="image/png"
                )
                config.image = image_part

            loop = asyncio.get_event_loop()

            # Veo uses long-running operation
            operation = await loop.run_in_executor(
                None,
                lambda: self.client.models.generate_videos(
                    model=VEO_31,
                    prompt=contents,
                    config=config
                )
            )

            # Poll until complete (videos take 1-3 minutes)
            logger.info("[VEO] Waiting for video generation (1-3 min)...")
            max_wait = 300  # 5 minutes
            start = time.time()

            while not operation.done:
                if time.time() - start > max_wait:
                    return {"success": False, "error": "Video generation timed out after 5 minutes"}

                await asyncio.sleep(10)

                operation = await loop.run_in_executor(
                    None,
                    lambda: self.client.operations.get(operation)
                )

            # Download the video
            video = operation.response.generated_videos[0]
            filename = f"veo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
            path = f"./generated/{filename}"

            # Videos expire after 48h — download immediately
            await loop.run_in_executor(
                None,
                lambda: self.client.files.download(
                    file=video.video,
                    download_path=path
                )
            )

            logger.info(f"[VEO] Video saved: {path}")
            return {
                "success":    True,
                "video_path": path,
                "model":      VEO_31,
                "duration":   duration_seconds,
                "prompt":     prompt
            }

        except Exception as e:
            logger.error(f"[VEO] Video generation failed: {e}")
            return {"success": False, "error": str(e)}

    # ── MULTI-TURN (Conversational editing) ──────────────────────────────────

    async def chat_edit(self, history: list[dict], new_instruction: str) -> dict:
        """
        Multi-turn image editing — conversational, like Gemini chat.
        history = [{"role": "user/model", "parts": [...]}]
        """
        if not self.client:
            return {"success": False, "error": "No GOOGLE_API_KEY set."}

        history.append({"role": "user", "parts": [new_instruction]})

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.client.models.generate_content(
                model=NANOBANANA_2,
                contents=history,
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"]
                )
            )
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                filename = f"edit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                path = f"./generated/{filename}"
                with open(path, "wb") as f:
                    f.write(part.inline_data.data)
                return {"success": True, "image_path": path}

        return {"success": False, "error": "No image in response"}
