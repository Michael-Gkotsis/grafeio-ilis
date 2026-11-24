// Δομή εντύπου υπηρεσιών άλλης μονάδας, ΠΙΟ ΠΕΡΙΕΡΓΕΣ ΜΟΡΦΕΣ (24/11, Michael: «με υπηρεσίες στελεχών, με άλλα δεδομένα, διάφορα, συνδυαστικές»).
// Κάθε seed φτιάχνει άλλη εφαρμογή (στελέχη με βαθμούς, υπηρεσία «μόνο στελέχη», δικές μας υπηρεσίες ΠΥΛΗ/ΚΥΛΙΚΕΙΟ με νούμερα × άτομα, καταστάσεις ατόμων)
// και άλλο έντυπο: άλλο όνομα φύλλου και φύλλα γύρω του, με ή χωρίς τίτλο, στήλη ΑΜ και ΤΗΛ με δικά τους δεδομένα, βαθμός πριν ή μετά το όνομα, ενωμένα κελιά,
// μπλοκ καταστάσεων και άγνωστα μπλοκ ΣΕ ΟΠΟΙΑΔΗΠΟΤΕ ΘΕΣΗ, βαθμοί στελεχών στο πρότυπο. Μετά: αφαίρεση υπηρεσιών (στρατιωτών/στελεχών/καταστάσεων), προσθήκη
// υπηρεσιών και ΚΑΤΑΣΤΑΣΕΩΝ που λείπουν, «φαίνεται αλλά δεν γεμίζει», όλα μαζί. Ελέγχονται: σειρά μπλοκ, γέμισμα (στρατιώτες και στελέχη στη σωστή γραμμή), δικά σου
// δεδομένα ανέγγιχτα, διαχωριστικά, τύπος, προεπισκόπηση του αρχείου που βγαίνει. FUZZ_N=200 για περισσότερα seeds (προεπιλογή 30).
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { apply, type Ctx } from '../src/shared/commands';
import { blocksOf, fullName, groupKey, type AppState } from '../src/shared/domain';
import { fillDay, postsOf, seatMap } from '../src/shared/rules';
import { rankTxt } from '../src/shared/ranks';
import { upper } from '../src/shared/text';
import { modelOfBuffer } from '../src/main/bookModel';
import { listsFill } from '../src/main/tplLists';
import { previewOf } from '../src/main/formPreview';
import { detectSvc, STATE_FILE_WORD, STATE_TARGETS, stateWho, svcKeyOf, svcTargets, type SvcTarget } from '../src/shared/unitLists';
import type { ListProfile, TplProfile } from '../src/shared/tplStore';
import { fakeState } from './fixtures';

