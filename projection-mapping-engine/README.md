# Projection Mapping Engine ("project")

A zero-jargon automated projection mapping app for AV operators — targets
Windows (`.exe`) and Android (`.apk`) from one codebase. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full module breakdown and
[`docs/TERMINOLOGY.md`](./docs/TERMINOLOGY.md) for the UI-copy-to-engine-term
mapping every screen must follow.

## Layout

```
projection-mapping-engine/
├── ARCHITECTURE.md        Full architecture breakdown (start here)
├── docs/TERMINOLOGY.md    Zero-jargon UI copy <-> engine term table
├── app/                   Flutter UI shell (Windows + Android) — Module 4
│   ├── lib/                Dart: Zone Deck UI, Nudge Corners overlay, display/control service bridges
│   ├── windows/native/     C++: display daemon (EnumDisplayMonitors, borderless output window) — Module 1
│   └── android/.../projectionmapper/  Kotlin: android.app.Presentation projector — Module 1
├── cv_engine/              Python: calibration, segmentation, canvas ingest, venue profiles — Module 2
└── render_engine/          GLSL shaders + a real, tested ModernGL host renderer — Module 3
```

## Status

See `ARCHITECTURE.md` §6 for the full breakdown. Short version:

- **Module 1** (display daemon, both platforms): implemented end-to-end against
  the real Win32 and Android APIs.
- **Module 2** (`cv_engine`): Scan Room's Gray code decode + thin-plate-spline
  mesh fit, Highlight Target's GrabCut-based segmentation, and Nudge Corners'
  manual mesh override are real, working, and covered by tests — run them
  yourself:

  ```bash
  cd cv_engine && pip install -r requirements-dev.txt
  python -m pytest tests/ -v   # 24 passed
  ```

  Still open: live camera capture and a bundled ONNX model for the optional
  higher-quality SAM/YOLOv8-Seg segmentation path — both need hardware/model
  assets this environment doesn't have.
- **Module 4** (`app/lib`): the Nudge Corners screen is real and wired end to
  end — its `ControlClient` talks the same JSON protocol `cv_engine/main.py`
  implements, driving `apply_manual_nudge` live. The rest of the Zone Deck UI
  (Scan Room, Highlight Target) still has its `cv_engine` calls stubbed as
  `TODO`s — same `ControlClient`, just not wired to those buttons yet.
- **Module 3** (`render_engine`): the host renderer actually compiles and
  runs the committed shaders against a real GL pipeline (Mesa's llvmpipe
  software rasterizer — no GPU required) and checks output pixels,
  including that the calibration-mesh warp genuinely displaces content, not
  just that it compiles:

  ```bash
  cd render_engine && pip install -r requirements-dev.txt
  Xvfb :99 -screen 0 1280x1024x24 &
  DISPLAY=:99 python -m pytest tests/ -v   # 8 passed
  ```

  Still open: attaching to the real projector output surface instead of an
  off-screen framebuffer, hardware video decode, and live audio FFT — see
  `render_engine/README.md`.
- Building any of it needs a Flutter/Android/MSVC toolchain none of which are
  available here — see `ARCHITECTURE.md` §6 for the precise split of
  tested-and-working vs. still-blocked.

## Getting started (once you have the SDKs)

```bash
# UI shell
cd app && flutter create --platforms=windows,android .   # regenerates the
                                                           # Flutter Windows/
                                                           # Android runner
                                                           # scaffolding
                                                           # around the
                                                           # native/ sources
                                                           # already here
flutter run -d windows   # or -d <android-device-id>

# CV engine
cd cv_engine && pip install -r requirements.txt
python -m cv_engine.main
```
