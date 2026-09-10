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

## 6. What's implemented in this pass vs. scaffolded

This first pass delivers **Module 1 end-to-end** (the "display daemon" the spec
explicitly asks for first) plus buildable skeletons for Modules 2–4 with real
signatures and data contracts, so each module can be filled in independently without
changing the interfaces above. Sections not yet implemented are marked `TODO` at the
point in the code where they attach — see each folder's own README for status.

No Flutter/Dart SDK, MSVC, or Android SDK is available in this execution
environment, so native/Dart code here is hand-written to the target SDKs' real APIs
but has **not** been compiled here. `cv_engine` is pure Python and its module
structure has been import-checked with the local `python3`.
