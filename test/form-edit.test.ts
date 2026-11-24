// Δομή του εντύπου υπηρεσιών ΑΛΛΗΣ μονάδας (24/11, Michael): μπλοκ που βγαίνουν από το έντυπο, υπηρεσίες της εφαρμογής που μπαίνουν όπου θέλεις (π.χ. ΠΥΛΗ)
// με τη μορφή ενός υπάρχοντος μπλοκ, μπλοκ που φαίνονται αλλά δεν γεμίζουν. Δεν υπάρχει τίποτα ειδικό για κάποιο υπόδειγμα: οι φόρμες εδώ φτιάχνονται τυχαία ανά seed
// (στήλες σε διαφορετικές θέσεις, με/χωρίς βάρδιες και ώρες, συγχωνευμένη ή όχι λέξη, διαχωριστικές γραμμές με χρώμα, πλαίσια, τύπος κάτω από τη λίστα, υπογραφές,
// λίστες καταστάσεων και άγνωστα μπλοκ στο κάτω μέρος). Έλεγχοι:
//  · η σειρά των μπλοκ μετά είναι ακριβώς η αναμενόμενη· ό,τι βγήκε λείπει, ό,τι μπήκε υπάρχει στη θέση που ζητήθηκε με σωστά νούμερα/βάρδιες
//  · η μορφή των νέων γραμμών (πλαίσια, χρώμα, ύψος, συγχωνεύσεις) είναι αυτή του μπλοκ-προτύπου· οι διαχωριστικές γραμμές μένουν όπως ήταν (ποτέ δύο διαδοχικές)
//  · όσα δεν άλλαξαν μένουν ίδια (κείμενα, δικό σου κείμενο στα κελιά ονομάτων, υπογραφές, τίτλος)· ο τύπος κάτω από τη λίστα ακολουθεί τις γραμμές
//  · κάθε άτομο της εφαρμογής γράφεται στη σωστή γραμμή, και στα νέα μπλοκ· ό,τι δεν χωράει αναφέρεται
//  · δεύτερο πέρασμα με το ίδιο προφίλ πάνω στο αποτέλεσμα δεν προσθέτει τίποτα ξανά
//  · η προεπισκόπηση (previewOf πάνω στο αρχείο της εξαγωγής) αλλάζει όταν αλλάζει η αντιστοίχιση (προσθήκη, αφαίρεση, «φαίνεται»)
// FUZZ_N=200 npx vitest run test/form-edit.test.ts για περισσότερα seeds (προεπιλογή 25).
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { apply, type Ctx } from '../src/shared/commands';
import { fullName, groupKey, type AppState } from '../src/shared/domain';
import { postsOf } from '../src/shared/rules';
import { rankTxt } from '../src/shared/ranks';
import { upper } from '../src/shared/text';
import { modelOfBuffer } from '../src/main/bookModel';
import { listsFill, listTry } from '../src/main/tplLists';
import { fillFroura } from '../src/main/exports';
import { previewOf } from '../src/main/formPreview';
import { detectSvc, svcKeyOf, svcTargets, type SvcTarget } from '../src/shared/unitLists';
import type { ListProfile, TplProfile } from '../src/shared/tplStore';
import { fakeState } from './fixtures';
import fs from 'fs';
import os from 'os';
import path from 'path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Workbook } from '../src/main/xlsx';
import { listModelOf } from '../src/main/tplLists';
import { ListMapBody, noEdits, missingOf, addsOf } from '../src/renderer/screens/listMap';
import { emptyListReq } from '../src/shared/listMap';
import { genSvcList, svcBuf } from './mockgen';

const N = Number(process.env.FUZZ_N || 25);
const D = '2026-11-16';
let seq = 0; const ctx: Ctx = { today: D, newId: () => 'f' + ++seq };
const prof = (lst: ListProfile): TplProfile => ({ v: 1, id: 'services-1', kind: 'services', fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], lst });
// ψευδοτυχαία από seed (ίδια σε κάθε εκτέλεση)
const rng = (seed: number) => { let x = seed * 2654435761 % 4294967296 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const pick = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)];
const int = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const chance = (r: () => number, p: number) => r() < p;
const canon = (o: unknown): string => (o && typeof o === 'object' ? '{' + Object.keys(o as object).sort().map(k => k + ':' + canon((o as Record<string, unknown>)[k])).join(',') + '}' : String(o));
const nk = (s: string) => upper(s).replace(/\s+/g, ' ').trim();

