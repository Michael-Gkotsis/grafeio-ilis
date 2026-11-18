// The back side and the loose texts of the front of the ΗΚΑΙ/ΗΚΑΛ of ANY unit: where the sections are, where their lines go, how a line is written.
//   locateBack      the sections of the back side by their WORDS (with or without number / group), the rows under them (slots), the columns that are never written
//   frontTexts      the title «Ημερήσια αναφορά της ____ της / /», the «Τόπος, ημερομηνία» line and the signature blocks, and the text to write into their BLANK parts only
//   line format     numbering (α. β. … στ. ζ. | 1. 2.), date («15 ΟΚΤ 26» | «15/10/26» | «15/10/2026»), the person line of the unit's form, hyphenated wrapping
// Pure functions over the sheet model: no file access, nothing is written here. A section the form does not have is reported by the caller, never written elsewhere.
import { Grid, key as cellKey, valueText, type SheetModel } from './sheetModel';
import { phraseKey, type Lexicon } from './lexicon';
import { HK_MON, type ISODate } from './dates';
import { upper } from './text';

// ------------------------------------------------------------------ the format of a line (kept in the profile; the default is today's)
export interface BackFormat { num: 'arabic' | 'greek'; date: 'hk' | 'slash' | 'slash4'; line: 'app' | 'person' }
export const DEFAULT_FORMAT: BackFormat = { num: 'arabic', date: 'hk', line: 'app' };
export const formatOf = (b?: Partial<BackFormat> | null): BackFormat => ({
  num: b?.num === 'greek' ? 'greek' : 'arabic', date: b?.date === 'slash' || b?.date === 'slash4' ? b.date : 'hk', line: b?.line === 'person' ? 'person' : 'app'
});
const UNITS = ['', 'α', 'β', 'γ', 'δ', 'ε', 'στ', 'ζ', 'η', 'θ'], TENS = ['', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π'];
export function greekNum(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 89) return String(n);
  return TENS[Math.floor(n / 10)] + UNITS[n % 10];
}
export const numLabel = (n: number, f: BackFormat) => (f.num === 'greek' ? greekNum(n) : String(n)) + '.';
export function fmtDate(d: ISODate, how: BackFormat['date']): string {
  const dd = d.slice(8, 10), mm = d.slice(5, 7);
  return how === 'slash' ? dd + '/' + mm + '/' + d.slice(2, 4) : how === 'slash4' ? dd + '/' + mm + '/' + d.slice(0, 4) : dd + ' ' + HK_MON[+mm - 1] + ' ' + d.slice(2, 4);
}
// the dates inside a sentence of the app («12 ΟΚΤ 26») in the format of the unit
const HK_DATE_IN = new RegExp('(?<![\\p{L}\\d])(\\d{2}) (' + HK_MON.join('|') + ') (\\d{2})(?![\\p{L}\\d])', 'gu');
export const dateIn = (t: string, how: BackFormat['date']) => (how === 'hk' ? t : t.replace(HK_DATE_IN, (_m, d: string, mo: string, y: string) => d + '/' + String(HK_MON.indexOf(mo) + 1).padStart(2, '0') + '/' + (how === 'slash4' ? '20' + y : y)));
// a made-up person for the sample line of the screen
export const SAMPLE = { rank: 'ΣΤΡ', spec: 'ΠΖ', last: 'ΠΑΠΑΔΟΠΟΥΛΟΣ', first: 'ΝΙΚΟΣ', num: '123456' };

