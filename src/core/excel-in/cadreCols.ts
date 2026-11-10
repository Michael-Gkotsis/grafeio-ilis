// Cadres in their own Excel (Michael, 3/11): the columns and the values of a cadre.
//
// Purpose: `CADRE_KEYS` / `CADRE_OPT` (the columns), `cadreStr` / `cadreCell` / `vals` (a cadre as text and as a
//   cell), `cmpKey` (compare a cell with the app), `parseActive`, `hkKeyOf`, `Meta` / `CadrePlan`.
// Does NOT: match rows to cadres (cadreMatch.ts), write the sheets (cadreWrite.ts, cadreAbsWrite.ts) or read them
//   (cadreRead.ts, cadreAbsRead.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/cadre, core/model, core/people,
//   core/lib, core/excel-in/writeCells.
// Why: the cadres have their own Excel: their details (sheet ΣΤΕΛΕΧΗ) and their statuses (sheet ΚΑΤΑΣΤΑΣΕΙΣ) in one
//   file, apart from the roster of the soldiers. Reading and writing follow the same rules as the other Excel files:
//   the app writes in a cell only what it changed since the last read or write (`base`), and reads what the Excel
//   changed. All pure functions (the UI and main run them).
// Covering tests: test/cadre-excel.test.ts, test/stelexi.test.ts.
import { normGreek } from '../lib/text';
import type { AppState } from '../model/state';
import type { Cadre } from '../model/cadreRecord';
import { hkCadreRows } from '../people/hkRows';
import { rankTxt } from '../people/ranks';
import { hkRowLabel, hkRowNames } from '../model/unit';
import { PKEYS, normPersonal, type PKey } from '../people/personal';
import { type SourcePlan, type WVal, num } from './writeCells';

/**
 * The optional cadre columns: they come at the end of the table only when some cadre has a value (like the hours of
 * the leaves).
 */
export const CADRE_OPT = ['eid', 'monthMax', 'weapon', 'wtype', 'rack', 'wpos', 'iban', 'amka', 'afm'] as const;
/** Every cadre field the app reads and writes as a column: the fixed ones, then `CADRE_OPT`. */
export const CADRE_KEYS = [
  'rank',
  'origin',
  'spec',
  'last',
  'first',
  'am',
  'phone',
  'role',
  'hk',
  'active',
  ...CADRE_OPT,
] as const;
/**
 * What the app remembers of the last read or write: `keys` (the cadres or statuses that were in the sheet) and `base`
 * (the values of the app at that moment, as JSON per key).
 */
export type Meta = { keys?: string[]; base?: Record<string, string> };
/** A `SourcePlan` plus `base`: the values of the app as they will be after the write (to tell who changed what). */
export type CadrePlan = SourcePlan & { base: Record<string, string> };
/** The part of the state these helpers need: the settings. */
export type Cfg = Pick<AppState, 'settings'>;
/** The name of each cadre field in the messages to the user (Greek). */
export const LABEL: Record<string, string> = {
  rank: 'βαθμός',
  origin: 'προέλευση',
  spec: 'Ο/Σ',
  eid: 'ειδικότητα',
  last: 'επώνυμο',
  first: 'όνομα',
  am: 'ΑΜ',
  phone: 'τηλέφωνο',
  role: 'θέση',
  hk: 'γραμμή ΗΚΑΙ',
  active: 'σε δύναμη',
  monthMax: 'όριο υπηρεσιών',
  weapon: 'όπλο',
  wtype: 'τύπος όπλου',
  rack: 'οπλοβάστης',
  wpos: 'θέση όπλου',
  iban: 'IBAN',
  amka: 'ΑΜΚΑ',
  afm: 'ΑΦΜ',
};
/** Text without accents, case and spaces, for comparing. */
export const sq = (t: string) => normGreek(t).replace(/\s+/g, '');
const YES = /^(ΝΑΙ|ΕΝΕΡΓΟΣ|ΕΝΕΡΓΗ|1|TRUE|YES|Ν)$/,
  NO = /^(ΟΧΙ|ΕΚΤΟΣ|ΕΚΤΟΣΔΥΝΑΜΗΣ|0|FALSE|NO|Ο)$/;
/**
 * The «σε δύναμη» cell as a boolean: true for ΝΑΙ / ΕΝΕΡΓΟΣ / 1…, false for ΟΧΙ / ΕΚΤΟΣ / 0…, null for anything else.
 */
export const parseActive = (t: string): boolean | null => {
  const k = sq(t);
  return YES.test(k) ? true : NO.test(k) ? false : null;
};
/**
 * The ΗΚΑΙ line from the text of a cell: by the key, by the name in the type of the unit, or by the user's own name.
 */
export function hkKeyOf(t: string, s: Cfg): string | null {
  const k = sq(t);
  if (!k) return null;
  for (const key of hkCadreRows(s.settings.lists))
    if ([key, ...hkRowNames(key), hkRowLabel(key, s.settings)].some((n) => sq(n) === k)) return key;
  return null;
}
/** The value of a field of a cadre as text (as it would look in the Excel). */
export function cadreStr(c: Cadre, k: string, s: Cfg, hasOrigin = true): string {
  switch (k) {
    case 'rank':
      return (hasOrigin ? c.rank : rankTxt(c)) || '';
    case 'hk':
      return hkRowLabel(c.hk, s.settings);
    case 'active':
      return c.active ? 'ΝΑΙ' : 'ΟΧΙ';
    case 'monthMax':
      return c.monthMax ? String(c.monthMax) : '';
    default:
      return String((c as unknown as Record<string, unknown>)[k] ?? '');
  }
}
/**
 * For comparing a cell with the app: the same value even when it is written differently (capitals, accents, spaces,
 * ΝΑΙ/1, IBAN with spaces).
 */
export function cmpKey(k: string, t: string, s: Cfg): string {
  if (PKEYS.includes(k as PKey)) return normPersonal(k as PKey, t);
  if (k === 'active') {
    const a = parseActive(t);
    return a == null ? sq(t) : a ? 'ΝΑΙ' : 'ΟΧΙ';
  }
  if (k === 'hk') return hkKeyOf(t, s) ?? sq(t);
  if (k === 'monthMax') {
    const n = Math.floor(Number(t.replace(',', '.')));
    return n > 0 ? String(n) : '';
  }
  return sq(t);
}
/**
 * The value to write in the cell of field `k` of cadre `c`: null when empty, a number for ΑΜ, phone and the service
 * limit, otherwise text.
 */
export const cadreCell = (k: string, c: Cadre, s: Cfg, hasO: boolean): WVal => {
  const v = cadreStr(c, k, s, hasO);
  if (v === '') return null;
  if (k === 'am' || k === 'phone') return num(v);
  if (k === 'monthMax') return c.monthMax || null;
  return v;
};
/** All the fields of a cadre as text, by key (what is stored in `base`). */
export const vals = (c: Cadre, s: Cfg, hasO: boolean): Record<string, string> =>
  Object.fromEntries(CADRE_KEYS.map((k) => [k, cadreStr(c, k, s, hasO)]));
/** A stored `base` JSON as an object; null when empty or damaged. */
export const parse = (t?: string): Record<string, string> | null => {
  try {
    const o = t ? JSON.parse(t) : null;
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
};
/** A cadre's rank, surname and name, for the messages. */
export const nameOf = (c: { last: string; first: string; rank?: string; origin?: string }) =>
  [rankTxt(c), c.last, c.first].filter(Boolean).join(' ');
