import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Electron 22 = Chromium 108: όλος ο κώδικας του UI χτίζεται για chrome108 (δες 08 §3.4, 09 §1)
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: { outDir: '../../dist/renderer', emptyOutDir: true, target: 'chrome108', cssTarget: 'chrome108' },
  test: { root: '.', include: ['../../test/**/*.test.ts'] }
});