// ------------------------------------------------------------------ wrapping at the width of the column, hyphenating a word that does not fit
const VOWEL = /[ΑΕΗΙΟΥΩΆΈΉΊΌΎΏAEIOUΪΫ]/i;
export function hyphenAt(word: string, fits: (s: string) => boolean): number {
  // the longest head (≥2 letters) that fits with its hyphen and leaves ≥2 letters, cut after a vowel before a consonant (else anywhere)
  let best = -1, bestAny = -1;
  for (let i = 2; i <= word.length - 2; i++) {
    if (!fits(word.slice(0, i) + '-')) break;
    bestAny = i; if (VOWEL.test(word[i - 1]) && !VOWEL.test(word[i])) best = i;
  }
  return best > 0 ? best : bestAny;
}
// width: a function that measures a text (px); max: the width of the column. The lines joined without the hyphens and spaces give back the text.
export function wrapText(text: string, measure: (s: string) => number, max: number): string[] {
  const out: string[] = []; let cur = '';
  const fits = (s: string) => measure(s) <= max;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    let word = w;
    for (;;) {
      const t = cur ? cur + ' ' + word : word;
      if (fits(t)) { cur = t; break; }
      if (cur) { out.push(cur); cur = ''; continue; }
      const k = hyphenAt(word, fits);
      if (k <= 0) { out.push(word); word = ''; cur = ''; break; }   // a word that cannot be cut stays whole on its own row
      out.push(word.slice(0, k) + '-'); word = word.slice(k);
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

// ------------------------------------------------------------------ sections of the back side
export type SecId = 'enroll' | 'delete' | 'leaves' | 'punish' | 'requests' | 'misc' | 'reports' | 'absences';
export const SEC_IDS: SecId[] = ['enroll', 'delete', 'leaves', 'punish', 'requests', 'misc', 'reports', 'absences'];
export const SEC_NAME: Record<SecId, string> = { enroll: 'Εγγραφές', delete: 'Διαγραφές', leaves: 'Άδειες', punish: 'Ποινές', requests: 'Αιτήσεις', misc: 'Λοιπά', reports: 'Αναφορές', absences: 'Απουσίες' };
const secOfConcept = (c: string | null): SecId | null => { const id = c?.startsWith('label:') ? c.slice(6) : ''; return (SEC_IDS as string[]).includes(id) ? (id as SecId) : null; };
export interface Slot { r: number; c: number; c2: number }          // the anchor cell of a row of the form (0-based) and the last column of its merge
export interface BackSection {
  id: SecId; text: string; r: number; c: number; r2: number; c2: number;
  state: 'sure' | 'suggest'; group: string;
  layout: 'right' | 'below'; slots: Slot[];                          // right: ONE cell next to the label (as many lines as it takes)· below: the rows under the label
  comment?: string;
}
export interface BackForm {
  sheet: string; sections: BackSection[]; protectedCols: Set<number>; decision: { r: number; c: number; text: string }[];
  blocks: { vehicles: boolean; organs: boolean; meal: boolean; arms: boolean };
  continuation: string | null;
}
const DECISION = /^(ΕΙΣΗΓΗΣΗ|ΑΠΟΦΑΣΗ|ΕΛΑΒΑ ΓΝΩΣΗ|ΕΙΣΗΓΗΣΗ\s*\(.*\)|ΑΠΟΦΑΣΗ\s*\(.*\)|ΕΙΣΗΓΗΣΗ\s*[-/]\s*ΑΠΟΦΑΣΗ.*|ΥΔΚΤΟΥ|ΔΚΤΟΥ|ΕΙΣΗΓΗΣΗ ΥΔΚΤΟΥ|ΑΠΟΦΑΣΗ ΔΚΤΟΥ)$/;
// the lines of a signature block / the end of a form: a section's rows never run into them
const STOP_TEXT = /^ΥΠΟΓΡΑΦ|^ΕΛΑΒΑ ΓΝΩΣΗ|^(Ο|Η|ΤΟ)\s+(ΑΛΧΙΑΣ|ΛΟΧΙΑΣ|ΔΚΤΗΣ|ΔΙΟΙΚΗΤΗΣ|ΥΔΚΤΗΣ|ΑΞΚΟΣ|ΑΞΙΩΜΑΤΙΚΟΣ|ΟΥΛΑΜΟΣ|ΕΠΟΠΤΗΣ)/;
const isStopText = (t: string) => !!t && t.length < 80 && STOP_TEXT.test(upper(t).replace(/\s+/g, ' ').trim());
export const isDecision = (t: string) => DECISION.test(upper(t).replace(/\s+/g, ' ').trim());
const GROUP = /^ΟΜΑΔΑ\s+([ΑΒA-B])\s*['΄’`´]?\s*[-–:.]?\s*(.*)$/;
// «ΟΜΑΔΑ Α΄ ΣΤΡΑΤΟΛΟΓΙΚΕΣ: ΕΓΓΡΑΦΕΣ» → group Α + «ΕΓΓΡΑΦΕΣ»; «1. ΕΓΓΡΑΦΕΣ:» → «ΕΓΓΡΑΦΕΣ»
export function sectionWord(t: string): { word: string; group: string } {
  let x = upper(t).replace(/\s+/g, ' ').trim(); let group = '';
  const g = GROUP.exec(x); if (g) { group = g[1] === 'A' ? 'Α' : g[1] === 'B' ? 'Β' : g[1]; x = g[2].trim(); }
  x = x.replace(/^(ΣΤΡΑΤΟΛΟΓΙΚΕΣ|ΔΙΟΙΚΗΤΙΚΕΣ)(\s+ΜΕΤΑΒΟΛΕΣ)?\s*[-–:.]?\s*/, '').replace(/^\d{1,2}\s*[.)\-–]?\s*/, '').replace(/\s*[:.]\s*$/, '').trim();
  return { word: x, group };
}
export interface BackOpts { lex: Lexicon; accepted?: string[]; ours?: Record<string, string> }
const freeCell = (g: Grid, r: number, c: number, ours?: Record<string, string>, sheet?: string) => {
  const m = g.mergeOf(r, c); const ar = m ? m.r1 : r, ac = m ? m.c1 : c; const t = g.text(ar, ac);
  return !g.isFormula(ar, ac) && (t === '' || (!!ours && !!sheet && ours[sheet + '|' + ar + ':' + ac] === t));
};

// every section word of a sheet, group headers and decision columns
export function sectionsOf(sh: SheetModel, o: BackOpts): { found: BackSection[]; groups: number[]; decision: BackForm['decision'] } {
  const g = new Grid(sh); const found: BackSection[] = []; const groups: number[] = []; const decision: BackForm['decision'] = [];
  for (let r = 0; r < g.nRows; r++) {
    const row = sh.rows[r]; if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const t = valueText(row[c]); if (!t || t.length > 70) continue;
      const m = g.mergeOf(r, c); if (m && (m.r1 !== r || m.c1 !== c)) continue;
      if (isDecision(t)) { decision.push({ r, c, text: t }); continue; }
      const { word, group } = sectionWord(t);
      if (group && !word) { groups.push(r); continue; }
      if (!word || word.split(' ').length > 3) continue;
      const mt = o.lex.match(word, { kinds: ['label'] });
      const id = secOfConcept(mt.concept); if (!id || mt.confidence === 'unknown') continue;
      const accepted = !!o.accepted?.includes(phraseKey(t));
      if (mt.confidence !== 'sure' && !accepted) { found.push({ id, text: t, r, c, r2: m?.r2 ?? r, c2: m?.c2 ?? c, state: 'suggest', group, layout: 'below', slots: [] }); continue; }
      found.push({ id, text: t, r, c, r2: m?.r2 ?? r, c2: m?.c2 ?? c, state: 'sure', group, layout: 'below', slots: [] });
    }
  }
  return { found, groups, decision };
}
const BLOCK = { vehicles: /^ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ|^ΕΙΔΗ ΟΧΗΜΑΤΩΝ/, organs: /^ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ|^ΑΞΙΩΜΑΤΙΚΟΙ\s*:?$/, meal: /^ΣΥΣΣΙΤΙΟ/, arms: /^ΟΠΛΙΣΜΟΣ|^ΑΝΑΦΕΡΕΤΑΙ ΠΛΗΡΟΤΗΤΑ ΟΠΛΙΣΜΟΥ/ };
export function locateBack(sh: SheetModel, o: BackOpts, cont?: string | null): BackForm | null {
  const { found, groups, decision } = sectionsOf(sh, o);
  const ids = new Set(found.map(x => x.id)); if (ids.size < 2) return null;
  const g = new Grid(sh);
  const protectedCols = new Set<number>();
  for (const d of decision) { const m = g.mergeOf(d.r, d.c); for (let c = m?.c1 ?? d.c; c <= (m?.c2 ?? d.c); c++) protectedCols.add(c); }
  // the rows of a section end where the next section / group begins
  const stops = [...found.map(x => x.r), ...groups].sort((a, b) => a - b);
  const stopAfter = (r: number) => stops.find(x => x > r) ?? g.nRows;
  const blockCells = (() => { const rows: { r: number; c: number }[] = []; for (let r = 0; r < g.nRows; r++) for (let c = 0; c < (sh.rows[r]?.length ?? 0); c++) { const t = upper(valueText(sh.rows[r][c])).replace(/\s+/g, ' ').trim(); if (t && t.length < 80 && (BLOCK.vehicles.test(t) || BLOCK.meal.test(t) || BLOCK.arms.test(t) || STOP_TEXT.test(t))) rows.push({ r, c }); } return rows; })();
  const sigRows = (() => { const rows: number[] = []; for (let r = 0; r < g.nRows; r++) for (let c = 0; c < (sh.rows[r]?.length ?? 0); c++) if (isStopText(valueText(sh.rows[r][c]))) { rows.push(r); break; } return rows; })();
  const spanFree = (r: number, c: number) => { const m = g.mergeOf(r, c); const c1 = m?.c1 ?? c, c2 = m?.c2 ?? c; for (let x = c1; x <= c2; x++) if (protectedCols.has(x)) return false; return true; };
  for (const s of found) {
    if (s.state !== 'sure') continue;
    const end = Math.min(stopAfter(s.r), ...blockCells.filter(x => x.r > s.r2 && x.c >= s.c).map(x => x.r), ...sigRows.filter(x => x > s.r2));
    const below: Slot[] = [];
    for (let r = s.r2 + 1; r < end; r++) {
      const m = g.mergeOf(r, s.c); if (m && (m.r1 !== r || m.c1 !== s.c)) { if (m.c1 <= s.c && m.r1 < r) continue; break; }
      if (!freeCell(g, r, s.c, o.ours, sh.name) || !spanFree(r, s.c)) break;
      below.push({ r, c: s.c, c2: m?.c2 ?? s.c });
      if (m && m.r2 > r) r = m.r2;
    }
    // right of the label, if that cell is free and is THE place of the section (the bundled form: one wide cell, no rows under the label, or a cell as tall as the section).
    // Text there («ΕΙΣΗΓΗΣΗ»), a decision column, or free rows under the label: the rows under the label
    const rc = s.c2 + 1; const rm = g.mergeOf(s.r, rc);
    const rightFree = freeCell(g, s.r, rc, o.ours, sh.name), rightProt = !spanFree(s.r, rc);
    if (rightFree && !rightProt && (below.length === 0 || (!!rm && rm.r2 >= end - 1 && rm.r2 > rm.r1))) { s.layout = 'right'; s.slots = [{ r: rm?.r1 ?? s.r, c: rm?.c1 ?? rc, c2: rm?.c2 ?? rc }]; continue; }
    // any other text next to the label (a note, an old line, an example): the section is not written at all
    if (!rightFree && !rightProt && !isDecision(g.textThrough(s.r, rc))) { s.slots = []; continue; }
    s.slots = below;
  }
  const blocks = { vehicles: false, organs: false, meal: false, arms: false };
  for (let r = 0; r < g.nRows; r++) for (let c = 0; c < (sh.rows[r]?.length ?? 0); c++) { const t = upper(valueText(sh.rows[r][c])).replace(/\s+/g, ' ').trim(); if (!t || t.length > 90) continue; for (const k of Object.keys(blocks) as (keyof typeof blocks)[]) if (BLOCK[k].test(t)) blocks[k] = true; }
  const comments = sh.comments || {};
  for (const s of found) { const c = comments[cellKey(s.r, s.c)]; if (c) s.comment = c; }
  return { sheet: sh.name, sections: found, protectedCols, decision, blocks, continuation: cont ?? null };
}

// The back sheet of the book: the one that has the most sections; of two (a worked example and the blank form) the one with room for lines
export function pickBack(sheets: SheetModel[], o: BackOpts, not?: string): { form: BackForm; sheet: SheetModel } | null {
  let best: { form: BackForm; sheet: SheetModel; score: number } | null = null;
  for (const sh of sheets) {
    if (sh.state !== 'visible' && sh.state !== undefined && sh.state !== 'hidden') continue;
    const form = locateBack(sh, o); if (!form) continue;
    const slots = form.sections.reduce((a, s) => a + (s.state === 'sure' ? s.slots.length : 0), 0);
    const score = new Set(form.sections.map(x => x.id)).size * 100 + Math.min(slots, 90) + (/ΠΑΡΑΓΡΑΦ|ΠΙΣΩ|ΟΨΗ/.test(upper(sh.name)) ? 5 : 0) - (sh.name === not ? 50 : 0);
    if (!best || score > best.score) best = { form, sheet: sh, score };
  }
  if (!best) return null;
  best.form.continuation = continuationOf(sheets, best.sheet.name, o);
  return { form: best.form, sheet: best.sheet };
}
// A sheet that continues the back side: no sections of its own, a decision column («ΕΙΣΗΓΗΣΗ») and free rows under it
export function continuationOf(sheets: SheetModel[], back: string, o: BackOpts): string | null {
  for (const sh of sheets) {
    if (sh.name === back || sectionsOf(sh, o).found.length) continue;
    if (/ΕΠΕΚΤΑΣΗ|ΣΥΝΕΧΕΙΑ/.test(upper(sh.name)) && slotsOfContinuation(sh).length) return sh.name;
  }
  return null;
}
// the rows of a continuation page: under the heading that sits left of the decision column, in the column of that heading
export function slotsOfContinuation(sh: SheetModel): Slot[] {
  const g = new Grid(sh); const out: Slot[] = [];
  const dec: { r: number; c: number }[] = [];
  for (let r = 0; r < g.nRows; r++) for (let c = 0; c < (sh.rows[r]?.length ?? 0); c++) { const m = g.mergeOf(r, c); if (m && (m.r1 !== r || m.c1 !== c)) continue; if (isDecision(valueText(sh.rows[r][c]))) dec.push({ r, c }); }
  if (!dec.length) return out;
  const hr = Math.min(...dec.map(d => d.r)); const first = dec.filter(d => d.r === hr).sort((a, b) => a.c - b.c)[0];
  const left = g.mergeOf(hr, first.c - 1); const tc = left?.c1 ?? first.c - 1; if (tc < 0) return out;
  const prot = new Set<number>(); for (const d of dec) { const m = g.mergeOf(d.r, d.c); for (let c = m?.c1 ?? d.c; c <= (m?.c2 ?? d.c); c++) prot.add(c); }
  const hEnd = Math.max(hr, ...dec.filter(d => d.r === hr).map(d => g.mergeOf(d.r, d.c)?.r2 ?? d.r), left?.r2 ?? hr);
  const stopRow = (() => { for (let r = hEnd + 1; r < g.nRows; r++) for (let c = 0; c < (sh.rows[r]?.length ?? 0); c++) if (isStopText(valueText(sh.rows[r][c]))) return r; return g.nRows; })();
  for (let r = hEnd + 1; r < stopRow; r++) {
    const m = g.mergeOf(r, tc); if (m && (m.r1 !== r || m.c1 !== tc)) { if (m.r1 < r) continue; break; }
    const c2 = m?.c2 ?? tc; let bad = false; for (let x = tc; x <= c2; x++) if (prot.has(x)) bad = true;
    if (bad || !freeCell(g, r, tc)) break;
    out.push({ r, c: tc, c2 }); if (m && m.r2 > r) r = m.r2;
  }
  return out;
}

// ------------------------------------------------------------------ blanks inside a text: «____», «….», «/ /»
export const BLANK_RUN = /[_…]{2,}|\.{3,}/g;
const DATE_SLASH = /(\d{1,2}|[_….]*)[ \t]*\/[ \t]*(\d{1,2}|[_….]*)[ \t]*\/([ \t]*)(\d{4}|20[_….]+|\d{2}|[_….]*)/;
const DATE_WORD = new RegExp('(?<![\\p{L}\\d])\\d{1,2}\\s+(?:' + HK_MON.join('|') + '|ΜΑΪ|ΙΟΥΝ|ΙΟΥΛ)\\s+\\d{2,4}(?![\\p{L}\\d])', 'iu');
export interface FillResult { text: string; unit: boolean; date: boolean; skipped: string[] }
// Fills the blank parts of a title / date line. Everything outside the filled parts is returned unchanged (the caller compares them).
export function fillTitle(t: string, o: { unit: string; d: ISODate; fmt: BackFormat['date']; dateOnly?: boolean }): FillResult {
  let text = t; let unit = false, date = false; const skipped: string[] = [];
  const dm = DATE_SLASH.exec(text);
  let dateAt = -1, dateLen = 0;
  if (dm) {
    const y = dm[4]; const y4 = /^\d{4}$/.test(y) || /^20[_….]+$/.test(y) || (!/\d/.test(y) && o.fmt === 'slash4');
    const repl = fmtDate(o.d, y4 ? 'slash4' : 'slash');
    // blanks that are only spaces (« / / ») keep the spaces in front of and after the date: only the slashes and what is between them are replaced
    const lead = dm[1] === '' ? /^[ \t]*/.exec(dm[0])![0].length : 0; const trail = y === '' ? dm[3].length : 0;
    dateAt = dm.index + lead; dateLen = dm[0].length - lead - trail; text = text.slice(0, dateAt) + repl + text.slice(dateAt + dateLen); date = true;
  } else {
    const wm = DATE_WORD.exec(text);
    if (wm) { dateAt = wm.index; dateLen = wm[0].length; text = text.slice(0, dateAt) + fmtDate(o.d, 'hk') + text.slice(dateAt + dateLen); date = true; }
  }
  if (!o.dateOnly) {
    const runs = [...text.matchAll(BLANK_RUN)].filter(m => !(dateAt >= 0 && m.index! >= dateAt && m.index! < dateAt + 10));
    if (runs.length === 1 || (runs.length && !date)) {
      const m = runs[0]; const after = text.slice(m.index! + m[0].length).trim();
      // the unit's name goes in front of «ΤΗΣ …» / the date; a lonely blank at the end could be anything
      if (o.unit && (/^(ΤΗΣ|ΤΟΥ)(?![\p{L}])/iu.test(after) || (date && m.index! < dateAt))) { text = text.slice(0, m.index!) + o.unit + text.slice(m.index! + m[0].length); unit = true; }
      else skipped.push('κενό για το όνομα της μονάδας');
    }
  }
  return { text, unit, date, skipped };
}
// what remains of a text when its blanks, digits and the filled words are cut out: equal before and after = only blanks were filled
export const frame = (t: string, filled: string[] = []) => { let x = t; for (const f of filled) if (f) x = x.split(f).join(''); return x.replace(BLANK_RUN, '').toUpperCase().replace(new RegExp('(?<![\\p{L}])(?:' + HK_MON.join('|') + '|ΜΑΪ)(?![\\p{L}])', 'gu'), '').replace(/[\s_…./\d]+/g, ''); };

// ------------------------------------------------------------------ the loose texts of the front
export interface FrontPlan { writes: { sheet: string; r: number; c: number; value: string | number; over: string }[]; warnings: string[]; found: { title: boolean; date: boolean; sigs: number }; sigsDone: string[]; sigsLost: string[]; dates: { r: number; c: number; old: Date }[] }
// «ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ … ΤΗΣ» | 14/8/2024 · «Πυλί, Κως,» | 14-Αυγ-24: η ημερομηνία σε δικό της κελί δεξιά (κελί με μορφή ημερομηνίας, όχι τύπος).
// Το πρώτο μη κενό κελί δεξιά στην ίδια γραμμή· αν είναι κάτι άλλο, δεν υπάρχει τέτοιο κελί.
function dateRight(g: Grid, sh: SheetModel, r: number, c: number): { r: number; c: number; old: Date } | null {
  const from = (g.mergeOf(r, c)?.c2 ?? c) + 1;
  for (let cc = from; cc < from + 30; cc++) {
    const m = g.mergeOf(r, cc); if (m && (m.r1 !== r || m.c1 !== cc)) continue;
    const v = sh.rows[r]?.[cc]; if (v == null || v === '' || (typeof v === 'string' && !v.trim())) continue;
    return v instanceof Date && !g.isFormula(r, cc) ? { r, c: cc, old: v } : null;
  }
  return null;
}
const SIGROLE = /^(Ο|Η|ΤΟ|ΟΙ)\s+(?!ΑΠΟ\b)[Α-Ω0-9ΆΈΉΊΌΎΏ][^:]{2,40}$/;
const NAMELINE = /^[\s_…\-–.]*(?:[_…]{3,}|\.{4,})[\s_…\-–.]*$/;
export function frontTexts(sh: SheetModel, o: { unit: string; place: string; d: ISODate; fmt: BackFormat['date']; sigs: { art: string; title: string; name?: string }[]; skipRows?: (r: number, c: number) => boolean; serial?: number }): FrontPlan {
  const g = new Grid(sh); const plan: FrontPlan = { writes: [], warnings: [], found: { title: false, date: false, sigs: 0 }, sigsDone: [], sigsLost: [], dates: [] };
  const put = (r: number, c: number, over: string, value: string) => { if (value !== over) plan.writes.push({ sheet: sh.name, r, c, value, over }); };
  // η ημερομηνία στο κελί δεξιά: ο αριθμός της μέρας του Excel (η μορφή του κελιού μένει όπως την έχει το έντυπο)
  const putDate = (x: { r: number; c: number; old: Date }) => { if (o.serial == null) return false; plan.writes.push({ sheet: sh.name, r: x.r, c: x.c, value: o.serial, over: '' }); plan.dates.push(x); return true; };
  for (let r = 0; r < g.nRows; r++) {
    const row = sh.rows[r]; if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const raw = row[c]; if (typeof raw !== 'string' || g.isFormula(r, c)) continue;
      const m = g.mergeOf(r, c); if (m && (m.r1 !== r || m.c1 !== c)) continue;
      const t = raw.replace(/\s+$/, ''); const n = upper(t).replace(/\s+/g, ' ');
      if (/(^|\s)ΗΜΕΡΗΣΙΑ[ΣΣ]?\s+ΑΝΑΦΟΡΑ[ΣΣ]?(?![\p{L}])/u.test(n)) {
        plan.found.title = true;
        const res = fillTitle(raw, { unit: upper(o.unit), d: o.d, fmt: o.fmt });
        if (!res.date) { const dr = dateRight(g, sh, r, c); if (!(dr && putDate(dr))) plan.warnings.push('Ο τίτλος «' + t.slice(0, 40) + '» δεν έχει κενό ή ημερομηνία: δεν γράφτηκε'); }
        else if (frame(res.text, [upper(o.unit), fmtDate(o.d, 'hk'), fmtDate(o.d, 'slash'), fmtDate(o.d, 'slash4')]) !== frame(raw, [])) plan.warnings.push('Ο τίτλος δεν γράφτηκε (θα άλλαζε λέξεις του εντύπου)');
        else put(r, c, raw, res.text);
        for (const s of res.skipped) plan.warnings.push('Στον τίτλο: ' + s + ': δεν γράφτηκε');
        continue;
      }
      // «Πυλί, Κως,» και η ημερομηνία σε δικό της κελί δεξιά
      if (/^[^\d:]{1,40},$/u.test(t.trim())) { const dr = dateRight(g, sh, r, c); if (dr && putDate(dr)) { plan.found.date = true; continue; } }
      // «Τόπος, 25/09/26» · «Τόπος, / /» · «……, ημερομηνία» (a short text, a comma, then the date or its blank)
      const pd = /^([^\d,:]{0,40}?|[_….\s]+),\s*(.*)$/u.exec(t);
      if (pd && (DATE_SLASH.test(pd[2]) || DATE_WORD.test(pd[2])) && !/\p{L}{4,}\s+\p{L}{4,}\s+\p{L}{4,}/u.test(pd[1]) && pd[2].replace(DATE_SLASH, '').replace(DATE_WORD, '').replace(/[_….\s]/g, '') === '') {
        plan.found.date = true;
        const place = /^[_….\s]*$/.test(pd[1]) ? (o.place ? upper(o.place) : '') : pd[1];
        if (/^[_….\s]*$/.test(pd[1]) && !place) { plan.warnings.push('Η γραμμή τόπου και ημερομηνίας δεν έχει τόπο: δεν γράφτηκε'); continue; }
        const res = fillTitle(pd[2], { unit: '', d: o.d, fmt: o.fmt, dateOnly: true });
        put(r, c, raw, place + ', ' + res.text.trim()); continue;
      }
    }
  }
  // signatures: the role cell (the template's own words) and the line for the name under it. Only names the unit gave are written.
  const roles: { r: number; c: number; n: string }[] = [];
  for (let r = 0; r < g.nRows; r++) for (let c = 0; c < (sh.rows[r]?.length ?? 0); c++) {
    const raw = sh.rows[r][c]; if (typeof raw !== 'string') continue; const m = g.mergeOf(r, c); if (m && (m.r1 !== r || m.c1 !== c)) continue;
    const n = upper(raw).replace(/\s+/g, ' ').trim(); if (SIGROLE.test(n) && !/[0-9]{3}/.test(n)) roles.push({ r, c, n });
  }
  plan.found.sigs = roles.length;
  for (const s of o.sigs) {
    if (!s.name) continue; const want = upper(s.title).replace(/\s+/g, ' ').trim(); if (!want) continue;
    const role = roles.find(x => x.n.includes(want)) ; 
    if (!role) { plan.sigsLost.push(s.title); continue; }
    const rm = g.mergeOf(role.r, role.c); const c1 = rm?.c1 ?? role.c, c2 = rm?.c2 ?? role.c;
    let hit: { r: number; c: number; t: string } | null = null;
    for (let r = (rm?.r2 ?? role.r) + 1; r <= (rm?.r2 ?? role.r) + 5 && !hit; r++) {
      const mm = g.mergeOf(r, c1); const ac = mm?.c1 ?? c1; const ar = mm?.r1 ?? r; const t = g.text(ar, ac);
      if (t && NAMELINE.test(t) && typeof sh.rows[ar]?.[ac] === 'string') hit = { r: ar, c: ac, t: String(sh.rows[ar][ac]) };
      else if (t) break;
    }
    void c2;
    if (!hit) { plan.warnings.push('Δεν βρέθηκε γραμμή για το όνομα κάτω από «' + role.n + '»: δεν γράφτηκε'); continue; }
    put(hit.r, hit.c, hit.t, upper(s.name)); plan.sigsDone.push(s.title);
  }
  return plan;
}

