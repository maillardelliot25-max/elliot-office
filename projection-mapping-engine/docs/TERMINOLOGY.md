# Zero-Jargon Terminology Map

UI copy, button labels, and any user-facing string MUST use the left column only.
Code, APIs, and internal docs use the right column. If you're writing a string for
a `Text()` widget, check this table before typing "mask", "homography", "keystone",
or "alpha" anywhere the operator can see it.

| Operator-facing term (UI copy) | Engine term (code/API) |
|---|---|
| Scan Room | Mesh warping / structured-light calibration |
| Load Wall Photo | Upload canvas image (PNG/JPEG/HEIC) |
| Highlight Target | Polygon masking / edge segmentation |
| Cutout Mode | Alpha invert / negative-space mask |
| Visual Style | Fragment shader / media playback asset |
| Send to Projector | NDI / display routing / window positioning |
| Nudge Corners | Manual keystone correction |
| Zone Deck | Layer stack (grouped by physical object, not by time) |
| Focus | Mask applied directly: `color * M` |
| Cutout (Invert) | Mask inverted: `color * (1.0 - M)` |
| Mute | Zone alpha forced to 0 |
| Save Venue / Load Venue | Serialize/deserialize `venue_profile.json` |
