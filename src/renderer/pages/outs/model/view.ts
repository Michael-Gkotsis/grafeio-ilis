// Pure rules of the «Εξοδούχοι» screen: the choices of a row, the saved and draft maps, what changed, who is shown.
// Purpose: `OUT_OPTS`, `savedOuts`, `mergeDraft`, `outDiffs`, `filterOutRows`, `sunWhyOf`, `outCounts` … for the hooks
//   of `OutsScreen` and its test.
// Does NOT: render anything, touch React, read the store or call `run` (model/useOuts.ts does).
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6) so it is testable without a
//   render.
// Covering test: test/outs-page-view.test.ts.
import type { ISODate } from '../../../../shared/dates';
import { addDays, parseD } from '../../../../shared/dates';
import type { AppState, Person, Status, TypeKey } from '../../../../shared/domain';
import { TYPES } from '../../../../shared/domain';
import { awayIn, awayName } from '../../../../shared/outsStay';
import { live, statusLbl } from '../../../../shared/ranks';
import { outBlock, outMinOn, statusesFrom } from '../../../../shared/rules';
import { stillOut, type returnsOn } from '../../../../shared/returns';
import { dutyAt, isWk } from '../../../../shared/weekend';
import { collator } from '../../../../shared/text';

/** What a row can hold: a stored out type, or «ΔΝ ΣΚ» (Saturday ΔΝ that also gives Sunday ΔΝ). */
export type OutVal = TypeKey | 'DNSK';

/** The day's choice per person id; a missing id means «Μένει». */
export type OutDraft = Record<number, OutVal>;

/** The row filter chips. */
export type OutFilter = 'all' | 'can' | 'cant' | 'sel';

/** Away status and its sentence per person id (leave or hospital at the time of going out). */
export type AwayMap = Map<number, { st: Status; note: string }>;

/** Why a «ΔΝ ΣΚ» person is kept in on Sunday, and whether a leave starts then. */
export interface SunWhy {
  why: string;
  leave: boolean;
}

/** One button of a row: `''` is «Μένει». */
export interface OutOpt {
  value: '' | 'OUT' | 'DN' | 'DNSK';
  label: string;
}

/** The three choices of a row. */
export const OUT_OPTS: OutOpt[] = [
  { value: '', label: 'Μένει' },
  { value: 'OUT', label: 'Έξοδος' },
  { value: 'DN', label: 'ΔΝ' },
];

/** Saturday adds «ΔΝ ΣΚ» = ΔΝ today and ΔΝ on Sunday (Michael, 18/10, 24/10). */
export const OUT_OPTS_SAT: OutOpt[] = [...OUT_OPTS, { value: 'DNSK', label: 'ΔΝ ΣΚ' }];

/** The same empty notes object every time, so a day without notes does not look like a change. */
export const NO_NOTES: Record<number, string> = {};

/**
 * Label of a choice. `away`: a person on leave or in hospital is not «Μένει»; the label says «Σε άδεια»/«Νοσοκομείο».
 * @param v - the choice, `null`/`undefined` for none
 */
export const valLbl = (v: OutVal | null | undefined, away?: Status | null) =>
  v === 'DNSK' ? 'ΔΝ ΣΚ' : v ? TYPES[v].label : away ? awayName(away) : 'Μένει';

/** Badge tone of a choice («ΔΝ ΣΚ» looks like ΔΝ). */
export const valTone = (v: OutVal) => TYPES[v === 'DNSK' ? 'DN' : v].tone;

/** `1–4` when the rooms are consecutive, else `1, 3, 5` (Ρυθμίσεις › Θάλαμοι και ουλαμοί). */
export const roomsTxt = (rs: number[]) =>
  rs.length > 2 && rs[rs.length - 1] - rs[0] === rs.length - 1 ? rs[0] + '–' + rs[rs.length - 1] : rs.join(', ');

/** The first day from `today` on (within 7 days) that falls on weekday `w` (0 = Sunday); `today` if none. */
export const nextDow = (today: ISODate, w: number): ISODate => {
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    if (parseD(d).getDay() === w) return d;
  }
  return today;
};

