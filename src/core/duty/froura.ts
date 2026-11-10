// Duty form «ΦΡΟΥΡΑ»: the data of the guard (ΣΒΕΝ sample 01 and ΣΠΕΝ, photo of the clerk, 10/10/2026).
//
// Purpose: the cells of each form (`FROURA_FORMS`, `frouraForm`, `phaseOf`), the names (`rankName`, `dutyName`,
//   `lyLine`), what is written where (`frouraLayout`), the tables of the duties without a cell of their own
//   (`frouraTables`, `tableRowSpan`), the absence texts (`absenceText`, `absenceOf`) and the rows of the numbers of
//   the thalamofylakes / weapon-keepers (`NUM_ROWS`, `frouraPer`, `rows3`).
// Does NOT: write the Excel file (src/main/exports.ts `fillFroura` does) or change the template (templates/*.xlsx is
//   frozen).
// Owner layer: core/duty (no fs, no Electron, no React); imports core/model, core/people and core/duty.
// Why: shared by the export (main) and the preview (UI), so that both write exactly the same.
// Covering tests: test/service-edit.test.ts, test/shifts.test.ts, test/active-service.test.ts,
//   test/origin.test.ts.
import { norm } from '../lib/text';
import type { ISODate } from '../lib/dates';
import { TYPES, type Status } from '../model/status';
import { blocksOf, dutyStartOf, phaseBase } from '../model/settingsAccess';
import { buildPosts, groupKey } from '../model/blocks';
import { fullName, type Person } from '../model/person';
import type { AppState } from '../model/state';
import type { BasePhase, Phase } from '../model/duty';
import { leaveName } from '../people/kinds';
import { seatMap } from './indexes';
import { postsOf } from './posts';
import { rankTxt } from '../people/ranks';

/** The cells of one form of the guard. */
export interface FrouraForm {
  file: string;
  /** Post → cell of the name (two posts in the same cell = a pair of sentries). */
  pos: Record<string, string>;
  /** Last row of the tables of the form: below it go the tables of the duties without a cell of their own. */
  extra: { after: number };
  /** First row of the penalised / absent. */
  list: number;
  /** The tables of your own duties, two by two; look: the cells with their style. */
  tables: { look: TableCols; left: TableCols; right: TableCols };
}
/**
 * The columns of a duty table: Α/Α, name (from `name` until before the hours), ΩΡΕΣ, ΠΑΡ/ΣΕΙΣ. Without hours the name
 * takes their column too.
 */
export interface TableCols {
  aa: string;
  name: string;
  hours: string;
  note: string;
}
// Two side by side (Michael, 20/10): on the left in the columns of the 1st table of thalamofylakes, on the right in
// the columns of the 2nd (or of the weapon-keepers)
const TABLES: FrouraForm['tables'] = {
  look: { aa: 'B13', name: 'C13', hours: 'D13', note: 'E13' },
  left: { aa: 'B', name: 'C', hours: 'D', note: 'E' },
  right: { aa: 'I', name: 'J', hours: 'K', note: 'L' },
};
const range4 = (k: string, col: string) =>
  Object.fromEntries([0, 1, 2, 3].map((i) => [k + (i + 1), col + (13 + 3 * i)]));
/** The two forms of the guard, by base phase. */
export const FROURA_FORMS: Record<BasePhase, FrouraForm> = {
  sven: {
    file: 'froura.xlsx',
    pos: {
      ...range4('th', 'C'),
      th5: 'J13',
      th6: 'J16',
      th7: 'J19',
      th8: 'J22',
      mg1: 'F27',
      mg2: 'F28',
      mg3: 'F29',
      mg4: 'F30',
      mg5: 'F31',
    },
    extra: { after: 31 },
    list: 36,
    tables: TABLES,
  },
  spen: {
    file: 'froura-spen.xlsx',
    pos: {
      ...range4('th', 'C'),
      ...range4('op', 'J'),
      mg1: 'C27',
      mg2: 'C28',
      mg3: 'C29',
      mg4: 'C30',
      mg5: 'C31',
      tae: 'C33',
      sk3a: 'J27',
      sk3b: 'J27',
      sk4a: 'J30',
      sk4b: 'J30',
    },
    extra: { after: 33 },
    list: 38,
    tables: TABLES,
  },
};
/** The phase of the unit (ΣΒΕΝ by default). */
export const phaseOf = (s: AppState): Phase => s.settings.phase || 'sven';
/** The cells of the form: of the ΣΒΕΝ or of the ΣΠΕΝ (also for your own forms, with whichever of the two). */
export const frouraForm = (s: AppState, phase: Phase = phaseOf(s)): FrouraForm =>
  FROURA_FORMS[phaseBase(s.settings, phase)];

