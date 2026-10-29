// Εξοδούχοι «Σε 4 πίνακες» (Michael, 26/10): το πραγματικό template, οι τέσσερις πίνακες με Πότε/Γιατί και η τωρινή μορφή ίδια
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fillOuts } from '../src/main/exports';
import { Workbook, mergeFirstSheets } from '../src/main/xlsx';
import { pskDays } from '../src/shared/dates';
import { fakeState as fakeNew } from './fixtures';
// η παλιά διάταξη (κεφαλίδα αριστερά, ημερομηνία δεξιά): αυτά τα τεστ δεν αφορούν τη θέση τους (head-date-swap.test.ts)
const fakeState: typeof fakeNew = n => { const s = fakeNew(n); return { ...s, settings: { ...s.settings, hdLeft: true } }; };
import { genOuts } from './tplgen';
import { outsTables } from '../src/shared/returns';
import { upper } from '../src/shared/text';
import type { AppState, Status, TypeKey } from '../src/shared/domain';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 'q' + ++seq, pid, type, from, to: extra.to || from, ...extra });
const D = '2026-10-26';   // Δευτέρα
const TITLES = ['ΒΓΑΙΝΟΥΝ ΣΗΜΕΡΑ ΔΝ', 'ΒΓΑΙΝΟΥΝ ΣΗΜΕΡΑ ΕΞΟΔΟΥΧΟΙ', 'ΓΥΡΙΖΟΥΝ ΣΗΜΕΡΑ (ΑΠΟΨΕ)', 'ΓΥΡΙΖΟΥΝ ΑΥΡΙΟ'];
function state(fmt: 'cur' | 'tab4' | undefined, ss: Status[], n = 40): AppState {
  const s = fakeState(n); s.statuses = ss; s.settings = { ...s.settings, ...(fmt ? { outsFmt: fmt } : {}) }; return s;
}
// ό,τι μπήκε: 1 ΔΝ σήμερα (στον 1 και στον 4), 2 εξοδούχοι, ΔΝ χθες + έξοδος σήμερα, ΚΑ που λήγει σήμερα, ΚΑ που λήγει αύριο, ΚΑ που λήγει σήμερα με ΔΝ
const scenario = () => [st(1, 'DN', D), st(3, 'OUT', D), st(4, 'OUT', D), st(5, 'DN', '2026-10-25'), st(5, 'OUT', D),
  st(7, 'LEAVE', '2026-10-23', { to: D, toTime: '15:00', kind: 'Κανονική' }), st(6, 'LEAVE', '2026-10-23', { to: '2026-10-27', toTime: '14:00', kind: 'Κανονική' }), st(9, 'LEAVE', '2026-10-23', { to: D }), st(9, 'DN', D)];
// όλα τα κελιά ως κείμενο ανά γραμμή
async function grid(data: Buffer, sheet?: string) { const wb = await Workbook.open(data); const n = sheet || wb.sheetNames()[0]; return { wb, ws: await wb.sheet(n), rows: await wb.values(n, 400, 40), name: n }; }
const at = (rows: (string | number | boolean | Date | null)[][], r: number, c: number) => String(rows[r - 1]?.[c - 1] ?? '');
// πίνακες: για κάθε τίτλο η γραμμή του, και οι γραμμές δεδομένων ως την επόμενη κενή γραμμή
function tables(rows: (string | number | boolean | Date | null)[][]) {
  const out: { title: string; r: number; head: string[]; lines: string[][] }[] = [];
  for (let r = 1; r <= rows.length; r++) {
    const t = at(rows, r, 1); if (!TITLES.includes(t)) continue;
    const head = Array.from({ length: 10 }, (_, i) => at(rows, r + 1, i + 1));
    const lines: string[][] = []; for (let q = r + 2; at(rows, q, 4) || at(rows, q, 2) || at(rows, q, 9); q++) lines.push(Array.from({ length: 10 }, (_, i) => at(rows, q, i + 1)));
    out.push({ title: t, r, head, lines });
  }
  return out;
}

