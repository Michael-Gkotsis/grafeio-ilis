// Statuses read from the Ίλη's Excel: punishments, medical, hospital, ΣΤΕΠ, leave, ΔΝ.
//
// Purpose: `parseStatuses` (rows → `Cand`s), `typeOfValue` (the text of the kind column → the status type) and
//   `DEFAULT_TYPE`.
// Does NOT: compare with the statuses of the app (statusDiff.ts) or write to the Excel (writePlan.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/lib, core/model, core/people,
//   core/statuses, core/excel-in/tableRows, core/excel-in/peopleMatch.
// Why: the sergeant keeps the statuses in his own tables; the app reads them with the same rules in the preview, in
//   the import and in the sync, and never guesses: what it cannot read is listed with the reason.
// Covering tests: test/sources.test.ts, test/own-kind.test.ts, test/multi-med.test.ts, test/leave-hours.test.ts.
import type { ISODate } from '../lib/dates';
import { norm, normGreek } from '../lib/text';
import type { Person } from '../model/person';
import { PUN_KINDS, TYPES, type TypeKey } from '../model/status';
import type { RawSheet } from './roster';
import { listOf } from '../people/ranks';
import { medTypeOf } from '../people/kinds';
import type { UserLists } from '../model/lists';
import { cellTime } from '../statuses/hours';
import type { SourceBinding } from '../model/bindings';
import { parseDate, cellText } from './cellText';
import { type StatusKind, TIME_KINDS } from './fields';
import { makeMatcher, rowName } from './peopleMatch';
import { tableRows } from './tableRows';

/**
 * A row of a status table read from the Excel. `r`: row; `who`: the name as written; `pid`: the person found (null =
 * not matched, `cands` are the suggestions); `type`: the status type (null = unknown value, `raw` is its text);
 * `from`/`to`: dates (`noEnd`: the «έως» is empty); the rest are the optional columns of the kind.
 */
export interface Cand {
  r: number;
  who: string;
  pid: number | null;
  cands: Person[];
  type: TypeKey | null;
  raw: string;
  from: ISODate;
  to: ISODate;
  kind?: string;
  note?: string;
  by?: string;
  reason?: string;
  noEnd?: boolean;
  fromTime?: string;
  toTime?: string;
  dest?: string;
}
/**
 * The result of `parseStatuses`: the candidates, the rows skipped (with the reason in Greek) and the unknown values of
 * the kind column.
 */
export interface ParseOut {
  cands: Cand[];
  skipped: { r: number; who: string; why: string }[];
  unknown: string[];
}
/** The key of a value: capitals without accents, only letters and digits (to compare the text of the kind column). */
export const vk = (s: string) => normGreek(s).replace(/[^Α-ΩA-Z0-9]/g, '');
/**
 * A value in the «kind» column → the kind of status. Null = unknown (the user chooses; until then the default of the
 * kind is used).
 * `lists`: the user's own medical kinds (Ρυθμίσεις › Λίστες) are recognized first, before the rules and what the user
 * had chosen (`values`).
 */