/** The day buttons of the screen: today, tomorrow, the next Saturday and Sunday, sorted, no repeats. */
export const outDaysOf = (today: ISODate, tomorrow: ISODate): ISODate[] =>
  [...new Set([today, tomorrow, nextDow(today, 6), nextDow(today, 0)])].sort();

/** What is stored for `date`: the out status of each person (Saturday weekend ΔΝ shows as «ΔΝ ΣΚ»). */
export const savedOuts = (statuses: Status[], date: ISODate, sat: boolean): OutDraft =>
  Object.fromEntries(
    statuses
      .filter((s) => TYPES[s.type].cat === 'out' && s.from <= date && date <= s.to)
      .map((s) => [s.pid, sat && s.type === 'DN' && isWk(s) ? 'DNSK' : s.type]),
  );

/** On Sunday: the people who came in by themselves from Saturday's «ΔΝ ΣΚ». */
export const weekendSunPids = (statuses: Status[], date: ISODate, sat: boolean): Set<number> =>
  new Set(sat ? [] : statuses.filter((s) => isWk(s) && s.from <= date && date <= s.to).map((s) => s.pid));

/**
 * The draft after the stored statuses changed elsewhere (a declaration, a read from Excel) on the same day: what the
 * user changed here and nobody else changed stays in the draft instead of being lost.
 * @param d - the draft now
 * @param saved - the stored map now
 * @param old - the stored map before
 */
export function mergeDraft(d: OutDraft, saved: OutDraft, old: OutDraft): OutDraft {
  const n: OutDraft = { ...saved };
  for (const id of new Set([...Object.keys(d), ...Object.keys(old)].map(Number)))
    if ((old[id] || null) === (saved[id] || null) && (d[id] || null) !== (old[id] || null)) {
      if (d[id]) n[id] = d[id];
      else delete n[id];
    }
  return n;
}

/** The draft with one person's choice set (`null` = «Μένει»). */
export const withChoice = (d: OutDraft, pid: number, v: OutVal | null): OutDraft => {
  const n = { ...d };
  if (v) n[pid] = v;
  else delete n[pid];
  return n;
};

/** The distinct room numbers of the people, ascending. */
export const roomsOf = (people: Person[]): number[] =>
  [...new Set(people.map((p) => p.room).filter((r): r is number => r != null))].sort((a, b) => a - b);

/** People whose choice differs from the stored one. */
export const outDiffs = (people: Person[], saved: OutDraft, draft: OutDraft) =>
  people
    .filter((p) => (saved[p.id] || null) !== (draft[p.id] || null))
    .map((p) => ({ pid: p.id, from: saved[p.id] || null, to: draft[p.id] || null }));

/** One changed choice. */
export type OutDiff = ReturnType<typeof outDiffs>[number];

/** People whose note differs from the stored one (trimmed). */
export const noteChangesOf = (notes: Record<number, string>, savedNotes: Record<number, string>) =>
  [...new Set([...Object.keys(notes), ...Object.keys(savedNotes)].map(Number))]
    .filter((pid) => (notes[pid] || '').trim() !== (savedNotes[pid] || ''))
    .map((pid) => ({ pid, note: (notes[pid] || '').trim() }));

/** The diffs as the `outs` command wants them: «ΔΝ ΣΚ» is stored as `DN` with `wk: true`. */
export const toChanges = (diffs: OutDiff[]) =>
  diffs.map((c) => ({
    pid: c.pid,
    from: c.from === 'DNSK' ? ('DN' as TypeKey) : c.from,
    to: c.to === 'DNSK' ? ('DN' as TypeKey) : c.to,
    ...(c.to === 'DNSK' ? { wk: true } : {}),
  }));

/** How the list is filtered and ordered. */
export interface RowFilter {
  filter: string;
  room: number | null;
  sort: string;
  /** The (deferred) search text; sorting by room only applies without a search. */
  dq: string;
  reasons: Record<number, string | null>;
  aways: AwayMap;
  draft: OutDraft;
}

