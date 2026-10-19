// Χτίσιμο: main + preload + excel (esbuild) και UI (vite). Όλα στο dist/.
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import fs from 'fs';

export async function buildMain({ dev = false } = {}) {
  const common = { bundle: true, platform: 'node', target: 'node16', format: 'cjs', sourcemap: dev ? 'inline' : false, minify: !dev, logLevel: 'warning', legalComments: 'none' };
  await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js', external: ['electron'] });
  await build({ ...common, entryPoints: ['src/main/excel.ts'], outfile: 'dist/main/excel.js', external: ['electron'] });
  await build({ ...common, entryPoints: ['src/main/worker.ts'], outfile: 'dist/main/worker.js', external: ['electron'] });
  await build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload/preload.js', external: ['electron'] });
  await build({ ...common, entryPoints: ['src/preload/print.ts'], outfile: 'dist/preload/print.js', external: ['electron'] });
  fs.copyFileSync('node_modules/sql.js/dist/sql-wasm.wasm', 'dist/main/sql-wasm.wasm');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.rmSync('dist', { recursive: true, force: true });
  await buildMain();
  await viteBuild({ configFile: 'vite.config.mjs', logLevel: 'warn' });
  console.log('OK: dist/');
}