// ------------------------------------------------------------------ the sample line of the screen (a made-up person)
export function sampleLine(f: BackFormat, d: ISODate = '2026-10-15'): string {
  const x = SAMPLE; const date = fmtDate(d, f.date);
  if (f.line === 'person') return numLabel(1, f) + ' ' + x.rank + ' (' + x.spec + ') ' + x.last + ' ' + x.first + ' (ΣΑ :' + x.num + ') : ΕΓΓΡΑΦΕΤΑΙ ΣΤΗΝ ΔΥΝΑΜΗ ΤΗΝ ' + date + '.';
  return numLabel(1, f) + ' ' + x.rank + ' (' + x.spec + ') ' + x.last + ' ' + x.first + ' ΤΟΥ ΓΕΩΡΓΙΟΥ, ΑΣΜ ' + x.num + ': ΗΡΘΕ ΑΠΟ ΤΗΝ ΜΟΝΑΔΑ ΧΧΧ ΤΗΝ ' + date + '.';
}
// what the screen shows of the back side of a file
export interface BackView {
  sheet: string; continuation: string | null; blocks: BackForm['blocks']; decision: number;
  sections: { id: SecId; name: string; text: string; ref: string; state: 'sure' | 'suggest'; layout: 'right' | 'below'; rows: number; comment: string; key: string }[];
  missing: SecId[];                           // sections of the app the form does not have: their lines are reported, never written elsewhere
}
export function backView(sheets: SheetModel[], o: BackOpts): BackView | null {
  const p = pickBack(sheets, o); if (!p) return null;
  const have = new Set(p.form.sections.map(x => x.id));
  const colL = (c: number) => { let n = c + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  return {
    sheet: p.form.sheet, continuation: p.form.continuation, blocks: p.form.blocks, decision: p.form.decision.length,
    sections: p.form.sections.map(x => ({ id: x.id, name: SEC_NAME[x.id], text: x.text, ref: colL(x.c) + (x.r + 1), state: x.state, layout: x.layout, rows: x.slots.length, comment: x.comment || '', key: phraseKey(x.text) })),
    missing: (['enroll', 'delete', 'leaves', 'punish', 'requests', 'misc'] as SecId[]).filter(id => !have.has(id) && !(id === 'leaves' && have.has('absences')))
  };
}
