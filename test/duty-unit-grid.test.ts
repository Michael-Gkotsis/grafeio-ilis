// Μηνιαίο πλέγμα υπηρεσιών ΑΛΛΗΣ μονάδας (πρότυπα άλλων μονάδων, 3α). Μπαίνει στο mockgen (genUnitGrid) με αλήθεια ανά κελί και ελέγχεται:
//  · ανίχνευση: οι γραμμές των ατόμων και οι στήλες των ημερών, χωρίς τις στήλες συνόλων (Σ/ΚΑ/ΕΤΑΠ/ΤΙΜ με τύπους)
//  · λεξιλόγιο: κάθε κωδικός βρίσκεται· ΜΗΔΕΝ λάθος «σίγουρα» (ό,τι λέγεται σίγουρο ισούται με την αλήθεια)
//  · με προφίλ (οι επιλογές του χρήστη) τα δεδομένα που διαβάζονται ισούνται με την αλήθεια
//  · εγγραφή: μηδέν κελιά εκτός των ημερών των ατόμων, κανένας τύπος, κανένα κείμενο που δεν έγραψε η εφαρμογή· διάβασμα(εγγραφή(x)) = x
//  · τα αρχεία που δουλεύουν σήμερα διαβάζονται όπως πριν (καμία αλλαγή: το ίδιο αντικείμενο ρυθμίσεων, ίδιος πίνακας)
// FUZZ_N=200 npx vitest run test/duty-unit-grid.test.ts για περισσότερα seeds (προεπιλογή 30). REAL_TEMPLATES_DIR: μόνο στο τοπικό, τυπώνει ΜΟΝΟ αριθμούς.
import { afterAll, describe, it, expect } from 'vitest';
import fs from 'fs';
import ExcelJS from 'exceljs';
import path from 'path';
import { apply, type Ctx } from '../src/shared/commands';
import { allPosts } from '../src/shared/rules';
import { codeKey } from '../src/shared/domain';
import type { AppState } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { bestFor, dutiesCmd, dutyDays, planDuties, planDutiesWrite, tableRows, type SourceBinding } from '../src/shared/sources';
import { buildDutyModel, colsByRole, collectCodes, dutyProfileFrom, findDutyGrid, guessCode, pickDuties, unresolvedCodes } from '../src/shared/dutyGrid';
import { withUnit } from '../src/shared/dutyUnit';
import { buildLexicon } from '../src/shared/lexicon';
import type { DutyMeaning } from '../src/shared/tplStore';
import { Workbook, colName } from '../src/main/xlsx';
import { safeWrite } from '../src/main/safeWrite';
import { genUnitGrid, type UnitGrid, type UnitMeaning } from './mockgen';
import { fakeState } from './fixtures';

const N = Number(process.env.FUZZ_N || 30);
const TODAY = '2026-12-20';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 'u' + ++seq };
const base = fakeState(40);
// τα ονόματα χωρίς ψηφία (το «ΔΟΚΙΜΙΟΣ1» δεν μοιάζει με επώνυμο· οι γραμμές με αριθμούς θεωρούνται σύνολα)
base.people = base.people.map(p => ({ ...p, last: p.last.replace(/\d/g, d => 'ΑΒΓΔΕΖΗΘΙΚ'[+d]) }));
const FAMILY = ['th', 'mg', 'op', 'sk', 'tae'];
const SEATS: Record<string, { k: string; code: string }[]> = {};
for (const p of allPosts(base.settings)) if (FAMILY.includes(p.kind)) (SEATS[p.kind] ||= []).push({ k: p.k, code: p.code || p.k });
const lex = buildLexicon();
const dateOf = (g: UnitGrid, d: number) => g.ym + '-' + String(d).padStart(2, '0');
const mean = (m: UnitMeaning, text: string): DutyMeaning => (m.t === 'seat' ? { t: 'seat', k: m.k, text } : m.t === 'kind' ? { t: 'kind', kind: m.kind, text } : m.t === 'status' ? { t: 'status', id: m.id, name: m.id.replace(/^(own|status):/, ''), text } : { t: 'ignore', text });
const dataCells = (g: UnitGrid) => g.cells.filter(x => x.meaning.t === 'seat' || x.meaning.t === 'kind');

