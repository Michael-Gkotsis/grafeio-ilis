// A new duty-check file (sample 03) for a month.
//
// Purpose: `planDutiesNew` (title, headers, one row per active person, counters, totals, grey weekends and
//   holidays), `dutyCols` (the counter columns, including the user's own duties) and the title, sheet name and
//   binding of a month.
// Does NOT: read or update a duty check (dutyCheckIn.ts, dutyCheckBack.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/duty, core/model,
//   core/excel-in/dutyCheckBack, core/excel-in/newRoster, core/excel-in/sheetMonth.
// Why: the app can start the monthly file of the sergeant in his own shape; the counters count seat codes too, and
//   the weekends and holidays come from the calendar of the app.
// Covering tests: test/new-files.test.ts, test/duty-columns.test.ts, test/duties-import.test.ts.
import { type ISODate, MONTHS as MONTH_NAMES } from '../lib/dates';
import { norm } from '../lib/text';
import type { DutyKind } from '../model/duty';
import { codeKey } from '../model/codes';
import { everyBlock } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import type { Settings } from '../model/settings';
import { isBareCode } from '../duty/dutyCodes';
import type { CellValue } from './roster';
import { isHol } from '../duty/holidays';
import { rankTxt } from '../people/ranks';
import type { SourceBinding } from '../model/bindings';
import { colLetter } from './cellText';
import { planDutiesWrite } from './dutyCheckBack';
import { byRoom } from './newRoster';
import type { Span } from './peopleSnap';
import type { WVal } from './writeCells';

/**
 * The headers before the days of a new duty-check sheet (sample 03). One sheet per month: title «ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ
 * ΟΚΤΩΒΡΙΟΥ 2026», one row per active person (per room and alphabetically), counters per kind and one column per day.
 * The counters count with «Θ*», «Μ*»… so they count the seat codes too (Θ1α, Μ2); the weekends and holidays come from
 * the calendar of the app (grey, and in the ΑΡΓΙΑ column).
 */
export const DUTY_HEAD = [
  'Α/Α',
  'ΒΘΜ',
  'Ο-Σ',
  'ΕΠΩΝΥΜΟ',
  'ΟΝΟΜΑ',
  'ΘΑΛΑΜΟΣ',
  'ΑΡΓΙΑ',
  'ΚΑΘΗΜΕΡΙΝΗ',
  'ΣΥΝΟΛΟ',
  'ΣΚΟΠΙΑ',
  'ΜΑΓΕΙΡΕΙΑ',
  'ΘΑΛΑΜΟΦΥΛΑΚΑΣ',
  'ΟΠΛΟΦΥΛΑΚΑΣ',
  'Λ/Υ-Δ/Υ',
];
const DUTY_COUNT: [number, string[]][] = [
  [9, ['Σ*']],
  [10, ['Μ*']],
  [11, ['Θ*']],
  [12, ['ΟΠ*']],
  [13, ['ΛΥ*', 'ΔΥ*']],
];
const ANY_DUTY = ['Θ*', 'Μ*', 'Σ*', 'ΟΠ*', 'ΛΥ*', 'ΔΥ*', 'Τ*', 'Υ*'];
const KIND_COL: Partial<Record<DutyKind, number>> = { sk: 9, mg: 10, th: 11, op: 12, ly: 13 };
/**
 * The columns before the days of a duty-check sheet: `head` the headers, `count` the counters ([column, criteria]) and
 * `any` the criteria that count any duty.
 */
export interface DutyCols {
  head: string[];
  count: [number, string[]][];
  any: string[];
}
/**
 * The counter columns of the month: those of the sample, and one for each of the user's own duties that no counter
 * counts (e.g. «Πύλη», kind «other»), with its name. Every counter and the totals also count the codes that do not
 * start with the letter of the kind (a code changed in Settings, e.g. «Π1»). A bare letter or word (e.g. «ΠΥΛΗ») gets
 * a «*», so the formula does not look like a COUNTIF of a bare letter (exactCountif). Without Settings: as the sample.
 */
