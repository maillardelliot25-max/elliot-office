import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this project at /elliot-office/ (a project page, not
  // a user/org root page); local dev and other hosts keep the normal root.
  base: process.env.GITHUB_PAGES ? '/elliot-office/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // @tensorflow-models/pose-detection statically imports from these two
      // packages to support runtimes/backends this app doesn't use (BlazePose
      // MediaPipe, WebGPU) — see src/stubs for details.
      '@mediapipe/pose': fileURLToPath(new URL('./src/stubs/mediapipe-pose-stub.ts', import.meta.url)),
      '@tensorflow/tfjs-backend-webgpu': fileURLToPath(
        new URL('./src/stubs/tfjs-backend-webgpu-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
