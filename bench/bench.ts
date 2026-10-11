// Μέτρηση με ρεαλιστικά δεδομένα ενός έτους: 150 άτομα, υπηρεσίες κάθε μέρα, εξοδούχοι κάθε ΣΚ, ιατρικά.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import v8 from 'v8';
import { Store } from '../src/main/db';
import { apply, type Command } from '../src/shared/commands';
import { addDays, isWeekend, type ISODate } from '../src/shared/dates';
import { fakePeople } from '../test/fixtures';
import { emptyState } from '../src/shared/domain';
import { fillDay, strengthOf, dutyStats, outBlock, activePeople, hkaiCounts } from '../src/shared/rules';
import { preflight } from '../src/shared/preflight';

const N = Number(process.env.N || 150), DAYS = Number(process.env.DAYS || 365);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilh-bench-'));
const wasm = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
const t = (f: () => any) => { const a = performance.now(); const r = f(); return [performance.now() - a, r] as const; };

(async () => {
  const store = new Store(dir, wasm); await store.open();
  const s0 = emptyState(); s0.people = fakePeople(N);
  store.commit(s0); let sent = store.state;
  let id = 0; const start: ISODate = '2025-10-01';
  const ctx = (d: ISODate) => ({ today: d, newId: () => 'b' + ++id });
  const times: Record<string, number[]> = {};
  const rec = (k: string, ms: number) => (times[k] ||= []).push(ms);
  const run = (cmd: Command, d: ISODate) => {
    const [ta, r] = t(() => apply(store.state, cmd, ctx(d)));
    rec('apply:' + cmd.t, ta);
    const [tc, patch] = t(() => store.commit(r.state));
    const [tf] = t(() => store.addAudit({ at: '10:00', day: d, text: r.text, files: r.files, source: 'app', undoable: true }, patch));
    rec('commit', tc); rec('audit+flush', tf);
    // όπως το reply() του main: μόνο ό,τι άλλαξε και οι νέες γραμμές ιστορικού
    const [ts, size] = t(() => { const ch: any = {}; for (const k of Object.keys(store.state)) if ((store.state as any)[k] !== (sent as any)[k]) ch[k] = (store.state as any)[k]; sent = store.state; return v8.serialize({ ok: true, changes: ch, newAudit: store.audit(300, store.audit(1)[0].id - 1), text: r.text }).length; });
    rec('ipc-serialize', ts); rec('ipc-kb:' + cmd.t, (size as number) / 1024); return size as number;
  };
  for (let i = 0; i < DAYS; i++) {
    const d = addDays(start, i);
    run({ t: 'autofill', date: d }, d);
    if (i % 3 === 0) run({ t: 'declare', cmd: { type: 'EA', pids: [1 + (i * 7) % N], from: d, to: addDays(d, 3) } }, d);
    if (isWeekend(d)) {
      const s = store.state; const outs = activePeople(s).filter(p => !outBlock(s, d, p.id)).slice(0, Math.round(N * 0.4));
      run({ t: 'outs', date: d, changes: outs.map(p => ({ pid: p.id, from: null, to: 'OUT' as const })) }, d);
    }
    if (i === Math.floor(DAYS / 4) || i === Math.floor(DAYS / 2) || i === DAYS - 30) {
      const q = (k: string) => { const v = times[k] || []; const l = v.slice(-20); return (l.reduce((a, b) => a + b, 0) / (l.length || 1)).toFixed(1); };
      console.log(`day ${i}: db ${(fs.statSync(path.join(dir, 'ilh.db')).size / 1024).toFixed(0)} KB, ipc autofill ${q('ipc-kb:autofill')} KB, ipc outs ${q('ipc-kb:outs')} KB | autofill ${q('apply:autofill')} ms, outs ${q('apply:outs')} ms, commit ${q('commit')} ms, audit+flush ${q('audit+flush')} ms, ipc-ser ${q('ipc-serialize')} ms`);
    }
  }
  const s = store.state; const d = addDays(start, DAYS - 1);
  console.log('statuses', s.statuses.length, 'guard days', Object.keys(s.guards).length);
  console.log('db size KB', (fs.statSync(path.join(dir, 'ilh.db')).size / 1024).toFixed(0));
  const st2 = new Store(dir, wasm); const a = performance.now(); await st2.open(); console.log('open/load ms', (performance.now() - a).toFixed(1));
  const fresh = { ...s, guards: { ...s.guards } };   // νέο αντικείμενο: χωρίς caches
  console.log('dutyStats cold ms', t(() => dutyStats(fresh))[0].toFixed(1));
  console.log('strengthOf ms', t(() => strengthOf(s, d))[0].toFixed(1));
  console.log('hkaiCounts ms', t(() => hkaiCounts(s, d))[0].toFixed(1));
  for (const k of ['froura', 'hkai', 'outs'] as const) console.log('preflight ' + k + ' ms', t(() => preflight(k, s, d))[0].toFixed(1));
  console.log('fillDay (next day) ms', t(() => fillDay(s, addDays(d, 1)))[0].toFixed(1));
  const [tb, buf] = t(() => v8.serialize({ state: s, audit: store.audit() }));
  console.log('boot (full) payload KB', ((buf as Buffer).length / 1024).toFixed(0), 'serialize ms', tb.toFixed(1), ' state only KB', (v8.serialize(s).length / 1024).toFixed(0), ' audit only KB', (v8.serialize(store.audit()).length / 1024).toFixed(0));
  fs.rmSync(dir, { recursive: true, force: true });
})();
