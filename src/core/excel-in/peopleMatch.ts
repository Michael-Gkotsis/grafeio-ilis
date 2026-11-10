// Matching the rows of a table to the people of the app.
//
// Purpose: `makeMatcher` (ΑΣΜ, then surname and name, namesakes by father's name and room, near names as
//   suggestions), `Matcher`, `key2` and `rowName`.
// Does NOT: decide what to do with the match (the readers in statusesIn.ts, postsIn.ts… do) or write anything.
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/lib, core/model/person,
//   core/model/cells, core/excel-in/cellText.
// Why: the Excel has no id of the person: the app finds the person by ΑΣΜ, else by name. Wrong matches would put a
//   punishment or a leave on the wrong soldier, so uncertain ones are never guessed: they become suggestions the
//   user confirms.
// Covering tests: test/namesakes.test.ts, test/sources.test.ts, test/roster-sync.test.ts.
import { normGreek } from '../lib/text';
import type { Person } from '../model/person';
import type { CellValue } from './roster';
import { cellText } from './cellText';

/**
 * Matches a table row to a person of the app: `pid` is the person (null = not found or several active ones), `cands`
 * the suggestions for the user, `alts` the namesakes that all fit (same name and father's name, no ΑΣΜ) before the
 * active one was chosen, or when none is chosen (several active: pid null). For reading the active one is enough;
 * writing, however, must not write on the row of the other, nor write one of them again in a new row (X2).
 */
export interface Matcher {
  (v: Record<string, CellValue>): { pid: number | null; cands: Person[]; alts?: Person[] };
}
/** The key of a pair of names: capitals, only letters and digits, `a|b`. */
export const key2 = (a: string, b: string) =>
  normGreek(a).replace(/[^Α-ΩA-Z0-9]/g, '') + '|' + normGreek(b).replace(/[^Α-ΩA-Z0-9]/g, '');
function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  if (!m || !n) return m + n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/**
 * Builds the `Matcher` of `people`: ΑΣΜ first, then surname and name in either order. Namesakes are told apart by the
 * father's name and by the room; a double name «ΝΙΚΟΛΑΟΣ/ΛΟΥΚΑΣ» fits either; «Γ.» fits by initial; otherwise up to 4
 * near names (edit distance up to 34%) are offered to the user.
 */
export function makeMatcher(people: Person[]): Matcher {
  const byAsm = new Map<string, Person>(),
    byName = new Map<string, Person[]>();
  for (const p of people) {
    if (p.asm) byAsm.set(p.asm.replace(/\s/g, ''), p);
    for (const k of [key2(p.last, p.first), key2(p.first, p.last)]) {
      const l = byName.get(k) || [];
      l.push(p);
      byName.set(k, l);
    }
  }
  const flat = people.map((p) => ({ p, k: normGreek(p.last + p.first).replace(/[^Α-ΩA-Z]/g, '') }));
  return (v) => {
    const asm = cellText(v.asm).replace(/\s/g, '');
    if (asm && byAsm.has(asm)) return { pid: byAsm.get(asm)!.id, cands: [] };
    let last = cellText(v.last),
      first = cellText(v.first);
    if (!last && v.name != null) {
      const parts = cellText(v.name).split(' ');
      last = parts[0] || '';
      first = parts.slice(1).join(' ');
    }
    // «ΓΕΩΡΓΙΟΣ του ΙΩΑΝΝΗ»: this is how the app writes namesakes when there is no father's name column
    let father = v.father != null ? cellText(v.father) : null;
    const tou = /^(.*?)\s+ΤΟΥ\s+(.+)$/.exec(normGreek(first));
    if (tou) {
      first = tou[1];
      if (!father) father = tou[2];
    }
    if (last) {
      let l = byName.get(key2(last, first)) || [];
      // «ΝΙΚΟΛΑΟΣ/ΛΟΥΚΑΣ»: double name with «/», fits whichever of the two the app has
      if (!l.length && first.includes('/'))
        l = [...new Set(first.split('/').flatMap((f) => byName.get(key2(last, f)) || []))];
      if (l.length > 1 && father != null) {
        const f = normGreek(father);
        const x = l.filter((p) => normGreek(p.father) === f);
        if (x.length) l = x;
      }
      // namesakes in another room: the ΘΑΛΑΜΟΣ column of the sheet tells who it is (only if it points to one)
      const room = v.room != null ? parseInt(cellText(v.room), 10) : NaN;
      if (l.length > 1 && room > 0) {
        const x = l.filter((p) => p.room === room);
        if (x.length === 1) return { pid: x[0].id, cands: [] };
      }
      const all = l;
      if (l.length > 1) {
        const act = l.filter((p) => p.active);
        if (act.length) l = act;
      }
      if (l.length === 1) return all.length > 1 ? { pid: l[0].id, cands: [], alts: all } : { pid: l[0].id, cands: [] };
      if (l.length > 1) return { pid: null, cands: l.slice(0, 4), alts: all }; // several active: we do not know who
      // «ΠΑΠΑΔΟΠΟΥΛΟΣ Γ.»: surname and initial
      if (/^[Α-ΩA-Z]\.?$/.test(normGreek(first))) {
        const ini = normGreek(first).charAt(0);
        const m = people.filter((p) => normGreek(p.last) === normGreek(last) && normGreek(p.first).startsWith(ini));
        if (m.length === 1) return { pid: m[0].id, cands: [] };
      }
      const k = normGreek(last + first).replace(/[^Α-ΩA-Z]/g, '');
      const near = flat
        .map((x) => ({ p: x.p, d: lev(k, x.k) / Math.max(k.length, x.k.length, 1) }))
        .filter((x) => x.d <= 0.34)
        .sort((a, b) => a.d - b.d)
        .slice(0, 4)
        .map((x) => x.p);
      return { pid: null, cands: near };
    }
    return { pid: null, cands: [] };
  };
}
/**
 * The name of a row for the messages to the user: the full name, or origin, rank and name; «(χωρίς όνομα)» when the
 * row has none.
 */
export const rowName = (v: Record<string, CellValue>) =>
  cellText(v.name) ||
  [cellText(v.origin), cellText(v.rank), cellText(v.last), cellText(v.first)].filter(Boolean).join(' ') ||
  '(χωρίς όνομα)';
