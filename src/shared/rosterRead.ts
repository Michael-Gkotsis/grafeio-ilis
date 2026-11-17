// Reads the people of ANY roster-like sheet (Δυναμολόγιο, Παρουσιολόγιο, list of cadre...) through the shape detector (shape.ts): the header
// columns come from the lexicon, never from fixed places, and the rows are read down to the real end of the list:
//   - rows without a name and blank separator rows inside the list are skipped (reading stops only after a long run of empty rows
//     or at a totals/footer label that no person follows)
//   - one cell «ΟΝΟΜΑΤΕΠΩΝΥΜΟ», or «ΕΠΩΝΥΜΟ - ΟΝΟΜΑ» in one cell, or separate ΕΠΩΝΥΜΟ / ΟΝΟΜΑ / ΠΑΤΡΩΝΥΜΟ; ΑΜ / ΑΣΜ column
//   - mixed cadre/soldier lists: decided by the rank through the lexicon; an unknown or ambiguous rank is ASKED, never guessed
//   - the header repeated on every printed page is skipped; title rows (ΙΛΗ 1, ΟΥΛΑΜΟΣ Α) are carried as the `group` of the people below
// The app's own import (roster.ts parseRoster) is untouched: this is the engine's reader.
import { Grid, valueText, type SheetModel } from './sheetModel';
import { buildLexicon, normText, phraseKey, type Lexicon } from './lexicon';
import { detectSheet, type ListRegion, type SheetShape } from './shape';
import { isPersonRow } from './roster';

export type PersonKind = 'cadre' | 'soldier' | 'ask';
export interface RosterPerson {
  r: number;                                  // row (0-based)
  name: string;                               // the name as written (one cell, or last + first + father)
  last?: string; first?: string; father?: string;   // only when the file separates them (or says the order in the header)
  rank: string;                               // the rank text as written
  rankConcept: string | null;
  origin?: string;
  kind: PersonKind;
  asm?: string; aa?: string; group?: string;
  fields: Record<string, string>;             // other person columns by concept id (phone, room, remarks, status...)
}
export interface RosterAsk { rank: string; rows: number[]; proposal?: PersonKind; why: string }
export interface RosterRead {
  sheet: string;
  found: boolean;                             // a people table was found
  header?: { rows: [number, number]; first: number };
  people: RosterPerson[];
  ask: RosterAsk[];                           // ranks that need the user's answer (opts.answers)
  skipped: { r: number; why: string }[];      // rows that were not people (no name, summary...)
  vacant: number;                             // rows with a number or a rank but no name (empty positions): not people, counted for the user
  stoppedAt?: { r: number; why: string };    // where reading ended; absent = end of the sheet
  cols: { concept: string; c: number; confidence: 'sure' | 'suggest' }[];
  needsConfirm: string[];                     // key columns that were only suggested
  groups: string[];
  warnings: string[];
}
export interface RosterOpts {
  lexicon?: Lexicon; shape?: SheetShape;
  cols?: Record<string, number>;              // the user's own column choice: concept -> column
  answers?: Record<string, 'cadre' | 'soldier'>;   // rank text (any spelling) -> the user's answer
  assume?: 'cadre' | 'soldier';               // for ranks that exist in both lists (ΛΧΙΑΣ, ΔΝΕΑΣ, ΔΕΑ) and for lists without a rank column
  emptyRun?: number;                          // empty rows that end the list (default 12)
}

