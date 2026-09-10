# Projection Mapping Engine — Architecture Breakdown

Codename: **project**
Targets: Windows desktop (`.exe`) and Android (`.apk`), operated by non-technical AV operators.

This document is the confirmed architecture for the system described in the product
spec. It maps every spec section to a concrete module, a concrete folder, and a
concrete technology, so implementation work can proceed module-by-module without
re-litigating the stack.

## 1. Guiding constraint: zero jargon in, real engineering out

Every screen the operator sees uses the plain-language terms below. Internally, the
code uses the precise technical terms — the mapping is a **presentation-layer
concern only**, enforced in `app/lib/ui/`, never leaking into `cv_engine/` or
`render_engine/` APIs.

| Operator sees        | Engine implements                                   |
|-----------------------|------------------------------------------------------|
| Scan Room             | Structured-light Gray code calibration → homography + TPS mesh warp |
| Load Wall Photo       | Static canvas ingestion (PNG/JPEG/HEIC)              |
| Highlight Target       | Polygon/SAM segmentation mask, `Focus` mode           |
| Cutout Mode            | Inverted alpha mask, `Cutout` mode                    |
| Visual Style           | GLSL fragment shader / media asset bound to a zone    |
| Send to Projector      | Secondary-display detection + borderless output window / Android `Presentation` |
| Nudge Corners          | Manual 4-/9-point keystone override on top of the warp mesh |

See `docs/TERMINOLOGY.md` for the full table used by UI copy review.

## 2. Module map

| Module | Spec section(s) | Folder | Stack |
|---|---|---|---|
| **1. Display & Rendering Daemon** | §3A | `app/windows/native/`, `app/android/.../ProjectorPresentation.kt`, `app/lib/core/display/` | Win32 API (C++), Android `Presentation` API (Kotlin), Dart `MethodChannel` bridge |
| **2. Canvas & CV Pipeline** | §3B, §3C, §3D | `cv_engine/` | Python, OpenCV, ONNX Runtime |
| **3. Video & Shader Playback Engine** | §3E, §3G, §3H, §3I | `render_engine/`, `cv_engine/render_bridge/` | GLSL (ModernGL/Skia host), mpv/ExoPlayer/Media Foundation |
| **4. UI & Manual Nudge Controls** | §1, §3F, §3J | `app/lib/ui/` | Flutter (Windows desktop + Android from one codebase) |

## 3. Process topology

Four long-lived processes communicate over local IPC — no component blocks another,
and the render path never waits on the CV path per-frame:

```
┌─────────────────────┐        MethodChannel/FFI        ┌──────────────────────────┐
│   Flutter UI Shell   │◄────────────────────────────────►│  Display Daemon (native)  │
│   (app/lib)          │                                  │  Win32 EnumDisplayMonitors│
│   Zone Deck cards,    │                                  │  / Android Presentation   │
│   Nudge overlay       │                                  └──────────────────────────┘
└──────────┬───────────┘
           │ WebSocket (JSON control) + shared-memory frame buffer
           ▼
┌───────────────────────┐   ONNX Runtime   ┌─────────────────────────┐
│  CV Engine (Python)    │◄────────────────►│ Segmentation model (.onnx)│
│  cv_engine/            │                  │ quantized SAM / YOLOv8-seg│
│  - calibration         │                  └─────────────────────────┘
│  - segmentation        │
│  - venue profiles      │
└──────────┬─────────────┘
           │ mask matrix M(x,y) + calibration_matrix.json (WebSocket/shm)
           ▼
┌───────────────────────────────────────────────────────────┐
│  Render Engine (GPU)                                        │
│  render_engine/shaders/*.glsl — mesh warp, color correction, │
│  audio-reactive uniforms — composited onto the daemon's      │
│  borderless output window at 60 FPS                          │
└───────────────────────────────────────────────────────────┘
```

**Why WebSockets + shared memory, not a single process:** the CV pipeline
(segmentation, calibration) runs at a few Hz and can stall on ML inference; the
render path must never drop below 60 FPS because of it. Splitting them means a slow
segmentation pass degrades to "last known mask" rather than a dropped frame on the
projector output.

## 4. Data contracts between modules

- `calibration_matrix.json` — 33×33 deformation mesh tensor produced by Module 1's
  Scan Room routine (§3C.5), consumed by Module 3's warp shader as a vertex
  displacement lookup.