function state(seed: number): AppState {
  let s = fakeState(60);
  if (seed % 3 === 0) s = { ...s, settings: { ...s.settings, phase: 'spen' } };
  s = apply(s, { t: 'autofill', date: D }, ctx).state;
  return s;
}
// ------------------------------------------------------------------ η γεννήτρια εντύπου (ExcelJS), με μορφή (πλαίσια, χρώματα, συγχωνεύσεις)
interface FormDef { label: string; nums: number; per: number; kind: 'svc' | 'state' | 'unknown'; value: string }
interface Form {
  buf: Buffer; sheet: string; defs: FormDef[]; lc: number; nc: number; sc: number | null; hc: number | null; rc: number; nmc: number; mergeLabel: boolean; gap: boolean; hmerge: boolean;
  rows: Record<string, number[]>; sigRow: number; titleRow: number; fRow: number; foreign: { label: string; r: number; text: string }[]; wb: ExcelJS.Workbook;
}
const LINE = { style: 'thin' as const, color: { argb: 'FF444444' } };
const BORDER = { top: LINE, left: LINE, bottom: LINE, right: LINE };
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
async function genForm(seed: number, targets: SvcTarget[], present: SvcTarget[]): Promise<Form> {
  const r = rng(seed * 104729 + 7); const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('ΥΠΗΡΕΣΙΕΣ');
  const lc = pick(r, [0, 0, 1]); const nc = lc + 1; const hasHours = chance(r, 0.6); const hc = hasHours ? nc + 1 : null; const hasShift = chance(r, 0.75); const sc = hasShift ? (hc ?? nc) + 1 : null;
  const rc = (sc ?? hc ?? nc) + 1; const nmc = rc + 1; const mergeLabel = chance(r, 0.5); const gap = chance(r, 0.7); const hmerge = chance(r, 0.4);
  const defs: FormDef[] = [];
  for (const t of present) defs.push({ label: t.label, nums: t.groups.length, per: hasShift ? Math.max(...t.groups.map(g => g.length)) : 1, kind: 'svc', value: t.value });
  // ανακάτεμα σειράς, και μερικά μπλοκ που δεν είναι υπηρεσίες
  for (let i = defs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [defs[i], defs[j]] = [defs[j], defs[i]]; }
  if (chance(r, 0.6)) defs.push({ label: 'ΚΕΠΙΚ', nums: 1, per: 1, kind: 'unknown', value: '' });
  if (chance(r, 0.7)) defs.push({ label: 'ΑΠΕΣΠΑΣΜΕΝΟΙ', nums: int(r, 2, 4), per: 1, kind: 'state', value: 'st:APS' });
  const put = (rr: number, cc: number, v: ExcelJS.CellValue) => { ws.getCell(rr, cc + 1).value = v; };
  const titleRow = int(r, 1, 3); put(titleRow, 0, 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ 3 ΝΟΕΜΒΡΙΟΥ 2026'); ws.mergeCells(titleRow, 1, titleRow, nmc + 1);
  const hr = titleRow + 1; put(hr, nc, 'Νο'); put(hr, rc, 'ΒΑΘΜΟΣ'); put(hr, nmc, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ');
  if (hc != null) put(hr, hc, 'ΩΡΕΣ');
  let row = hr + 1; const rows: Record<string, number[]> = {}; const foreign: Form['foreign'] = [];
  const lastCol = nmc + (hmerge ? 1 : 0);
  defs.forEach((d, bi) => {
    const k = d.nums * d.per; const bg = bi % 2 ? 'FFE8F1D4' : 'FFFFFFFF'; rows[d.label] = [];
    for (let i = 0; i < k; i++) {
      const rr = row++; rows[d.label].push(rr);
      for (let c = lc; c <= lastCol; c++) { const cell = ws.getCell(rr, c + 1); cell.border = BORDER; cell.fill = fill(bg); }
      ws.getRow(rr).height = 18 + (bi % 2) * 4;
      if (i === 0) { const lcell = ws.getCell(rr, lc + 1); lcell.value = d.label; lcell.font = { bold: true, size: 11 + (bi % 3) }; }
      const g = Math.floor(i / d.per), j = i % d.per;
      if (d.kind !== 'state') { if (j === 0) put(rr, nc, d.kind === 'unknown' && d.nums === 1 ? null : (g + 1) + 'ο'); if (sc != null && d.per > 1) put(rr, sc, j === 0 ? 'Φ' : 'Κ'); if (hc != null && j === 0 && chance(r, 0.5)) put(rr, hc, '06:00-09:00/15'); }
      put(rr, rc, pick(r, ['ΣΤΡ(ΤΘ)', 'ΣΤΡ', 'ΔΝΕΑΣ']));
      if (hmerge) ws.mergeCells(rr, nmc + 1, rr, nmc + 2);
      if (d.kind === 'svc' && chance(r, 0.04)) { put(rr, nmc, 'ΜΕΝΕΙ ΕΔΩ'); foreign.push({ label: d.label, r: rr, text: 'ΜΕΝΕΙ ΕΔΩ' }); }
    }
    if (k > 1 && (mergeLabel || d.kind === 'state')) ws.mergeCells(rows[d.label][0], lc + 1, rows[d.label][k - 1], lc + 1);
    if (gap) { const rr = row++; for (let c = lc; c <= lastCol; c++) ws.getCell(rr, c + 1).fill = fill('FFBBBBBB'); ws.getRow(rr).height = 7; }
  });
  const sigRow = row + 1; put(sigRow, lc, 'Ο'); put(sigRow, nmc, 'Ο'); put(sigRow + 1, lc, 'ΑΛΧΙΑΣ ΙΛΗΣ'); put(sigRow + 1, nmc, 'ΔΚΤΗΣ ΕΠΧΙΑΣ');
  const first = hr + 1; const fRow = sigRow + 4;
  const L = (n: number) => { let s = '', m = n + 1; while (m > 0) { const q = (m - 1) % 26; s = String.fromCharCode(65 + q) + s; m = Math.floor((m - 1) / 26); } return s; };
  put(fRow, nmc, { formula: 'COUNTA(' + L(nmc) + first + ':' + L(nmc) + (sigRow - 1) + ')', result: 0 } as ExcelJS.CellValue);
  return { buf: Buffer.from(await wb.xlsx.writeBuffer()), sheet: 'ΥΠΗΡΕΣΙΕΣ', defs, lc, nc, sc, hc, rc, nmc, mergeLabel, gap, hmerge, rows, sigRow, titleRow, fRow, foreign, wb };
}

// ποιος πρέπει να είναι σε κάθε (νούμερο, θέση) μιας υπηρεσίας: από την εφαρμογή
function who(s: AppState, target: string, g: number, j: number): string | null {
  const posts = postsOf(s.settings); const grd = s.guards[D] || {};
  const ps = target.startsWith('post:') ? posts.filter(p => p.k === target.slice(5)) : posts.filter(p => p.block === target.slice(4));
  const keys = [...new Set(ps.map(p => groupKey(p)))]; const post = ps.filter(p => groupKey(p) === keys[g])[j]; if (!post) return null;
  const p = grd[post.k] != null ? s.people.find(x => x.id === grd[post.k]) : undefined; return p ? upper(rankTxt(p)) + '|' + upper(fullName(p)) : null;
}
const cellTxt = (v: unknown): string => (v == null ? '' : typeof v === 'object' && v && 'richText' in (v as object) ? (v as { richText: { text: string }[] }).richText.map(x => x.text).join('') : typeof v === 'object' && v && 'result' in (v as object) ? String((v as { result: unknown }).result ?? '') : String(v)).trim();

describe('δομή εντύπου υπηρεσιών άλλης μονάδας (τυχαία έντυπα)', () => {
  it('αφαίρεση, προσθήκη και «φαίνεται» σε τυχαία έντυπα: σειρά, μορφή, γέμισμα, τίποτα άλλο δεν αλλάζει', async () => {
    const bad = (w: number, seed: number, ...a: unknown[]) => { mismatch++; if (process.env.DBG === 'mm') console.log('mismatch', w, 'seed', seed, ...a); };
    let mismatch = 0; let seeds = 0, added = 0, removed = 0, kept = 0, filled = 0, styleBad = 0, orderBad = 0, lostText = 0, gapBad = 0, formulaBad = 0, idemBad = 0, unreported = 0;
    for (let seed = 1; seed <= N; seed++) {
      const s = state(seed); const r = rng(seed * 31 + 5);
      const all = svcTargets(s, postsOf(s.settings)).filter(t => t.value.startsWith('blk:') || t.value.startsWith('post:'));
      if (all.length < 3) continue;
      const order = [...all].sort(() => r() - 0.5);
      const nMissing = int(r, 1, Math.min(3, order.length - 1)); const missing = order.slice(0, nMissing); const present = order.slice(nMissing);
      const form = await genForm(seed, all, present); seeds++;
      const sheets = await modelOfBuffer(form.buf); const det = detectSvc(sheets[0])!; expect(det, 'seed ' + seed).not.toBeNull();
      expect(det.blocks.length, 'seed ' + seed + ' blocks').toBe(form.defs.length);
      const keyOf = (label: string) => svcKeyOf(det.blocks.find(b => nk(b.label) === nk(label))!);
      // τι ζητά ο χρήστης: αφαιρεί ένα μπλοκ-υπηρεσία (όχι όλα), κρατά ορατό ένα άγνωστο, προσθέτει όσα λείπουν
      const svcDefs = form.defs.filter(d => d.kind === 'svc');
      const rmLabels: string[] = svcDefs.length > 1 && chance(r, 0.6) ? [pick(r, svcDefs).label] : [];
      const keepLabels = form.defs.filter(d => d.kind === 'unknown').map(d => d.label);
      const stateRm = chance(r, 0.25) && form.defs.some(d => d.kind === 'state') ? ['ΑΠΕΣΠΑΣΜΕΝΟΙ'] : [];
      const likeable = form.defs.filter(d => d.kind === 'svc');
      const adds = missing.map(t => ({ value: t.value, after: pick(r, ['', '^', ...form.defs.map(d => keyOf(d.label))]), like: keyOf(pick(r, likeable).label) }));
      const lst: ListProfile = { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts: Object.fromEntries(present.map(t => [keyOf(t.label), t.value])), show: { ...Object.fromEntries([...rmLabels, ...stateRm].map(l => [keyOf(l), 'remove' as const])), ...Object.fromEntries(keepLabels.map(l => [keyOf(l), 'keep' as const])) }, add: adds };
      const out = await listsFill(form.buf, s, D, { kind: 'services', profile: prof(lst) });
      expect(out, 'seed ' + seed).not.toBeNull();
      const m2 = (await modelOfBuffer(out!.data)).find(x => x.name === 'ΥΠΗΡΕΣΙΕΣ')!; const det2 = detectSvc(m2, { cols: { label: form.lc } })!; expect(det2, 'seed ' + seed + ' out').not.toBeNull();

      // 1. η σειρά: τα μπλοκ που έμειναν και τα νέα στη θέση τους (after: ποιο μπλοκ· '' τέλος· '^' αρχή)
      const gone = new Set([...rmLabels, ...stateRm].map(nk)); const n0 = form.defs.length;
      type It = { label: string; pos: number; ord: number };
      const seqE: It[] = [...form.defs.map((d, i): It => ({ label: d.label, pos: i, ord: 0 })).filter(x => !gone.has(nk(x.label))),
        ...adds.map((a, i): It => { const t = missing[i]; const ai = a.after === '' ? n0 - 1 : a.after === '^' ? -1.5 : det.blocks.findIndex(b => svcKeyOf(b) === a.after); return { label: t.label, pos: ai + 0.5, ord: i + 1 }; })]
        .sort((a, b) => (a.pos - b.pos) || (a.ord - b.ord));
      const gotLabels = det2.blocks.map(b => nk(b.label)); const wantLabels = seqE.map(x => nk(x.label));
      if (JSON.stringify(gotLabels) !== JSON.stringify(wantLabels)) { orderBad++; console.log('order seed', seed, '\n got ', gotLabels.join(' | '), '\n want', wantLabels.join(' | '), out!.warnings); }
      removed += gone.size; kept += keepLabels.length;

      // 2. νέα μπλοκ: γραμμές, νούμερα, βάρδιες, ονόματα· 3. μορφή από το μπλοκ-πρότυπο
      const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(out!.data); const w2 = wb2.getWorksheet('ΥΠΗΡΕΣΙΕΣ')!;
      const w1 = form.wb.getWorksheet('ΥΠΗΡΕΣΙΕΣ')!;
      adds.forEach((a, i) => {
        const t = missing[i]; const b = det2.blocks.find(x => nk(x.label) === nk(t.label)); if (!b) return; added++;
        const per = det.cols.shift.c != null ? Math.max(...t.groups.map(g => g.length)) : 1; const k = t.groups.length * per;   // χωρίς στήλη βάρδιας που να φαίνεται από τα δεδομένα, μία γραμμή ανά νούμερο
        if (b.rows.length !== k) { bad(1, seed, t.label, 'rows', b.rows.length, 'k', k, 'shift', form.sc, 'gap', form.gap, 'merge', form.mergeLabel, 'groups', JSON.stringify(t.groups.map(g => g.length)), 'blocks', det2.blocks.map(x => x.label + '@' + (x.rows[0].r + 1) + '+' + x.rows.length).join(' '), '\\n', m2.rows.slice(b.rows[0].r - 1, b.rows[0].r + 8).map(rw => (rw || []).map(v => String(v ?? '')).join('|')).join('\\n')); return; }
        b.rows.forEach((rw, q) => {
          const g = Math.floor(q / per), j = q % per; const row1 = rw.r + 1;
          if (det.cols.shift.c != null && per > 1 && cellTxt(w2.getCell(row1, form.sc! + 1).value) !== (j === 0 ? 'Φ' : 'Κ')) bad(2, seed);
          if (j === 0 && cellTxt(w2.getCell(row1, form.nc + 1).value) !== (g + 1) + 'Ο') bad(3, seed);
          const e = who(s, t.value, g, j); const gotName = cellTxt(w2.getCell(row1, form.nmc + 1).value), gotRank = cellTxt(w2.getCell(row1, form.rc + 1).value);
          if (e) { if (j < per) { filled++; if (e !== gotRank + '|' + gotName) bad(4, seed); } }
        });
        // μορφή: η γραμμή-πρότυπο (πρώτη του μπλοκ-προτύπου για την πρώτη γραμμή, δεύτερη ή πρώτη για τις υπόλοιπες)
        const likeDef = form.defs.find(d => keyOf(d.label) === a.like)!; const lrows = form.rows[likeDef.label];
        b.rows.forEach((rw, q) => {
          const src = q === 0 ? lrows[0] : lrows[1] ?? lrows[0]; const row1 = rw.r + 1;
          for (const c of [form.lc, form.nc, form.rc, form.nmc]) {
            const x = w2.getCell(row1, c + 1), y = w1.getCell(src, c + 1);
            if (canon(x.border) !== canon(y.border) || canon(x.fill) !== canon(y.fill)) { styleBad++; if (process.env.DBG) console.log('style seed', seed, 'q', q, 'c', c, JSON.stringify(x.border), JSON.stringify(y.border), JSON.stringify(x.fill), JSON.stringify(y.fill)); }
          }
          if ((w2.getRow(row1).height ?? 0) < (w1.getRow(src).height ?? 0)) {   // η προσαρμογή ύψους του γραφέα (fitSheet) μπορεί μόνο να το μεγαλώσει
 styleBad++; if (process.env.DBG) console.log('height seed', seed, q, w2.getRow(row1).height, w1.getRow(src).height); }
        });
        // συγχωνεύσεις: η λέξη του νέου μπλοκ καλύπτει όλες τις γραμμές του όταν το πρότυπο είχε κάθετη συγχώνευση
        const likeMerged = lrows.length > 1 && (w1.getCell(lrows[0], form.lc + 1) as ExcelJS.Cell).isMerged && w1.getCell(lrows[1], form.lc + 1).isMerged;
        if (likeMerged && k > 1) { const top = w2.getCell(b.rows[0].r + 1, form.lc + 1), bot = w2.getCell(b.rows[k - 1].r + 1, form.lc + 1); if (!top.isMerged || top.master.address !== bot.master.address) styleBad++; }
        if (form.hmerge) for (const rw of b.rows) if (!w2.getCell(rw.r + 1, form.nmc + 2).isMerged) styleBad++;
      });

      // 4. ό,τι έμεινε είναι ίδιο: λέξεις, νούμερα, δικό σου κείμενο· το φύλλο δεν έχει άλλο κείμενο από τα αναμενόμενα
      for (const d of form.defs) {
        if (gone.has(nk(d.label))) { if (gotLabels.includes(nk(d.label))) lostText++; continue; }
        const b = det2.blocks.find(x => nk(x.label) === nk(d.label)); if (!b) { lostText++; continue; }
        if (b.rows.length !== d.nums * d.per) lostText++;
        for (const f of form.foreign.filter(x => x.label === d.label)) { const q = form.rows[d.label].indexOf(f.r); if (cellTxt(w2.getCell(b.rows[q].r + 1, form.nmc + 1).value) !== f.text) lostText++; }
        if (d.kind === 'svc') b.rows.forEach((rw, q) => { const g = Math.floor(q / d.per), j = q % d.per; const e = who(s, d.value, g, j); if (!e || form.foreign.some(f => f.label === d.label && form.rows[d.label][q] === f.r)) return; filled++; if (e !== cellTxt(w2.getCell(rw.r + 1, form.rc + 1).value) + '|' + cellTxt(w2.getCell(rw.r + 1, form.nmc + 1).value)) bad(5, seed); });
      }
      const sigT = ['ΑΛΧΙΑΣ ΙΛΗΣ', 'ΔΚΤΗΣ ΕΠΧΙΑΣ']; let sigFound = 0; w2.eachRow(rw => rw.eachCell(c => { if (sigT.includes(cellTxt(c.value))) sigFound++; })); if (sigFound !== 2) lostText++;
      if (!/^ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ 16 ΝΟΕΜΒΡΙΟΥ 2026$/.test(cellTxt(w2.getCell(form.titleRow, 1).value))) lostText++;

      // 5. διαχωριστικές γραμμές: ή ανάμεσα σε κάθε δύο μπλοκ ή πουθενά, ποτέ δύο διαδοχικές· ο τύπος ακολουθεί τις γραμμές
      const starts = det2.blocks.map(b => b.rows[0].r), ends = det2.blocks.map(b => b.rows[b.rows.length - 1].r);
      const gaps = starts.slice(1).map((st, i) => st - ends[i] - 1);
      if (form.gap ? gaps.some(x => x !== 1) : gaps.some(x => x !== 0)) {
        gapBad++; console.log('gap seed', seed, gaps);
        if (process.env.DBG === 'gap') { const dump = (m: { rows: unknown[][] }, d: { blocks: { label: string; rows: { r: number }[] }[] }) => d.blocks.map(b => b.label + '@' + b.rows[0].r + '+' + b.rows.length).join(' '); console.log('  rm', [...rmLabels, ...stateRm], 'adds', adds.map((a, i) => missing[i].label + ' after ' + (a.after === '' ? 'END' : a.after === '^' ? 'START' : a.after) + ' like ' + a.like), '\n  before', dump(sheets[0], det), '\n  after ', dump(m2, det2), 'gapForm', form.gap); }
      }
      let fText = ''; w2.eachRow(rw => rw.eachCell(c => { const v = c.value as { formula?: string } | null; if (v && typeof v === 'object' && v.formula) fText = v.formula; }));
      const fm = /^COUNTA\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/.exec(fText);
      if (!fm || Number(fm[2]) > det2.blocks[0].rows[0].r + 1 || Number(fm[4]) < ends[ends.length - 1] + 1 || Number(fm[4]) >= (det2.sig ?? 1e9) + 1) { formulaBad++; console.log('formula seed', seed, fText, 'first', det2.blocks[0].rows[0].r + 1, 'last', ends[ends.length - 1] + 1, 'sig', (det2.sig ?? -1) + 1);
        if (process.env.DBG === 'f') console.log('  rm', [...rmLabels, ...stateRm], 'adds', adds.map((a, i) => missing[i].label + ' after ' + (a.after === '' ? 'END' : a.after === '^' ? 'START' : a.after)), '\n  before', det.blocks.map(b => b.label + '@' + (b.rows[0].r + 1) + '+' + b.rows.length).join(' '), '\n  after ', det2.blocks.map(b => b.label + '@' + (b.rows[0].r + 1) + '+' + b.rows.length).join(' ')); }

      // 6. ό,τι δεν χώρεσε αναφέρεται
      for (const t of present) { const b = det2.blocks.find(x => nk(x.label) === nk(t.label)); if (b && gone.has(nk(t.label))) unreported++; }
      // 7. δεύτερο πέρασμα με το ίδιο προφίλ (χωρίς τις αφαιρέσεις) πάνω στο αποτέλεσμα: δεν μπαίνει τίποτα ξανά
      const lst2: ListProfile = { sheet: 'ΥΠΗΡΕΣΙΕΣ', cols: { label: form.lc }, ...(lst.posts ? { posts: Object.fromEntries(Object.entries(lst.posts).map(([k, v]) => [k, v])) } : {}), add: adds };
      const out2 = await listsFill(out!.data, s, D, { kind: 'services', profile: prof(lst2), dryRun: false });
      if (out2) { const d3 = detectSvc((await modelOfBuffer(out2.data)).find(x => x.name === 'ΥΠΗΡΕΣΙΕΣ')!, { cols: { label: form.lc } })!; if (d3.blocks.length !== det2.blocks.length) idemBad++; }
    }
    console.log('form-edit: seeds', seeds, 'added', added, 'removed', removed, 'kept visible', kept, 'cells filled', filled, '| mismatch', mismatch, 'style', styleBad, 'order', orderBad, 'lost', lostText, 'gap', gapBad, 'formula', formulaBad, 'idem', idemBad, 'unreported', unreported);
    expect(seeds).toBeGreaterThan(0); expect(added).toBeGreaterThan(0); expect(filled).toBeGreaterThan(0);
    expect(orderBad).toBe(0); expect(mismatch).toBe(0); expect(styleBad).toBe(0); expect(lostText).toBe(0); expect(gapBad).toBe(0); expect(formulaBad).toBe(0); expect(idemBad).toBe(0); expect(unreported).toBe(0);
  }, 900000);
});

// ------------------------------------------------------------------ το ίδιο από την πλευρά της οθόνης: εξαγωγή, προεπισκόπηση, δοκιμή, παράθυρο
const withProfile = (s: AppState, lst: ListProfile): AppState => ({ ...s, settings: { ...s.settings, tplProfiles: [prof(lst)] } });
async function setup(seed: number) {
  const s = state(seed); const all = svcTargets(s, postsOf(s.settings)).filter(t => t.value.startsWith('blk:'));
  const missing = all[0]; const present = all.slice(1);
  const form = await genForm(seed, all, present); const det = detectSvc((await modelOfBuffer(form.buf))[0])!;
  const key = (label: string) => svcKeyOf(det.blocks.find(b => nk(b.label) === nk(label))!);
  const posts = Object.fromEntries(present.map(t => [key(t.label), t.value]));
  return { s, all, missing, present, form, det, key, posts };
}
const htmlOf = async (data: Buffer) => (await previewOf({ data })).sheets.map(x => x.html).join('\n');
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('εξαγωγή, προεπισκόπηση και δοκιμή ακολουθούν τις αλλαγές δομής', () => {
  it('η ΠΥΛΗ (υπηρεσία που λείπει) μπαίνει στο έντυπο που βγαίνει και στην προεπισκόπηση· όταν αλλάζει η αντιστοίχιση αλλάζει και η σελίδα', async () => {
    let checked = 0;
    for (let seed = 1; seed <= Math.min(N, 12); seed++) {
      const { s, missing, form, det, key, posts, present } = await setup(seed);
      const lst0: ListProfile = { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts };
      const out0 = await fillFroura(form.buf, withProfile(s, lst0), D); const h0 = await htmlOf(out0.data);
      expect(h0, 'seed ' + seed).not.toContain(esc(missing.label.toUpperCase()));
      expect(out0.warnings.join(' ')).toMatch(/δεν γράφτηκε/);        // η εφαρμογή λέει ότι οι θέσεις της υπηρεσίας που λείπει δεν γράφτηκαν
      const like = key(present[0].label);
      const lst1: ListProfile = { ...lst0, add: [{ value: missing.value, after: '', like }] };
      const out1 = await fillFroura(form.buf, withProfile(s, lst1), D); const h1 = await htmlOf(out1.data);
      expect(h1, 'seed ' + seed).toContain(esc(upper(missing.label)));
      expect(h1).not.toBe(h0);
      // τα ονόματα των ανθρώπων της υπηρεσίας φαίνονται στη σελίδα
      const t = missing; const g0 = who(s, t.value, 0, 0); if (g0) { expect(h1).toContain(esc(g0.split('|')[1])); checked++; }
      // «φαίνεται, δεν γεμίζει»: ο τίτλος μένει, τα ονόματα όχι
      const lst2: ListProfile = { ...lst1, show: { [key(present[0].label)]: 'keep' } };
      const out2 = await fillFroura(form.buf, withProfile(s, lst2), D); const h2 = await htmlOf(out2.data);
      expect(upper(h2)).toContain(esc(upper(present[0].label)));   // το αρχικό κείμενο του αρχείου μένει όπως ήταν
      const pn = who(s, present[0].value, 0, 0); if (pn && !pn.endsWith('|' + (g0 || '').split('|')[1])) expect(h2).not.toContain(esc(pn.split('|')[1]));
      // «δεν υπάρχει στο έντυπο»: φεύγει ο τίτλος και τα ονόματα
      const lst3: ListProfile = { ...lst1, show: { [key(present[0].label)]: 'remove' } };
      const out3 = await fillFroura(form.buf, withProfile(s, lst3), D); const h3 = await htmlOf(out3.data);
      if (!present.slice(1).some(p => upper(p.label).includes(upper(present[0].label)))) expect(upper(h3)).not.toContain('>' + esc(upper(present[0].label)) + '<');
      expect(h3).not.toBe(h1);
      // το αρχείο της μονάδας δεν αλλάζει ποτέ στον δίσκο: το ίδιο buffer δίνει ξανά το ίδιο αποτέλεσμα
      const again = await fillFroura(form.buf, withProfile(s, lst1), D); expect(Buffer.compare(again.data, out1.data)).toBe(0);
      void det;
    }
    expect(checked).toBeGreaterThan(0);
  }, 300000);

  it('η δοκιμή του παραθύρου (listTry) δείχνει τα νέα μπλοκ και αλλάζει όταν αλλάζουν οι επιλογές', async () => {
    for (let seed = 1; seed <= Math.min(N, 10); seed++) {
      const { s, missing, form, key, posts, present } = await setup(seed);
      const f = path.join(os.tmpdir(), 'form-edit-' + seed + '-' + process.pid + '.xlsx'); fs.writeFileSync(f, form.buf);
      try {
        const m = await listModelOf(f, withProfile(s, { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts }), 'froura');
        expect(m.model.svc!.targets.find(t => t.value === missing.value)).toBeTruthy();
        const req0 = { ...emptyListReq(), file: f, sheet: m.model.sheet, posts };
        const t0 = await listTry(m.sheets, m.buf, withProfile(s, { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts }), D, 'froura', m.model.sheet, req0);
        const t1 = await listTry(m.sheets, m.buf, withProfile(s, { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts }), D, 'froura', m.model.sheet, { ...req0, add: [{ value: missing.value, after: '', like: key(present[0].label) }] });
        expect(t1.placed, 'seed ' + seed).toBeGreaterThan(t0.placed - 0);                // η νέα υπηρεσία γεμίζει
        expect(t1.lines.some(l => nk(l.label) === nk(missing.label))).toBe(true);
        expect(t0.lines.some(l => nk(l.label) === nk(missing.label))).toBe(false);
        const t2 = await listTry(m.sheets, m.buf, withProfile(s, { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts }), D, 'froura', m.model.sheet, { ...req0, show: { [key(present[0].label)]: 'keep' } });
        expect(t2.placed).toBeLessThan(t0.placed);                                          // ό,τι είναι «δεν γεμίζει» δεν μπαίνει στη δοκιμή
        const t3 = await listTry(m.sheets, m.buf, withProfile(s, { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts }), D, 'froura', m.model.sheet, { ...req0, show: { [key(present[0].label)]: 'remove' } });
        expect(t3.placed).toBe(t2.placed);
      } finally { fs.unlinkSync(f); }
    }
  }, 300000);

  it('το παράθυρο: στήλη «Στο έντυπο» σε κάθε μπλοκ, πάνελ με όσες υπηρεσίες λείπουν, και ό,τι διαλέγεις φαίνεται αμέσως', async () => {
    const { s, missing, form, key, posts, present } = await setup(3);
    const f = path.join(os.tmpdir(), 'form-edit-ui-' + process.pid + '.xlsx'); fs.writeFileSync(f, form.buf);
    try {
      const m = await listModelOf(f, withProfile(s, { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts }), 'froura');
      const base = { model: m.model, step: 'posts', e: noEdits(), trial: null, onStep() {}, setPost() {}, setCreate() {}, setShow() {}, addSvc() {}, dropAdd() {}, skipSvc() {}, setCol() {}, setRoom() {} };
      const draw = (e = noEdits()) => renderToString(React.createElement(ListMapBody as any, { ...base, e }));
      const h0 = draw(); expect(h0).toContain('Στο έντυπο που βγαίνει'); expect(h0).toContain('Φαίνεται και γεμίζει'); expect(h0).toContain('Υπηρεσίες της εφαρμογής που λείπουν'); expect(h0).toContain(esc(missing.label));
      expect(h0).toContain('Πρόσθεσέ τη'); expect(h0).toContain('Λίστα κατάστασης που λείπει από το έντυπο'); expect(h0).not.toMatch(/undefined|\[object|NaN/);
      expect(missingOf(m.model, noEdits()).map(x => x.value)).toContain(missing.value);
      // προσθέτω: δεν είναι πια «λείπει», φαίνεται ως «Θα μπει»
      const e1 = { ...noEdits(), adds: [{ value: missing.value, after: '^', like: key(present[0].label) }] };
      expect(missingOf(m.model, e1).map(x => x.value)).not.toContain(missing.value); expect(addsOf(m.model, e1)).toHaveLength(1);
      const h1 = draw(e1); expect(h1).toContain('Θα μπει'); expect(h1).toContain('στην αρχή');
      // «Όχι στο έντυπο» κρύβει την κάρτα
      expect(missingOf(m.model, { ...noEdits(), skip: [missing.value] }).map(x => x.value)).not.toContain(missing.value);
      // η επιλογή «Στο έντυπο» φαίνεται επιλεγμένη
      const k = m.model.svc!.blocks[0].labelKey; const h2 = draw({ ...noEdits(), show: { [k]: 'remove' } }); expect(h2).toContain('Δεν υπάρχει στο έντυπο (σβήνεται)');
    } finally { fs.unlinkSync(f); }
  });

  it('όταν η δομή δεν αλλάζει με ασφάλεια (πίνακας Excel, τύπος μέσα στο μπλοκ) δεν χαλάει τίποτα και το λέει', async () => {
    const { s, form, key, posts, present } = await setup(5);
    const rm = present[0]; const lst: ListProfile = { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts, show: { [key(rm.label)]: 'remove' } };
    // 1. τύπος μέσα στις γραμμές του μπλοκ
    const wb = await Workbook.open(form.buf); const ws = await wb.sheet('ΥΠΗΡΕΣΙΕΣ'); const r1 = form.rows[rm.label][0] + 1; ws.setFormula('K' + r1, 'A1+1');
    const buf1 = await wb.save(); const o1 = await listsFill(buf1, s, D, { kind: 'services', profile: prof(lst) });
    const d1 = detectSvc((await modelOfBuffer(o1!.data))[0], { cols: { label: form.lc } })!; expect(d1.blocks.some(b => nk(b.label) === nk(rm.label))).toBe(true);
    expect(o1!.warnings.join(' ')).toMatch(/έχει τύπους μέσα στις γραμμές/);
    // 2. φύλλο με πίνακα Excel
    const x = new ExcelJS.Workbook(); await x.xlsx.load(form.buf); const w = x.getWorksheet('ΥΠΗΡΕΣΙΕΣ')!; w.addTable({ name: 'Πίνακας1', ref: 'M1', columns: [{ name: 'Α' }, { name: 'Β' }], rows: [['1', '2']] } as ExcelJS.TableProperties);
    const buf2 = Buffer.from(await x.xlsx.writeBuffer()); const o2 = await listsFill(buf2, s, D, { kind: 'services', profile: prof(lst) });
    const d2 = detectSvc((await modelOfBuffer(o2!.data))[0], { cols: { label: form.lc } })!; expect(d2.blocks.some(b => nk(b.label) === nk(rm.label))).toBe(true);
    expect(o2!.warnings.join(' ')).toMatch(/πίνακες, σχέδια ή σχόλια/);
    // και το γέμισμα συνεχίστηκε κανονικά
    expect(o2!.report.placed).toBeGreaterThan(0);
  }, 120000);

  it('ανενεργή υπηρεσία «να μένει στο έντυπο» στα έντυπα της εφαρμογής: ο τίτλος μένει, τα ονόματα όχι', async () => {
    const s0 = apply(fakeState(60), { t: 'autofill', date: D }, ctx).state; const mg = s0.settings.blocks.find(b => b.kind === 'mg')!;
    const tpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'froura.xlsx'));
    const texts = async (patch: object) => { const st = apply(s0, { t: 'setBlock', phase: s0.settings.phase, id: mg.id, patch } as never, ctx).state; const out = await fillFroura(tpl, st, D); const rows = await (await Workbook.open(out.data)).values(out.sheet!, 80, 20); return rows.flat().filter((v): v is string => typeof v === 'string'); };
    expect((await texts({ hidden: true })).some(v => /ΜΑΓΕΙΡΕΙΑ/i.test(v))).toBe(false);
    expect((await texts({ hidden: true, keep: true })).some(v => /ΜΑΓΕΙΡΕΙΑ/i.test(v))).toBe(true);
    expect((await texts({ hidden: false })).some(v => /ΜΑΓΕΙΡΕΙΑ/i.test(v))).toBe(true);
  });
});

// τα έντυπα της γεννήτριας του unit-lists (άλλη μορφή: δικές της στήλες, τίτλοι, υπογραφές, άγνωστα μπλοκ, λίστες καταστάσεων): ίδιες αλλαγές, ίδιοι έλεγχοι σειράς και γεμίσματος
describe('δομή εντύπου σε έντυπα της γεννήτριας υπηρεσιών (άλλη μορφή)', () => {
  it('αφαιρέσεις και προσθήκες: η σειρά είναι η ζητούμενη και οι νέες υπηρεσίες γεμίζουν', async () => {
    let seeds = 0, added = 0, filled = 0, bad = 0;
    for (let seed = 1; seed <= N; seed++) {
      const s = state(seed); const r = rng(seed * 977 + 3);
      const tg = svcTargets(s, postsOf(s.settings)).filter(t => t.value.startsWith('blk:'));
      const m = genSvcList(seed, tg.map(t => ({ value: t.value, label: t.label, kind: t.kind, groups: t.groups.map(g => g.length) })), { states: seed % 2 ? [{ value: 'st:NOS', label: 'ΝΟΣΟΚΟΜΕΙΟ' }] : [] }); const buf = await svcBuf(m);
      const det = detectSvc((await modelOfBuffer(buf))[0])!; if (!det) continue;
      const inFile = new Set(m.blocks.map(b => b.truth).filter(Boolean)); const missing = tg.filter(t => !inFile.has(t.value));
      if (!missing.length) continue; seeds++;
      const key = (i: number) => svcKeyOf(det.blocks[i]);
      const posts: Record<string, string> = {}; m.blocks.forEach((b, i) => { posts[key(i)] = b.truth ?? 'ignore'; });
      const rmI = det.blocks.length > 2 && chance(r, 0.6) ? [pick(r, det.blocks.map((_, i) => i).filter(i => !m.blocks[i].state))] : [];
      const likeI = det.blocks.map((_, i) => i).filter(i => !m.blocks[i].state && m.blocks[i].truth?.startsWith('blk:'));
      if (!likeI.length) continue;
      const add = missing.slice(0, 2).map(t => ({ value: t.value, after: pick(r, ['', '^', ...det.blocks.map((_, i) => key(i))]), like: key(pick(r, likeI)) }));
      const lst: ListProfile = { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts, cols: { rank: m.rankCol, name: m.nameCol }, show: Object.fromEntries(rmI.map(i => [key(i), 'remove' as const])), add };
      const out = await listsFill(buf, s, D, { kind: 'services', profile: prof(lst) }); expect(out, 'seed ' + seed).not.toBeNull();
      const d2 = detectSvc((await modelOfBuffer(out!.data))[0], { cols: { rank: m.rankCol, name: m.nameCol } })!; expect(d2).not.toBeNull();
      const n0 = det.blocks.length;
      const seq = [...det.blocks.map((b, i) => ({ label: b.label, pos: i, ord: 0 })).filter((_, i) => !rmI.includes(i)), ...add.map((a, i) => ({ label: missing[i].label, pos: a.after === '' ? n0 - 0.5 : a.after === '^' ? -1 : det.blocks.findIndex(b => svcKeyOf(b) === a.after) + 0.5, ord: i + 1 }))].sort((a, b) => (a.pos - b.pos) || (a.ord - b.ord));
      const got = d2.blocks.map(b => nk(b.label)), want = seq.map(x => nk(x.label));
      if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('order seed', seed, got, want, out!.warnings); continue; }
      const m2 = (await modelOfBuffer(out!.data))[0];
      add.forEach((a, i) => { const t = missing[i]; const b = d2.blocks.find(x => nk(x.label) === nk(t.label))!; added++;
        if (b.groups.length !== t.groups.length) bad++;
        b.groups.forEach((gp, gi) => gp.forEach((ri, j) => { const e = who(s, t.value, gi, j); if (!e) return; filled++; const row = b.rows[ri].r; const got2 = String(m2.rows[row]?.[m.rankCol] ?? '') + '|' + String(m2.rows[row]?.[m.nameCol] ?? ''); if (got2 !== e) { bad++; console.log('fill seed', seed, t.label, gi, j, got2, e); } }));
      });
    }
    console.log('form-edit(mock): seeds', seeds, 'added', added, 'cells filled', filled, 'bad', bad);
    expect(seeds).toBeGreaterThan(0); expect(added).toBeGreaterThan(0); expect(bad).toBe(0);
  }, 300000);
});