/** Rank, specialty in brackets and full name. */
export const rankName = (p: Person) =>
  [rankTxt(p), p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');
/**
 * On the duty form: only last name and first name; a cadre member in a post (Michael, 26/10) also with the rank.
 * @decision Michael 26/10: a cadre member in a post is written with the rank.
 */
export const dutyName = (p: Person) => (p.cid ? rankTxt(p) + ' ' : '') + fullName(p);
/** Λ/Υ and Δ/Υ: rank, name, mobile phone and weapon (clerk, 10/10). */
export const lyLine = (p: Person) =>
  rankName(p) + (p.phone ? ', ΤΗΛ: ' + p.phone : '') + (p.weapon ? ', ΟΠΛΟ: ' + p.weapon : '');

/** What is written where: the names per cell, the duties without a cell, and the posts the form does not know. */
export interface FrouraLayout {
  cells: Map<string, string[]>;
  extra: { label: string; k: string; g: string; block: string; name: string; hours: string; slots: string[] | null }[];
  foreign: string[];
}
/**
 * What is written where: the posts with a cell of their own, and those without (e.g. a new duty «Πύλη») in rows below.
 * `pos`: the cells of the posts in the template that comes out (tplmap.ts); without it, as in the template of the app
 * (screen).
 * @decision Michael 4/11: a pair: person β is written in the cell of α, one under the other.
 */
export function frouraLayout(
  s: AppState,
  date: ISODate,
  phase: Phase = phaseOf(s),
  pos: Record<string, string> = frouraForm(s, phase).pos,
): FrouraLayout {
  const g = s.guards[date] || {};
  const pm = seatMap(s);
  const cells = new Map<string, string[]>();
  const extra: FrouraLayout['extra'] = [];
  const posts = postsOf(s.settings);
  for (const x of posts) {
    if (x.k === 'ly' || x.k === 'dy') continue;
    const person = g[x.k] ? pm.get(g[x.k]) : undefined;
    // pair (Michael, 4/11): person β is written in the cell of α, one under the other
    const at =
      pos[x.k] ??
      (() => {
        const gk = groupKey(x);
        const y = posts.find((z) => z.block === x.block && groupKey(z) === gk && pos[z.k]);
        return y ? pos[y.k] : undefined;
      })();
    if (at) {
      if (!cells.has(at)) cells.set(at, []);
      if (person) cells.get(at)!.push(dutyName(person));
      continue;
    }
    const same = posts.filter((y) => y.block === x.block);
    const b = blocksOf(s.settings, phase).find((y) => y.id === x.block);
    const label = norm(b ? b.name : x.label) + (same.length > 1 ? ' ' + (same.indexOf(x) + 1) + 'ο' : '');
    extra.push({
      label,
      k: x.k,
      g: groupKey(x),
      block: x.block,
      name: person ? dutyName(person) : '',
      hours: x.hours,
      slots: x.slots,
    });
  }
  const foreign = Object.keys(g).filter(
    (k) => k !== 'ly' && k !== 'dy' && !posts.some((x) => x.k === k) && pm.get(g[k]),
  );
  return { cells, extra, foreign };
}

/**
 * A table of a duty without a cell of its own (e.g. a new duty «Πύλη»), one table per duty (Michael, 20/10): the title
 * is its name, 1st, 2nd… on the left, hours on the right only if it has them (not «ημέρα»). `shifts`: the shifts of
 * the number, one row each (Α/Α and name merged from top to bottom).
 * @decision Michael 20/10: each duty without a cell gets its own table.
 */
export interface FrouraTable {
  title: string;
  hours: boolean;
  rows: { n: string; name: string; hours: string; shifts?: string[] }[];
}
const realHours = (h: string) => !!h.trim() && norm(h) !== 'ΗΜΕΡΑ';
/** The tables of the duties without a cell, from the `extra` of the layout. */
export function frouraTables(s: AppState, lay: FrouraLayout, phase: Phase = phaseOf(s)): FrouraTable[] {
  const out = new Map<string, FrouraTable>();
  const rowOf = new Map<string, FrouraTable['rows'][number]>();
  for (const x of lay.extra) {
    let t = out.get(x.block);
    if (!t) {
      const b = blocksOf(s.settings, phase).find((y) => y.id === x.block);
      t = { title: norm(b ? b.name : x.label), hours: false, rows: [] };
      out.set(x.block, t);
    }
    // pair (Michael, 4/11): the people of the same number in one row, the names one under the other
    const prev = rowOf.get(x.block + '|' + x.g);
    if (prev) {
      if (x.name) prev.name = prev.name ? prev.name + '\n' + x.name : x.name;
      continue;
    }
    const row: FrouraTable['rows'][number] = { n: t.rows.length + 1 + 'ο', name: x.name, hours: '' };
    if (x.slots && x.slots.length) {
      row.hours = x.slots[0];
      row.shifts = x.slots;
      t.hours = true;
    } else if (realHours(x.hours)) {
      row.hours = norm(x.hours);
      t.hours = true;
    }
    rowOf.set(x.block + '|' + x.g, row);
    t.rows.push(row);
  }
  return [...out.values()];
}

/** «ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ», not «ΚΑΝΟΝΙΚΗ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ». */
export const absenceText = (kind: string | undefined, long: string) =>
  norm(kind && !norm(long).includes(norm(kind)) ? kind + ' ' + long : long);
/** The kind of absence on the form: a leave with its kind («ΑΔΕΙΑ ΑΙΜΟΔΟΣΙΑΣ»), not «ΑΙΜΟΔΟΣΙΑΣ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ». */
export const absenceOf = (x: Pick<Status, 'type' | 'kind'>) =>
  x.type === 'LEAVE' ? norm(leaveName(x)) : absenceText(x.kind, TYPES[x.type].long);

/**
 * The tables of thalamofylakes / weapon-keepers (rows 13–24): in the template each number has 3 rows, one per shift.
 * With other shifts (Michael, 20/10: «all the hours one under the other and the block gets adjusted») a number takes as
 * many rows as the fullest of the two side by side has shifts: more are added, the surplus ones are hidden.
 * @decision Michael 20/10: all the hours one under the other, and the block is adjusted.
 */
export const NUM_ROWS = [13, 16, 19, 22];
/** The rows each of the four numbers takes (at least 1; 3 when the posts have no shifts). */
export function frouraPer(s: AppState, phase: Phase = phaseOf(s)): number[] {
  const ps = buildPosts(
    blocksOf(s.settings, phase).filter((b) => !b.hidden),
    dutyStartOf(s.settings),
  );
  const spen = phaseBase(s.settings, phase) === 'spen';
  const right = spen ? 'op' : 'th',
    off = spen ? 1 : 5;
  return [0, 1, 2, 3].map((i) => {
    const ns = [ps.find((x) => x.k === 'th' + (i + 1)), ps.find((x) => x.k === right + (i + off))]
      .filter((x) => x && !x.hidden && x.slots)
      .map((x) => x!.slots!.length);
    return ns.length ? Math.max(1, ...ns) : 3;
  });
}
/**
 * In the cells of the form each number has 3 rows of hours: fewer shifts leave a blank, more are put two by two (or
 * more by more).
 */
export function rows3(slots: string[] | null | undefined): string[] {
  const sl = slots || [];
  if (sl.length <= 3) return [0, 1, 2].map((i) => sl[i] || '');
  const k = Math.ceil(sl.length / 3);
  return [0, 1, 2].map((i) => sl.slice(i * k, i * k + k).join(' · '));
}
/** How many rows a number takes in the table of your own duty. */
export const tableRowSpan = (x: FrouraTable['rows'][number]) => (x.shifts && x.shifts.length > 1 ? x.shifts.length : 1);
