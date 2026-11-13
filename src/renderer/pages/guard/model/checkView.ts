// Pure rules of the «Έλεγχος υπηρεσιών» tab: month label, the columns, idle days, the order of the rows.
// Purpose: `monLbl`, `checkKinds`, `idleDays`, `checkRows`, `checkLayout` for `useDutyCheck` and its test.
// Does NOT: render anything, read the store or hold state (model/useDutyCheck.ts does).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6) so it is testable without a
//   render.
// Covering test: test/guard-page-view.test.ts.
import type { ISODate } from '../../../../shared/dates';
import { daysBetween, MONTHS } from '../../../../shared/dates';
import { blocksOf, everyBlock, KIND_LBL, type AppState, type DutyKind, type Person } from '../../../../shared/domain';
import { fairKey, postsOf, emptyStat, type DutyStat } from '../../../../shared/rules';
import { collator } from '../../../../shared/text';

/** «Νοέμβριος 2026» for `'2026-11'`. */
export const monLbl = (m: string) => MONTHS[+m.slice(5) - 1] + ' ' + m.slice(0, 4);

/** The sort of the table: a column key and the direction (1 up, -1 down). */
export interface CheckSort {
  k: string;
  dir: number;
}

/** One line of the table: the person, the stats of the chosen month and the days without duty. */
export interface CheckRow {
  p: Person;
  d: DutyStat;
  idle: number;
}

/**
 * The columns of the table: the kinds of the form and each own service apart (it counts as its own), and the hidden
 * ones while they have duties in the period (nothing is lost); «Άλλη» only for duties without a post (e.g. «Υ» from
 * the Excel).
 * @param st the stats of the chosen month (or of all months)
 */
export function checkKinds(state: AppState, st: Map<number, DutyStat>): string[] {
  const stats = [...st.values()];
  const own = (blocksOf(state.settings) || [])
    .filter((b) => b.hidden)
    .map((b) => (b.custom ? 'b:' + b.id : b.kind))
    .filter((k) => stats.some((d) => d.byKind[k]));
  const on = new Set([...postsOf(state.settings).map((p) => fairKey(state, p)), ...own]);
  if (stats.some((d) => d.log.some((e) => e.kind === 'other' && !e.t))) on.add('other');
  return [...on];
}

/** The header of a column: own services by name, the others by kind. */
export const kindLabel = (state: AppState, k: string): string =>
  k.startsWith('b:') ? everyBlock(state.settings).find((b) => 'b:' + b.id === k)?.name || '?' : KIND_LBL[k as DutyKind];

/**
 * Days without duty: from the last duty of any month (not only the month on screen).
 * @returns 9999 when the person never did one
 */
export function idleDays(allSt: Map<number, DutyStat>, pid: number, today: ISODate): number {
  const l = allSt.get(pid)?.last;
  return l ? Math.max(0, daysBetween(l, today) - 1) : 9999;
}

const sortValue = (r: CheckRow, k: string): number | string =>
  k === 'name'
    ? r.p.last + ' ' + r.p.first
    : k === 'total'
      ? r.d.total
      : k === 'hol'
        ? r.d.hol
        : k === 'last'
          ? r.d.last || ''
          : k === 'idle'
            ? r.idle
            : r.d.byKind[k] || 0;

/**
 * The people of the table in order. A click on a header sorts by it; else the fair order.
 * @decision Michael 17/10: first those with the most days without duty, then fewer in total, then fewer holidays.
 * @param holFirst «Λιγότερες αργίες»: holidays first of all
 */
export function checkRows(
  people: Person[],
  st: Map<number, DutyStat>,
  idleOf: (pid: number) => number,
  holFirst: boolean,
  sk: CheckSort | null,
): CheckRow[] {
  return people
    .map((p) => ({ p, d: st.get(p.id) || emptyStat(), idle: idleOf(p.id) }))
    .sort((a, b) => {
      if (sk) {
        const x = sortValue(a, sk.k);
        const y = sortValue(b, sk.k);
        const c = typeof x === 'number' ? x - (y as number) : collator.compare(x, y as string);
        if (c) return c * sk.dir;
      }
      return (
        (holFirst ? a.d.hol - b.d.hol : 0) ||
        b.idle - a.idle ||
        a.d.total - b.d.total ||
        a.d.hol - b.d.hol ||
        collator.compare(a.p.last, b.p.last)
      );
    });
}

/** Grid columns of the table, its minimum width and the height of the header (taller when a label is long). */
export function checkLayout(labels: string[]): { cols: string; min: number; head: number } {
  return {
    cols: 'minmax(140px,1fr) repeat(' + labels.length + ',84px) 52px 52px 78px 62px',
    min: 140 + labels.length * 84 + 52 + 52 + 78 + 62,
    head: labels.some((l) => l.length > 9) ? 58 : 34,
  };
}
