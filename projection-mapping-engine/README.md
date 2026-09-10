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

Module 1 (display daemon, both platforms) is implemented end-to-end against
the real Win32 and Android APIs. Modules 2–4 have real, stable interfaces
and data contracts (see `ARCHITECTURE.md` §4) with the CV-heavy inference
paths (Gray code decode, TPS mesh fit, SAM/YOLOv8-Seg inference) left as
explicit `TODO`s pointing at what's needed to fill them in — camera/model
integration, which this execution environment can't exercise.

**Not yet done here:** compiling/running the Flutter app (no Flutter SDK in
this environment), MSVC build of the Windows native plugin, an Android
Gradle build, or installing/running the Python dependencies in
`cv_engine/requirements.txt`. `cv_engine`'s pure-Python module structure has
been syntax-checked with `python3 -m py_compile`.

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