const CADRE = new Set(['ΣΥΝΤΑΓΜΑΤΑΡΧΗΣ', 'ΑΝΤΙΣΥΝΤΑΓΜΑΤΑΡΧΗΣ', 'ΤΑΓΜΑΤΑΡΧΗΣ', 'ΛΟΧΑΓΟΣ', 'ΥΠΟΛΟΧΑΓΟΣ', 'ΑΝΘΥΠΟΛΟΧΑΓΟΣ', 'ΑΝΘΥΠΑΣΠΙΣΤΗΣ', 'ΑΡΧΙΛΟΧΙΑΣ', 'ΕΠΙΛΟΧΙΑΣ']);
const SOLDIER = new Set(['ΣΤΡΑΤΙΩΤΗΣ', 'ΥΠΟΔΕΚΑΝΕΑΣ']);
const BOTH = new Set(['ΛΟΧΙΑΣ', 'ΔΕΚΑΝΕΑΣ', 'ΔΕΑ']);            // exist in both lists of the app: the rank alone does not tell
const CADRE_ORIGIN = new Set(['ΕΠΟΠ', 'ΟΒΑ', 'ΕΜΘ', 'Μόνιμος']);
const FOOTER = /^(ΣΥΝΟΛΟ|ΣΥΝΟΛΑ|ΓΕΝΙΚΟ ΣΥΝΟΛΟ|ΑΘΡΟΙΣΜΑ|ΑΘΡΟΙΣΗ|ΤΕΛΟΣ)(\s|$)/;
const TITLE_WORD = /(^|\s)(ΙΛΗ|ΙΛΗΣ|ΟΥΛΑΜΟΣ|ΟΥΛΑΜΟΙ|ΛΟΧΟΣ|ΛΟΧΟΙ|ΤΜΗΜΑ|ΟΜΑΔΑ|ΠΕΛΟΤΟΝ|ΕΠΙΛΟΧΙΑ|ΥΠΟΜΟΝΑΔΑ|ΘΑΛΑΜΟΣ|ΘΑΛΑΜΟΙ|ΣΤΕΛΕΧΗ|ΟΠΛΙΤΕΣ)(\s|$)/;
const LETTERS = /^\p{L}[\p{L}\s'\-./]*$/u;
const FIELD_KEYS = ['name', 'last', 'first', 'father', 'rank', 'asm', 'aa', 'sub'];

export function readRoster(sheet: SheetModel, o: RosterOpts = {}): RosterRead {
  const lex = o.lexicon || buildLexicon(); const g = new Grid(sheet);
  const shape = o.shape || detectSheet(sheet, { lexicon: lex });
  const out: RosterRead = { sheet: sheet.name, found: false, people: [], ask: [], skipped: [], vacant: 0, cols: [], needsConfirm: [], groups: [], warnings: [] };
  // the first people table (a header with a name column)
  const hasName = (l: ListRegion) => l.cols.some(c => c.match.confidence !== 'unknown' && /^person:(name|last)$/.test(c.match.concept || ''));
  const reg = shape.regions.filter((x): x is ListRegion => x.type === 'list' && hasName(x)).sort((a, b) => a.headerRows[0] - b.headerRows[0])[0];
  if (!reg) { out.warnings.push('Δεν βρέθηκε πίνακας με ονόματα στο φύλλο «' + sheet.name + '».'); return out; }
  out.found = true; out.header = { rows: reg.headerRows, first: reg.headerRows[1] + 1 };

  // ---- columns
  type CM = { concept: string; c: number; text: string; confidence: 'sure' | 'suggest' };
  const mapOf = (cols: { c: number; leaf: string; text: string; match: { concept: string | null; confidence: string } }[]): Map<string, CM> => {
    const m = new Map<string, CM>();
    for (const c of cols) {
      const cn = c.match.concept; if (!cn || c.match.confidence === 'unknown' || !/^person:/.test(cn)) continue;
      const k = cn.slice(7); const old = m.get(k);
      if (!old || (old.confidence === 'suggest' && c.match.confidence === 'sure')) m.set(k, { concept: k, c: c.c, text: c.leaf || c.text, confidence: c.match.confidence as 'sure' | 'suggest' });
    }
    return m;
  };
  let cm = mapOf(reg.cols);
  if (o.cols) for (const [k, c] of Object.entries(o.cols)) cm.set(k.replace(/^person:/, ''), { concept: k.replace(/^person:/, ''), c, text: '', confidence: 'sure' });
  const describe = () => { out.cols = [...cm.values()].map(x => ({ concept: 'person:' + x.concept, c: x.c, confidence: x.confidence })); out.needsConfirm = [...cm.values()].filter(x => x.confidence === 'suggest' && FIELD_KEYS.includes(x.concept)).map(x => 'person:' + x.concept); };
  describe();
  // «ΕΠΩΝΥΜΟ - ΟΝΟΜΑ» / «ΟΝΟΜΑ - ΕΠΩΝΥΜΟ» in one cell: the order is in the header
  let order: 'last-first' | 'first-last' | null = null;
  const nameCell = cm.get('name') || (cm.get('last') && !cm.get('first') ? cm.get('last') : undefined);
  if (nameCell && nameCell.text) { const t = normText(nameCell.text); const a = t.indexOf('ΕΠΩΝΥΜ'), b = t.indexOf('ΟΝΟΜΑ'); if (a >= 0 && b >= 0 && !/ΟΝΟΜΑΤΕΠ/.test(t)) order = a < b ? 'last-first' : 'first-last'; }
  const rankCol = cm.get('rank')?.c;
  if (rankCol == null) out.warnings.push('Δεν βρέθηκε στήλη βαθμού: ο τύπος κάθε ατόμου (στέλεχος ή οπλίτης) πρέπει να δηλωθεί.');

  // ---- helpers over one row
  const lastCol = Math.max(reg.c2, ...[...cm.values()].map(x => x.c));
  const firstCol = Math.min(reg.c1, ...[...cm.values()].map(x => x.c));
  const cell = (r: number, k: string): string => { const x = cm.get(k); return x ? g.textThrough(r, x.c) : ''; };
  const filled = (r: number): number[] => { const l: number[] = []; for (let c = firstCol; c <= lastCol; c++) if (g.textThrough(r, c) !== '') l.push(c); return l; };
  const isNameLike = (t: string) => { const n = normText(t); return n.length >= 2 && LETTERS.test(n) && !/\d/.test(n); };
  // the name of a person row, or null
  const nameOf = (r: number): Pick<RosterPerson, 'name' | 'last' | 'first' | 'father'> | null => {
    const last = cell(r, 'last'), first = cell(r, 'first'), father = cell(r, 'father'), full = cell(r, 'name');
    if (cm.get('first') && cm.get('last')) {
      if (!last || !first) return null;
      if (!isPersonRow(last, first, father)) return null;
      return { name: [last, first, father].filter(Boolean).join(' '), last, first, ...(father ? { father } : {}) };
    }
    const one = full || (cm.get('last') && !cm.get('first') ? last : '');
    if (!one || !isNameLike(one) || FOOTER.test(normText(one))) return null;
    if (lex.match(one, { kinds: ['total', 'group'] }).confidence === 'sure') return null;
    const w = one.replace(/\s+/g, ' ').trim().split(' ');
    if (order && w.length === 2) return order === 'last-first' ? { name: one, last: w[0], first: w[1] } : { name: one, first: w[0], last: w[1] };
    return { name: one };
  };
  const isHeader = (r: number): Map<string, CM> | null => {
    let hits = 0; const cols: { c: number; leaf: string; text: string; match: ReturnType<Lexicon['match']> }[] = []; const seen = new Set<string>();
    for (const c of filled(r)) { const t = g.textThrough(r, c); if (seen.has(t)) continue; seen.add(t); if (/^[\d\s.,:/+\-–]+$/.test(t) || t.length > 48) continue; const m = lex.match(t, { kinds: ['person'] }); if (m.confidence !== 'unknown') { hits++; cols.push({ c, leaf: t, text: t, match: m }); } }
    return hits >= 3 && cols.some(x => /^person:(name|last)$/.test(x.match.concept || '')) ? mapOf(cols) : null;
  };
  const rankOf = (r: number) => cell(r, 'rank');
  const classify = (rank: string): { kind: PersonKind; concept: string | null; origin?: string; why: string; proposal?: PersonKind } => {
    const ans = o.answers?.[rank] ?? o.answers?.[phraseKey(rank)] ?? Object.entries(o.answers || {}).find(([k]) => phraseKey(k) === phraseKey(rank))?.[1];
    // «ΕΠΟΠ ΛΧΙΑΣ (ΤΘ)»: the bracket is the specialty, «Μ. ΕΠΧΙΑΣ»: Μ. is permanent
    const base = rank.replace(/\([^)]*\)/g, ' ').replace(/^\s*Μ\s*\.\s*/, 'ΜΟΝΙΜΟΣ ').replace(/\s+/g, ' ').trim();
    const m = base ? lex.match(base, { kinds: ['rank'] }) : null;
    const concept = m && m.confidence !== 'unknown' ? m.concept : null; const origin = m?.origin;
    if (ans) return { kind: ans, concept, ...(origin ? { origin } : {}), why: 'απάντηση χρήστη' };
    if (!base) return o.assume && rankCol == null ? { kind: o.assume, concept: null, why: 'χωρίς στήλη βαθμού' } : { kind: 'ask', concept: null, why: rankCol == null ? 'δεν υπάρχει στήλη βαθμού' : 'κενός βαθμός' };
    if (!m || m.confidence === 'unknown' || !m.concept) return { kind: 'ask', concept: null, why: 'άγνωστος βαθμός' };
    const id = m.concept.slice(5);
    const known = CADRE.has(id) ? 'cadre' : SOLDIER.has(id) ? 'soldier' : BOTH.has(id) ? 'both' : null;
    if (m.confidence !== 'sure' || !known) return { kind: 'ask', concept: m.concept, ...(origin ? { origin } : {}), why: m.confidence !== 'sure' ? 'ο βαθμός μόνο προτείνεται' : 'βαθμός εκτός λίστας', ...(known && known !== 'both' ? { proposal: known } : {}) };
    if (origin && CADRE_ORIGIN.has(origin)) return { kind: 'cadre', concept: m.concept, origin, why: 'προέλευση ' + origin };
    if (known === 'both') return o.assume ? { kind: o.assume, concept: m.concept, ...(origin ? { origin } : {}), why: 'ο βαθμός υπάρχει και στις δύο λίστες' } : { kind: 'ask', concept: m.concept, ...(origin ? { origin } : {}), why: 'ο βαθμός υπάρχει και στις δύο λίστες (στέλεχος ή οπλίτης;)' };
    return { kind: known, concept: m.concept, ...(origin ? { origin } : {}), why: 'βαθμός' };
  };

  // ---- the rows
  const empties = o.emptyRun ?? 12; const asks = new Map<string, RosterAsk>();
  let group: string | undefined; let empty = 0;
  const personAhead = (from: number): boolean => { for (let r = from, e = 0; r < g.nRows && e < empties; r++) { if (!filled(r).length) { e++; continue; } e = 0; if (nameOf(r)) return true; } return false; };
  const seenGroups = new Set<string>();
  for (let r = reg.headerRows[1] + 1; r < g.nRows; r++) {
    const f = filled(r);
    if (!f.length) { if (++empty >= empties) { out.stoppedAt = { r, why: 'μεγάλο κενό (' + empties + ' άδειες γραμμές)' }; break; } continue; }
    empty = 0;
    // the header of the next printed page (maybe with its group row just above, which was taken as a title)
    const hm = isHeader(r);
    if (hm) {
      const same = ['name', 'last', 'first'].every(k => (cm.get(k)?.c ?? -1) === (hm.get(k)?.c ?? -1));
      if (!same && hm.size >= 3) { cm = hm; describe(); out.warnings.push('Νέα επικεφαλίδα με άλλες στήλες στη γραμμή ' + (r + 1) + ': διαβάζεται με τις νέες στήλες.'); }
      continue;
    }
    const nm = nameOf(r);
    const texts = f.map(c => g.textThrough(r, c)); const first = texts[0];
    // totals / footer: the end, unless people follow (a subtotal)
    if (FOOTER.test(normText(first)) || texts.some(t => lex.match(t, { kinds: ['total'] }).confidence === 'sure' && !nm)) {
      if (personAhead(r + 1)) { out.skipped.push({ r, why: 'υποσύνολο' }); continue; }
      out.stoppedAt = { r, why: 'σύνολο στο τέλος της λίστας: «' + first.slice(0, 30) + '»' }; break;
    }
    if (nm) {
      const rank = rankOf(r); const k = classify(rank);
      const fields: Record<string, string> = {};
      for (const [key, x] of cm) if (!FIELD_KEYS.includes(key)) { const t = g.textThrough(r, x.c); if (t) fields[key] = t; }
      const p: RosterPerson = { r, ...nm, rank, rankConcept: k.concept, ...(k.origin ? { origin: k.origin } : {}), kind: k.kind, ...(cell(r, 'asm') ? { asm: cell(r, 'asm').replace(/\s/g, '') } : {}), ...(cell(r, 'aa') ? { aa: cell(r, 'aa') } : {}), ...(group ? { group } : {}), fields };
      out.people.push(p);
      if (k.kind === 'ask') { const key = phraseKey(rank) || '·'; const a = asks.get(key) || { rank, rows: [], why: k.why, ...(k.proposal ? { proposal: k.proposal } : {}) }; a.rows.push(r); asks.set(key, a); }
      continue;
    }
    // a title row: one text alone (merged across the table, or a group word), not a number
    const merged = g.mergeOf(r, f[0]); const wide = !!merged && merged.c2 > merged.c1 && merged.c2 - merged.c1 >= 2;
    const t0 = normText(first);
    // (a title right above a repeated header is the title of the printed page, unless it names a group)
    const nextHeader = (() => { for (let q = r + 1; q < Math.min(g.nRows, r + 4); q++) if (filled(q).length) return !!isHeader(q); return false; })();
    const single = new Set(texts).size === 1;     // one text (a merged cell shows its text in every column it covers)
    if (single && !/^[\d\s.,:/+\-–]+$/.test(first) && (wide || TITLE_WORD.test(t0))) {
      if (nextHeader && !TITLE_WORD.test(t0)) continue;
 group = first; if (!seenGroups.has(first)) { seenGroups.add(first); out.groups.push(first); } continue; }
    if (!cell(r, 'last') && !cell(r, 'first') && !cell(r, 'name') && (/^\d+$/.test(cell(r, 'aa')) || (cell(r, 'rank') && lex.match(cell(r, 'rank'), { kinds: ['rank'] }).confidence !== 'unknown') || cell(r, 'asm'))) { out.vacant++; out.skipped.push({ r, why: 'θέση χωρίς όνομα' }); continue; }
    out.skipped.push({ r, why: single ? 'χωρίς όνομα' : 'χωρίς όνομα ή μη έγκυρο όνομα' });
  }
  out.ask = [...asks.values()];
  return out;
}
// How many people of each kind (for screens and tests)
export const countKinds = (x: RosterRead): Record<PersonKind, number> => {
  const c: Record<PersonKind, number> = { cadre: 0, soldier: 0, ask: 0 }; for (const p of x.people) c[p.kind]++; return c;
};
void valueText;