export function typeOfValue(
  kind: StatusKind,
  raw: string,
  values?: Record<string, TypeKey>,
  lists?: UserLists,
): TypeKey | null {
  const v = vk(raw);
  if (kind === 'medical') {
    const own = medTypeOf(raw, lists);
    if (own) return own;
  }
  // ΕΑΡΒ / «ΕΛ ΑΡΒ»: a kind of its own (before it existed it was read as ΕΑ, or as the user had chosen)
  if (kind === 'medical' && /^(ΕΑΡΒ|ΕΛΑΡΒ)|ΑΡΒΥΛ/.test(v)) return 'EARV';
  if (values && v && values[v]) return values[v];
  switch (kind) {
    case 'punish':
      return 'PUN';
    case 'step':
      return 'STEP';
    case 'dn':
      return 'DN';
    case 'leave':
      return /ΤΙΜΗΤ/.test(v) ? 'HON' : 'LEAVE';
    case 'hospital':
      return /^ΑΝ|ΑΝΑΡ/.test(v) ? 'SICK' : 'NOS';
    case 'medical':
      if (/^ΕΥ/.test(v) || /ΕΛΕΥΘΕΡΟΣΥΠΗΡ/.test(v)) return 'EY';
      if (/^ΕΟ/.test(v) || /ΟΡΘΟΣΤ/.test(v)) return 'EO';
      if (/^ΕΑ/.test(v) || /ΑΣΚΗΣ/.test(v)) return 'EA';
      return null;
  }
}
/** `vk` under the name the screens use. */
export const valueKey = vk;
/** The status type a row gets when its kind value is empty or not recognized. */
export const DEFAULT_TYPE: Record<StatusKind, TypeKey> = {
  punish: 'PUN',
  medical: 'EA',
  hospital: 'NOS',
  step: 'STEP',
  leave: 'LEAVE',
  dn: 'DN',
};
// also the user's own kinds (Λίστες): the Excel has them in capitals, the app keeps the name as the user wrote it
const punKind = (raw: string, lists?: UserLists) => {
  const v = vk(raw);
  return (
    PUN_KINDS.find((k) => vk(k) === v || v.startsWith(vk(k).slice(0, 5))) ||
    listOf(lists, 'punKinds').find((k) => vk(k) === v) ||
    (raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : '')
  );
};

/**
 * Reads the rows of a status table into candidates: the dates (an empty «έως» means no end, but without a «έως» column
 * the record is one day), the type from the kind column, the person (`makeMatcher`) and, when the kind has them, kind,
 * note, who imposed, reason, times and direction. Rows without a readable start date are skipped with the reason.
 */
export function parseStatuses(
  kind: StatusKind,
  sheet: RawSheet,
  b: SourceBinding,
  people: Person[],
  today: ISODate,
  lists?: UserLists,
): ParseOut {
  const scan = tableRows(sheet, b.header, b.cols);
  const match = makeMatcher(people);
  const out: ParseOut = { cands: [], skipped: [], unknown: [] };
  const unk = new Map<string, string>();
  for (const { r, v } of scan.records) {
    const who = rowName(v);
    const from = parseDate(v.from);
    let to = parseDate(v.to);
    if (!from) {
      out.skipped.push({
        r,
        who,
        why: cellText(v.from) ? 'η ημερομηνία «' + cellText(v.from) + '» δεν διαβάζεται' : 'χωρίς ημερομηνία έναρξης',
      });
      continue;
    }
    let noEnd = false;
    // an empty «έως» = no end; without an «έως» column the record is one day
    if (!to && b.cols.to == null) to = from;
    else if (!to) {
      to = from > today ? from : today;
      noEnd = true;
    }
    if (to < from) {
      out.skipped.push({ r, who, why: 'το «έως» είναι πριν από το «από»' });
      continue;
    }
    const raw = cellText(kind === 'hospital' ? v.where : v.kind);
    const type = typeOfValue(kind, raw, b.values, lists);
    if (!type && raw && !unk.has(vk(raw))) unk.set(vk(raw), raw);
    const m = match(v);
    const c: Cand = { r, who, pid: m.pid, cands: m.cands, type, raw, from, to, noEnd };
    if (kind === 'punish') {
      if (raw) c.kind = punKind(raw, lists);
      if (cellText(v.by)) c.by = cellText(v.by);
      if (cellText(v.reason)) c.reason = cellText(v.reason);
    } else if (kind === 'medical' || kind === 'leave') {
      if (raw && !(kind === 'medical' && TYPES[type || 'EA'].label === norm(raw))) c.kind = raw;
    } else if (kind === 'hospital' && raw) c.kind = raw;
    if (cellText(v.note)) c.note = cellText(v.note);
    if (kind === 'leave' && cellText(v.dest)) c.dest = cellText(v.dest);
    if (TIME_KINDS.includes(kind)) {
      const f = cellTime(v.tout),
        t = cellTime(v.tin);
      if (f) c.fromTime = f;
      if (t && !noEnd) c.toTime = t;
    }
    out.cands.push(c);
  }
  out.unknown = [...unk.values()];
  return out;
}
