// Συνολική μέτρηση (review απόδοσης): κανόνες, βάση, έντυπα Excel, Δυναμολόγιο, εκτύπωση, με ρεαλιστικά δεδομένα.
// N=180 DAYS=120 npm run bench:full · JSON=1 για αποτελέσματα σε JSON
import fs from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import v8 from 'v8';
import { Store } from '../src/main/db';
import { apply, type Command } from '../src/shared/commands';
import { addDays, pskDays, today as todayFn, type ISODate } from '../src/shared/dates';
import { dutyStats, fillDay, hkaiCounts, strengthOf, whyAll, fairAvg, monthStats, dutyMonths, activePeople, outBlock, capCols, capCell } from '../src/shared/rules';
import { preflight } from '../src/shared/preflight';
import { returnsOn } from '../src/shared/weekend';
import { fillFroura, fillHkai, fillOuts, outsAndStay } from '../src/main/exports';
import { mergeFirstSheets } from '../src/main/xlsx';
import { dutyCheck, rosterLists, cadreLists, rosterPrint, weaponsBook } from '../src/main/excel';
import { renderBook } from '../src/main/print';
import { readBook, valuesHash, writeGroup, writeSource, tableState, locateCheck, type SourceMeta } from '../src/main/sources';
import { KIND, defaultBinding, kindsForPeople, type ListKind, type SourceBinding } from '../src/shared/sources';
import { benchState } from './state';
import JSZip from 'jszip';
import crypto from 'crypto';

const N = Number(process.env.N || 180), DAYS = Number(process.env.DAYS || 120);
const END: ISODate = (process.env.END as ISODate) || todayFn();
const R: Record<string, number> = {};
const ms = (k: string, v: number) => { R[k] = Math.round(v * 10) / 10; };
const t = <T>(f: () => T): [number, T] => { const a = performance.now(); const r = f(); return [performance.now() - a, r]; };
const ta = async <T>(f: () => Promise<T>): Promise<[number, T]> => { const a = performance.now(); const r = await f(); return [performance.now() - a, r]; };
// διάμεσος από k επαναλήψεις (ζεστό), και η πρώτη (κρύο)
async function med(k: string, f: () => any, reps = 5) {
  const xs: number[] = [];
  for (let i = 0; i < reps; i++) { const a = performance.now(); await f(); xs.push(performance.now() - a); }
  ms(k + ' (1η)', xs[0]); xs.sort((a, b) => a - b); ms(k, xs[Math.floor(xs.length / 2)]);
}
const TPL = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const zipHash = async (buf: Buffer) => { const z = await JSZip.loadAsync(buf); const h = crypto.createHash('sha1'); for (const n of Object.keys(z.files).sort()) { if (z.files[n].dir) continue; h.update(n); h.update(await z.files[n].async('nodebuffer')); } return h.digest('hex'); };

