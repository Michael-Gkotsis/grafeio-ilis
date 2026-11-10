// The status columns of a report: which statuses a column shows and how a status is written.
//
// Purpose: `stText` (a status in a format with {TAGS}), `ST_TAGS` / `ST_FMTS` (the tags and the ready formats),
//   `stCol` (the statuses of a soldier on a day as one cell), `isStatusField`, `stNewCols`.
// Does NOT: list the fields (fields.ts) or decide the filters (conds.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/duty,
//   core/people.
// Why: the same writing of a status is used by the status columns, the combinations and the «Καταστάσεις» kind, and
//   saved reports keep their old formats, so it is kept in one place.
// Covering tests: test/report-days-left.test.ts, test/reports-tables.test.ts, test/report-stnew.test.ts.
import { daysBetween, dm, type ISODate } from '../lib/dates';
import { normGreek } from '../lib/text';
import { TYPES, type Status } from '../model/status';
import type { AppState } from '../model/state';
import { statusesOn } from '../duty/statuses';
import { live, leavePhrase, statusLbl } from '../people/kinds';
import type { ColOpts, RepPick, StCat } from '../model/reportTypes';

/** Columns with the statuses of the day: the categories each one takes (null: all) */
export const ST_FIELD: Record<string, StCat[] | null> = {
  status: null,
  smed: ['med'],
  sabs: ['abs'],
  spun: ['pun'],
  sother: ['other'],
  sout: ['out'],
};
/** True for the columns that show statuses: `stype` and the status-of-the-day columns. */
export const isStatusField = (f: string) => f === 'stype' || Object.prototype.hasOwnProperty.call(ST_FIELD, f);
const CAT_WORD: Partial<Record<string, string>> = { med: 'ΙΑΤΡΙΚΟ', abs: 'ΑΔΕΙΑ', pun: 'ΠΟΙΝΗ', out: 'ΕΞΟΔΟΣ' };
/** The {TAGS} a status format can use, each with an example. */
export const ST_TAGS: { tag: string; help: string }[] = [
  { tag: 'ΚΩΔ', help: 'ΕΑ, ΚΑ, ΠΕΡΙΟΡΙΣΜΟΣ' },
  { tag: 'ΣΥΝΤΟΜΑ', help: 'ΕΑ, ΕΥ, ΑΔΕΙΑ, ΠΟΙΝΗ' },
  { tag: 'ΟΝΟΜΑ', help: 'ΕΛΕΥΘΕΡΟΣ ΑΣΚΗΣΕΩΝ' },
  { tag: 'ΚΑΤΗΓΟΡΙΑ', help: 'ΙΑΤΡΙΚΟ, ΑΔΕΙΑ, ΠΟΙΝΗ' },
  { tag: 'ΑΠΟ', help: '20/10' },
  { tag: 'ΕΩΣ', help: '24/10' },
  { tag: 'ΗΜΕΡΕΣ', help: '5' },
  { tag: 'ΜΕΝΟΥΝ', help: '2' }, // days left from the day of the form, counting that day
  { tag: 'ΚΑΤΕΥΘΥΝΣΗ', help: 'ΚΟΡΙΝΘΟΣ (άδειες)' }, // the destination of the leave (1/11), empty when it has none
];
/** The ready formats for a status column; anything else the user writes is «δική σου». */
export const ST_FMTS = [
  '{ΚΩΔ}',
  '{ΣΥΝΤΟΜΑ}',
  '{ΟΝΟΜΑ}',
  '{ΚΑΤΗΓΟΡΙΑ}',
  '{ΚΩΔ} ΕΩΣ {ΕΩΣ}',
  '{ΚΩΔ} {ΑΠΟ}-{ΕΩΣ}',
  '{ΚΩΔ} ({ΗΜΕΡΕΣ} ΗΜ.)',
  'ΝΑΙ',
  '{ΚΩΔ} X{ΜΕΝΟΥΝ}',
]; // at the end: the old positions stay the same
/**
 * One status written in the format `fmt` (the {TAGS} of `ST_TAGS`); without a format: ΕΑ, ΚΑ, ΠΕΡΙΟΡΙΣΜΟΣ, as before.
 */
export function stText(
  st: Pick<Status, 'type' | 'kind' | 'from' | 'to' | 'open' | 'dest'>,
  fmt: string | undefined,
  lists?: AppState['settings']['lists'],
  d?: ISODate,
): string {
  const lbl = statusLbl(st, lists);
  if (!fmt || fmt === '{ΚΩΔ}') return lbl;
  const t = TYPES[st.type];
  const cat = t?.cat || '';
  const tag = (name: string): string | null => {
    switch (normGreek(name).replace(/\s+/g, '')) {
      case 'ΚΩΔ':
      case 'ΚΩΔΙΚΟΣ':
        return lbl;
      case 'ΣΥΝΤΟΜΑ':
        return cat === 'abs' || cat === 'pun' ? CAT_WORD[cat]! : st.type === 'OUT' ? 'ΕΞΟΔΟΣ' : lbl;
      case 'ΟΝΟΜΑ':
        return st.type === 'PUN'
          ? lbl
          : st.type === 'LEAVE' && st.kind
            ? leavePhrase(st)
            : lbl !== t?.label
              ? lbl
              : t?.long || lbl;
      case 'ΚΑΤΗΓΟΡΙΑ':
        return CAT_WORD[cat] || lbl;
      case 'ΚΑΤΕΥΘΥΝΣΗ':
        return st.dest?.trim() || ''; // the leave's destination (empty when it has none)
      case 'ΑΠΟ':
        return dm(st.from);
      case 'ΕΩΣ':
        return st.open ? '…' : dm(st.to);
      case 'ΗΜΕΡΕΣ':
        return st.open ? '…' : String(daysBetween(st.from, st.to));
      case 'ΜΕΝΟΥΝ':
      case 'ΜΕΝΟΥΝΗΜΕΡΕΣ':
        return st.open ? '…' : String(Math.max(0, daysBetween(d && d > st.from ? d : st.from, st.to))); // from d on
    }
    return null;
  };
  return fmt.replace(/\{([^{}]{1,20})\}/g, (m, n: string) => tag(n) ?? m).trim();
}
/** The statuses of a soldier on day `d` (categories `cats`, null: all), each once, separated by commas. */
export function stCol(s: AppState, pid: number, d: ISODate, cats: StCat[] | null, fmt?: string, only?: 'new'): string {
  const on = statusesOn(live(s), pid, d).filter(
    (x) => (!cats || cats.includes(TYPES[x.type]?.cat as StCat)) && (only !== 'new' || x.from === d),
  );
  return [...new Set(on.map((x) => stText(x, fmt, s.settings.lists, d)).filter(Boolean))].join(', ');
}
/**
 * The columns of a table when the filter says «only those declared on the day» (`pick.stNew`): the status columns and
 * the combinations get `st: 'new'`.
 */
export const stNewCols = <T extends { f: string; o?: ColOpts }>(cols: T[], pk?: Pick<RepPick, 'stNew'>): T[] =>
  pk?.stNew
    ? cols.map((c) =>
        c.f === 'combo' || (c.f !== 'stype' && isStatusField(c.f)) ? { ...c, o: { ...c.o, st: 'new' as const } } : c,
      )
    : cols;
