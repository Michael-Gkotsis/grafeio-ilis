import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// A lazy screen loads from pages/<screen>/index.ts: name its chunk after the folder (diag-*.js, not index-*.js), so the
// files in dist/renderer/assets stay recognisable in bench reports and in a support call.
const chunkFileNames = (c) =>
  'assets/' +
  (c.name === 'index' && c.facadeModuleId ? path.basename(path.dirname(c.facadeModuleId)) : '[name]') +
  '-[hash].js';

// Electron 22 = Chromium 108: όλος ο κώδικας του UI χτίζεται για chrome108 (δες 08 §3.4, 09 §1)
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    target: 'chrome108',
    cssTarget: 'chrome108',
    rollupOptions: { output: { chunkFileNames } },
  },
  test: { root: '.', include: ['../../test/**/*.test.ts'] }
});
