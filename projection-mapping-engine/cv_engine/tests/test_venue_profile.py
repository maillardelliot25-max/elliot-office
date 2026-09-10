from __future__ import annotations

from pathlib import Path

from cv_engine.venue.venue_profile import VenueProfile, ZoneProfile, venues_directory


def test_venue_profile_round_trips_through_json(tmp_path: Path):
    profile = VenueProfile(
        venue_name="Downtown Gala",
        calibration_mesh_path="calibration_matrix.json",
        projector_resolution=(1920, 1080),
        zones=[
            ZoneProfile(
                zone_id="wall",
                name="Wall Deck",
                mode="focus",
                mask_path="wall_mask.npy",
            ),
            ZoneProfile(
                zone_id="frame",
                name="Picture Frame Deck",
                mode="cutout",
                mask_path="frame_mask.npy",
                assigned_media_path="loops/gold_shimmer.mp4",
                visual_style_id="shimmer_01",
            ),
        ],
    )

    target = tmp_path / "downtown_gala.json"
    profile.save(target)
    loaded = VenueProfile.load(target)

    assert loaded.venue_name == profile.venue_name
    assert loaded.projector_resolution == (1920, 1080)
    assert len(loaded.zones) == 2
    assert loaded.zones[1].assigned_media_path == "loops/gold_shimmer.mp4"
    assert loaded.mesh_resolution == profile.mesh_resolution


def test_venues_directory_creates_missing_folder(tmp_path: Path):
    app_data_dir = tmp_path / "app_data"
    assert not app_data_dir.exists()

    directory = venues_directory(app_data_dir)

    assert directory.exists()
    assert directory == app_data_dir / "venues"
