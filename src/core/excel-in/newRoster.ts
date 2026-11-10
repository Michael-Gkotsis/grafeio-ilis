// A new roster «ΔΥΝΑΜΟΛΟΓΙΟ» (and the ΘΑΛΑΜΟΙ sheet) made from the people of the app.
//
// Purpose: `planPeopleNew` (all active people per room with the room totals as COUNTIF formulas), `roomSheetNew`
//   (one table per room), `rosterTitle`, `roomList`, `ROOM_HEAD` and `byRoom`.
// Does NOT: update an existing roster (personnelBack.ts) or write the file (src/main/sources.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/people, core/esso,
//   core/excel-in/peopleSnap, core/excel-in/writePlan.
// Why: the app can start the sergeant's file from nothing («Νέο αρχείο…») in the same shape as his own roster, so
//   that the later read and write find the columns and totals where they expect them.
// Covering tests: test/new-files.test.ts, test/room-extras-totals.test.ts, test/personal-excel.test.ts.
import { normGreek } from '../lib/text';
import type { Person } from '../model/person';
import { roomCfg } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import { rankTxt } from '../people/ranks';
import { essoName } from '../esso/esso';
import type { SourceBinding } from '../model/bindings';
import { colLetter } from './cellText';
import { byNameCmp } from './peopleSlot';
import { type FullPlan, type PersonSnap, type Extra, type Span, personVals, PEOPLE_SYNC, outVal } from './peopleSnap';
import { type WVal, num } from './writeCells';
import { newHeader } from './writePlan';

/** The title of a new roster: «ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ» with the name of the unit and of the ΕΣΣΟ, single spaces. */
export const rosterTitle = (s: AppState) =>
  ('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ ' + (s.settings.unitName || '') + (s.settings.essos ? ' ' + essoName(s.settings.essos) : ''))
    .replace(/\s+/g, ' ')
    .trim();
// per room, the room leader first (as in yours), then alphabetically
const isLead = (p: Person) => (/ΘΑΛΑΜΑΡΧ/.test(normGreek(p.role || '')) ? 0 : 1);
/** Orders people by room (people without a room last), the room leader first, then alphabetically. */
export const byRoom = (a: Person, c: Person) =>
  (a.room ?? 999) - (c.room ?? 999) || isLead(a) - isLead(c) || byNameCmp(a, c);
const ordinal = (n: number) => n + 'ος';
/**
 * A new roster (ΣΥΝΟΛΙΚΟ) as in the Ίλη's ΔΥΝΑΜΟΛΟΓΙΟ: all the active people, per room (those without a room at the
 * end) and alphabetically, with Α/Α 1, 2, 3…; below, after one empty row, the room totals with COUNTIF on the room
 * column (as in yours: the label in the surname, the number in the father's name). A new soldier later goes in above
 * the totals and the formulas grow (`grow`).
 */
export function planPeopleNew(b: SourceBinding, s: AppState): Omit<FullPlan, 'psnap'> {
  const people = s.people.filter((p) => p.active).sort(byRoom);
  const plan = {
    sets: [] as { r: number; c: number; v: WVal }[],
    insert: null,
    header: newHeader('people', [], b, rosterTitle(s)),
    keys: [] as string[],
    added: 0,
    changed: 0,
    cleared: 0,
    foreign: 0,
    notFound: [] as string[],
    snap: {} as Record<number, PersonSnap>,
    inserts: [],
    deletes: [],
    fresh: [],
    gone: [],
    extra: [] as Extra[],
    merges: [] as Span[],
  };
  people.forEach((p, i) => {
    const r = b.header + 1 + i;
    const cur = personVals(p, b);
    if (b.cols.aa != null) plan.sets.push({ r, c: b.cols.aa, v: i + 1 });
    for (const f of PEOPLE_SYNC)
      if (b.cols[f] != null && cur[f] !== '') plan.sets.push({ r, c: b.cols[f], v: outVal(f, cur, p, b) });
    plan.snap[p.id] = cur;
    if (p.added) plan.keys.push(String(p.id));
  });
  const { last, first, father, room } = b.cols;
  const rooms = roomList(s, people);
  if (people.length && rooms.length && last != null && father != null && room != null) {
    const L = (c: number) => colLetter(c),
      r1 = b.header + 2,
      r2 = b.header + 1 + people.length; // from 1
    let r = r2 + 1; // one empty row (from 0: r2 is the empty one)
    const label = (rr: number, v: string, head = false) => {
      plan.extra.push({ r: rr, c: last, v, head });
      if (first != null && first === last + 1) plan.merges.push({ r: rr, c1: last, c2: first });
    };
    label(r, 'ΘΑΛΑΜΟΙ', true);
    plan.extra.push({ r, c: father, v: 'ΣΤΡΑΤΙΩΤΕΣ', head: true });
    const from = r + 2; // first row of the totals, from 1
    for (const n of rooms) {
      r++;
      label(r, ordinal(n));
      plan.extra.push({ r, c: father, f: `COUNTIF(${L(room)}${r1}:${L(room)}${r2},"${n}")` });
    }
    r++;
    label(r, 'ΣΥΝΟΛΟ', true);
    plan.extra.push({ r, c: father, f: `SUM(${L(father)}${from}:${L(father)}${r})`, head: true });
  }
  plan.added = 0;
  return plan;
}
/**
 * The rooms of a new roster: those set in Settings › Rooms and platoons (the empty ones too, for whoever comes later)
 * and any other that has someone.
 */