export function dutyCols(settings?: Settings): DutyCols {
  const head = [...DUTY_HEAD];
  const count = DUTY_COUNT.map(([c, x]) => [c, [...x]] as [number, string[]]);
  const any = [...ANY_DUTY];
  if (!settings) return { head, count, any };
  const hit = (list: string[], code: string) =>
    list.some((w) =>
      w.endsWith('*') ? codeKey(code).startsWith(codeKey(w.slice(0, -1))) : codeKey(w) === codeKey(code),
    );
  const crit = (code: string) => (isBareCode(code) ? code + '*' : code);
  const own = new Map<string, number>();
  for (const b of everyBlock(settings)) {
    let col = KIND_COL[b.kind];
    if (col == null && b.custom) {
      // and the inactive ones too (Michael, 20/10): their duties are not lost from the check
      const name = norm(b.name);
      col = own.get(name);
      if (col == null) {
        col = head.length;
        head.push(name);
        count.push([col, []]);
        own.set(name, col);
      }
    }
    const into = col == null ? null : count.find((x) => x[0] === col)![1];
    for (const p of b.posts) {
      const code = (p.code || '').trim();
      if (!code) continue;
      if (!hit(any, code)) any.push(crit(code));
      if (into && !hit(into, code)) into.push(crit(code));
    }
  }
  return { head, count, any };
}
const monthUp = (ym: string) => norm(MONTH_NAMES[Number(ym.slice(5, 7)) - 1]);
/** The title of the sheet of month `ym` (YYYY-MM), e.g. «ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΟΚΤΩΒΡΙΟΥ 2026». */
export const dutiesTitle = (ym: string) =>
  'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + monthUp(ym).replace(/ΟΣ$/, 'ΟΥ') + ' ' + ym.slice(0, 4);
/** The name of the sheet of month `ym` (YYYY-MM), e.g. «ΟΚΤΩΒΡΙΟΣ 2026». */
export const dutiesSheet = (ym: string) => monthUp(ym) + ' ' + ym.slice(0, 4);
/**
 * The binding of a new duty-check file for month `ym`: header on row 1, the person columns and the first day column
 * (after the counters of `dutyCols`), scope «all».
 */
export const dutiesBinding = (
  file: string,
  ym: string,
  sheet = dutiesSheet(ym),
  settings?: Settings,
): SourceBinding => ({
  file,
  sheet,
  header: 1,
  cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4, room: 5, d1: dutyCols(settings).head.length },
  write: true,
  scope: 'all',
  month: ym,
});
/** A cell of a new duty-check sheet: `v` a value or `f` a formula, `st` its style, `gray` for weekends and holidays. */
export interface NewCell {
  r: number;
  c: number;
  v?: WVal;
  f?: string;
  st: 'title' | 'head' | 'data' | 'code';
  gray?: boolean;
}
/**
 * The cells of a new duty-check sheet for the month of `b`: the title, the headers, one row per active person with the
 * codes of the duties the app already has (up to `today`), the counters with their formulas, and the totals. Also the
 * merges, the column widths, the number of rows and of filled cells, and the `keys` the app has now seen.
 */
