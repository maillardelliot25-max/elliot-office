"""cv_engine control-plane entrypoint.

Runs a local WebSocket server the Flutter UI shell connects to for
everything that isn't a per-frame render operation: Scan Room progress,
Highlight Target requests, and Save/Load Venue. Per-frame mask/calibration
data is handed off to the render engine over `render_bridge`, not this
socket — see ARCHITECTURE.md §3 for why the control and frame paths are
split.

Run with: `python -m cv_engine.main`
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

import websockets
from websockets.server import WebSocketServerProtocol

from cv_engine.segmentation.mask_engine import compute_output_mask
from cv_engine.venue.venue_profile import VenueProfile, venues_directory

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cv_engine")

HOST = "127.0.0.1"
PORT = 8765

APP_DATA_DIR = Path.home() / ".projection_mapper"


class ControlServer:
    def __init__(self, app_data_dir: Path = APP_DATA_DIR):
        self.app_data_dir = app_data_dir
        self.venues_dir = venues_directory(app_data_dir)

    async def handle_connection(self, websocket: WebSocketServerProtocol) -> None:
        logger.info("UI shell connected")
        async for raw_message in websocket:
            try:
                request = json.loads(raw_message)
                response = await self.dispatch(request)
            except Exception as exc:  # surfaced to the operator, not silently dropped
                logger.exception("request failed")
                response = {"ok": False, "error": str(exc)}
            await websocket.send(json.dumps(response))

    async def dispatch(self, request: dict[str, Any]) -> dict[str, Any]:
        command = request.get("command")

        if command == "set_zone_mode":
            mask_shape = tuple(request["maskShape"])
            import numpy as np

            # Placeholder mask until segmentation lands; proves the
            # focus/cutout/mute contract end-to-end over the wire.
            mask = np.zeros(mask_shape, dtype="float32")
            output = compute_output_mask(mask, request["mode"])
            return {"ok": True, "maskShape": list(output.shape)}

        if command == "save_venue":
            profile = VenueProfile(**request["venue"])
            target = self.venues_dir / f"{profile.venue_name}.json"
            profile.save(target)
            return {"ok": True, "path": str(target)}

        if command == "load_venue":
            target = self.venues_dir / f"{request['venueName']}.json"
            if not target.exists():
                return {"ok": False, "error": f"no saved venue named {request['venueName']!r}"}
            profile = VenueProfile.load(target)
            return {"ok": True, "venue": profile.__dict__}

        if command == "scan_room":
            # TODO(Module 2/3): drive GrayCodePatternSet display via the
            # render engine, capture via LiveCameraSource, decode, fit, and
            # save_calibration(). Left unimplemented until camera + render
            # loop integration lands; see structured_light.py.
            return {"ok": False, "error": "Scan Room is not implemented yet"}

        return {"ok": False, "error": f"unknown command: {command!r}"}


async def main() -> None:
    server = ControlServer()
    async with websockets.serve(server.handle_connection, HOST, PORT):
        logger.info("cv_engine control server listening on ws://%s:%d", HOST, PORT)
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
