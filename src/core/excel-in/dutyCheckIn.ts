// Reading the duty check (sample 03): the monthly grid of the duties.
//
// Purpose: `planDuties` (the grid → what changes in the app, day by day), `mergeDuties` (one day: the app is kept),
//   `dutiesCmd` and the types of the plan. Re-exports `dutyCode` and `isAbsCode`.
// Does NOT: write the grid (dutyCheckBack.ts, dutyCheckSheet.ts) or know the codes (core/duty/dutyCodes.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/duty, core/model,
//   core/excel-in/sheetPeople, core/excel-in/columns, core/excel-in/sheetMonth.
// Why: the sergeant keeps the duties in his own monthly file; the app reads them with the rule «the app is kept»,
//   the same code for the preview and for the command, so exactly what was shown passes.
// Covering tests: test/duties-import.test.ts, test/duty-columns.test.ts, test/hold-duties.test.ts,
//   test/sources.test.ts.
import type { ISODate } from '../lib/dates';
import { normGreek } from '../lib/text';
import { KIND_NAME, type DutyKind } from '../model/duty';
import type { AppState } from '../model/state';
import type { SeatlessDuty } from '../model/records';
import { readDuty } from '../duty/dutyCodes';
import type { RawSheet } from './roster';
import { postBy } from '../duty/posts';
import { seatMap } from '../duty/indexes';
import type { SourceBinding } from '../model/bindings';
import { colLetter, cellText } from './cellText';
import { dutyDays, dayColumns, dayNum } from './columns';
import { type SheetPeople, sheetPeople, nameOf } from './sheetPeople';

export { dutyCode, isAbsCode } from '../duty/dutyCodes';
/** A day of the duty check: the seats and the duties without a seat (like `guards[d]` and `dutyLog[d]`). */
export interface DutyDay {
  seats: Record<string, number>;
  seatless: SeatlessDuty[];
}
/**
 * A cell of the sheet with a duty: who (`pid`), the seat `k` (if the code says it), the kind and what the cell says
 * (`raw`).
 */
export interface DutyCell {
  pid: number;
  k?: string;
  kind: DutyKind;
  raw: string;
}
/**
 * A duty that passes from the Excel into the app: `k` the seat, `label` for the user, `by` the person who already
 * holds the seat when the duty goes in without a seat.
 */
export interface DutyAdd {
  pid: number;
  k?: string;
  kind: DutyKind;
  label: string;
  by?: number;
}
/**
 * The merge of one day. `adds`: what passes into the app (a seat, or without a seat when the seat is already someone
 * else's: `by`); `differ`: the Excel says another, the app's stays; `gone`: the app had seen it and you deleted it
 * there (it is deleted from the Excel too); `dup`: the same seat code on two people (the day does not pass).
 */
export interface DutyMerge {
  day: DutyDay;
  adds: DutyAdd[];
  differ: { pid: number; app: string; excel: string }[];
  gone: { pid: number; excel: string }[];
  dup?: { raw: string; pids: number[] }[];
}
const dutyLabel = (s: AppState, k: string | undefined, kind: DutyKind) =>
  k ? postBy(s, k)?.label || k : KIND_NAME[kind] + ' χωρίς θέση';
const dkey = (d: ISODate, pid: number) => d + '|' + pid;
/**
 * Merges the cells of one day into the day of the app. The app is kept: what the Excel has and the app lacks comes in
 * (in its seat if it is free, otherwise without a seat); where they differ, the app's stays. The preview and the
 * command run the same code, so exactly what the preview showed passes.
 * @decision Michael 14/10: the app is kept.
 * `seen`: «day|person» that the app had already seen in the Excel (read or write).
 */
