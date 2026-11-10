// The personnel in the roster «Δυναμολόγιο»: how a person is written, and the plan of writing back.
//
// Purpose: `PEOPLE_SYNC` (the synced fields), `personVals` / `snapPeople` (a person as the roster holds it),
//   `outVal`, and the types `PersonSnap`, `PeoplePlan`, `FullPlan`, `Extra`, `Span`.
// Does NOT: plan the write (personnelBack.ts, newRoster.ts) or read the roster (roster.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/people,
//   core/excel-in/writeCells, core/excel-in/rowInsert.
// Why: the roster is the sergeant's list: only what changed in the app since the last read or write (`snap`) goes
//   back, on the row of the same person. One definition of «how a person looks in the roster» serves the write, the
//   new roster and the sync.
// Covering tests: test/roster-sync.test.ts, test/personal-excel.test.ts, test/new-soldier.test.ts,
//   test/origin.test.ts.
import type { Person } from '../model/person';
import { stripDn } from './rosterColumns';
import { rankTxt } from '../people/ranks';
import { PKEYS } from '../people/personal';
import type { SourceBinding } from '../model/bindings';
import type { RowInsert } from './rowInsert';
import { type WVal, num, type SourcePlan, rankCell } from './writeCells';

/**
 * The fields of a person that are synced between the app and the roster «Δυναμολόγιο», in the order they are compared.
 */
export const PEOPLE_SYNC = [
  'rank',
  'origin',
  'spec',
  'last',
  'first',
  'father',
  'asm',
  'phone',
  'room',
  'si',
  'remarks',
  'dn',
  ...PKEYS,
];
/** A person as the roster holds it: field key → text (see `personVals`). */
export type PersonSnap = Record<string, string>;
/** Without a ΔΝ column, the ΔΝ right is written as the word ΔΝ in the remarks (as the import reads it). */
export const remarksOf = (role: string, dn: boolean, inRemarks: boolean) =>
  [stripDn(role), inRemarks && dn ? 'ΔΝ' : ''].filter(Boolean).join(' ');
/**
 * The values of a person as the roster holds them (`PEOPLE_SYNC` and the extra fields). `rank` has the origin in
 * front, as written where the table has no «Προέλευση» column (in its own column only the rank: `outVal`). `b`: the
 * binding, to know whether ΔΝ has a column of its own.
 */
export const personVals = (p: Person, b?: SourceBinding): PersonSnap => ({
  rank: rankTxt(p),
  origin: p.origin || '',
  spec: p.spec || '',
  last: p.last || '',
  first: p.first || '',
  father: p.father || '',
  asm: p.asm || '',
  phone: p.phone || '',
  room: p.room == null ? '' : String(p.room),
  si: p.si || '',
  remarks: remarksOf(p.role || '', !!p.dn, !!b && b.cols.dn == null),
  dn: p.dn ? 'ΝΑΙ' : '',
  iban: p.iban || '',
  amka: p.amka || '',
  afm: p.afm || '',
  email: p.email || '',
  relEmail: p.relEmail || '',
  blood: p.blood || '', // base for the ΘΑΛΑΜΟΙ sheet (roomExtra.ts)
});
/** The `personVals` of all the people by id: the `snap` stored after a read or a write. */
export const snapPeople = (people: Person[]): Record<number, PersonSnap> =>
  Object.fromEntries(people.map((p) => [p.id, personVals(p)]));
/**
 * The plan of writing the personnel back to the roster. `sets`: cells; `snap`: the values as they will be after the
 * write; `notFound`: people changed in the app whose row was not found.
 * `grow`: the new ones went in right below the last one (row `last`, from 1) up to row `to`; the ranges of the
 * formulas that stop at the last one (e.g. COUNTIF(I4:I158, "1") in the room totals) grow up to there, as Excel would
 * do.
 * `inserts`: new rows (steps of `placeRows`); the values (`sets`) are at the positions after them. `deletes`: rows
 * deleted after the values (from bottom to top). `fresh` / `gone`: those who came in and those who left (for the
 * ΘΑΛΑΜΟΙ sheet).
 */
export interface PeoplePlan {
  sets: { r: number; c: number; v: WVal }[];
  changed: number;
  notFound: string[];
  snap: Record<number, PersonSnap>;
  inserts: RowInsert[];
  deletes: number[];
  added: number;
  cleared: number;
  keys: string[];
  grow: { from: number; last: number; to: number } | null;
  fresh: number[];
  gone: PersonSnap[];
  warn?: string[];
}
const snapVal = (k: string, v: string): WVal =>
  v === '' ? null : k === 'room' ? Number(v) : k === 'asm' || k === 'phone' ? num(v) : v;
/** The value that is written in the cell: the rank without the origin when the table has a column of its own for it. */
export const outVal = (k: string, cur: PersonSnap, p: Person, b: SourceBinding): WVal =>
  k === 'rank' ? rankCell(p, b) : snapVal(k, cur[k]);
/**
 * A cell written below the table of a new roster: `v` a text or `f` a formula; `head`: styled as a heading. Rows and
 * columns count from 0.
 */
export interface Extra {
  r: number;
  c: number;
  v?: string;
  f?: string;
  head?: boolean;
}
/** A range of merged cells in one row: from column `c1` to `c2` of row `r`. */
export interface Span {
  r: number;
  c1: number;
  c2: number;
}
/**
 * The plan of writing for any kind: the `SourcePlan` plus what the personnel and the new roster add (`snap` / `psnap`
 * values of the people, `inserts`, `deletes`, `grow`, `fresh`, `gone`, `extra`, `merges`).
 */
export interface FullPlan extends SourcePlan {
  snap?: Record<number, PersonSnap>;
  psnap: Record<number, PersonSnap>;
  grow?: PeoplePlan['grow'];
  inserts?: RowInsert[];
  deletes?: number[];
  fresh?: number[];
  gone?: PersonSnap[]; // only the personnel (planPeopleWrite)
  extra?: Extra[];
  merges?: Span[]; // new roster: the room totals below the table
  base?: Record<string, string>;
} // cadres: the values of the app as they will be after the write (to tell who changed what)
