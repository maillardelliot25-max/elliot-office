// @tensorflow-models/pose-detection statically imports these from
// @tensorflow/tfjs-backend-webgpu to support the WebGPU backend, which this
// app never uses (we hardcode the WebGL backend). Stubbed out and aliased in
// vite.config.ts rather than shipping the real WebGPU backend package.
export const webgpu_util = {}
export class WebGPUBackend {}