/** The rows after room, filter chip and sort. `found` is the list the search already narrowed. */
export function filterOutRows(found: Person[], f: RowFilter): Person[] {
  const { filter, room, sort, dq, reasons, aways, draft } = f;
  const r = found.filter(
    (p) =>
      p.active &&
      (room == null || p.room === room) &&
      (filter === 'all' ||
        (filter === 'can'
          ? !reasons[p.id] && !aways.has(p.id)
          : filter === 'cant'
            ? !!reasons[p.id] || aways.has(p.id)
            : !!draft[p.id])),
  );
  return sort === 'room' && !dq
    ? [...r].sort(
        (a, b) =>
          (a.room ?? 99) - (b.room ?? 99) || collator.compare(a.last, b.last) || collator.compare(a.first, b.first),
      )
    : r;
}

/** How many people hold choice `t`. */
export const countOf = (draft: OutDraft, t: string) => Object.keys(draft).filter((k) => draft[Number(k)] === t).length;

/** Per day: the short names of «ΔΝ» people whose return day is not declared yet (and has no training). */
export const pendingDays = (backs: ReturnType<typeof returnsOn>, shortName: (p: Person) => string) => [
  ...backs.reduce(
    (m, b) => (b.r.pending ? m.set(b.r.day, [...(m.get(b.r.day) || []), shortName(b.p)]) : m),
    new Map<string, string[]>(),
  ),
];

/**
 * «ΔΝ ΣΚ»: what keeps the person in on Sunday (duty, penalty …), or that a leave starts then (`leave`: they leave
 * instead of coming back). `null` when nothing keeps them or the day is not Saturday.
 */
export function sunWhyOf(state: AppState, sat: boolean, sunday: ISODate, pid: number): SunWhy | null {
  if (!sat) return null;
  const lv = state.statuses.find((x) => x.pid === pid && TYPES[x.type].cat === 'abs' && x.from === sunday);
  if (lv) return { why: 'ξεκινά ' + statusLbl(lv, state.settings.lists), leave: true };
  const d = dutyAt(state, sunday, pid);
  const why = d ? d.label + (d.time ? ' από ' + d.time : '') : outBlock(state, sunday, pid);
  return why ? { why, leave: false } : null;
}

/** The counters of the bar above the list. */
export function outCounts(
  state: AppState,
  date: ISODate,
  people: Person[],
  reasons: Record<number, string | null>,
  aways: AwayMap,
  draft: OutDraft,
) {
  return {
    // People on leave are not «λόγω κανόνων» (blockedN); under «Δεν μπορούν» they stay with the others (cantN).
    blockedN: people.filter((p) => reasons[p.id] && !aways.has(p.id)).length,
    cantN: people.filter((p) => reasons[p.id] || aways.has(p.id)).length,
    awayN: people.filter((p) => aways.has(p.id) && !draft[p.id]).length,
    stayN: people.filter(
      (p) =>
        !draft[p.id] &&
        !awayIn(statusesFrom(live(state), p.id, date, outMinOn(state, date)), state.settings.lists) &&
        !stillOut(state, p.id, date),
    ).length,
  };
}

/**
 * What the confirm dialog and the save need: who goes out against the rules (or with ΔΝ without the right), and the
 * «ΔΝ ΣΚ» people who come back on Sunday morning or whose leave starts then.
 * @param dnSet - somebody has the ΔΝ right, so ΔΝ is for them only
 * @param sunWhy - {@link sunWhyOf} for the day on screen
 */
export function saveFacts(
  changes: ReturnType<typeof toChanges>,
  diffs: OutDiff[],
  reasons: Record<number, string | null>,
  dnSet: boolean,
  hasDn: (pid: number) => boolean,
  sunWhy: (pid: number) => SunWhy | null,
) {
  const warns = changes
    .filter((c) => c.to && (reasons[c.pid] || (c.to === 'DN' && dnSet && !hasDn(c.pid))))
    .map((c) => ({ pid: c.pid, why: reasons[c.pid] || 'χωρίς δικαίωμα ΔΝ' }));
  const sunBack = diffs
    .filter((c) => c.to === 'DNSK')
    .map((c) => ({ pid: c.pid, ...sunWhy(c.pid)! }))
    .filter((x) => x.why);
  return { warns, sunBackOnly: sunBack.filter((x) => !x.leave), sunLeave: sunBack.filter((x) => x.leave) };
}