describe('Εξοδούχοι σε 4 πίνακες: πραγματικό template', () => {
  it('οι τίτλοι με τη σειρά, επικεφαλίδες με ΠΟΤΕ/ΓΙΑΤΙ, χωρίς φύλλο Παραμενόντων', async () => {
    const r = await fillOuts(T('exodouxoi.xlsx'), state('tab4', scenario()), D);
    expect(r.name).toBe('ΕΞΟΔΟΥΧΟΙ 26-10-2026.xlsx'); expect(r.warnings).toEqual([]);
    const { wb, rows } = await grid(r.data);
    expect(wb.sheetNames()).toEqual(['ΕΞΟΔΟΥΧΟΙ']);
    const tb = tables(rows);
    expect(tb.map(x => x.title)).toEqual(TITLES);
    for (const t of tb) expect(t.head).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'Ο-Σ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΘΑΛΑΜΟΣ', 'ΤΗΛΕΦΩΝΟ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', 'ΠΟΤΕ', 'ΓΙΑΤΙ']);
  });
  it('σε κάθε πίνακα οι σωστοί άνθρωποι με ΠΟΤΕ/ΓΙΑΤΙ, κεφαλαία, ταξινομημένοι', async () => {
    const s = state('tab4', scenario());
    const r = await fillOuts(T('exodouxoi.xlsx'), s, D);
    const { rows } = await grid(r.data);
    const [t1, t2, t3, t4] = tables(rows);
    const nm = (id: number) => s.people.find(p => p.id === id)!.last;
    const pick = (t: typeof t1) => t.lines.map(l => [l[3], l[7], l[8], l[9]]);
    expect(pick(t1)).toEqual([[nm(1), 'ΔΝ', 'ΑΥΡΙΟ 06:00', 'ΔΝ']]);
    expect(pick(t2)).toEqual([[nm(3), '', 'ΑΠΟΨΕ 22:00', 'ΕΞΟΔΟΣ'], [nm(4), '', 'ΑΠΟΨΕ 22:00', 'ΕΞΟΔΟΣ']]);
    // ΚΑ που λήγει σήμερα 15:00, και ΔΝ χθες + έξοδος σήμερα· κατά ώρα
    expect(pick(t3)).toEqual([[nm(7), '', 'ΣΗΜΕΡΑ 15:00', 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ'], [nm(5), '', 'ΑΠΟΨΕ 22:00', 'ΔΝ ΧΘΕΣ, ΕΞΟΔΟΣ']]);
    // αύριο: 06:00 πρώτα (ΔΝ, και η ΚΑ που λήγει σήμερα με ΔΝ), μετά 14:00
    expect(pick(t4)).toEqual([[nm(1), 'ΔΝ', 'ΑΥΡΙΟ 06:00', 'ΔΝ'], [nm(9), 'ΔΝ', 'ΑΥΡΙΟ 06:00', 'ΤΕΛΟΣ ΑΔΕΙΑΣ, ΔΝ'], [nm(6), '', 'ΑΥΡΙΟ 14:00', 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ']]);
    // η αρίθμηση ανά πίνακα ξεκινά από 1 (τύπος του template =ROW()-k)
    // και όλα όσα γράφηκαν είναι με κεφαλαία
    for (const row of rows) for (const v of row || []) if (typeof v === 'string') expect(v, v).toBe(v.toUpperCase());
  });
  it('οι παρατηρήσεις δεν επαναλαμβάνουν το «ΓΥΡΝΑ…»: ΔΝ ΣΚ, υπηρεσία και παρατήρηση της μέρας μένουν', async () => {
    let s = state('tab4', [st(2, 'DN', '2026-10-24', { kind: 'ΣΚ' }), st(2, 'DN', '2026-10-25', { kind: 'ΣΚ' })]);
    s = { ...s, outNotes: { '2026-10-25': { 2: 'ΙΑΤΡΟΣ' } } };
    const r = await fillOuts(T('exodouxoi.xlsx'), s, '2026-10-25');
    const [t1, t2, t3, t4] = tables((await grid(r.data)).rows);
    // ΔΝ ΣΚ την Κυριακή: ΜΟΝΟ στον 4, ΓΙΑΤΙ «ΔΝ ΣΚ»
    for (const t of [t1, t2, t3]) expect(t.lines.map(l => l[3])).toEqual(['—']);
    expect(t4.lines.map(l => [l[7], l[8], l[9]])).toEqual([['ΔΝ ΣΚ (ΙΑΤΡΟΣ)', 'ΑΥΡΙΟ 06:00', 'ΔΝ ΣΚ']]);
    expect(t4.lines[0][7]).not.toMatch(/ΓΥΡΝΑ/);
  });
  it('άδειος πίνακας: ο τίτλος, η επικεφαλίδα και μία γραμμή με «—»', async () => {
    const r = await fillOuts(T('exodouxoi.xlsx'), state('tab4', []), D);
    const { rows } = await grid(r.data);
    const tb = tables(rows);
    expect(tb.map(x => x.title)).toEqual(TITLES);
    for (const t of tb) expect(t.lines).toEqual([['', '', '', '—', '', '', '', '', '', '']]);
  });
  it('πολλές γραμμές στον πρώτο πίνακα: οι υπόλοιποι κατεβαίνουν, η αρίθμηση ξεκινά ξανά, ο τόπος και οι υπογραφές από κάτω', async () => {
    const ss = Array.from({ length: 25 }, (_, i) => st(10 + i, 'OUT', D)).concat([st(1, 'DN', D)]);
    const s = state('tab4', ss, 60);
    const r = await fillOuts(T('exodouxoi.xlsx'), s, D);
    const { ws, rows } = await grid(r.data);
    const tb = tables(rows);
    expect(tb[1].lines).toHaveLength(25); expect(tb[0].lines).toHaveLength(1);
    expect(tb.map(t => t.r)).toEqual([5, 9, 37, 41]);
    expect(ws.formula('A7')).toBe('ROW()-6'); expect(ws.formula('A11')).toBe('ROW()-10'); expect(ws.formula('A35')).toBe('ROW()-10'); expect(ws.formula('A43')).toBe('ROW()-42');
    // τίτλοι ενωμένοι σε όλο το πλάτος (ως τη στήλη ΓΙΑΤΙ)
    expect(ws.merges().map(m => [m.r1, m.c1, m.c2])).toEqual(expect.arrayContaining([[5, 1, 10], [9, 1, 10], [37, 1, 10], [41, 1, 10]]));
    const place = rows.findIndex(r2 => /^ΑΥΛΩΝΑΣ,/.test(String(r2?.[6] ?? '')));
    expect(place + 1).toBeGreaterThan(tb[3].r + tb[3].lines.length + 2);
    expect(String(rows[place][6])).toBe('ΑΥΛΩΝΑΣ, 26-10-2026');
    expect(rows.flat().filter(v => v === 'ΑΛΧΙΑΣ ΙΛΗΣ')).toHaveLength(1);
  });
  it('ο πίνακας του Excel του template μένει μόνο στον πρώτο πίνακα και η περιοχή εκτύπωσης φτάνει ως τη στήλη ΓΙΑΤΙ', async () => {
    const r = await fillOuts(T('exodouxoi.xlsx'), state('tab4', scenario()), D);
    const JSZip = (await import('jszip')).default; const z = await JSZip.loadAsync(r.data);
    const tabs = Object.keys(z.files).filter(f => /^xl\/tables\/table\d+\.xml$/.test(f));
    expect(tabs).toHaveLength(1);
    expect(/ref="([^"]+)"/.exec(await z.file(tabs[0])!.async('string'))![1]).toBe('A6:H7');
    expect(await z.file('xl/workbook.xml')!.async('string')).toMatch(/\$A\$1:\$J\$\d+/);
  });
  it('ΠΣΚ: ένα φύλλο ανά μέρα (Παρ, Σαβ, Κυρ), με τους 4 πίνακες το καθένα', async () => {
    const s = state('tab4', [st(1, 'DN', '2026-10-24', { kind: 'ΣΚ' }), st(1, 'DN', '2026-10-25', { kind: 'ΣΚ' }), st(2, 'OUT', '2026-10-23')]);
    const days = pskDays('2026-10-23');
    const parts = await Promise.all(days.map(d => fillOuts(T('exodouxoi.xlsx'), s, d)));
    const merged = await mergeFirstSheets(parts.map(x => x.data), ['ΠΑΡ 23-10', 'ΣΑΒ 24-10', 'ΚΥΡ 25-10'], parts[0].sheet);
    const wb = await Workbook.open(merged);
    expect(wb.sheetNames()).toEqual(['ΠΑΡ 23-10', 'ΣΑΒ 24-10', 'ΚΥΡ 25-10']);
    for (const n of wb.sheetNames()) expect(tables(await wb.values(n, 400, 40)).map(t => t.title)).toEqual(TITLES);
    expect(tables(await wb.values('ΣΑΒ 24-10', 400, 40))[0].lines.map(l => l[3])).not.toEqual(['—']);
    expect(tables(await wb.values('ΚΥΡ 25-10', 400, 40))[3].lines.map(l => l[3])).not.toEqual(['—']);
  });
  it('η τωρινή μορφή (προεπιλογή) δεν αλλάζει: δύο φύλλα, καμία νέα στήλη, οι παρατηρήσεις με το «ΓΥΡΝΑ…»', async () => {
    for (const fmt of [undefined, 'cur' as const]) {
      const r = await fillOuts(T('exodouxoi.xlsx'), state(fmt, scenario()), D);
      expect(r.name).toBe('ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ 26-10-2026.xlsx');
      const { wb, rows } = await grid(r.data);
      expect(wb.sheetNames()).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΠΑΡΑΜΕΝΟΝΤΕΣ']);
      expect(at(rows, 5, 1)).toBe('ΕΞΟΔΟΥΧΟΙ ΤΗΣ 26 ΟΚΤ 26'); expect(at(rows, 6, 9)).toBe('');
      expect(at(rows, 7, 8)).toMatch(/^ΔΝ, ΓΥΡΝΑ ΤΡΙΤΗ 27\/10 06:00/);
    }
  });
});

// Τυχαία templates (tplgen): ό,τι έχει ο γράφων στο δικό του έντυπο Εξοδούχων
describe('Εξοδούχοι σε 4 πίνακες: τυχαία templates', () => {
  for (let seed = 1; seed <= 40; seed++) {
    it('#' + seed, async () => {
      const gen = await genOuts(seed * 13); const why = gen.desc.join(' · ');
      const s = state('tab4', scenario());
      const r = await fillOuts(gen.buf, s, D);
      const { wb, rows } = await grid(r.data, gen.sheets[0].name);
      expect(wb.sheetNames().filter(n => /ΠΑΡΑΜΕΝ/.test(n) && n !== gen.sheets[0].name), why).toEqual([]);
      // οι τίτλοι των 4 πινάκων (στη στήλη του πρώτου τίτλου) με τη σειρά, και ένα μόνο «ΕΞΟΔΟΥΧΟΙ…» δεν υπάρχει πια
      const found: { t: string; r: number; c: number }[] = [];
      rows.forEach((row, i) => (row || []).forEach((v, j) => { if (typeof v === 'string' && TITLES.includes(v)) found.push({ t: v, r: i + 1, c: j + 1 }); }));
      expect(found.map(x => x.t), why).toEqual(TITLES);
      expect(new Set(found.map(x => x.c)).size, why).toBe(1);
      const want = outsTables(s, D); const keys = ['dn', 'out', 'tonight', 'tomorrow'] as const;
      found.forEach((f, k) => {
        // η επικεφαλίδα ΠΟΤΕ/ΓΙΑΤΙ μέσα στις 3 επόμενες γραμμές, και κάτω από αυτήν τα άτομα με τη σειρά τους
        const hr = [1, 2, 3, 4].map(d => f.r + d).find(r2 => rows[r2 - 1]?.includes('ΠΟΤΕ'));
        expect(hr, why + ' επικεφαλίδα ' + f.t).toBeTruthy();
        const cWhen = rows[hr! - 1].indexOf('ΠΟΤΕ') + 1;
        expect(at(rows, hr!, cWhen + 1), why).toBe('ΓΙΑΤΙ');
        want[keys[k]].forEach((row, i) => {
          expect(at(rows, hr! + 1 + i, cWhen), why + ' ' + f.t + ' ' + (i + 1)).toBe(upper(row.when));
          expect(at(rows, hr! + 1 + i, cWhen + 1), why).toBe(upper(row.why));
          expect(rows[hr! + i].join(' '), why).toContain(row.p.last);
        });
      });
      const pd = rows.flat().filter(v => typeof v === 'string' && /^ΑΥΛΩΝΑΣ,/.test(v)); expect(pd, why).toHaveLength(1);
      const lastTable = found[3].r; expect(rows.findIndex(row => (row || []).some(v => typeof v === 'string' && /^ΑΥΛΩΝΑΣ,/.test(v))) + 1, why).toBeGreaterThan(lastTable + 2);
    });
  }
});