// επικεφαλίδα που δεν αναγνωρίστηκε: ο χρήστης διαλέγει τη στήλη στο βήμα «Στήλες» (undefined = δεν χρειάζεται)
function userCols(g: UnitGrid, s: AppState): Record<string, string> | undefined {
  const model = buildDutyModel({ settings: s.settings, profile: null, file: 'x.xlsx', today: TODAY, sheet: g.sheet });
  const got = new Set(model.cols.map(c => c.role));
  if (got.has('name') || (got.has('last') && got.has('first'))) return undefined;
  const cols = colsByRole(model.cols); for (const [r, t] of Object.entries(g.heads)) cols[r] = t; return cols;
}
// το προφίλ όπως το κάνει ο χρήστης στο παράθυρο: για κάθε κωδικό διαλέγει την αλήθεια
function withProfile(g: UnitGrid, s: AppState): { s: AppState; b: SourceBinding } {
  const cols = userCols(g, s); const model = buildDutyModel({ settings: s.settings, profile: null, file: 'x.xlsx', today: TODAY, sheet: g.sheet, cols });
  const choices: Record<string, DutyMeaning> = {};
  for (const c of model.codes) { const code = Object.keys(g.vocab).find(k => codeKey(k) === c.key); if (code) choices[c.key] = mean(g.vocab[code], c.text); }
  const prof = dutyProfileFrom(model, { prev: null, choices, cols });
  const st = apply(s, { t: 'adaptTpl', profile: prof, create: [], text: 'δοκιμή' }, ctx).state;
  return { s: st, b: { ...model.binding!, month: g.ym } };   // μήνας: όταν δεν γράφεται στον τίτλο, τον δίνει ο χρήστης
}
// τι διαβάστηκε στην εφαρμογή
function readBack(g: UnitGrid, sheet: RawSheet, s: AppState, b: SourceBinding) {
  const plan = planDuties(sheet, b, s, g.ym, TODAY);
  const r = apply(s, { t: 'importDuties', ...dutiesCmd(plan), source: 'x' }, ctx).state;
  return { plan, state: r };
}
const truthGuards = (g: UnitGrid) => { const o: Record<string, Record<string, number>> = {}; for (const x of g.cells) if (x.meaning.t === 'seat') (o[dateOf(g, x.day)] ||= {})[x.meaning.k] = x.pid; return o; };
const truthKinds = (g: UnitGrid) => { const o: string[] = []; for (const x of g.cells) if (x.meaning.t === 'kind') o.push(dateOf(g, x.day) + '|' + x.pid + '|' + x.meaning.kind); return o.sort(); };
const gotKinds = (s: AppState) => Object.entries(s.dutyLog || {}).flatMap(([d, l]) => (l as { pid: number; kind: string }[]).map(x => d + '|' + x.pid + '|' + x.kind)).sort();
const stat = { grids: 0, found: 0, rows: 0, days: 0, codes: 0, sure: 0, suggest: 0, unknown: 0, wrongSure: 0, cells: 0, reads: 0, unitPicked: 0, legacy: 0, writes: 0, outside: 0, formula: 0, clobber: 0 };

