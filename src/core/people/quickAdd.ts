// Quick add of soldiers: an Excel-like table, paste of many rows, check for duplicates before adding.
//
// Purpose: the rows of the table (`QaRow`, `emptyRow`, `carryOf`, `isFilled`), `toNewPerson` (a row as a new soldier),
//   `checkRows` (what is wrong on each row) and `parsePaste` (paste from Excel or Word).
// Does NOT: save anything: the screen sends the rows as the `addPeople` command (core/commands).
// Owner layer: core/people (pure: no fs, no Electron, no React); imports core/lib, core/model, core/excel-in and the
//   command types.
// Why: Michael, 19/10: in the Νέα ΕΣΣΟ the sergeant adds «τον ένα στρατιώτη μετά τον άλλον» without saving each time.
//   It lives in core/people, next to `personKey`, which it shares with the commands: the quick add depends on the
//   key, never the commands on the quick add.
// Covering tests: test/quick-add.test.ts.
import { HEADERS } from '../excel-in/roster';
import { norm } from '../lib/text';
import { personKey } from './personKey';
import type { NewPerson } from '../commands/types';
import type { Person } from '../model/person';

/** The columns of the quick-add table, in screen order. */
export const QA_COLS = ['rank', 'spec', 'last', 'first', 'father', 'asm', 'phone', 'room', 'si'] as const;
/** The key of a column of the quick-add table. */
export type QaKey = (typeof QA_COLS)[number];
/** One row of the quick-add table: every cell is text. */
export type QaRow = Record<QaKey, string>;
/** they come the same as the row above */
export const CARRY: QaKey[] = ['rank', 'spec', 'room'];

/** Σ.Ι. Ι1 on every new row (Michael, 19/10), not from the one above: most are Ι1 */
export const emptyRow = (carry: Partial<QaRow> = {}): QaRow => ({
  rank: '',
  spec: '',
  last: '',
  first: '',
  father: '',
  asm: '',
  phone: '',
  room: '',
  si: 'Ι1',
  ...carry,
});
/** The cells a new row takes from the row above (`CARRY`). */
export const carryOf = (r: QaRow): Partial<QaRow> => Object.fromEntries(CARRY.map((k) => [k, r[k]]));
/** row with a soldier: whatever does not come from above */
export const isFilled = (r: QaRow) =>
  !!(r.last.trim() || r.first.trim() || r.father.trim() || r.asm.trim() || r.phone.trim());

const clean = (v: string) => v.replace(/\s+/g, ' ').trim();
const asmOf = (v: string) => v.replace(/\s/g, '');
// «3», «Θ3», «3ος» → 3
const roomOf = (v: string) => {
  const m = /\d+/.exec(v);
  return m && +m[0] > 0 ? +m[0] : null;
};

/** A row as a new soldier for the `addPeople` command (`essos` is the ΕΣΣΟ the sergeant is adding to). */
export function toNewPerson(r: QaRow, essos: string): NewPerson {
  return {
    rank: clean(r.rank),
    spec: clean(r.spec),
    last: clean(r.last),
    first: clean(r.first),
    father: clean(r.father),
    asm: asmOf(r.asm),
    phone: asmOf(r.phone),
    room: roomOf(r.room),
    si: clean(r.si),
    post: null,
    role: null,
    essos: clean(essos),
    attached: false,
    notes: '',
  };
}

/**
 * What is wrong on each row (null = fine or empty): missing last/first name, same ΑΣΜ or full name and father name
 * as someone that exists or as a row above
 */
export function checkRows(people: Person[], rows: QaRow[]): (string | null)[] {
  const byAsm = new Map<string, Person>();
  const byKey = new Map<string, Person>();
  for (const p of people) {
    if (p.asm) byAsm.set(p.asm, p);
    byKey.set(personKey(p), p);
  }
  const gAsm = new Map<string, number>();
  const gKey = new Map<string, number>();
  return rows.map((r, i) => {
    if (!isFilled(r)) return null;
    const last = clean(r.last),
      first = clean(r.first);
    if (!last && !first) return 'Λείπουν επώνυμο και όνομα';
    if (!last) return 'Λείπει το επώνυμο';
    if (!first) return 'Λείπει το όνομα';
    const asm = asmOf(r.asm);
    const key = personKey({ last, first, father: clean(r.father) });
    const tw = (asm && byAsm.get(asm)) || byKey.get(key);
    const err = tw
      ? 'Υπάρχει ήδη' +
        (tw.asm && tw.asm === asm ? ' με ΑΣΜ ' + asm + ': ' : ': ') +
        tw.last +
        ' ' +
        tw.first +
        (tw.active ? '' : ' (εκτός δύναμης)')
      : asm && gAsm.has(asm)
        ? 'Ίδιο ΑΣΜ με τη γραμμή ' + (gAsm.get(asm)! + 1)
        : gKey.has(key)
          ? 'Ίδιος με τη γραμμή ' + (gKey.get(key)! + 1)
          : null;
    if (asm && !gAsm.has(asm)) gAsm.set(asm, i);
    if (!gKey.has(key)) gKey.set(key, i);
    return err;
  });
}

/**
 * Paste from Excel or Word (columns with Tab, rows with Enter). With a header row («Επώνυμο», «Όνομα»…) the columns
 * are found from their names, as in the roster import; otherwise they go in order from the cursor column. null:
 * plain text of one cell, which is pasted normally
 */
export function parsePaste(text: string, startCol: number): Partial<QaRow>[] | null {
  if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return null;
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.split('\t').map(clean));
  while (lines.length && lines[lines.length - 1].every((c) => !c)) lines.pop();
  if (!lines.length) return null;
  // headers in one of the first rows
  for (let h = 0; h < Math.min(lines.length, 5); h++) {
    const cols: Partial<Record<QaKey, number>> = {};
    lines[h].forEach((v, c) => {
      const f = HEADERS.find(([, re]) => re.test(norm(v)))?.[0] as QaKey | undefined;
      if (f && (QA_COLS as readonly string[]).includes(f) && cols[f] == null) cols[f] = c;
    });
    if (cols.last == null || cols.first == null) continue;
    return lines
      .slice(h + 1)
      .map((l) => Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, l[c as number] || ''])))
      .filter((r) => r.last || r.first);
  }
  // without headers: a first column Α/Α (1, 2, 3…) before the last name or the rank is not ours
  const aa =
    lines.every((l) => /^\d{1,3}\.?$/.test(l[0] || '')) &&
    QA_COLS[startCol] !== 'asm' &&
    QA_COLS[startCol] !== 'phone' &&
    QA_COLS[startCol] !== 'room';
  return lines
    .map((l) => {
      const cells = aa ? l.slice(1) : l;
      const r: Partial<QaRow> = {};
      cells.forEach((v, j) => {
        const k = QA_COLS[startCol + j];
        if (k) r[k] = v;
      });
      return r;
    })
    .filter((r) => Object.values(r).some(Boolean));
}
