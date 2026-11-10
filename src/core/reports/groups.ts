// Splitting a report into sheets and telling the user what «Βγάλε» will do.
//
// Purpose: `groupsOf` / `groupOf` (rows into groups by room, platoon or Σ.Ι.), `repFileName` and `outPlan` (the
//   plain-words text).
// Does NOT: write any sheet (src/main/reports.ts does).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/reports/kinds,
//   core/reports/rowTypes.
// Why: the guide shows what will happen before «Βγάλε», and the file name and the sheets it names must be the ones
//   the writer makes.
// Covering tests: test/reports-flow.test.ts, test/report-blank.test.ts, test/reports-sheets.test.ts.
import type { ISODate } from '../lib/dates';
import { collator, upper } from '../lib/text';
import { unitOf } from '../model/settingsAccess';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import type { Report, RepKind, RepSplit } from '../model/reportTypes';
import { splitOk } from './kinds';
import type { Row } from './rowTypes';

/** Splitting into sheets: groups in the order of room / platoon / Σ.Ι., and inside each one the order of the list. */
export interface RepGroup {
  key: string;
  label: string;
  short: string;
  rows: Row[];
}
/** The group of a row (the soldier's room, platoon or Σ.Ι.). */
export function groupOf(s: Pick<AppState, 'settings'>, x: Row, split: RepSplit): Omit<RepGroup, 'rows'> {
  const p = x as Person;
  let key: string, label: string, short: string;
  if (split === 'room') {
    key = p.room == null ? '~' : String(p.room).padStart(3, '0');
    label = p.room == null ? 'ΧΩΡΙΣ ΘΑΛΑΜΟ' : 'ΘΑΛΑΜΟΣ ' + p.room;
    short = p.room == null ? 'ΧΩΡΙΣ ΘΑΛ' : 'Θ' + p.room;
  } else if (split === 'unit') {
    const u = unitOf(p, s.settings);
    key = u === '—' ? '~' : u;
    label = u === '—' ? 'ΧΩΡΙΣ ΟΥΛΑΜΟ' : 'ΟΥΛΑΜΟΣ ' + u;
    short = u === '—' ? 'ΧΩΡΙΣ ΟΥΛ' : u;
  } else {
    const si = (p.si || '').trim();
    key = si || '~';
    label = si || 'ΧΩΡΙΣ Σ.Ι.';
    short = si || 'ΧΩΡΙΣ ΣΙ';
  }
  return { key, label: label.toUpperCase(), short: short.toUpperCase() };
}
/** Orders groups by key; the «χωρίς» group (key '~') comes last. */
export const byGroup = (a: { key: string }, b: { key: string }) =>
  Number(a.key === '~') - Number(b.key === '~') || collator.compare(a.key, b.key); // «χωρίς» (none) at the end
/**
 * Splits the rows into groups, one sheet each, by room, platoon or Σ.Ι.; one group without a label when there is no
 * split or the kind cannot split.
 */
export function groupsOf(
  s: Pick<AppState, 'settings'>,
  kind: RepKind,
  rows: Row[],
  split: RepSplit | undefined,
): RepGroup[] {
  if (!split || split === 'none' || !splitOk(kind)) return [{ key: '', label: '', short: '', rows }];
  const by = new Map<string, RepGroup>();
  for (const x of rows) {
    const k = groupOf(s, x, split);
    const g = by.get(k.key);
    if (g) g.rows.push(x);
    else by.set(k.key, { ...k, rows: [x] });
  }
  return [...by.values()].sort(byGroup);
}
/**
 * The Excel file name of a form on day `d`: the name in capitals, forbidden characters replaced, the date as
 * dd-mm-yyyy.
 */
export const repFileName = (r: Pick<Report, 'name'>, d: ISODate) =>
  upper(r.name || 'ΕΝΤΥΠΟ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim() +
  ' ' +
  d.split('-').reverse().join('-') +
  '.xlsx';
const baseName = (f?: string) => (f || '').split(/[\\/]/).pop() || '';
/** The word for a split in the singular and the plural, for the text of the plan. */
export const SPLIT_NOUN: Record<RepSplit, [string, string]> = {
  none: ['', ''],
  room: ['θάλαμο', 'θαλάμους'],
  unit: ['ουλαμό', 'ουλαμούς'],
  si: ['Σ.Ι.', 'Σ.Ι.'],
};
/**
 * What will happen when «Βγάλε» is pressed, in plain words (guide, «Βγάλε…»): how many sheets or pages, which, and
 * where. Returns the `groups` and the `text`.
 */
export function outPlan(
  s: Pick<AppState, 'settings'>,
  r: Report,
  rows: Row[],
  d: ISODate,
): { groups: RepGroup[]; text: string } {
  const split = splitOk(r.kind) && !!r.split && r.split !== 'none';
  const groups = split ? groupsOf(s, r.kind, rows, r.split) : [];
  const gl = (f: (g: RepGroup) => string) =>
    groups
      .slice(0, 6)
      .map((g) => f(g) + ' (' + g.rows.length + ')')
      .join(', ') + (groups.length > 6 ? ' κ.ά.' : '');
  const one = SPLIT_NOUN[r.split || 'none'][0];
  const file = repFileName(r, d);
  const parts = (page: boolean) =>
    (groups.length === 1 ? (page ? '1 σελίδα' : '1 φύλλο') : groups.length + (page ? ' σελίδες' : ' φύλλα')) +
    (page ? ', μία' : ', ένα') +
    ' για κάθε ' +
    one +
    (groups.length ? ': ' + gl((g) => g.short) : '');
  let text: string;
  if (r.out === 'print')
    text =
      'Ανοίγει η προεπισκόπηση εκτύπωσης' +
      (split ? ' με ' + parts(true) : '') +
      '. Το αρχείο «' +
      file +
      '» μένει και στον φάκελο των Excel.';
  else if (r.out === 'sheet') {
    const t = r.target || { to: 'people', sheet: '' };
    const where = t.to === 'file' ? baseName(t.file) : baseName(s.settings.sources?.people?.file) || 'Δυναμολόγιο';
    const base = upper(t.sheet || r.name || 'ΕΝΤΥΠΟ').trim();
    text =
      (split
        ? 'Γράφονται ' + parts(false) + ', μέσα στο ' + where
        : 'Γράφεται το φύλλο «' + base.slice(0, 31) + '» μέσα στο ' + where) +
      '. Τα άλλα φύλλα του αρχείου δεν αλλάζουν.';
  } else
    text =
      'Φτιάχνεται το αρχείο «' +
      file +
      '» στον φάκελο των Excel' +
      (split ? ', με ' + parts(false) : '') +
      ', και ανοίγει.';
  return { groups, text };
}