export function mergeDuties(s: AppState, d: ISODate, cells: DutyCell[], seen?: Set<string>): DutyMerge {
  const g0 = s.guards[d] || {};
  const log0 = s.dutyLog?.[d] || [];
  const out: DutyMerge = {
    day: { seats: { ...g0 }, seatless: log0.map((e) => ({ pid: e.pid, kind: e.kind })) },
    adds: [],
    differ: [],
    gone: [],
  };
  // the same seat code on two people: the day does not pass until it is corrected in the Excel
  const n = new Map<string, DutyCell[]>();
  for (const e of cells) if (e.k) n.set(e.k, [...(n.get(e.k) || []), e]);
  const dup = [...n.values()].filter((l) => l.length > 1);
  if (dup.length) {
    out.dup = dup.map((l) => ({ raw: l[0].raw, pids: l.map((e) => e.pid) }));
    return out;
  }
  const taken = new Set(Object.keys(g0));
  for (const e of cells) {
    const seats = Object.keys(g0).filter((k) => g0[k] === e.pid);
    const sl = log0.filter((x) => x.pid === e.pid);
    if (seats.length || sl.length) {
      const same = e.k
        ? seats.includes(e.k) || (!seats.length && sl.some((x) => x.kind === e.kind))
        : seats.some((x) => postBy(s, x)?.kind === e.kind) || sl.some((x) => x.kind === e.kind);
      // the app has him without a seat and the Excel says the seat (free): he takes the seat
      if (same && e.k && !seats.includes(e.k) && !taken.has(e.k)) {
        out.day.seats[e.k] = e.pid;
        taken.add(e.k);
        const i = out.day.seatless.findIndex((x) => x.pid === e.pid && x.kind === e.kind);
        if (i >= 0) out.day.seatless.splice(i, 1);
        out.adds.push({ pid: e.pid, k: e.k, kind: e.kind, label: dutyLabel(s, e.k, e.kind) });
      } else if (!same)
        out.differ.push({
          pid: e.pid,
          app: [
            ...seats.map((k) => dutyLabel(s, k, postBy(s, k)?.kind || 'other')),
            ...sl.map((x) => dutyLabel(s, undefined, x.kind)),
          ].join(', '),
          excel: e.raw,
        });
      continue;
    }
    if (seen?.has(dkey(d, e.pid))) {
      out.gone.push({ pid: e.pid, excel: e.raw });
      continue;
    }
    if (e.k && !taken.has(e.k)) {
      out.day.seats[e.k] = e.pid;
      taken.add(e.k);
      out.adds.push({ pid: e.pid, k: e.k, kind: e.kind, label: dutyLabel(s, e.k, e.kind) });
    } else {
      out.day.seatless.push({ pid: e.pid, kind: e.kind });
      out.adds.push({
        pid: e.pid,
        kind: e.kind,
        label: dutyLabel(s, undefined, e.kind),
        ...(e.k ? { by: g0[e.k] } : {}),
      });
    }
  }
  return out;
}
/**
 * A day in the preview: `extra` = what only the app has (written to the Excel); `locked` = a past (locked) day;
 * `twice` = people with two duties on the day (⚠, it passes).
 */
export interface DutyDayPlan extends DutyMerge {
  date: ISODate;
  cells: DutyCell[];
  extra: { pid: number; label: string }[];
  locked: boolean;
  twice: number[];
}
/**
 * The result of reading a duty-check sheet: the `days` that change, the number of `changes` and unchanged days
 * (`same`), `errors`, `future` days, people without a row in the sheet (`noRow`), the `keys` the app has now seen,
 * `warn` messages, `unknown` cell texts and the people found (`sp`).
 */
export interface DutiesPlan {
  month: string;
  days: DutyDayPlan[];
  changes: number;
  same: number;
  errors: { date: ISODate; text: string }[]; // same seat on two people: the day does not pass
  future: ISODate[]; // after today: they never pass
  noRow: number[]; // people with duties but without a row in the sheet: they are not written there
  keys: string[]; // «day|person» of the Excel that the app has now seen (after the read)
  warn?: string[]; // day columns that do not fit the month
  unknown: string[];
  sp: SheetPeople;
}
/** The command of a plan: per day the cells of the Excel that pass (not those you deleted in the app). */
export const dutiesCmd = (p: DutiesPlan): { days: Record<ISODate, DutyCell[]> } => ({
  days: Object.fromEntries(
    p.days
      .filter((x) => x.adds.length)
      .map((x) => [x.date, x.cells.filter((c) => !x.gone.some((g) => g.pid === c.pid))]),
  ),
});
/**
 * Reads the duty check (sample 03): a monthly grid, one column per day with the code of the duty. A seat code (Θ1α,
 * Μ2, ΛΥ) → the seat; a bare letter (Θ, Μ, Σ) → a duty without a seat, with a date (we do not guess a seat). The app
 * is kept: what the app lacks is taken in, for days up to today; what differs stays the app's and is written to the
 * Excel afterwards. Reading the same again adds nothing.
 * `synced`: «day|person» that the app had seen in the Excel at the previous read or write.
 */