export function planDutiesNew(
  b: SourceBinding,
  s: AppState,
  today: ISODate,
): { cells: NewCell[]; merges: Span[]; widths: Record<number, number>; rows: number; filled: number; keys: string[] } {
  const ym = b.month!;
  const [y, m] = ym.split('-').map(Number);
  const nd = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d1 = b.cols.d1;
  const days = Array.from({ length: nd }, (_, i) => (ym + '-' + String(i + 1).padStart(2, '0')) as ISODate);
  const hol = days.map((d) => isHol(s.settings, d));
  const people = s.people.filter((p) => p.active).sort(byRoom);
  const cells: NewCell[] = [];
  const last = d1 + nd - 1;
  const L = colLetter;
  // the columns of the user's own duties only if the mapping has them (`dutiesBinding` with the Settings)
  const DC = dutyCols(s.settings);
  const head = DC.head.slice(0, Math.max(DUTY_HEAD.length, d1));
  const counts = DC.count.filter(([c]) => c < head.length);
  const ANY = DC.any;
  cells.push({ r: 0, c: 0, v: dutiesTitle(ym), st: 'title' });
  head.forEach((h, c) => cells.push({ r: 1, c, v: h, st: 'head' }));
  days.forEach((_, i) => cells.push({ r: 1, c: d1 + i, v: i + 1, st: 'head', gray: hol[i] }));
  const any = (rng: string) => 'SUM(COUNTIF(' + rng + ',{' + ANY.map((x) => '"' + x + '"').join(',') + '}))';
  // consecutive weekend or holiday days: one range each
  const runs: [number, number][] = [];
  hol.forEach((h, i) => {
    if (!h) return;
    const l = runs[runs.length - 1];
    if (l && l[1] === i - 1) l[1] = i;
    else runs.push([i, i]);
  });
  const raw: CellValue[][] = [[dutiesTitle(ym)], [...head, ...days.map((_, i) => i + 1)]];
  people.forEach((p, i) => {
    const r = 2 + i,
      R = r + 1;
    const row = L(d1) + R + ':' + L(last) + R;
    const vals: WVal[] = [i + 1, rankTxt(p) || null, p.spec || null, p.last, p.first, p.room ?? null];
    vals.forEach((v, c) => cells.push({ r, c, v, st: 'data' }));
    raw.push(vals.map((v) => (v != null && typeof v === 'object' ? null : v)));
    cells.push({
      r,
      c: 6,
      f: runs.length ? runs.map(([a, z]) => any(L(d1 + a) + R + ':' + L(d1 + z) + R)).join('+') : '0',
      st: 'data',
    });
    cells.push({ r, c: 7, f: L(8) + R + '-' + L(6) + R, st: 'data' });
    cells.push({ r, c: 8, f: any(row), st: 'data' });
    for (const [c, codes] of counts)
      cells.push({
        r,
        c,
        f: codes.length ? codes.map((x) => 'COUNTIF(' + row + ',"' + x + '")').join('+') : '0',
        st: 'data',
      });
    days.forEach((_, j) => cells.push({ r, c: d1 + j, st: 'code', gray: hol[j] }));
  });
  // TOTALS: per counter column and per day (as in the sample, in the name column)
  const tr = 2 + people.length,
    TR = tr + 1;
  if (people.length) {
    cells.push({ r: tr, c: 4, v: 'ΣΥΝΟΛΑ', st: 'head' });
    for (let c = 6; c < head.length; c++)
      cells.push({ r: tr, c, f: 'SUM(' + L(c) + '3:' + L(c) + (TR - 1) + ')', st: 'head' });
    days.forEach((_, j) =>
      cells.push({ r: tr, c: d1 + j, f: any(L(d1 + j) + '3:' + L(d1 + j) + (TR - 1)), st: 'head', gray: hol[j] }),
    );
  }
  // the duties the app already has for the month, as it writes them in your own file too
  const plan = planDutiesWrite({ name: b.sheet, rows: raw }, b, s, today);
  const at = new Map(cells.map((x) => [x.r + ':' + x.c, x]));
  for (const x of plan.sets) {
    const c = at.get(x.r + ':' + x.c);
    if (c) c.v = x.v;
  }
  const widths: Record<number, number> = { 1: 5, 2: 7, 3: 7, 4: 18, 5: 14, 6: 6 };
  for (let c = 6; c < head.length; c++) widths[c + 1] = 8;
  for (let j = 0; j < nd; j++) widths[d1 + j + 1] = 4.5;
  return {
    cells,
    merges: [{ r: 0, c1: 0, c2: last }],
    widths,
    rows: people.length,
    filled: plan.changed,
    keys: plan.keys,
  };
}
