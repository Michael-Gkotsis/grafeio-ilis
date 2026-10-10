// Ανάπτυξη: vite με hot reload για το UI, electron για το παράθυρο
import { createServer } from 'vite';
import { spawn } from 'child_process';
import { buildMain } from './build.mjs';
import electron from 'electron';

await buildMain({ dev: true });
const server = await createServer({ configFile: 'vite.config.mjs' });
await server.listen();
const url = server.resolvedUrls.local[0];
const p = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_URL: url } });
p.on('close', () => { server.close(); process.exit(); });
