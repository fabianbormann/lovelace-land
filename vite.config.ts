/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  // Playwright specs in e2e/ run with `npm run e2e`, not vitest.
  test: { include: ['tests/**/*.test.ts'] },
});