describe('πλέγμα άλλης μονάδας: ανίχνευση, λεξιλόγιο, ανάγνωση, εγγραφή', () => {
  it('ανίχνευση + λεξιλόγιο: σωστές γραμμές/ημέρες, κανένα λάθος «σίγουρο»', () => {
    for (let seed = 1; seed <= N; seed++) {
      const g = genUnitGrid(seed, base.people, SEATS); stat.grids++;
      const grid = findDutyGrid(g.sheet, { lex, cols: userCols(g, base) });
      expect(grid, 'seed ' + seed + ' ' + g.flags.join(',')).toBeTruthy(); stat.found++;
      expect(grid!.rows.length, 'γραμμές seed ' + seed).toBe(g.people.length); stat.rows += grid!.rows.length;
      expect(grid!.dayCols.length, 'ημέρες seed ' + seed).toBe(g.days); stat.days += grid!.dayCols.length;
      for (const c of g.sumCols) expect(grid!.dayCols.includes(c)).toBe(false);
      const v = collectCodes(g.sheet, grid!);
      const used = new Set(g.cells.map(x => codeKey(x.code)));
      expect(new Set(v.codes.map(x => x.key)), 'κωδικοί seed ' + seed).toEqual(used); stat.codes += v.codes.length;
      for (const c of v.codes) {
        const truth = g.vocab[Object.keys(g.vocab).find(k => codeKey(k) === c.key)!]; const gs = guessCode(c.text, { settings: base.settings, lex }); stat[gs.sure]++;
        if (gs.sure !== 'sure') continue;
        const m = gs.meaning!;
        const ok = m.t === truth.t && (m.t !== 'seat' || (truth.t === 'seat' && m.k === truth.k)) && (m.t !== 'kind' || (truth.t === 'kind' && m.kind === truth.kind));
        if (!ok) { stat.wrongSure++; console.log('ΛΑΘΟΣ ΣΙΓΟΥΡΟ', seed, c.text, JSON.stringify(m), JSON.stringify(truth)); }
      }
    }
    expect(stat.wrongSure).toBe(0);
  });

  it('με προφίλ: αυτά που διαβάζονται ισούνται με την αλήθεια (θέσεις και υπηρεσίες χωρίς θέση)', () => {
    for (let seed = 1; seed <= N; seed++) {
      const g = genUnitGrid(seed, base.people, SEATS); const pick = pickDuties([g.sheet], { lex });
      expect(pick, 'seed ' + seed).toBeTruthy();
      // ό,τι δουλεύει ήδη με τα πρότυπα μένει όπως πριν (ελέγχεται παρακάτω)· αν ο χρήστης πατήσει «Αντιστοίχιση…» περνά κι αυτό από εδώ
      if (pick!.unit) stat.unitPicked++; else stat.legacy++;
      const { s, b } = withProfile(g, base);
      expect(b.unit).toBe(true);
      expect(unresolvedCodes(g.sheet, b, s.settings), 'seed ' + seed).toBe(0);
      const { plan, state } = readBack(g, g.sheet, s, b);
      expect(plan.errors, 'seed ' + seed + ' ' + g.flags.join(',')).toEqual([]);
      expect(plan.noRow).toEqual([]);
      expect(plan.unknown, 'seed ' + seed).toEqual([]);
      expect(state.guards, 'seed ' + seed + ' ' + g.flags.join(',')).toEqual(truthGuards(g));
      expect(gotKinds(state), 'seed ' + seed).toEqual(truthKinds(g));
      stat.reads += g.cells.length; stat.cells += g.cells.length;
    }
  });

  it('χωρίς προφίλ δεν διαβάζεται κανένας κωδικός που δεν ξέρει η εφαρμογή (μηδέν λάθος δεδομένα)', () => {
    for (let seed = 1; seed <= N; seed++) {
      const g = genUnitGrid(seed, base.people, SEATS); const pick = pickDuties([g.sheet], { lex });
      if (!pick) continue;
      const b: SourceBinding = { file: 'x.xlsx', sheet: g.sheet.name, header: pick.header, cols: pick.cols, write: true, scope: 'active', ...(pick.unit ? { unit: true } : {}), month: g.ym };
      const { state } = readBack(g, g.sheet, base, b);
      const tg = truthGuards(g);
      for (const [d, m] of Object.entries(state.guards)) for (const [k, pid] of Object.entries(m)) expect(tg[d]?.[k], 'seed ' + seed + ' ' + d + ' ' + k).toBe(pid);
      // υπηρεσία χωρίς θέση: μόνο όπου το Excel έχει όντως υπηρεσία εκείνου του ατόμου εκείνη τη μέρα
      for (const e of gotKinds(state)) { const [d, pid] = e.split('|'); expect(g.cells.some(x => dateOf(g, x.day) === d && x.pid === +pid && (x.meaning.t === 'seat' || x.meaning.t === 'kind')), 'seed ' + seed + ' ' + e).toBe(true); }
    }
  });

  it('εγγραφή: μόνο στα κελιά των ημερών των ατόμων, χωρίς τύπους και χωρίς δικό της κείμενο· διάβασμα(εγγραφή) = ό,τι γράφτηκε', () => {
    for (let seed = 1; seed <= N; seed++) {
      const g = genUnitGrid(seed, base.people, SEATS); const pick = pickDuties([g.sheet], { lex });
      if (!pick) continue;
      const { s, b } = withProfile(g, base);
      // η εφαρμογή ξέρει όλες τις υπηρεσίες· στο Excel λείπουν (άδεια κελιά), ενώ το κείμενο των άλλων κελιών μένει
      const bare: RawSheet = { ...g.sheet, rows: g.sheet.rows.map(r => r.slice()) };
      const mine = dataCells(g); for (const x of mine) bare.rows[x.r][x.c] = null;
      const st: AppState = { ...s, guards: truthGuards(g) }; const logs: Record<string, { pid: number; kind: string }[]> = {};
      for (const x of g.cells) if (x.meaning.t === 'kind') (logs[dateOf(g, x.day)] ||= []).push({ pid: x.pid, kind: x.meaning.kind });
      (st as any).dutyLog = logs;
      const plan = planDutiesWrite(bare, b, st, TODAY);
      const dc = dutyDays(bare, b); const prow = new Set(tableRows(bare, b.header, b.cols).records.map(x => x.r));
      for (const x of plan.sets) {
        if (!prow.has(x.r) || !dc.includes(x.c)) { stat.outside++; console.log('ΕΚΤΟΣ', seed, x.r, x.c); }
        if (g.sheet.fx?.has(x.r + ':' + x.c)) stat.formula++;
        const was = bare.rows[x.r][x.c];
        if (was != null && String(was).trim() !== '') stat.clobber++;
      }
      stat.writes += plan.sets.length;
      // ακριβώς τα κελιά της αλήθειας, με τον κωδικό της μονάδας
      const want = mine.map(x => x.r + ':' + x.c + '=' + x.code).sort();
      const got = plan.sets.map(x => x.r + ':' + x.c + '=' + String(x.v)).sort();
      expect(got, 'seed ' + seed + ' ' + g.flags.join(',')).toEqual(want);
      // εφαρμόζονται, και διαβάζονται πίσω ίδια
      const after: RawSheet = { ...bare, rows: bare.rows.map(r => r.slice()) };
      for (const x of plan.sets) after.rows[x.r][x.c] = x.v as any;
      const back = readBack(g, after, base.settings === s.settings ? s : s, b);
      expect(back.state.guards, 'round trip seed ' + seed).toEqual(truthGuards(g));
      expect(gotKinds(back.state)).toEqual(truthKinds(g));
      // το δεύτερο πέρασμα δεν έχει τίποτα να γράψει· κείμενα, τύποι και σύνολα όπως ήταν
      expect(planDutiesWrite(after, b, st, TODAY).sets, 'idempotent seed ' + seed).toEqual([]);
      for (let r = 0; r < after.rows.length; r++) for (let c = 0; c < after.rows[r].length; c++) if (g.sheet.rows[r][c] !== after.rows[r][c]) expect(mine.some(x => x.r === r && x.c === c), 'άλλαξε ξένο κελί ' + r + ':' + c).toBe(true);
    }
    expect(stat.outside).toBe(0); expect(stat.formula).toBe(0); expect(stat.clobber).toBe(0);
  });

  it('κωδικός χωρίς αντιστοίχιση: προειδοποίηση, δεν γράφεται· κείμενο του χρήστη στο κελί δεν σβήνεται', () => {
    let seen = 0;
    for (let seed = 1; seed <= N && seen < 6; seed++) {
      const g = genUnitGrid(seed, base.people, SEATS); const pick = pickDuties([g.sheet], { lex });
      if (!pick) continue;
      const free = g.cells.find(x => x.meaning.t === 'ignore'); if (!free) continue;
      const { s, b } = withProfile(g, base); seen++;
      // η εφαρμογή έχει υπηρεσία σε θέση που η μονάδα δεν έχει κωδικό, και μία πάνω σε κελί με ελεύθερο κείμενο
      const used = new Set(g.cells.filter(x => x.meaning.t === 'seat').map(x => (x.meaning as { k: string }).k));
      const lonely = allPosts(s.settings).find(p => p.k !== 'ly' && p.k !== 'dy' && !used.has(p.k))!;
      const day = dateOf(g, free.day);
      const st: AppState = { ...s, guards: { [day]: { [lonely.k]: g.people.find(p => p.id !== free.pid && !g.cells.some(x => x.day === free.day && x.pid === p.id))!.id, ...(used.has('th1') ? {} : {}) } } };
      const plan = planDutiesWrite(g.sheet, b, st, TODAY);
      expect(plan.sets.length, 'seed ' + seed).toBe(0);
      expect((plan.warn || []).join(' '), 'seed ' + seed).toMatch(/κωδικό/);
      const st2: AppState = { ...s, guards: { [day]: { [lonely.k]: free.pid } } };
      const p2 = planDutiesWrite(g.sheet, b, st2, TODAY);
      expect(p2.sets.some(x => x.r === free.r && x.c === free.c)).toBe(false);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('αρχεία που δουλεύουν σήμερα: ίδιες ρυθμίσεις (το ίδιο αντικείμενο), ίδιος πίνακας, χωρίς καμία παρέμβαση', () => {
    for (let seed = 1; seed <= N; seed++) {
      const g = genUnitGrid(seed, base.people, SEATS); const pick = pickDuties([g.sheet], { lex }); const std = bestFor('duties', [g.sheet]);
      if (!pick) continue;
      if (!pick.unit) { expect(pick).toEqual(std); continue; }
      // μη-unit δέσιμο ⇒ withUnit επιστρέφει το ίδιο αντικείμενο
      expect(withUnit(base, { unit: false })).toBe(base); expect(withUnit(base, undefined)).toBe(base);
    }
  });
});

// στο πραγματικό βιβλίο (Workbook + safeWrite, όπως ο main): οι τύποι των συνόλων μένουν, μόνο τα κελιά των ημερών αλλάζουν
describe('εγγραφή στο βιβλίο Excel', () => {
  it('τύποι COUNTIF και κείμενα μένουν· γράφονται οι κωδικοί της μονάδας όπως είναι (Θ1α, όχι ΘΙΑ)', async () => {
    let done = 0;
    for (let seed = 1; seed <= Math.min(N, 12); seed++) {
      const g = genUnitGrid(seed, base.people, SEATS); if (!pickDuties([g.sheet], { lex })) continue;
      const { s, b } = withProfile(g, base);
      const wb0 = new ExcelJS.Workbook(); const w0 = wb0.addWorksheet(g.sheet.name);
      g.sheet.rows.forEach((row, r) => row.forEach((v, c) => {
        if (v == null) return; const cell = w0.getCell(r + 1, c + 1);
        cell.value = g.sheet.fx?.has(r + ':' + c) ? { formula: 'COUNTIF(' + colName(g.dayCol0 + 1) + (r + 1) + ':' + colName(g.dayCol0 + g.days) + (r + 1) + ',"?*")', result: v as number } : v;
      }));
      for (const x of dataCells(g)) w0.getCell(x.r + 1, x.c + 1).value = null;
      const wb = await Workbook.open(Buffer.from(await wb0.xlsx.writeBuffer()));
      const sheet: RawSheet = { name: g.sheet.name, rows: await wb.values(g.sheet.name, 2000, 200) };
      const st: AppState = { ...s, guards: truthGuards(g) }; (st as any).dutyLog = {};
      const plan = planDutiesWrite(sheet, b, st, TODAY); const seatCells = g.cells.filter(x => x.meaning.t === 'seat');
      const dc = dutyDays(sheet, b); const rr = tableRows(sheet, b.header, b.cols).records.map(x => x.r);
      const box = { sheet: g.sheet.name, r1: Math.min(...rr), c1: dc[0], r2: Math.max(...rr), c2: dc[dc.length - 1] };
      // ένας κακός προγραμματισμός προς τον τύπο και προς ξένο κείμενο: το safeWrite τον αρνείται
      const bad = [{ sheet: g.sheet.name, r: g.first, c: g.sumCols[0] ?? g.dayCol0 + g.days, value: 'Χ', exact: true }];
      const rep = await safeWrite(wb, [...plan.sets.map(x => ({ sheet: g.sheet.name, r: x.r, c: x.c, value: String(x.v), exact: true })), ...(g.sumCols.length ? bad : [])], { dataBoxes: [box] });
      expect(rep.refused.length, 'seed ' + seed).toBe(g.sumCols.length ? 1 : 0);
      expect(rep.written.length).toBe(seatCells.length);
      const out = await Workbook.open(await wb.save()); const ws = await out.sheet(g.sheet.name);
      for (const x of seatCells) expect(ws.get(colName(x.c + 1) + (x.r + 1)), 'seed ' + seed).toBe(x.code);
      for (const key of g.sheet.fx || []) { const [r, c] = key.split(':').map(Number); expect(ws.hasFormula(colName(c + 1) + (r + 1)), 'τύπος seed ' + seed).toBe(true); }
      done++;
    }
    expect(done).toBeGreaterThan(0);
  });
});

// τοπικά μόνο: το πραγματικό αρχείο ελέγχου υπηρεσιών· τυπώνονται ΜΟΝΟ αριθμοί
const REAL = process.env.REAL_TEMPLATES_DIR;
describe.skipIf(!REAL || !fs.existsSync(path.join(REAL || '', 'YPIRESIES.xlsx')))('πραγματικό αρχείο (τοπικά)', () => {
  it('αριθμοί ανίχνευσης και κωδικών', async () => {
    const { readBook } = await import('../src/main/sources');
    const bk = await readBook(path.join(REAL!, 'YPIRESIES.xlsx')); const sh = bk.sheets[0];
    const pk = pickDuties(bk.sheets, { lex }); expect(pk).toBeTruthy();
    const g = findDutyGrid(sh, { lex })!; const v = collectCodes(sh, g); const c = { sure: 0, suggest: 0, unknown: 0 };
    for (const x of v.codes) c[guessCode(x.text, { settings: base.settings, lex }).sure]++;
    console.log('ΠΡΑΓΜΑΤΙΚΟ ΑΡΧΕΙΟ: γραμμές ' + g.rows.length + ', ημέρες ' + g.dayCols.length + ', κωδικοί ' + v.codes.length + ' (σίγουροι ' + c.sure + ', προτάσεις ' + c.suggest + ', άγνωστοι ' + c.unknown + '), κελιά ' + v.cells + ', αριθμοί ' + v.numbers + ', unit ' + !!pk!.unit);
  });
});
afterAll(() => { console.log('ΠΙΝΑΚΑΣ duty-unit-grid N=' + N + ': ' + JSON.stringify(stat)); });
