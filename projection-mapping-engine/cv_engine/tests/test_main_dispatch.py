"""Exercises ControlServer.dispatch directly — the same coroutine the
WebSocket handler calls per message — without needing an actual socket.
Covers the request/response contract the Dart `ControlClient` (Module 4)
and `main.py` agree on.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import cv2
import numpy as np
import pytest

from cv_engine.calibration.structured_light import MESH_RESOLUTION, load_calibration
from cv_engine.main import ControlServer


@pytest.fixture
def server(tmp_path: Path) -> ControlServer:
    return ControlServer(app_data_dir=tmp_path)


def _run(coro):
    return asyncio.run(coro)


def _write_test_photo(path: Path) -> None:
    frame = np.full((120, 160, 3), (40, 35, 60), dtype=np.uint8)
    frame[30:90, 40:120] = (230, 220, 200)
    cv2.imwrite(str(path), cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))


def test_highlight_target_requires_a_loaded_photo(server: ControlServer):
    response = _run(
        server.dispatch({"command": "highlight_target", "zoneId": "wall", "point": [10, 10]})
    )
    assert response["ok"] is False
    assert "Load Wall Photo" in response["error"]


def test_load_photo_then_highlight_then_set_zone_mode(server: ControlServer, tmp_path: Path):
    photo_path = tmp_path / "wall.png"
    _write_test_photo(photo_path)

    load_response = _run(server.dispatch({"command": "load_wall_photo", "path": str(photo_path)}))
    assert load_response == {"ok": True, "width": 160, "height": 120}

    highlight_response = _run(
        server.dispatch(
            {"command": "highlight_target", "zoneId": "frame", "point": [80, 60]}
        )
    )
    assert highlight_response["ok"] is True
    assert highlight_response["maskShape"] == [120, 160]

    mode_response = _run(
        server.dispatch({"command": "set_zone_mode", "zoneId": "frame", "mode": "cutout"})
    )
    assert mode_response == {"ok": True, "maskShape": [120, 160]}


def test_set_zone_mode_defaults_to_zero_mask_for_unsegmented_zone(server: ControlServer):
    response = _run(
        server.dispatch({"command": "set_zone_mode", "zoneId": "never_highlighted", "mode": "focus"})
    )
    assert response == {"ok": True, "maskShape": [0, 0]}


def test_nudge_corners_updates_session_mesh(server: ControlServer):
    canonical_top_left = [0.0, 0.0]
    dragged_points = [[0.1, 0.08], [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]]

    response = _run(
        server.dispatch(
            {"command": "nudge_corners", "pointCount": 4, "points": dragged_points}
        )
    )

    assert response["ok"] is True
    assert response["maxDisplacement"] > 0
    assert list(server._calibration_mesh[0, 0]) != canonical_top_left


def test_nudge_corners_then_save_calibration_round_trips(server: ControlServer, tmp_path: Path):
    _run(
        server.dispatch(
            {
                "command": "nudge_corners",
                "pointCount": 4,
                "points": [[0.1, 0.08], [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]],
            }
        )
    )
    target = tmp_path / "calibration_matrix.json"
    save_response = _run(server.dispatch({"command": "save_calibration", "path": str(target)}))

    assert save_response == {"ok": True, "path": str(target)}
    loaded = load_calibration(target)
    assert loaded.shape == (MESH_RESOLUTION, MESH_RESOLUTION, 2)
    np.testing.assert_allclose(loaded, server._calibration_mesh, atol=1e-5)


def test_save_and_load_venue_round_trip(server: ControlServer):
    venue = {
        "venue_name": "Test Venue",
        "calibration_mesh_path": "calibration_matrix.json",
        "projector_resolution": [1920, 1080],
        "zones": [],
    }
    save_response = _run(server.dispatch({"command": "save_venue", "venue": venue}))
    assert save_response["ok"] is True

    load_response = _run(server.dispatch({"command": "load_venue", "venueName": "Test Venue"}))
    assert load_response["ok"] is True
    assert load_response["venue"]["venue_name"] == "Test Venue"


def test_unknown_command_returns_error(server: ControlServer):
    response = _run(server.dispatch({"command": "do_a_barrel_roll"}))
    assert response["ok"] is False
    assert "do_a_barrel_roll" in response["error"]