export function planDuties(
  sheet: RawSheet,
  b: SourceBinding,
  s: AppState,
  month: string,
  today: ISODate,
  choices: Record<number, number | null> = {},
  synced: string[] = [],
): DutiesPlan {
  const sp = sheetPeople(sheet, b, s.people, choices);
  const pm = seatMap(s);
  const plan: DutiesPlan = {
    month,
    days: [],
    changes: 0,
    same: 0,
    errors: [],
    future: [],
    noRow: [],
    keys: [],
    unknown: [],
    sp,
  };
  const cols = dutyDays(sheet, b);
  const [y, m] = month.split('-').map(Number);
  const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const nDays = Math.min(cols.length, inMonth);
  const warn: string[] = [];
  if (cols.length !== inMonth)
    warn.push(
      'Βρέθηκαν ' +
        cols.length +
        ' στήλες ημερών, ενώ ο μήνας έχει ' +
        inMonth +
        ': έλεγξε τη στήλη της 1ης («Στήλες…»).',
    );
  const rowOf =
    [b.header, b.header - 1, b.header + 1].find(
      (r) => r >= 0 && dayColumns(sheet.rows[r], b.cols.d1).length === cols.length,
    ) ?? b.header;
  const off = cols
    .map((c, i) => [c, i + 1, dayNum((sheet.rows[rowOf] || [])[c])] as const)
    .filter(([, i, v]) => v != null && v !== i);
  if (off.length)
    warn.push(
      'Οι στήλες μετρούν με τη σειρά τους: ' +
        off
          .slice(0, 3)
          .map(([c, i, v]) => 'η ' + colLetter(c) + ' γράφει ' + v + ' αλλά είναι η ' + i + 'η μέρα')
          .join(', ') +
        (off.length > 3 ? '…' : '') +
        '.',
    );
  const byDay = new Map<ISODate, DutyCell[]>();
  const unk = new Map<string, string>();
  for (const row of sp.rows)
    cols.forEach((c, i) => {
      if (i >= nDays) return;
      const raw = cellText((sheet.rows[row.r] || [])[c]);
      const x = readDuty(raw, s.settings);
      if (x === 'unknown') {
        unk.set(normGreek(raw), raw);
        return;
      }
      if (!x || x === 'abs') return;
      const d = month + '-' + String(i + 1).padStart(2, '0');
      const l = byDay.get(d) || [];
      l.push({ pid: row.pid, ...x, raw: raw.trim() });
      byDay.set(d, l);
    });
  plan.unknown = [...unk.values()];
  const who = (pid: number) => (pm.get(pid) ? nameOf(pm.get(pid)!) : '?');
  const seen = new Set(synced);
  const keys = new Set<string>();
  const inSheet = new Set(sp.rows.map((r) => r.pid));
  const noRow = new Set<number>();
  const appDays = [...new Set([...Object.keys(s.guards), ...Object.keys(s.dutyLog || {})])].filter(
    (d) => d.slice(0, 7) === month && +d.slice(8) <= nDays,
  );
  for (const d of [...new Set([...byDay.keys(), ...appDays])].sort()) {
    const cells = byDay.get(d) || [];
    // future days and days with an error: what the app had already seen stays «seen», the rest does not
    const keepSeen = () =>
      cells.forEach((c) => {
        if (seen.has(dkey(d, c.pid))) keys.add(dkey(d, c.pid));
      });
    if (d > today) {
      if (cells.length) plan.future.push(d);
      keepSeen();
      continue;
    }
    const r = mergeDuties(s, d, cells, seen);
    if (r.dup) {
      plan.errors.push({
        date: d,
        text: r.dup.map((x) => x.raw + ' δύο φορές: ' + x.pids.map(who).join(', ')).join(' · '),
      });
      keepSeen();
      continue;
    }
    cells.forEach((c) => keys.add(dkey(d, c.pid)));
    const has = new Set(cells.map((c) => c.pid));
    const g = s.guards[d] || {};
    const extra = [
      ...Object.keys(g).map((k) => ({ pid: g[k], label: dutyLabel(s, k, postBy(s, k)?.kind || 'other') })),
      ...(s.dutyLog?.[d] || []).map((e) => ({ pid: e.pid, label: dutyLabel(s, undefined, e.kind) })),
    ].filter((x) => x.pid >= 0 && !has.has(x.pid) && (inSheet.has(x.pid) || (noRow.add(x.pid), false))); // a cadre in a seat (pid < 0): he does not belong to the sheet of the soldiers
    if (!r.adds.length && !r.differ.length && !r.gone.length && !extra.length) {
      plan.same++;
      continue;
    }
    const pids = [...Object.values(r.day.seats), ...r.day.seatless.map((e) => e.pid)];
    plan.days.push({
      ...r,
      date: d,
      cells,
      extra,
      locked: d < today,
      twice: [...new Set(pids.filter((p, i) => pids.indexOf(p) !== i))],
    });
    plan.changes += r.adds.length;
  }
  plan.noRow = [...noRow];
  plan.keys = [...keys];
  if (warn.length) plan.warn = warn;
  return plan;
}
