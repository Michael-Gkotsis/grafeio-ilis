// The roster import: merge rows into people and describe the changes.
//
// Purpose: `importPeople` (the command), `mergeRow`, `newPerson`, `rosterChanges` (the changes the import would make,
//   for the confirmation screen), and `ROSTER_FIELDS`.
// Does NOT: read the Excel file; main does that.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Match with ΑΣΜ, else with name + father name; the people keep their other fields.
// Covering tests: test/roster-sync.test.ts.
import { OUT_NOTE, fullName, type Person } from '../model/person';
import type { AppState } from '../model/state';
import { PKEYS, XKEYS, type PKey } from '../people/personal';
import type { ImportRow, Result } from './types';
import { personKey } from '../people/personKey';

// The person after the import: only the fields the row brought change. Without «in strength» on the row (the file has
// no ΕΚΤΟΣ sheet), whoever is in the roster comes back into strength, unless a ΕΚΤΟΣ ΔΥΝΑΜΗΣ sheet (another file) took
// him out. Whoever comes back into strength loses the note «Εκτός δύναμης…» the app had written.
function mergeRow(ex: Person, r: ImportRow): Person {
  const auto = ex.notes.startsWith(OUT_NOTE);
  const active = r.active ?? (ex.active || !auto);
  const next: Person = { ...ex, ...r, id: ex.id, active };
  delete next.added;
  if (!next.origin) delete next.origin;
  // an empty IBAN/ΑΜΚΑ/ΑΦΜ cell (or e-mail, blood group) in the file = none.
  for (const k of [...PKEYS, ...XKEYS]) if (!next[k]) delete next[k];
  if (active && r.notes === undefined && auto) next.notes = '';
  return next;
}
const newPerson = (r: ImportRow, id: number): Person => {
  const p: Person = { post: null, attached: false, notes: '', ...r, id, active: r.active ?? true };
  if (!p.origin) delete p.origin;
  for (const k of [...PKEYS, ...XKEYS]) if (!p[k]) delete p[k];
  return p;
};
/**
 * Command `importPeople`: merges the roster rows into the people (match by ΑΣΜ, else by full name + father name).
 * Whoever is missing from the roster is deleted when he has no record or duty, otherwise he leaves the strength, but
 * only when `deactivateMissing` is set.
 */
export function importPeople(s: AppState, rows: ImportRow[], source: string, deactivateMissing: boolean): Result {
  const byAsm = new Map(s.people.filter((p) => p.asm).map((p) => [p.asm, p]));
  const byName = new Map(s.people.map((p) => [personKey(p), p]));
  let nextId = s.people.reduce((a, p) => Math.max(a, p.id), 0) + 1;
  const seen = new Set<number>();
  const updated = new Map<number, Person>();
  const added: Person[] = [];
  for (const r of rows) {
    const ex = (r.asm && byAsm.get(r.asm)) || byName.get(personKey(r));
    if (ex) {
      seen.add(ex.id);
      updated.set(ex.id, mergeRow(ex, r));
    } else added.push(newPerson(r, nextId++));
  }
  // Whoever is missing from the new roster: with no record or duty they are deleted (for example wrong rows of an old
  // import), otherwise they become «out of strength» so that their history stays.
  const used = new Set<number>(s.statuses.map((x) => x.pid));
  Object.values(s.guards).forEach((g) => Object.values(g).forEach((id) => used.add(id)));
  let deact = 0,
    removed = 0;
  const people = s.people
    .flatMap((p) => {
      const u = updated.get(p.id);
      if (u) return [u];
      if (deactivateMissing && !used.has(p.id)) {
        removed++;
        return [];
      }
      // added by the app and not in the roster: the sergeant deleted him, he is not written back there.
      if (deactivateMissing && p.active) {
        deact++;
        const q = { ...p, active: false };
        delete q.added;
        return [q];
      }
      return [p];
    })
    .concat(added);
  const caps = { ...s.caps };
  for (const k of Object.keys(caps)) if (!people.some((p) => p.id === +k)) delete caps[+k];
  const parts = [added.length + ' νέα', updated.size + ' ενημερώθηκαν'].concat(
    deact ? [deact + ' εκτός δύναμης'] : [],
    removed ? [removed + ' αφαιρέθηκαν'] : [],
  );
  return {
    state: { ...s, people, caps },
    text: 'Εισαγωγή από ' + source + ': ' + parts.join(', '),
    files: [source],
    source: 'import',
  };
}
// What changes for each person with a personnel import (for the preview: «ΠΑΠΑΔΟΠΟΥΛΟΣ Γ.: Σ.Ι Ι1 → Ι3»).
const ROSTER_FIELDS: [keyof ImportRow, string][] = [
  ['rank', 'βαθμός'],
  ['origin', 'προέλευση'],
  ['spec', 'Ο/Σ'],
  ['last', 'επώνυμο'],
  ['first', 'όνομα'],
  ['father', 'πατρώνυμο'],
  ['asm', 'ΑΣΜ'],
  ['phone', 'τηλέφωνο'],
  ['room', 'θάλαμος'],
  ['si', 'Σ.Ι'],
  ['post', 'πόστο'],
  ['role', 'ρόλος'],
  ['dn', 'ΔΝ'],
  ['active', 'σε δύναμη'],
  ['iban', 'IBAN'],
  ['amka', 'ΑΜΚΑ'],
  ['afm', 'ΑΦΜ'],
  ['email', 'e-mail'],
  ['relEmail', 'e-mail συγγενή'],
  ['blood', 'ομάδα αίματος'],
];
const rv = (v: unknown) => (v == null || v === '' ? '—' : v === true ? 'ναι' : v === false ? 'όχι' : String(v));
/**
 * What a personnel import would change for each person, for the preview (`ROSTER_FIELDS`; no IBAN/ΑΜΚΑ/ΑΦΜ numbers).
 */
export function rosterChanges(
  s: AppState,
  rows: ImportRow[],
): { changes: { who: string; what: string }[]; same: number } {
  const byAsm = new Map(s.people.filter((p) => p.asm).map((p) => [p.asm, p]));
  const byName = new Map(s.people.map((p) => [personKey(p), p]));
  const changes: { who: string; what: string }[] = [];
  let same = 0;
  for (const r of rows) {
    const ex = (r.asm && byAsm.get(r.asm)) || byName.get(personKey(r));
    if (!ex) continue;
    const next = mergeRow(ex, r) as unknown as Record<string, unknown>;
    const cur = ex as unknown as Record<string, unknown>;
    const what = ROSTER_FIELDS.filter(
      ([k]) =>
        (r[k] !== undefined || k === 'active') &&
        rv(cur[k] ?? (k === 'dn' ? false : null)) !== rv(next[k] ?? (k === 'dn' ? false : null)),
    ).map(([k, label]) =>
      PKEYS.includes(k as PKey)
        ? label + ' άλλαξε'
        : label + ' ' + rv(cur[k] ?? (k === 'dn' ? false : null)) + ' → ' + rv(next[k]),
    ); // IBAN/ΑΜΚΑ/ΑΦΜ: without the numbers in the preview.
    if (what.length) changes.push({ who: fullName(ex), what: what.join(', ') });
    else same++;
  }
  return { changes, same };
}