export const roomList = (s: Pick<AppState, 'settings'>, people: Person[]) =>
  [
    ...new Set([
      ...Array.from({ length: roomCfg(s.settings).n }, (_, i) => i + 1),
      ...people.map((p) => p.room).filter((x): x is number => x != null),
    ]),
  ].sort((x, y) => x - y);
/** The headers of a room table of the ΘΑΛΑΜΟΙ sheet. */
export const ROOM_HEAD = [
  'Α/Α',
  'Βαθμός',
  'Ο/Σ',
  'Επώνυμο',
  'Όνομα',
  'Πατρώνυμο',
  'ΑΣΜ',
  'Κινητό Τηλέφωνο',
  'E-mail',
  'E-mail συγγενικού προσώπου',
  'Νούμερο παραλλαγής',
  'Ομάδα αίματος',
];
/**
 * A new ΘΑΛΑΜΟΙ sheet: one table per room («ΔΥΝΑΜΟΛΟΓΙΟ 1ου ΘΑΛΑΜΟΥ», headers, people) with an empty row between, as
 * `roomBlocks` reads it. The e-mail, the relative's e-mail and the blood group are written from the card; the variant
 * number stays empty for the sergeant.
 */
export function roomSheetNew(
  people: Person[],
  rooms0?: number[],
): { cells: { r: number; c: number; v: WVal; st: 'title' | 'head' | 'data' }[]; merges: Span[] } {
  const out = { cells: [] as { r: number; c: number; v: WVal; st: 'title' | 'head' | 'data' }[], merges: [] as Span[] };
  const act = people.filter((p) => p.active && p.room != null).sort(byRoom);
  const rooms = [...new Set([...(rooms0 || []), ...act.map((p) => p.room!)])].sort((x, y) => x - y);
  let r = 0;
  for (const n of rooms) {
    out.cells.push({ r, c: 0, v: 'ΔΥΝΑΜΟΛΟΓΙΟ ' + n + 'ου ΘΑΛΑΜΟΥ', st: 'title' });
    out.merges.push({ r, c1: 0, c2: ROOM_HEAD.length - 1 });
    r++;
    ROOM_HEAD.forEach((h, c) => out.cells.push({ r, c, v: h, st: 'head' }));
    r++;
    act
      .filter((p) => p.room === n)
      .forEach((p, i) => {
        const v: WVal[] = [
          i + 1,
          rankTxt(p) || null,
          p.spec || null,
          p.last,
          p.first,
          p.father || null,
          p.asm ? num(p.asm) : null,
          p.phone ? num(p.phone) : null,
          p.email || null,
          p.relEmail || null,
          null,
          p.blood || null,
        ];
        for (let c = 0; c < ROOM_HEAD.length; c++) out.cells.push({ r, c, v: v[c] ?? null, st: 'data' });
        r++;
      });
    r++;
  }
  return out;
}
