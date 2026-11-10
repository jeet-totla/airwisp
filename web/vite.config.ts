import { defineConfig } from 'vite'

// base './' so the build works on GitHub Pages sub-paths and when opened from any static host.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'] },
} as any)