(async () => {
  // ------------------------------------------------ κατάσταση
  const cmdT: Record<string, number[]> = {};
  const [tb, s] = t(() => benchState({ n: N, days: DAYS, end: END, onCmd: (c, _d, x) => (cmdT[c.t] ||= []).push(x) }));
  ms('χτίσιμο κατάστασης', tb);
  for (const [k, v] of Object.entries(cmdT)) { const l = v.slice(-20); ms('apply:' + k + ' (τελευταίες 20)', l.reduce((a, b) => a + b, 0) / l.length); }
  const d = END, ym = d.slice(0, 7);
  const info = { N, DAYS, statuses: s.statuses.length, guardDays: Object.keys(s.guards).length, weaponLog: s.weaponLog.length, requests: s.requests.length };

  // ------------------------------------------------ εντολές πάνω στη μεγάλη κατάσταση (όπως ο main)
  let id = 0; const ctx = { today: d, newId: () => 'z' + ++id };
  const cmd = (k: string, c: Command) => { const [x] = t(() => apply(s, c, ctx)); ms('apply ' + k, x); };
  cmd('autofill αύριο', { t: 'autofill', date: addDays(d, 1) });
  cmd('assign μία θέση', { t: 'assign', date: addDays(d, 1), k: Object.keys(s.guards[addDays(d, 1)] || {})[0] || 'ly', pid: 3, force: 'x' });
  cmd('declare άδεια', { t: 'declare', cmd: { type: 'LEAVE', kind: 'Κανονική', pids: [5], from: d, to: addDays(d, 3) } });
  cmd('updatePerson τηλέφωνο', { t: 'updatePerson', person: { ...s.people[5], phone: '6999999999' } });
  const outs = activePeople(s).filter(p => !outBlock(s, d, p.id)).slice(0, 60);
  cmd('outs 60 άτομα', { t: 'outs', date: d, changes: outs.map(p => ({ pid: p.id, from: null, to: 'OUT' as const })) });
  cmd('weaponOut 10', { t: 'weaponOut', pids: s.people.slice(0, 10).map(p => p.id), reason: 'ΕΚΠ', day: d, time: '08:00' });

  // ------------------------------------------------ κανόνες που τρέχουν οι οθόνες
  const fresh = () => ({ ...s, guards: { ...s.guards }, statuses: [...s.statuses], people: [...s.people] });   // χωρίς caches
  ms('dutyStats κρύο', t(() => dutyStats(fresh()))[0]);
  ms('dutyStats ζεστό', t(() => dutyStats(s))[0]);
  ms('monthStats', t(() => monthStats(dutyStats(s), ym))[0]);
  ms('dutyMonths', t(() => dutyMonths(s))[0]);
  ms('strengthOf κρύο', t(() => strengthOf(fresh(), d))[0]);
  ms('strengthOf ζεστό', t(() => strengthOf(s, d))[0]);
  ms('hkaiCounts', t(() => hkaiCounts(s, d))[0]);
  ms('whyAll (αύριο)', t(() => whyAll(s, addDays(d, 1)))[0]);
  ms('fairAvg', t(() => fairAvg(s, addDays(d, 1)))[0]);
  ms('returnsOn', t(() => returnsOn(s, d))[0]);
  ms('outsAndStay', t(() => outsAndStay(s, d))[0]);
  ms('capCells όλοι × στήλες', t(() => { const cols = capCols(s.settings); for (const p of activePeople(s)) for (const c of cols) capCell(s, p, c); })[0]);
  for (const k of ['froura', 'hkai', 'outs', 'check'] as const) ms('preflight ' + k, t(() => preflight(k, s, d))[0]);
  ms('fillDay αύριο', t(() => fillDay(s, addDays(d, 1)))[0]);
  ms('fillDay 7 μέρες', t(() => { for (let i = 1; i <= 7; i++) fillDay(s, addDays(d, i)); })[0]);

  // ------------------------------------------------ βάση και IPC
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilh-full-'));
  const wasm = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
  const store = new Store(dir, wasm); await store.open();
  ms('commit πρώτο (όλη η κατάσταση)', t(() => store.commit(s))[0]);
  for (let i = 0; i < 400; i++) store.addAudit({ at: '10:00', day: d, text: 'ενέργεια ' + i, files: [], source: 'app', undoable: true }, null, false);
  store.flush();
  const s2 = apply(s, { t: 'autofill', date: addDays(d, 2) }, ctx).state;
  const [tc, patch] = t(() => store.commit(s2)); ms('commit μετά από autofill', tc);
  ms('addAudit+flush', t(() => store.addAudit({ at: '10:00', day: d, text: 'x', files: [], source: 'app', undoable: true }, patch))[0]);
  ms('flush βάσης', t(() => store.flush())[0]);
  info['db KB' as keyof typeof info] = Math.round(fs.statSync(path.join(dir, 'ilh.db')).size / 1024) as any;
  const st2 = new Store(dir, wasm); ms('άνοιγμα βάσης', (await ta(() => st2.open()))[0]);
  const [tser, buf] = t(() => v8.serialize({ state: s, audit: store.audit() })); ms('boot serialize', tser);
  info['boot KB' as keyof typeof info] = Math.round(buf.length / 1024) as any;
  ms('boot deserialize', t(() => v8.deserialize(buf))[0]);
  const ch = { guards: s2.guards }; const [tch, cb] = t(() => v8.serialize({ ok: true, changes: ch, newAudit: [], text: '' }));
  ms('reply serialize (autofill)', tch); info['reply autofill KB' as keyof typeof info] = Math.round(cb.length / 1024) as any;
  const [tst, sb] = t(() => v8.serialize({ ok: true, changes: { statuses: s.statuses }, newAudit: [], text: '' }));
  ms('reply serialize (statuses)', tst); info['reply statuses KB' as keyof typeof info] = Math.round(sb.length / 1024) as any;

  // ------------------------------------------------ έντυπα (το produce() του main)
  const fr = TPL('froura.xlsx'), hk = TPL('hkai.xlsx'), ou = TPL('exodouxoi.xlsx');
  await med('ΦΡΟΥΡΑ', () => fillFroura(fr, s, d));
  await med('ΗΚΑΙ', () => fillHkai(hk, s, d));
  await med('Εξοδούχοι', () => fillOuts(ou, s, d));
  await med('ΦΡΟΥΡΑ ΠΣΚ (3 φύλλα)', async () => { const days = pskDays(d); const parts = await Promise.all(days.map(x => fillFroura(fr, s, x))); return mergeFirstSheets(parts.map(x => x.data), days.map(x => x), undefined); }, 3);
  await med('Έλεγχος υπηρεσιών μήνα', () => dutyCheck(s, ym), 3);
  await med('Λίστες Δυναμολογίου', () => rosterLists(s, d), 3);
  await med('Δυναμικό στελεχών', () => cadreLists(s, d), 3);
  await med('Δυναμολόγιο εκτύπωση', () => rosterPrint(s, d), 3);
  await med('Οπλισμός', () => weaponsBook(s, d), 3);
  const hkOut = (await fillHkai(hk, s, d)).data;
  await med('zipHash ΗΚΑΙ', () => zipHash(hkOut));
  await med('valuesHash ΗΚΑΙ', () => valuesHash(hkOut));
  // αυτόματη ενημέρωση εντύπων που έχουν βγει (regenForms): ΦΡΟΥΡΑ+ΗΚΑΙ+Εξοδούχοι σήμερα και ΦΡΟΥΡΑ αύριο, χωρίς αλλαγή
  await med('regenForms 4 έντυπα (χωρίς αλλαγή)', async () => {
    for (const [tp, f] of [[fr, fillFroura], [hk, fillHkai], [ou, fillOuts], [fr, fillFroura]] as const) { const r = await (f as any)(tp, s, d); await zipHash(r.data); }
    for (const k of ['froura', 'hkai', 'outs', 'froura'] as const) preflight(k, s, d);
  }, 3);
  // εκτύπωση: προεπισκόπηση HTML
  const ros = (await rosterPrint(s, d)).data;
  await med('Προεπισκόπηση εκτύπωσης ΗΚΑΙ', () => renderBook(hkOut, { file: 'x.xlsx' }), 3);
  await med('Προεπισκόπηση εκτύπωσης Δυναμολογίου', () => renderBook(ros, { file: 'x.xlsx' }), 3);

  // ------------------------------------------------ Δυναμολόγιο στον δίσκο (πηγές): δημιουργία, ανάγνωση, αυτόματη εγγραφή
  const file = path.join(dir, 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsx');
  const K9: ListKind[] = ['people', 'punish', 'medical', 'hospital', 'step', 'leave', 'dn', 'posts', 'outside'];
  const B: Record<string, SourceBinding> = {}; const M: Record<string, SourceMeta> = {};
  const [tcr] = await ta(async () => {
    for (const k of K9) {
      B[k] = { ...defaultBinding(k, file, k === 'people' ? 'ΣΥΝΟΛΙΚΟ' : KIND[k].title.slice(0, 31)), write: true };
      const w = await writeSource(k, B[k], s, undefined, d, { create: true }); if (!w.ok) throw new Error(w.error);
      M[k] = { at: 'x', keys: [], ...w.meta } as SourceMeta; if (w.binding) B[k] = w.binding;
    }
  });
  ms('Νέο Δυναμολόγιο 9 φύλλα', tcr); info['Δυναμολόγιο KB' as keyof typeof info] = Math.round(fs.statSync(file).size / 1024) as any;
  await med('readBook Δυναμολόγιο', () => readBook(file), 3);
  // κάθε αυτόματη εγγραφή: autoCheck (locateCheck + tableState) για κάθε είδος, μετά writeGroup
  const s3 = { ...s, people: s.people.map(p => (p.id === 6 ? { ...p, phone: '6999999998' } : p)) };
  const kinds = [...kindsForPeople(s.people, s3.people, B)];
  const [tck] = await ta(async () => { for (const k of kinds) { await locateCheck(k, B[k]); await tableState(B[k], M[k], k); } });
  ms('autoCheck ' + kinds.length + ' ειδών', tck);
  const [tw, rs] = await ta(() => writeGroup(kinds.map(k => ({ kind: k, b: B[k], meta: M[k] })), s3, d));
  ms('writeGroup αλλαγή τηλεφώνου (' + kinds.length + ' είδη)', tw);
  if (!rs.every(r => r.ok)) console.error('writeGroup', rs.filter(r => !r.ok));
  rs.forEach((r, i) => { if (r.ok) M[kinds[i]] = { ...M[kinds[i]], ...r.meta } as SourceMeta; });
  const s4 = apply(s3, { t: 'declare', cmd: { type: 'EY', pids: [9], from: d, to: addDays(d, 2) } }, ctx).state;
  const sk: ListKind[] = ['medical', 'punish', 'hospital', 'step', 'leave', 'dn'];
  const [tw2] = await ta(() => writeGroup(sk.map(k => ({ kind: k, b: B[k], meta: M[k] })), s4, d));
  ms('writeGroup νέο ιατρικό (6 είδη καταστάσεων)', tw2);

  fs.rmSync(dir, { recursive: true, force: true });
  if (process.env.JSON) { console.log(JSON.stringify({ info, R })); return; }
  console.log(info);
  for (const [k, v] of Object.entries(R)) console.log(k.padEnd(52), String(v).padStart(8), 'ms');
})().catch(e => { console.error(e); process.exit(1); });
