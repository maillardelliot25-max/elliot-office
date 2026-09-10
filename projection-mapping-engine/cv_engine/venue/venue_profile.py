"""Save Venue / Load Venue (spec §3J).

Bundles everything needed to instantly restore an event configuration —
calibration mesh, per-zone masks, assigned media, and active Visual Styles —
into one `venue_profile.json`, so an operator doesn't re-scan a venue they've
already mapped.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

from cv_engine.calibration.structured_light import MESH_RESOLUTION


@dataclass
class ZoneProfile:
    zone_id: str
    name: str
    mode: str  # "focus" | "cutout" | "mute"
    mask_path: str  # relative path to the saved mask PNG/npy alongside this file
    assigned_media_path: str | None = None
    visual_style_id: str | None = None


@dataclass
class VenueProfile:
    venue_name: str
    calibration_mesh_path: str  # relative path to this venue's calibration_matrix.json
    projector_resolution: tuple[int, int]
    zones: list[ZoneProfile] = field(default_factory=list)
    mesh_resolution: int = MESH_RESOLUTION

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(asdict(self), indent=2))

    @classmethod
    def load(cls, path: Path) -> "VenueProfile":
        payload = json.loads(path.read_text())
        zones = [ZoneProfile(**zone) for zone in payload.pop("zones", [])]
        payload["projector_resolution"] = tuple(payload["projector_resolution"])
        return cls(zones=zones, **payload)


def venues_directory(app_data_dir: Path) -> Path:
    """Where `venue_profile.json` bundles (and their sibling mask/calibration
    files) live on disk, keyed by venue name as a subfolder each.
    """
    directory = app_data_dir / "venues"
    directory.mkdir(parents=True, exist_ok=True)
    return directory
