// The {LABELS} of a «Κενός πίνακας»: where each label gets its value, and the lists of names.
//
// Purpose: `blankTags` (the lookups for the labels of a form), `BlankTags`, the lists of names ({ΛΙΣΤΑ ΕΥ}, {ΠΛΗΘΟΣ
//   ΕΥ}) and `listTags` (the labels the «Βάλε τιμή…» menu offers).
// Does NOT: fill a cell text (blankFill.ts) or evaluate a measure (core values side).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/duty,
//   core/people, core/reports/cells, core/reports/condTest, core/reports/conds, core/reports/metricLookup,
//   core/reports/sortRows, core/reports/valueEval, core/reports/valueRows, core/reports/valueTags.
// Why: a «Κενός πίνακας» is written with the user's own text and labels, and the lists and the values tables answer
//   the same label, so the order of priority lives in one place.
// Covering tests: test/report-blank-lists.test.ts, test/report-blank-tags.test.ts.
import type { ISODate } from '../lib/dates';
import { upper } from '../lib/text';
import { TYPES, type TypeKey } from '../model/status';
import { shortName, type Person } from '../model/person';
import type { AppState } from '../model/state';
import { activePeople } from '../duty/indexes';
import { statusesOn } from '../duty/statuses';
import { live } from '../people/kinds';
import type { Report, RepCond } from '../model/reportTypes';
import { tagKey } from './cells';
import { condTest } from './condTest';
import { REP_CONDS } from './conds';
import { metricByTag } from './metricLookup';
import { sortRows } from './sortRows';
import type { ValueOut } from './valueEval';
import { valsUsed } from './valueRows';
import { tagId, tagsOf as valTags } from './valueTags';

/**
 * The lookups that give a {LABEL} in a cell of a «Κενός πίνακας» its value.
 * @decision Michael 29/10: a label is (in priority order) a row of a values table of the same form (a label that is
 *   already a form cell does not count as a row: warning), a form cell ({ΗΜΕΡΟΜΗΝΙΑ}, {ΤΙΤΛΟΣ}…) or a measure of the
 *   catalogue of values tables ({ΠΑΡΟΝΤΕΣ}, without needing a values table). A cell that is entirely a label = a
 *   number (the values-table row in its format), inside a text = text. An unknown label stays as written. Everything
 *   comes out in capitals except numbers.
 */
export interface BlankTags {
  std: (k: string) => string | number | null;
  row: (tag: string) => ValueOut['rows'][number] | undefined;
  met: (tag: string) => number | undefined;
  list?: (tag: string) => { s: string; n: number; cnt: boolean } | undefined;
} // list: the text, the count, and whether the count was asked for
/**
 * Builds the lookups for the labels of a form. `d`: the day of the form, for the lists of names ({ΛΙΣΤΑ ΕΥ}…); without
 * it there are no lists.
 */
export function blankTags(
  s: AppState,
  r: Pick<Report, 'vals'>,
  vo: ValueOut[],
  mv: (id: string) => number | null,
  std: (k: string) => string | number | null,
  d?: ISODate,
): BlankTags {
  const vt = valTags(valsUsed(r.vals), (id) => !!tagKey(id));
  return {
    std,
    row: (tg) => {
      const e = vt.map.get(tagId(tg));
      return e ? vo.find((x) => x.id === e.t.id)?.rows[e.i] : undefined;
    },
    met: (tg) => {
      const m = metricByTag(s, tg);
      const v = m ? mv(m.id) : null;
      return v ?? undefined;
    },
    ...(d ? { list: blankLists(s, d) } : {}),
  };
}
// Lists of names (Michael, 30/10): {ΛΙΣΤΑ ΕΥ} writes the names in one cell, separated by commas, e.g. «ΣΤΡ ΑΛΦΑΣ Α.,
// ΣΤΡ ΒΗΤΑΣ Β.». Lists: per filter of the form (REP_CONDS, the «yes» side) and per kind of status (ΕΑ, ΕΥ, ΚΑ…); with
// «ΣΗΜΕΡΑ» only the statuses that start on the day of the form (as pick.stNew). {ΠΛΗΘΟΣ ΕΥ}: the count of the same
// list (a number). An empty list: «—», like a values-table row without a value
interface ListDef {
  name: string;
  cond?: RepCond;
  neg?: true;
  type?: TypeKey;
  st: boolean;
} // st: also has a «ΣΗΜΕΡΑ» variant (it is based on statuses)
const LIST_CONDS: RepCond[] = ['present', 'duty', 'med', 'pun', 'leave', 'other'];
const LIST_DEFS = (): ListDef[] => {
  const cs = LIST_CONDS.map((id) => REP_CONDS.find((c) => c.id === id)!);
  return [
    ...cs.map((c): ListDef => ({ name: upper(c.yes), cond: c.id, st: c.id !== 'present' && c.id !== 'duty' })),
    { name: upper(cs[0].no), cond: 'present', neg: true, st: false },
    ...(Object.keys(TYPES) as TypeKey[])
      .filter((k) => ['med', 'abs', 'pun', 'other'].includes(TYPES[k].cat))
      .map((k): ListDef => ({ name: upper(TYPES[k].label), type: k, st: true })),
  ];
};
/**
 * All the list labels, as the «Βάλε τιμή…» menu inserts them (without the {ΠΛΗΘΟΣ …} ones, which are typed by hand).
 * @decision Michael 30/10: {ΛΙΣΤΑ ΕΥ} writes the names of a list in one cell, separated by commas.
 */
export const listTags = (): string[] =>
  LIST_DEFS().flatMap((f) => ['ΛΙΣΤΑ ' + f.name, ...(f.st ? ['ΛΙΣΤΑ ' + f.name + ' ΣΗΜΕΡΑ'] : [])]);
let LIST_IDX: Map<string, { f: ListDef; today: boolean; cnt: boolean }> | undefined;
const listIdx = () =>
  (LIST_IDX ||= new Map(
    LIST_DEFS().flatMap((f) =>
      (['ΛΙΣΤΑ', 'ΠΛΗΘΟΣ'] as const).flatMap((w) =>
        [false, true]
          .filter((t) => !t || f.st)
          .map((t) => [tagId(w + ' ' + f.name + (t ? ' ΣΗΜΕΡΑ' : '')), { f, today: t, cnt: w === 'ΠΛΗΘΟΣ' }] as const),
      ),
    ),
  ));
// Name in the list: rank (without the origin) and the short name (surname, initial, «του πατρός» for namesakes), as on
// the other screens (shortName)
const listName = (p: Person) => [p.rank, shortName(p)].filter(Boolean).join(' ');
function blankLists(s: AppState, d: ISODate): NonNullable<BlankTags['list']> {
  const tst = [condTest(s, d), condTest(s, d, true)];
  const memo = new Map<string, { s: string; n: number }>();
  return (tg) => {
    const id = tagId(tg);
    const e = listIdx().get(id);
    if (!e) return undefined;
    const key = id.replace(/^\S+/, '');
    let o = memo.get(key); // ΛΙΣΤΑ and ΠΛΗΘΟΣ of the same list count once
    if (!o) {
      const t = tst[+e.today];
      const f = e.f;
      const ps = activePeople(s).filter((p) =>
        f.type
          ? statusesOn(live(s), p.id, d).some((x) => x.type === f.type && (!e.today || x.from === d))
          : t(f.cond!, p) !== !!f.neg,
      );
      o = { s: sortRows(ps, 'rank', s, 'people').map(listName).join(', ') || '—', n: ps.length };
      memo.set(key, o);
    }
    return { ...o, cnt: e.cnt };
  };
}