const N = Number(process.env.FUZZ_N || 30);
const D = '2026-11-16';
let seq = 0; const ctx: Ctx = { today: D, newId: () => 'w' + ++seq };
const run = (s: AppState, c: Parameters<typeof apply>[1]) => apply(s, c, ctx).state;
const prof = (lst: ListProfile): TplProfile => ({ v: 1, id: 'services-1', kind: 'services', fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], lst });
const rng = (seed: number) => { let x = seed * 2654435761 % 4294967296 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
type R = () => number;
const pick = <T,>(r: R, a: T[]): T => a[Math.floor(r() * a.length)];
const int = (r: R, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const chance = (r: R, p: number) => r() < p;
const shuffle = <T,>(r: R, a: T[]): T[] => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const nk = (s: string) => upper(s).replace(/\s+/g, ' ').trim();
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cellTxt = (v: unknown): string => (v == null ? '' : typeof v === 'object' && v && 'richText' in (v as object) ? (v as { richText: { text: string }[] }).richText.map(x => x.text).join('') : typeof v === 'object' && v && 'result' in (v as object) ? String((v as { result: unknown }).result ?? '') : String(v)).trim();

// ------------------------------------------------------------------ η εφαρμογή: στελέχη, υπηρεσία μόνο για στελέχη, δικές μας υπηρεσίες, καταστάσεις
const CADRE_RANKS = ['ΥΠΛΧΟΣ', 'ΑΝΘΣΤΗΣ', 'ΛΧΙΑΣ', 'ΕΠΧΙΑΣ', 'ΑΛΧΙΑΣ'];
const STATUS_TYPES = ['APS', 'NOS', 'EY', 'EA', 'PUN', 'LEAVE', 'SICK'] as const;
const STATE_OF: Record<string, string> = { APS: 'st:APS', NOS: 'st:NOS', EY: 'st:EY', EA: 'st:EA', PUN: 'st:PUN', LEAVE: 'st:LEAVE', SICK: 'st:SICK' };
function rich(seed: number): AppState {
  const r = rng(seed * 131 + 9);
  let s = run(fakeState(60), { t: 'setSettings', settings: { cadreDuty: { groups: [{ id: 'g', name: 'Αξιωματικοί', services: [{ id: 'sv', name: 'ΑΥΔΜ', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }] }], limits: { off: { base: 20, extra: 1 }, nco: { base: 20, extra: 1 } }, rest: 1, carry: true, fairHol: true } }, text: 'δοκιμή' });
  if (seed % 3 === 0) s = { ...s, settings: { ...s.settings, phase: 'spen' } };
  for (let i = 0; i < int(r, 3, 6); i++) s = run(s, { t: 'saveCadre', cadre: { rank: pick(r, CADRE_RANKS), hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ' + String.fromCharCode(65 + i), first: 'ΟΝΟΜΑ' + i } });
  for (const c of s.cadreList) s = run(s, { t: 'setCadreDutyOf', cid: c.id, person: { group: 'g' } });
  const ph = s.settings.phase;
  s = run(s, { t: 'addBlock', phase: ph, name: 'Αξκός Υπηρεσίας', armed: false, n: int(r, 1, 2), per: 1, hrs: '', who: 'cadre', cadreGroup: 'g' });
  if (chance(r, 0.5)) s = run(s, { t: 'addBlock', phase: ph, name: 'ΠΥΛΗ', kind: 'other', armed: false, n: int(r, 1, 3), per: int(r, 1, 2), hrs: '' });
  if (chance(r, 0.5)) s = run(s, { t: 'addBlock', phase: ph, name: 'ΚΥΛΙΚΕΙΟ', kind: 'other', armed: false, n: 1, per: 1, hrs: '' });
  // καταστάσεις: μερικοί σε κάθε είδος τη μέρα D, άλλοι εκτός
  const sts = [...s.statuses]; let id = 0;
  s.people.filter(p => p.active).slice(8).forEach((p, i) => { const t = STATUS_TYPES[i % STATUS_TYPES.length]; if (i % 5 === 4) return; const on = i % 5 < 3; sts.push({ id: 'z' + ++id, pid: p.id, type: t as never, from: on ? '2026-11-13' : '2026-10-01', to: on ? '2026-11-19' : '2026-10-04' }); });
  s = { ...s, statuses: sts };
  s = run(s, { t: 'autofill', date: D });
  const f = fillDay(s, D, null); s = { ...s, guards: { ...s.guards, [D]: f.guards[D] ?? f.guards as never }, ...(f.cadreList ? { cadreList: f.cadreList } : {}) };
  return s;
}
// ποιος πρέπει να είναι σε κάθε (νούμερο, θέση) μιας υπηρεσίας της εφαρμογής (και στελέχη: αρνητικός αριθμός θέσης)
function who(s: AppState, target: string, g: number, j: number): string | null {
  const posts = postsOf(s.settings); const grd = s.guards[D] || {}; const pm = seatMap(s);
  const ps = target.startsWith('post:') ? posts.filter(p => p.k === target.slice(5)) : posts.filter(p => p.block === target.slice(4));
  const keys = [...new Set(ps.map(p => groupKey(p)))]; const post = ps.filter(p => groupKey(p) === keys[g])[j]; if (!post) return null;
  const p = grd[post.k] != null ? pm.get(grd[post.k]) : undefined; return p ? upper(rankTxt(p)) + '|' + upper(fullName(p)) : null;
}

// ------------------------------------------------------------------ το έντυπο
interface Def { label: string; kind: 'svc' | 'state' | 'unknown'; value: string; nums: number; per: number; cadre: boolean; rows: number[] }
interface Form { buf: Buffer; sheet: string; defs: Def[]; lc: number; nc: number; sc: number | null; hc: number | null; rc: number; nmc: number; amc: number | null; gap: boolean; hasTitle: boolean; titleRow: number; fRow: number; foreign: { r: number; c: number; text: string }[]; lastCol: number }
const LINE = { style: 'thin' as const, color: { argb: 'FF333333' } };
const BORDER = { top: LINE, left: LINE, bottom: LINE, right: LINE };
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
const COLS = (n: number) => { let s = '', m = n + 1; while (m > 0) { const q = (m - 1) % 26; s = String.fromCharCode(65 + q) + s; m = Math.floor((m - 1) / 26); } return s; };
const STATE_WORDS: [string, string[]][] = [['st:APS', ['ΑΠΕΣΠΑΣΜΕΝΟΙ']], ['st:NOS', ['ΝΟΣΟΚΟΜΕΙΟ']], ['st:EY', ['ΚΙΧΝΕ- ΕΥ', 'Ε.Υ']], ['st:PUN', ['ΤΙΜΩΡΗΜΕΝΟΙ']], ['st:LEAVE', ['ΑΔΕΙΟΥΧΟΙ']], ['st:SICK', ['ΑΝΑΡΡΩΤΙΚΕΣ']]];
async function genForm(seed: number, s: AppState, present: SvcTarget[]): Promise<Form> {
  const r = rng(seed * 104729 + 31); const wb = new ExcelJS.Workbook();
  const sheet = pick(r, ['ΥΠΗΡΕΣΙΕΣ', 'ΚΥ 1', 'ΦΡΟΥΡΑ Α΄ ΛΟΧΟΥ']);
  if (chance(r, 0.5)) { const w0 = wb.addWorksheet('ΟΔΗΓΙΕΣ'); w0.getCell('A1').value = 'ΣΗΜΕΙΩΣΗ: δεν είναι λίστα'; w0.getCell('A2').value = 'ΑΞΚΟΣ'; }
  const ws = wb.addWorksheet(sheet); if (chance(r, 0.4)) wb.addWorksheet('ΣΗΜΕΙΩΣΕΙΣ').getCell('B2').value = 'ΜΕΝΕΙ';
  const lc = pick(r, [0, 0, 1]); const nc = lc + 1; const hc = chance(r, 0.6) ? nc + 1 : null; const sc = chance(r, 0.75) ? (hc ?? nc) + 1 : null;
  const amc = chance(r, 0.5) ? (sc ?? hc ?? nc) + 1 : null; const colA = (amc ?? sc ?? hc ?? nc) + 1;
  const swap = chance(r, 0.3); const hmerge = chance(r, 0.4); const gap = chance(r, 0.7); const hasTitle = chance(r, 0.6); const twoHead = chance(r, 0.3);
  const nmc = swap ? colA : colA + 1; const rc = swap ? colA + (hmerge ? 2 : 1) : colA; const telc = Math.max(nmc + (hmerge ? 1 : 0), rc) + 1; const lastCol = telc;
  const cadreVals = new Set(blocksOf(s.settings).filter(b => b.who === 'cadre').map(b => 'blk:' + b.id));
  const defs: Def[] = present.map(t => ({ label: t.label, kind: 'svc' as const, value: t.value, nums: t.groups.length, per: sc != null ? Math.max(...t.groups.map(g => g.length)) : 1, cadre: cadreVals.has(t.value), rows: [] }));
  const words = shuffle(r, STATE_WORDS).slice(0, int(r, 0, 3)); for (const [v, ws2] of words) defs.push({ label: pick(r, ws2), kind: 'state', value: v, nums: int(r, 2, 4), per: 1, cadre: false, rows: [] });
  if (chance(r, 0.6)) defs.push({ label: 'ΚΕΠΙΚ', kind: 'unknown', value: '', nums: 1, per: 1, cadre: false, rows: [] });
  const order = shuffle(r, defs);
  const put = (rr: number, cc: number, v: ExcelJS.CellValue) => { ws.getCell(rr, cc + 1).value = v; };
  let row = 1; let titleRow = 0;
  if (hasTitle) { titleRow = row++; put(titleRow, 0, 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ 3 ΝΟΕΜΒΡΙΟΥ 2026'); ws.mergeCells(titleRow, 1, titleRow, lastCol + 1); row++; }
  if (twoHead) { for (let c = lc; c <= lastCol; c++) ws.getCell(row, c + 1).fill = fill('FFDDDDDD'); row++; }
  const hr = row++; put(hr, nc, 'Α/Α'); put(hr, rc, 'ΒΑΘΜΟΣ'); put(hr, nmc, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); if (hc != null) put(hr, hc, 'ΩΡΕΣ'); if (amc != null) put(hr, amc, 'ΑΜ'); put(hr, telc, 'ΤΗΛ');
  const foreign: Form['foreign'] = []; const first = row;
  order.forEach((d, bi) => {
    const k = d.nums * d.per; const bg = bi % 2 ? 'FFE8F1D4' : 'FFFFFFFF'; const hmState = d.kind === 'state' && chance(r, 0.5);
    for (let i = 0; i < k; i++) {
      const rr = row++; d.rows.push(rr);
      for (let c = lc; c <= lastCol; c++) { const cell = ws.getCell(rr, c + 1); cell.border = BORDER; cell.fill = fill(bg); }
      if (i === 0) { const lcell = ws.getCell(rr, lc + 1); lcell.value = d.label; lcell.font = { bold: true, size: 10 + (bi % 4) }; if (hmState) ws.mergeCells(rr, lc + 1, rr, nc + 1); }
      const g = Math.floor(i / d.per), j = i % d.per;
      if (d.kind === 'svc') { if (j === 0) put(rr, nc, (g + 1) + 'ο'); if (sc != null && d.per > 1) put(rr, sc, j === 0 ? 'Φ' : 'Κ'); if (hc != null && j === 0 && chance(r, 0.5)) put(rr, hc, '06:00-09:00/15'); }
      put(rr, rc, d.cadre ? pick(r, CADRE_RANKS) : pick(r, ['ΣΤΡ(ΤΘ)', 'ΣΤΡ', 'ΔΝΕΑΣ']));
      if (hmerge) ws.mergeCells(rr, nmc + 1, rr, nmc + 2);
      if (amc != null && chance(r, 0.5)) { const t = String(100000 + int(r, 0, 899999)); put(rr, amc, t); foreign.push({ r: rr, c: amc, text: t }); }
      if (chance(r, 0.4)) { const t = '69' + String(10000000 + int(r, 0, 89999999)); put(rr, telc, t); foreign.push({ r: rr, c: telc, text: t }); }
      if (d.kind === 'svc' && chance(r, 0.04)) { put(rr, nmc, 'ΜΕΝΕΙ ΕΔΩ'); foreign.push({ r: rr, c: nmc, text: 'ΜΕΝΕΙ ΕΔΩ' }); }
    }
    if (k > 1 && !hmState && chance(r, d.kind === 'state' ? 0.6 : 0.5)) ws.mergeCells(d.rows[0], lc + 1, d.rows[k - 1], lc + 1);
    if (gap) { const rr = row++; for (let c = lc; c <= lastCol; c++) ws.getCell(rr, c + 1).fill = fill('FFBBBBBB'); ws.getRow(rr).height = 6; }
  });
  const sigRow = row + 1; put(sigRow, lc, 'Ο'); put(sigRow, nmc, 'Ο'); put(sigRow + 1, lc, 'ΑΛΧΙΑΣ ΙΛΗΣ'); put(sigRow + 1, nmc, 'ΔΚΤΗΣ ΕΠΧΙΑΣ');
  const fRow = sigRow + 4; put(fRow, nmc, { formula: 'COUNTA(' + COLS(nmc) + first + ':' + COLS(nmc) + (sigRow - 1) + ')', result: 0 } as ExcelJS.CellValue);
  return { buf: Buffer.from(await wb.xlsx.writeBuffer()), sheet, defs: order, lc, nc, sc, hc, rc, nmc, amc, gap, hasTitle, titleRow, fRow, foreign, lastCol };
}

describe('δομή εντύπου: περίεργες μορφές, στελέχη, καταστάσεις, συνδυασμοί', () => {
  it('αφαιρέσεις/προσθήκες υπηρεσιών και καταστάσεων σε τυχαίες εφαρμογές και έντυπα', async () => {
    let undetected = 0; let seeds = 0, adds = 0, stateAdds = 0, cadreAdds = 0, removes = 0, kept = 0, fills = 0, stateFills = 0, bad = 0;
    const flag = (seed: number, what: string, ...a: unknown[]) => { bad++; if (process.env.DBG) console.log('BAD', what, 'seed', seed, ...a); };
    for (let seed = 1; seed <= N; seed++) {
      const s = rich(seed); const r = rng(seed * 57 + 11);
      const all = svcTargets(s, postsOf(s.settings)).filter(t => t.value.startsWith('blk:') && t.groups.length);
      if (all.length < 3) continue;
      const mixed = shuffle(r, all); const nMiss = int(r, 1, Math.min(3, mixed.length - 1)); const missing = mixed.slice(0, nMiss); const present = mixed.slice(nMiss);
      const form = await genForm(seed, s, present); seeds++;
      const model = (await modelOfBuffer(form.buf)).find(x => x.name === form.sheet)!; const det = detectSvc(model, { cols: { label: form.lc } });
      if (!det) { undetected++; continue; }   // το ίδιο το έντυπο δεν αναγνωρίζεται ως λίστα υπηρεσιών (σπάνιος συνδυασμός της γεννήτριας): δεν αφορά τη δομή
      if (det.blocks.length !== form.defs.length) { flag(seed, 'blocks', det.blocks.map(b => b.label), form.defs.map(d => d.label)); continue; }
      const keyOfDef = (d: Def) => svcKeyOf(det.blocks[form.defs.indexOf(d)]);
      // τι ζητά ο χρήστης
      const svcDefs = form.defs.filter(d => d.kind === 'svc'); const stateDefs = form.defs.filter(d => d.kind === 'state');
      const rmDefs = [...(svcDefs.length > 1 && chance(r, 0.6) ? [pick(r, svcDefs)] : []), ...(stateDefs.length && chance(r, 0.4) ? [pick(r, stateDefs)] : [])];
      const keepDefs = svcDefs.filter(d => !rmDefs.includes(d) && chance(r, 0.25)).slice(0, 1);
      const likeDefs = form.defs.filter(d => d.kind === 'svc'); if (!likeDefs.length) continue;
      const presentStates = new Set(stateDefs.map(d => d.value)); const missingStates = shuffle(r, STATE_WORDS.map(x => x[0]).filter(v => !presentStates.has(v))).slice(0, chance(r, 0.6) ? int(r, 1, 2) : 0);
      const afterKeys = ['', '^', ...form.defs.map(d => keyOfDef(d))];
      const addList = [...missing.map(t => ({ value: t.value, label: t.label })), ...missingStates.map(v => ({ value: v, label: STATE_FILE_WORD[v] }))].map(a => ({ ...a, after: pick(r, afterKeys), like: keyOfDef(pick(r, likeDefs)) }));
      const posts: Record<string, string> = {}; for (const d of form.defs) if (d.kind !== 'unknown') posts[keyOfDef(d)] = d.value;
      const lst: ListProfile = { sheet: form.sheet, posts, cols: { label: form.lc }, show: { ...Object.fromEntries(rmDefs.map(d => [keyOfDef(d), 'remove' as const])), ...Object.fromEntries(keepDefs.map(d => [keyOfDef(d), 'keep' as const])) }, add: addList.map(a => ({ value: a.value, after: a.after, like: a.like })) };
      const out = await listsFill(form.buf, s, D, { kind: 'services', profile: prof(lst) });
      if (!out) { flag(seed, 'nofill'); continue; }
      const m2 = (await modelOfBuffer(out.data)).find(x => x.name === form.sheet)!; const det2 = detectSvc(m2, { cols: { label: form.lc, rank: form.rc, name: form.nmc } });
      if (!det2) { flag(seed, 'nodet2'); continue; }
      // 1. η σειρά
      const gone = new Set(rmDefs.map(d => nk(d.label))); const n0 = form.defs.length;
      const seqE = [...form.defs.map((d, i) => ({ label: d.label, pos: i, ord: 0 })).filter(x => !gone.has(nk(x.label))),
        ...addList.map((a, i) => ({ label: a.label, pos: a.after === '' ? n0 - 0.5 : a.after === '^' ? -1 : det.blocks.findIndex(b => svcKeyOf(b) === a.after) + 0.5, ord: i + 1 }))].sort((a, b) => (a.pos - b.pos) || (a.ord - b.ord));
      const got = det2.blocks.map(b => nk(b.label)), want = seqE.map(x => nk(x.label));
      if (JSON.stringify(got) !== JSON.stringify(want)) { flag(seed, 'order', got, want, out.warnings); continue; }
      removes += gone.size; kept += keepDefs.length;
      const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(out.data); const w2 = wb2.getWorksheet(form.sheet)!;
      const rowsOf = (label: string) => det2.blocks.find(b => nk(b.label) === nk(label))!;
      const fillOf = (b: ReturnType<typeof rowsOf>, q: number) => cellTxt(w2.getCell(b.rows[q].r + 1, form.rc + 1).value) + '|' + cellTxt(w2.getCell(b.rows[q].r + 1, form.nmc + 1).value);
      // 2. ό,τι έμεινε: υπηρεσίες γεμίζουν (στρατιώτες και στελέχη), καταστάσεις γεμίζουν, «δεν γεμίζει» μένει άγραφο, δεδομένα σου ανέγγιχτα
      for (const d of form.defs) {
        if (gone.has(nk(d.label))) continue; const b = rowsOf(d.label);
        if (b.rows.length !== d.nums * d.per) { flag(seed, 'rows', d.label, b.rows.length, d.nums * d.per); continue; }
        if (d.kind === 'svc' && !keepDefs.includes(d)) b.rows.forEach((_, q) => { const e = who(s, d.value, Math.floor(q / d.per), q % d.per); if (!e || form.foreign.some(f => f.c === form.nmc && f.r === d.rows[q])) return; fills++; if (fillOf(b, q) !== e) flag(seed, 'fill', d.label, q, fillOf(b, q), e); });
        if (d.kind === 'svc' && keepDefs.includes(d)) b.rows.forEach((_, q) => { if (/ΣΤΕΛΕΧΟΣ|ΟΝΟΜΑ|ΑΛΦΑΣ|ΒΗΤΑΣ|ΓΑΜΜΑΣ|ΔΕΛΤΑΣ|ΕΨΙΛΟΝ|ΖΗΤΑΣ/.test(fillOf(b, q).split('|')[1])) flag(seed, 'keepWritten', d.label); });
        if (d.kind === 'state') { const ws2 = stateWho(s, D, d.value); b.rows.forEach((_, q) => { const p = ws2[q]; if (!p) return; stateFills++; if (fillOf(b, q) !== upper(rankTxt(p)) + '|' + upper(fullName(p))) flag(seed, 'state', d.label, q, fillOf(b, q)); }); }
        // δεδομένα που δεν είναι δικά μας (ΑΜ, ΤΗΛ, ΜΕΝΕΙ ΕΔΩ) στις ίδιες γραμμές του μπλοκ
        for (const f of form.foreign.filter(x => d.rows.includes(x.r))) { const q = d.rows.indexOf(f.r); if (cellTxt(w2.getCell(b.rows[q].r + 1, f.c + 1).value) !== f.text) flag(seed, 'foreign', d.label, f.text); }
      }
      // 3. νέα μπλοκ: γραμμές και γέμισμα
      for (const a of addList) {
        const b = rowsOf(a.label); adds++;
        if (a.value.startsWith('st:')) { stateAdds++; const ws2 = stateWho(s, D, a.value); if (b.rows.length !== Math.max(2, ws2.length)) flag(seed, 'stateRows', a.label, b.rows.length, ws2.length); ws2.forEach((p, q) => { stateFills++; if (b.rows[q] && fillOf(b, q) !== upper(rankTxt(p)) + '|' + upper(fullName(p))) flag(seed, 'stateAdd', a.label, q, fillOf(b, q)); }); continue; }
        const t = missing.find(x => x.value === a.value)!; if (blocksOf(s.settings).some(x => 'blk:' + x.id === t.value && x.who === 'cadre')) cadreAdds++;
        const per = det.cols.shift.c != null ? Math.max(...t.groups.map(g => g.length)) : 1; if (b.rows.length !== t.groups.length * per) { flag(seed, 'addRows', a.label, b.rows.length, t.groups.length * per); continue; }
        b.rows.forEach((_, q) => { const e = who(s, t.value, Math.floor(q / per), q % per); if (!e) return; fills++; if (fillOf(b, q) !== e) flag(seed, 'addFill', a.label, q, fillOf(b, q), e); });
      }
      // 4. διαχωριστικά και τύπος, υπογραφές, τίτλος
      const starts = det2.blocks.map(b => b.rows[0].r), ends = det2.blocks.map(b => b.rows[b.rows.length - 1].r);
      const gaps = starts.slice(1).map((st, i) => st - ends[i] - 1);
      if (form.gap ? gaps.some(x => x !== 1) : gaps.some(x => x !== 0)) flag(seed, 'gap', gaps);
      let fText = ''; w2.eachRow(rw => rw.eachCell(c => { const v = c.value as { formula?: string } | null; if (v && typeof v === 'object' && v.formula) fText = v.formula; }));
      const fm = /^COUNTA\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/.exec(fText);
      if (!fm || Number(fm[2]) > det2.blocks[0].rows[0].r + 1 || Number(fm[4]) < ends[ends.length - 1] + 1 || Number(fm[4]) >= (det2.sig ?? 1e9) + 1) flag(seed, 'formula', fText);
      let sigs = 0; w2.eachRow(rw => rw.eachCell(c => { if (['ΑΛΧΙΑΣ ΙΛΗΣ', 'ΔΚΤΗΣ ΕΠΧΙΑΣ'].includes(cellTxt(c.value))) sigs++; })); if (sigs !== 2) flag(seed, 'sigs');
      if (form.hasTitle && !/^ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ 16 ΝΟΕΜΒΡΙΟΥ 2026$/.test(cellTxt(w2.getCell(form.titleRow, 1).value))) flag(seed, 'title');
      for (const other of wb2.worksheets.filter(x => x.name !== form.sheet)) if (!/^(ΣΗΜΕΙΩΣΗ: δεν είναι λίστα|ΜΕΝΕΙ|)$/.test(cellTxt(other.getCell('A1').value) || cellTxt(other.getCell('B2').value))) flag(seed, 'othersheet', other.name);
      // 5. προεπισκόπηση του αρχείου που βγαίνει: τα νέα μπλοκ και τα ονόματα φαίνονται, ό,τι αφαιρέθηκε όχι
      const html = upper((await previewOf({ data: out.data })).sheets.map(x => x.html).join('\n'));
      for (const a of addList) if (!html.includes(esc(upper(a.label)))) flag(seed, 'previewAdd', a.label);
      for (const d of rmDefs) if (!gone.has(nk(d.label)) || html.includes('>' + esc(upper(d.label)) + '<')) flag(seed, 'previewRemoved', d.label);
      // 6. δεύτερο πέρασμα πάνω στο αποτέλεσμα: τίποτα δεν μπαίνει ξανά
      const out2 = await listsFill(out.data, s, D, { kind: 'services', profile: prof({ ...lst, show: undefined, posts: undefined, cols: { label: form.lc, rank: form.rc, name: form.nmc } }) });
      if (out2) { const d3 = detectSvc((await modelOfBuffer(out2.data)).find(x => x.name === form.sheet)!, { cols: { label: form.lc, rank: form.rc, name: form.nmc } }); if (!d3 || d3.blocks.length !== det2.blocks.length) flag(seed, 'idem', d3?.blocks.length, det2.blocks.length); }
    }
    console.log('form-edit(weird): seeds', seeds, 'added', adds, '(states', stateAdds, 'cadre-only', cadreAdds, ') removed', removes, 'kept', kept, 'cells filled', fills, 'state cells', stateFills, 'undetected forms', undetected, 'bad', bad);
    expect(undetected).toBeLessThanOrEqual(Math.ceil(seeds * 0.05)); expect(seeds).toBeGreaterThan(0); expect(adds).toBeGreaterThan(0); expect(fills).toBeGreaterThan(0); expect(bad).toBe(0);
  }, 900000);
});
void STATE_TARGETS; void STATE_OF;
