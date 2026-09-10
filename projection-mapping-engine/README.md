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
│   ├── lib/                Dart: Zone Deck UI, display service bridge
│   ├── windows/native/     C++: display daemon (EnumDisplayMonitors, borderless output window) — Module 1
│   └── android/.../projectionmapper/  Kotlin: android.app.Presentation projector — Module 1
├── cv_engine/              Python: calibration, segmentation, canvas ingest, venue profiles — Module 2
└── render_engine/          GLSL shaders + host-integration notes — Module 3
```

## Status

See `ARCHITECTURE.md` §6 for the full breakdown. Short version:

- **Module 1** (display daemon, both platforms): implemented end-to-end against
  the real Win32 and Android APIs.
- **Module 2** (`cv_engine`): Scan Room's Gray code decode + thin-plate-spline
  mesh fit, and Highlight Target's GrabCut-based segmentation, are real,
  working, and covered by tests — run them yourself:

  ```bash
  cd cv_engine && pip install -r requirements-dev.txt
  python -m pytest tests/ -v   # 12 passed
  ```

  Still open: live camera capture and a bundled ONNX model for the optional
  higher-quality SAM/YOLOv8-Seg segmentation path — both need hardware/model
  assets this environment doesn't have.
- **Modules 3–4**: real, stable interfaces and data contracts (shaders,
  Flutter UI shell), pending host integration (GL context, video decode) and
  a Flutter/Android/MSVC toolchain to build against, none of which are
  available here.

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