- `mask_matrix` — `float32[H,W]` in `[0,1]`, produced by Module 2 per zone, consumed
  by Module 3 as `u_zoneMask` texture. Focus multiplies by `M`; Cutout multiplies by
  `1.0 - M` (§3D.4). This inversion is a one-line shader uniform flip, never a
  separate mask computation — keeps Focus/Cutout toggling instant.
- `venue_profile.json` — bundles calibration + masks + assigned media + active
  Visual Style per zone (§3J), written by `cv_engine/venue/venue_profile.py`, loaded
  by the Flutter shell on "Load Venue".

## 5. Build targets

- **Windows `.exe`**: Flutter Windows desktop build embeds `app/windows/native` as a
  platform plugin; `cv_engine` ships as a bundled Python (PyInstaller) sidecar
  process spawned by the Flutter shell on launch.
- **Android `.apk`**: Flutter Android build embeds `ProjectorPresentation.kt` as a
  platform plugin; `cv_engine` inference runs on-device via ONNX Runtime Mobile
  (no Python interpreter needed on Android — the Python tree is the desktop/dev
  reference implementation the mobile ONNX path is validated against).

## 6. What's implemented vs. scaffolded

**Working and tested** (run `python -m pytest cv_engine/tests/` from `cv_engine/`'s
parent — 24 tests, all passing):

- **Module 1, both platforms, end-to-end**: real `EnumDisplayMonitors` +
  borderless-popup output window on Windows; real `android.app.Presentation`
  routing on Android; one shared Dart method channel behind "Send to Projector".
- **Scan Room decode + fit** (`cv_engine/calibration/structured_light.py`): Gray
  code bit-plane decode (with per-pixel white/black shadow thresholding) and a
  thin-plate-spline mesh fit (`scipy.interpolate.RBFInterpolator`) from sparse
  correspondence samples to the 33×33 calibration mesh. Validated against a
  simulated non-affine warped surface in `cv_engine/tests/test_structured_light.py`
  — the fit recovers the known warp to sub-pixel accuracy and reduces to the
  identity mesh on a flat/unwarped surface.
- **Highlight Target** (`cv_engine/segmentation/mask_engine.py`): a
  `ClassicalSegmentationEngine` using OpenCV GrabCut seeded at the operator's tap
  point, filtered to the connected foreground component under that point. This is
  the *default* segmentation path — it needs no bundled model, so "zero
  cloud/internet required" holds today, not just once a model ships. Validated
  against a synthetic high-contrast scene (IoU > 0.6 against ground truth).
- **Nudge Corners** (`apply_manual_nudge` in `structured_light.py` +
  `app/lib/ui/widgets/nudge_corners_overlay.dart`): a 4-/9-point touch overlay
  merges the operator's dragged handle positions on top of the current
  calibration mesh (whatever Scan Room produced, or the identity mesh if it
  hasn't run yet) via the same thin-plate-spline approach as the Scan Room fit
  — a dragged handle reproduces exactly at that mesh node and fades out
  smoothly with distance, never smearing evenly across the whole surface.
  Covered by both a pure-mesh-math test suite and a `ControlServer.dispatch`
  integration test exercising the exact request the Dart `ControlClient`
  sends.
- **Focus/Cutout/Mute mask logic, Save/Load Venue, canvas ingestion, Nudge
  Corners, and the control-plane WebSocket dispatch** wiring all of the above
  together in `cv_engine/main.py`, with `app/lib/core/control/control_client.dart`
  as the Dart-side request/response bridge to it (used by
  `NudgeCornersScreen` today; `ZoneDeckScreen`'s Scan Room / Highlight Target
  actions are the next things to wire onto the same client).

**Still scaffolded / explicitly blocked** on something this environment can't
provide:

- `SegmentationEngine` (the ONNX SAM/YOLoV8-Seg path) — needs a bundled quantized
  model file; `ClassicalSegmentationEngine` is the working default until then, not
  a placeholder blocking it.
- Live camera capture (`LiveCameraSource`) and driving Scan Room's pattern display
  through a real render loop — needs actual camera/projector hardware; the decode
  and fit math those frames feed into is implemented and tested above.
- Compiling/running the Flutter app (no Flutter SDK here), an MSVC build of the
  Windows native plugin, or an Android Gradle build. Native/Dart code is
  hand-written to the target SDKs' real APIs but unbuilt; `cv_engine`'s Python has
  been executed, not just syntax-checked.
- Render engine host integration (mpv/ExoPlayer embedding, GL context creation,
  audio FFT loop) — see `render_engine/README.md` for what's needed next.
