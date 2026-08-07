// @tensorflow-models/pose-detection statically imports `Pose` from
// `@mediapipe/pose` to support its BlazePose-MediaPipe runtime, which this
// app never uses (we only load the MoveNet model). Rather than ship the real
// @mediapipe/pose package just to satisfy that unused import, this stub is
// aliased in vite.config.ts so the bundler has something to resolve.
export class Pose {}
