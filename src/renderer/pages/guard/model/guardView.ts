// Pure rules of the «Υπηρεσίες» screen: who is not placed on the day, the next empty seat, the weekend, the tabs.
// Purpose: `excludedOn`, `afWhyOf`, `pskOf`, `nextEmptyKey`, `guardTabs`, `emptyOn`, `skipCount`, `blockNames` for the
//   hooks of `GuardScreen` and its test.
// Does NOT: render anything, touch React or the DOM (the hooks read the focused input and the scroll position).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6) so it is testable without a
//   render.
// Covering test: test/guard-page-view.test.ts.
import type { ISODate } from '../../../../shared/dates';
import { parseD, pskDays } from '../../../../shared/dates';
import {
  blocksOf,
  shortName,
  type AppState,
  type BlockDef,
  type Person,
  type Post,
  type Status,
} from '../../../../shared/domain';
import { live } from '../../../../shared/ranks';
import {
  capCell,
  capCols,
  dutyMin,
  isEpop,
  offDayBlock,
  seatPeople,
  statusesFrom,
  type CapCol,
} from '../../../../shared/rules';
import { statIsUnarmed, statNoDuty } from '../../../../shared/stat';

/** A person kept out of the duties by a status. */
export interface ExcludedBy {
  p: Person;
  s: Status;
}

/** A person with permanent «no» on some columns of «Ποιος κάνει τι». */
export interface CappedPerson {
  p: Person;
  c: { col: CapCol; x: { on: boolean; why: string } }[];
}

/** The people who are not placed on the day, by reason. */
export interface Excluded {
  noDuty: ExcludedBy[];
  unarmed: ExcludedBy[];
  posted: Person[];
  capped: CappedPerson[];
  offDay: { p: Person }[];
  epop: Person[];
}

/**
 * Who does not get a seat on `date`, and why: statuses (no duty at all, only unarmed duties), a post, permanent «no» of
 * the sergeant, days without duty, and ΕΠΟΠ/ΟΒΑ and cadre (by hand only).
 * @param people the active soldiers
 */
export function excludedOn(state: AppState, date: ISODate, people: Person[]): Excluded {
  const lists = state.settings.lists;
  // As the status table of Ρυθμίσεις › Υπηρεσίες says: no duty of the form at all, or no armed one.
  const blocks = (blocksOf(state.settings) || state.settings.blocks).filter((b) => !b.hidden);
  const noDuty: ExcludedBy[] = [];
  const unarmed: ExcludedBy[] = [];
  for (const p of people) {
    const ss = statusesFrom(live(state), p.id, date, dutyMin(state.settings));
    const a = ss.find((s) => statNoDuty(s, blocks, lists));
    if (a) {
      noDuty.push({ p, s: a });
      continue;
    }
    const b = ss.find((s) =>
      statIsUnarmed(
        s,
        blocks.filter((x) => x.kind !== 'ly'),
        lists,
      ),
    );
    if (b) unarmed.push({ p, s: b });
  }
  // With a post: apart, with the post (by hand only, in any seat).
  const posted = people.filter((p) => p.post && !noDuty.some((x) => x.p === p));
  const cols = capCols(state.settings);
  const capped = people
    .filter((p) => !p.post)
    .map((p) => ({ p, c: cols.map((col) => ({ col, x: capCell(state, p, col) })).filter((o) => !o.x.on) }))
    .filter((o) => o.c.length);
  const offDay = people
    .filter((p) => !noDuty.some((x) => x.p === p) && offDayBlock(state, date, p.id))
    .map((p) => ({ p }));
  // ΕΠΟΠ/ΟΒΑ: by hand only, with the duties of the month.
  const epop = [...people.filter((p) => isEpop(p, lists)), ...seatPeople(state).filter((p) => p.cid)];
  return { noDuty, unarmed, posted, capped, offDay, epop };
}

/**
 * Why «Αυτόματη συμπλήρωση» is grey (UX Μ5).
 * @returns the sentence, or `''` when the button works
 */
export const afWhyOf = (locked: boolean, nPeople: number, nEmpty: number): string =>
  locked
    ? 'Περασμένη μέρα: πάτα πρώτα «Ξεκλείδωσε για διόρθωση»'
    : !nPeople
      ? 'Δεν υπάρχουν στρατιώτες στο Δυναμολόγιο'
      : !nEmpty
        ? 'Δεν υπάρχουν κενές θέσεις'
        : '';

/** The weekend (Friday, Saturday, Sunday) of a day that is one of them, else `null`. */
export const pskOf = (date: ISODate): ISODate[] | null =>
  [5, 6, 0].includes(parseD(date).getDay()) ? pskDays(date) : null;

/** Number of empty seats on a day. */
export const emptyOn = (state: AppState, posts: Post[], d: ISODate): number => {
  const gd = state.guards[d] || {};
  return posts.filter((x) => !gd[x.k]).length;
};

/** Exceptions («Εξαιρέσεις») that are in force today or come. */
export const skipCount = (people: Person[], today: ISODate): number =>
  people.reduce((n, p) => n + (p.skips?.filter((k) => k.to >= today).length || 0), 0);

/** The names of those placed in a block, for the closed block: «Α, Β, Γ». */
export const blockNames = (ps: Post[], g: Record<string, number | null | undefined>, pm: Map<number, Person>): string =>
  ps
    .map((x) => (g[x.k] ? shortName(pm.get(g[x.k] as number)!) : null))
    .filter(Boolean)
    .join(', ');

/**
 * The seat «Επόμενη κενή» (button or key Ν) goes to. It continues after the last seat you went to (or are typing in),
 * else from the first one that is on screen.
 * @param blocks the blocks of the form
 * @param posts all seats
 * @param g the placed ids by seat key
 * @param from the seat key the focus is in (`gp-<key>`) or the last one visited; `null` when none
 * @param onScreen which empty seat keys are visible below the top bar
 * @returns the seat key, `''` when no seat is empty, or the first visible one
 */
export function nextEmptyKey(
  blocks: BlockDef[],
  posts: Post[],
  g: Record<string, number | null | undefined>,
  from: string | null,
  onScreen: (k: string) => boolean,
): string {
  const shown = new Set(blocks.filter((b) => !b.hidden).map((b) => b.id));
  const vis = posts.filter((x) => shown.has(x.block));
  const ks = vis.filter((x) => !g[x.k]).map((x) => x.k);
  if (!ks.length) return '';
  const at = from ? vis.findIndex((x) => x.k === from) : -1;
  const k = at >= 0 ? (vis.slice(at + 1).find((x) => !g[x.k]) || vis.find((x) => !g[x.k]))!.k : '';
  return k || ks.find(onScreen) || ks[0];
}

/** The tabs of the screen; on a narrow screen «Έλεγχος» is shorter and «Excel» is a tab. */
export function guardTabs(nEmpty: number, skipN: number, mobile: boolean) {
  return [
    { value: 'posts', label: 'Θέσεις' + (nEmpty ? ' (' + nEmpty + ')' : '') },
    { value: 'check', label: mobile ? 'Έλεγχος' : 'Έλεγχος υπηρεσιών' },
    { value: 'who', label: 'Ποιος κάνει τι' },
    { value: 'skips', label: 'Εξαιρέσεις' + (skipN ? ' (' + skipN + ')' : '') },
  ].concat(mobile ? [{ value: 'xl', label: 'Excel' }] : []);
}
