// Το νήμα των Excel (offload.ts + worker.ts): ίδιο αποτέλεσμα με τη δουλειά στο main, ίδια λάθη, και αν σταματήσει το
// νήμα η δουλειά γίνεται στο main.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildSync } from 'esbuild';
import { off, useWorker, workerUp } from '../src/main/offload';
import { fillFroura } from '../src/main/exports';
import { OldFormatError, valuesHash } from '../src/main/sources';
import { zipHash } from '../src/main/ziphash';
import { apply } from '../src/shared/commands';
import { fakeState } from './fixtures';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilh-worker-'));
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
beforeAll(() => {
  buildSync({ entryPoints: [path.join(__dirname, '..', 'src', 'main', 'worker.ts')], bundle: true, platform: 'node', target: 'node16', format: 'cjs', outfile: path.join(dir, 'worker.js'), logLevel: 'error', external: ['electron'] });
  useWorker(path.join(dir, 'worker.js'));
});

describe('νήμα των Excel', () => {
  it('η ΦΡΟΥΡΑ βγαίνει ίδια στο νήμα και στο main, και περνά η νεότερη κατάσταση', async () => {
    let s = apply(fakeState(60), { t: 'autofill', date: '2026-10-12' }, { today: '2026-10-12', newId: () => 'x' }).state;
    const tpl = T('froura.xlsx');
    const local = await fillFroura(tpl, s, '2026-10-12');
    const far = await off<typeof local>('fillFroura', [tpl, '2026-10-12', undefined, undefined], () => { throw new Error('όχι εδώ'); }, s);
    expect(workerUp()).toBe(true);
    expect(Buffer.isBuffer(far.data)).toBe(true);
    expect(far.name).toBe(local.name);
    expect(await valuesHash(far.data)).toBe(await valuesHash(local.data));
    expect(await off('zipHash', [far.data], () => zipHash(far.data))).toBe(await zipHash(far.data));
    // άλλη κατάσταση: το νήμα παίρνει τη νέα
    s = apply(s, { t: 'clearDay', date: '2026-10-12' }, { today: '2026-10-12', newId: () => 'y' }).state;
    const local2 = await fillFroura(tpl, s, '2026-10-12');
    const far2 = await off<typeof local>('fillFroura', [tpl, '2026-10-12', undefined, undefined], () => { throw new Error('όχι εδώ'); }, s);
    expect(await valuesHash(far2.data)).toBe(await valuesHash(local2.data));
  }, 30_000);
  it('τα λάθη έρχονται του ίδιου είδους', async () => {
    const f = path.join(dir, 'παλιό.xls'); fs.writeFileSync(f, 'x');
    await expect(off('readBook', [f], async () => 0)).rejects.toBeInstanceOf(OldFormatError);
  });
});
