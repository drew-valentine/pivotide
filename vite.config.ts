import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/pivotide/"); local dev uses "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
