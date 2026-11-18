// Το μηνιαίο πλέγμα υπηρεσιών ΑΛΛΗΣ μονάδας (άτομα × μέρες 1..28-31, δικοί της κωδικοί στα κελιά): αναγνώριση, λεξιλόγιο κωδικών,
// αντιστοίχιση και προφίλ. Καθαρές συναρτήσεις πάνω στα φύλλα (RawSheet), όπως τα διαβάζει η εφαρμογή.
//   findDutyGrid   βρίσκει το πλέγμα από το σχήμα του (σειρά ημερών, γραμμές ατόμων) και όχι από σταθερές θέσεις· οι επικεφαλίδες
//                  του ονόματος, Α/Α, ΠΟΣΤΟ, ΙΛΗ, ΕΣΣΟ… από το λεξικό (με τυπογραφικά), οι στήλες συνόλων (Σ, ΚΑ, ΕΤΑΠ…) αγνοούνται
//   collectCodes   κάθε διαφορετικός κωδικός στα κελιά των ημερών
//   guessCode      τι πιστεύει η εφαρμογή ότι σημαίνει: Σίγουρο · Πρόταση · Δεν το ξέρω. Ποτέ δεν μαντεύει σίγουρα.
//   buildDutyModel / dutyProfileFrom   η οθόνη «Αντιστοίχιση…» και το προφίλ (kind 'duties') που αποθηκεύεται
//   dutyTrial      η δοκιμή: πόσοι βρέθηκαν, πόσες μέρες διαβάστηκαν, τι σημαίνει κάθε κωδικός, τι θα γραφτεί
// Η ανάγνωση και η εγγραφή τρέχουν από τον ίδιο κώδικα που διαβάζει το δικό μας αρχείο (planDuties, planDutiesWrite) με τους
// κωδικούς του προφίλ (dutyUnit.ts)· το δικό μας αρχείο δεν περνά από εδώ αν διαβάζεται σήμερα σωστά (pickDuties).
import { buildLexicon, phraseKey, type Lexicon } from './lexicon';
import { KIND_NAME, codeKey, type AppState, type DutyKind, type Person, type Settings } from './domain';
import { dutyCode, seatOfCode } from './codes';
import { allPosts } from './rules';
import { DUTY_PROFILE_ID, dutyProfileOf, withUnit } from './dutyUnit';
import { bestFor, bindingMonth, cellText, colLetter, dayColumns, dayNum, dutyDays, missingFields, planDuties, planDutiesWrite, sheetPeople, tableRows, type SourceBinding } from './sources';
import { PROFILE_VERSION, type DutyMeaning, type DutyProfile, type TplProfile } from './tplStore';
import type { RawSheet } from './roster';
import type { ISODate } from './dates';

// ------------------------------------------------------------------ οι στήλες πριν από τις μέρες
export type Role = 'aa' | 'name' | 'last' | 'first' | 'father' | 'asm' | 'essos' | 'post' | 'sub';
export const ROLES: Role[] = ['aa', 'name', 'last', 'first', 'father', 'asm', 'essos', 'post', 'sub'];
export const ROLE_LABEL: Record<Role, string> = { aa: 'Α/Α', name: 'Ονοματεπώνυμο (σε ένα κελί)', last: 'Επώνυμο', first: 'Όνομα', father: 'Πατρώνυμο', asm: 'ΑΣΜ', essos: 'ΕΣΣΟ', post: 'Πόστο', sub: 'Ίλη / Λόχος' };
// το κλειδί του ρόλου στην αντιστοίχιση του Excel (SourceBinding.cols): οι τρεις τελευταίοι δεν διαβάζονται, μόνο δεν «σταματούν» τον πίνακα
export const ROLE_KEY: Record<Role, string> = { aa: 'aa', name: 'name', last: 'last', first: 'first', father: 'father', asm: 'asm', essos: 'dessos', post: 'dpost', sub: 'dsub' };
export interface GridCol { c: number; ref: string; text: string; role: Role | null; sure: boolean }
export interface DutyGrid {
  header: number;                // γραμμή με τις επικεφαλίδες των ονομάτων
  dayRow: number;                // γραμμή με τους αριθμούς των ημερών
  d1: number; days: number; dayCols: number[];
  left: GridCol[];               // στήλες πριν από τις μέρες, με επικεφαλίδα
  right: GridCol[];              // στήλες μετά τις μέρες (Σ, ΚΑ, ΕΤΑΠ… και τύποι): δεν διαβάζονται ούτε γράφονται
  rows: number[];                // γραμμές ατόμων
  namesRow: number;
}
const PERSON_ROLE: Record<string, Role> = { 'person:aa': 'aa', 'person:name': 'name', 'person:last': 'last', 'person:first': 'first', 'person:father': 'father', 'person:asm': 'asm', 'person:essos': 'essos', 'person:post': 'post', 'person:sub': 'sub' };
const FOOTER = /^(ΣΥΝΟΛΟ|ΣΥΝΟΛΑ|ΓΕΝΙΚΟ|ΑΘΡΟΙΣΜΑ|ΔΙΑΘΕΣΙΜΟΙ|ΥΠΗΡΕΣΙΕΣ|ΣΥΝΟΛΙΚΑ|ΤΕΛΟΣ)(\s|$)/;
const WEEKDAY = /^(Δ|Τ|Π|Σ|Κ|ΔΕ|ΤΡ|ΤΕ|ΠΕ|ΠΑ|ΣΑ|ΚΥ|ΔΕΥ|ΤΡΙ|ΤΕΤ|ΠΕΜ|ΠΑΡ|ΣΑΒ|ΚΥΡ)$/;   // μία ή δύο-τρία γράμματα ολόκληρο το κελί (όχι κωδικός υπηρεσίας που αρχίζει από τέτοιο γράμμα)
const txt = (sheet: RawSheet, r: number, c: number) => cellText((sheet.rows[r] || [])[c]);
const letters = (t: string) => /[Α-ΩA-Zα-ωa-z]/.test(t);

// Η πρώτη γραμμή με σειρά ημερών 1,2,3… (τουλάχιστον 28, η θέση μετράει όπως στο dutyDays)
function dayRowOf(sheet: RawSheet): { r: number; cols: number[] } | null {
  for (let r = 0; r < Math.min(sheet.rows.length, 80); r++) {
    const cols = dayColumns(sheet.rows[r]);
    if (cols.length < 28) continue;
    const row = sheet.rows[r]; let seq = 0; cols.forEach((c, i) => { if (dayNum(row[c]) === i + 1) seq++; });
    if (seq >= cols.length - 2) return { r, cols };
  }
  return null;
}
const isWeekdayRow = (sheet: RawSheet, r: number, cols: number[]) => { const row = sheet.rows[r] || []; const t = cols.map(c => cellText(row[c])).filter(Boolean); return t.length >= 5 && t.every(x => WEEKDAY.test(normW(x))); };
const normW = (x: string) => x.toUpperCase().replace(/[^Α-ΩA-Z]/g, '');

export interface GridOpts { lex?: Lexicon; cols?: Record<string, string> }   // cols: ρόλος → επικεφαλίδα που διάλεξε ο χρήστης
export function findDutyGrid(sheet: RawSheet, o: GridOpts = {}): DutyGrid | null {
  const lex = o.lex || buildLexicon(); const hit = dayRowOf(sheet); if (!hit) return null;
  const { r: dayRow, cols: dayCols } = hit; const d1 = dayCols[0]; const lastDay = dayCols[dayCols.length - 1];
  // επικεφαλίδα σε δύο γραμμές: τα ονόματα στη γραμμή των ημερών, από πάνω ή από κάτω
  const near = [dayRow, dayRow - 1, dayRow + 1].filter(r => r >= 0);
  const nLeft = (r: number) => { let n = 0; for (let c = 0; c < d1; c++) { const t = txt(sheet, r, c); if (t && letters(t)) n++; } return n; };
  const namesRow = near.reduce((best, r) => (nLeft(r) > nLeft(best) ? r : best), dayRow);
  const headText = (c: number) => { for (const r of [namesRow, ...near.filter(x => x !== namesRow)]) { const t = txt(sheet, r, c); if (t && !/^\d+$/.test(t)) return t; } return ''; };
  const left: GridCol[] = []; const taken = new Set<Role>();
  const want = o.cols || {};
  // ό,τι διάλεξε ο χρήστης (ρόλος → επικεφαλίδα) ισχύει πρώτο· «-επικεφαλίδα» = την αγνοεί. Οι υπόλοιπες από το λεξικό.
  const heads: { c: number; text: string }[] = [];
  for (let c = 0; c < d1; c++) { const text = headText(c); if (text) heads.push({ c, text }); }
  const byCol = new Map<number, Role>();
  for (const r of ROLES) if (want[r] != null) { const h = heads.find(x => phraseKey(x.text) === phraseKey(want[r]) && !byCol.has(x.c)); if (h) { byCol.set(h.c, r); taken.add(r); } }
  for (const h of heads) {
    let role: Role | null = byCol.get(h.c) ?? null, sure = role != null;
    if (!role && want['-' + phraseKey(h.text)] == null) {
      const m = lex.match(h.text, { kinds: ['person'] }); const rr = m.concept ? PERSON_ROLE[m.concept] : undefined;
      if (rr && !taken.has(rr)) { role = rr; sure = m.confidence === 'sure'; taken.add(rr); }
    }
    left.push({ c: h.c, ref: colLetter(h.c), text: h.text, role, sure });
  }
  const right: GridCol[] = [];
  for (let c = lastDay + 1; c < lastDay + 1 + 40; c++) { const t = headText(c); if (t) right.push({ c, ref: colLetter(c), text: t, role: null, sure: true }); }
  // γραμμές ατόμων: από κάτω από τις επικεφαλίδες ως το πρώτο σύνολο ή κενό διάστημα
  let first = Math.max(dayRow, namesRow) + 1;
  const named = (r: number) => left.some(x => (x.role === 'name' || x.role === 'last' || x.role === 'first') && letters(txt(sheet, r, x.c)));
  while (first < sheet.rows.length && first <= Math.max(dayRow, namesRow) + 2 && ((isWeekdayRow(sheet, first, dayCols) && !named(first)) || (!left.some(x => txt(sheet, first, x.c)) && !dayCols.some(c => txt(sheet, first, c))))) first++;
  const nameCols = left.filter(x => x.role === 'name' || x.role === 'last' || x.role === 'first').map(x => x.c);
  const aaCol = left.find(x => x.role === 'aa')?.c;
  const rows: number[] = []; let empty = 0;
  for (let r = first; r < sheet.rows.length; r++) {
    const name = nameCols.map(c => txt(sheet, r, c)).filter(Boolean).join(' ');
    const aa = aaCol != null ? txt(sheet, r, aaCol) : '';
    const anyLeft = left.some(x => txt(sheet, r, x.c));
    const anyDay = dayCols.some(c => txt(sheet, r, c));
    if (anyLeft && left.some(x => FOOTER.test(phraseKey(txt(sheet, r, x.c))))) break;
    const person = (name && letters(name)) || (/^\d+$/.test(aa) && +aa > 0) || (!nameCols.length && anyLeft && anyDay);
    if (person) { rows.push(r); empty = 0; continue; }
    if (anyLeft && letters(left.map(x => txt(sheet, r, x.c)).join(' '))) break;   // τίτλος ή σύνολα κάτω από τον πίνακα
    if (!anyLeft && !anyDay) { if (++empty > 4) break; continue; }
    empty = 0;
  }
  return { header: namesRow, dayRow, d1, days: dayCols.length, dayCols, left, right, rows, namesRow };
}

// ------------------------------------------------------------------ η αντιστοίχιση στο Excel (SourceBinding) από το πλέγμα
export function gridBinding(g: DutyGrid, file: string, sheet: string): SourceBinding {
  const cols: Record<string, number> = {};
  for (const x of g.left) if (x.role && cols[ROLE_KEY[x.role]] == null) cols[ROLE_KEY[x.role]] = x.c;
  cols.d1 = g.d1;
  return { file, sheet, header: g.header, cols, write: true, scope: 'active', unit: true };
}
// Αρκεί το δικό μας διάβασμα (πρότυπες επικεφαλίδες) για αυτό το φύλλο; Μόνο τότε μένει όπως είναι.
function standardWorks(sheet: RawSheet, std: { header: number; cols: Record<string, number> }): boolean {
  if (missingFields('duties', std.cols).length) return false;
  const b = { file: '', sheet: sheet.name, header: std.header, cols: std.cols };
  return dutyDays(sheet, b).length >= 28 && tableRows(sheet, std.header, std.cols).records.length > 0;
}
export interface DutyPick { sheet: string; header: number; cols: Record<string, number>; unit?: boolean }
// Ποιος πίνακας του αρχείου είναι ο έλεγχος υπηρεσιών: πρώτα όπως πάντα· αν το πρότυπο διάβασμα δεν δουλεύει, το πλέγμα της μονάδας
export function pickDuties(sheets: RawSheet[], o: { lex?: Lexicon } = {}): DutyPick | null {
  const std = bestFor('duties', sheets);
  if (std) { const sh = sheets.find(s => s.name === std.sheet)!; if (standardWorks(sh, std)) return std; }
  let best: { g: DutyGrid; sheet: string } | null = null;
  for (const sh of sheets) { const g = findDutyGrid(sh, o); if (g && g.rows.length && (!best || g.rows.length > best.g.rows.length)) best = { g, sheet: sh.name }; }
  if (!best) return std;
  const b = gridBinding(best.g, '', best.sheet); return { sheet: best.sheet, header: b.header, cols: b.cols, unit: true };
}

// ------------------------------------------------------------------ το λεξιλόγιο: κάθε κωδικός στα κελιά των ημερών
export interface CodeStat { text: string; key: string; n: number; people: number }
export interface Vocab { codes: CodeStat[]; numbers: number; cells: number; composite: number }
export function collectCodes(sheet: RawSheet, g: Pick<DutyGrid, 'rows' | 'dayCols'>): Vocab {
  const by = new Map<string, { spell: Map<string, number>; n: number; who: Set<number> }>(); let numbers = 0, cells = 0, composite = 0;
  for (const r of g.rows) for (const c of g.dayCols) {
    const raw = txt(sheet, r, c); if (!raw) continue; cells++;
    if (/^\d+([.,]\d+)?$/.test(raw)) { numbers++; continue; }
    const parts = raw.includes('/') && raw.split('/').every(p => p.trim() && !/\s/.test(p.trim())) ? raw.split('/').map(p => p.trim()) : [raw];
    if (parts.length > 1) composite++;
    for (const t of parts) {
      const k = codeKey(t); if (!k) continue;
      const e = by.get(k) || { spell: new Map(), n: 0, who: new Set<number>() }; e.n++; e.who.add(r); e.spell.set(t, (e.spell.get(t) || 0) + 1); by.set(k, e);
    }
  }
  const codes = [...by].map(([key, e]) => ({ text: [...e.spell].sort((a, b) => b[1] - a[1])[0][0], key, n: e.n, people: e.who.size })).sort((a, b) => b.n - a.n || a.text.localeCompare(b.text, 'el'));
  return { codes, numbers, cells, composite };
}

// ------------------------------------------------------------------ τι πιστεύει η εφαρμογή για έναν κωδικό
export type Sureness = 'sure' | 'suggest' | 'unknown';
export interface Guess { meaning: DutyMeaning | null; sure: Sureness; why: string }
const OWN_STATUS: [string[], string, string, Sureness][] = [
  [['ΑΠΟΛΥΣΗ', 'ΑΠΟΛ', 'ΑΠΟΛΥΣΗ ΣΤΡΑΤΙΩΤΗ'], 'own:ΑΠΟΛΥΣΗ', 'Απόλυση', 'sure'],
  [['ΑΔΕΙΑ ΑΠΟΛΥΣΕΩΣ', 'ΑΔΕΙΑ ΑΠΟΛΥΣΗΣ', 'ΑΔ ΑΠΟΛΥΣΕΩΣ', 'ΑΔΕΙΑ ΑΠΟΛΥΣΕΩΣ ΣΤΡΑΤΙΩΤΗ'], 'own:ΑΔΕΙΑ ΑΠΟΛΥΣΕΩΣ', 'Άδεια απόλυσης', 'sure'],
  [['Κ'], 'status:ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ', 'Κανονική άδεια', 'suggest']
];
const PREFIX_KINDS: Record<string, 'kind' | 'status'> = { service: 'kind', post: 'status', status: 'status' };
export interface GuessCtx { settings: Settings; lex: Lexicon }
const looksText = (t: string) => /[+,;()]/.test(t) || /\s\S+\s/.test(t) || t.length > 14 || (/\d/.test(t) && /\s/.test(t));
export function guessCode(text: string, ctx: GuessCtx): Guess {
  const { settings, lex } = ctx; const pk = phraseKey(text);
  const mk = (m: DutyMeaning, sure: Sureness, why: string): Guess => ({ meaning: m, sure, why });
  // 1. ακριβώς ο κωδικός μιας θέσης της εφαρμογής (Θ1α)
  const seat = seatOfCode(settings, text); if (seat) return mk({ t: 'seat', k: seat.k, text }, 'sure', 'κωδικός θέσης της εφαρμογής');
  // 2. οι λέξεις των καταστάσεων που ξέρει ο κατάλογος
  for (const [words, id, name, sure] of OWN_STATUS) if (words.includes(pk)) return mk({ t: 'status', id, name, text }, sure, sure === 'sure' ? 'λέξη κατάστασης' : 'μοιάζει με «' + name + '»');
  const st = lex.match(text, { kinds: ['status'] });
  if (st.concept && st.confidence === 'sure') return mk({ t: 'status', id: st.concept, name: lex.label(st.concept), text }, 'sure', 'λέξη κατάστασης');
  // 3. ελεύθερο κείμενο («6ΤΙΜ + 4ΚΑ», «ΛΑΦ …»): δεν είναι κωδικός υπηρεσίας
  if (looksText(text)) return mk({ t: 'ignore', text }, 'suggest', 'ελεύθερο κείμενο, όχι κωδικός');
  if (st.concept && st.confidence === 'suggest') return mk({ t: 'status', id: st.concept, name: lex.label(st.concept), text }, 'suggest', 'μοιάζει με «' + lex.label(st.concept) + '»');
  // 4. γράμμα υπηρεσίας με αριθμό (Θ1, Θ2Δ, Μ3): μοιάζει με υπηρεσία αυτού του είδους, χωρίς θέση
  const m = /^([Α-ΩA-Z]{1,3})\s*(\d{1,2}\s*[Α-Ωα-ω]?)?$/.exec(pk);
  if (m) { const d = dutyCode(m[1]); if (d && !d.pref && !(m[2] && m[1].length === 3)) return mk({ t: 'kind', kind: d.kind, text }, 'suggest', 'μοιάζει με ' + KIND_NAME[d.kind]); if (d?.pref) return mk({ t: 'seat', k: d.pref, text }, 'suggest', 'μοιάζει με ' + (d.pref === 'ly' ? 'Λ/Υ' : 'Δ/Υ')); }
  // 5. συντομογραφία ενός και μόνο ονόματος που ξέρει ο κατάλογος (ΕΣΤ → Εστιάτορας)
  if (/^[Α-Ω]{3,}$/.test(pk)) {
    const found = new Map<string, string>();
    for (const c of lex.concepts.values()) { if (!PREFIX_KINDS[c.kind]) continue; if ([...c.names, ...(c.weak || [])].some(n => { const k = phraseKey(n); return k.length > pk.length && k.startsWith(pk); })) found.set(c.id, c.kind); }
    if (found.size === 1) {
      const [id, kind] = [...found][0];
      return PREFIX_KINDS[kind] === 'kind' ? mk({ t: 'kind', kind: 'other', text }, 'suggest', 'μοιάζει με «' + lex.label(id) + '»') : mk({ t: 'status', id, name: lex.label(id), text }, 'suggest', 'μοιάζει με «' + lex.label(id) + '»');
    }
  }
  return { meaning: null, sure: 'unknown', why: 'δεν το ξέρω' };
}

// ------------------------------------------------------------------ επιλογές στη λίστα της οθόνης
export const meaningValue = (m: DutyMeaning | null | undefined): string => (!m ? '' : m.t === 'seat' ? 'seat:' + m.k : m.t === 'kind' ? 'kind:' + m.kind : m.t === 'status' ? 'status:' + m.id : 'ignore');
export interface MeaningOpt { value: string; label: string; group: string }
export function meaningOptions(settings: Settings, lex: Lexicon, extra: DutyMeaning[] = []): MeaningOpt[] {
  const out: MeaningOpt[] = [];
  for (const p of allPosts(settings)) out.push({ value: 'seat:' + p.k, label: p.label + (p.code ? ' (' + p.code + ')' : ''), group: 'Θέση της εφαρμογής' });
  for (const k of Object.keys(KIND_NAME) as DutyKind[]) if (k !== 'ly') out.push({ value: 'kind:' + k, label: KIND_NAME[k] + ' (χωρίς θέση)', group: 'Υπηρεσία χωρίς θέση' });
  const seen = new Set<string>();
  for (const c of lex.concepts.values()) if ((c.kind === 'status' && c.id !== 'status:ΠΑΡΩΝ') || c.kind === 'post') { seen.add(c.id); out.push({ value: 'status:' + c.id, label: c.label, group: 'Κατάσταση ή πόστο (όχι υπηρεσία)' }); }
  for (const m of [...extra, ...OWN_STATUS.map(([, id, name, , ]) => ({ t: 'status' as const, id, name, text: '' }))]) if (m.t === 'status' && !seen.has(m.id) && m.id.startsWith('own:')) { seen.add(m.id); out.push({ value: 'status:' + m.id, label: m.name, group: 'Κατάσταση ή πόστο (όχι υπηρεσία)' }); }
  out.push({ value: 'ignore', label: 'Δεν είναι υπηρεσία: το αφήνω όπως είναι', group: 'Αγνόησε' });
  return out;
}
// η επιλογή της λίστας → έννοια (η νέα υπηρεσία / κατάσταση φτιάχνονται χωριστά, δες ChoiceNew)
export function meaningOf(value: string, text: string, settings: Settings, lex: Lexicon, names: Record<string, string> = {}): DutyMeaning | null {
  if (value === 'ignore') return { t: 'ignore', text };
  if (value.startsWith('seat:')) return allPosts(settings).some(p => p.k === value.slice(5)) ? { t: 'seat', k: value.slice(5), text } : null;
  if (value.startsWith('kind:')) return KIND_NAME[value.slice(5) as DutyKind] ? { t: 'kind', kind: value.slice(5), text } : null;
  if (value.startsWith('status:')) { const id = value.slice(7); return { t: 'status', id, name: names[id] || lex.label(id) || id.replace(/^own:/, ''), text }; }
  return null;
}
// δημιουργία: νέα υπηρεσία (θέση που φτιάχνεται στο μπλοκ «άλλη υπηρεσία») ή νέα κατάσταση
export const NEW_PREFIX = '@new:';
export interface NewService { name: string; code: string }

// ------------------------------------------------------------------ το μοντέλο της οθόνης
export interface ColView extends GridCol { value: string; label: string }
export interface CodeView {
  text: string; key: string; n: number; people: number;
  state: Sureness | 'mine'; value: string; to: string;     // value: η τρέχουσα απάντηση (προφίλ ή σίγουρη)· '' = καμία
  suggest: string; suggestText: string; why: string; saved: boolean;
}
export interface DutyModel {
  found: boolean; sheet: string; header: number; month: string | null;
  grid: DutyGrid | null; cols: ColView[]; codes: CodeView[]; vocab: Vocab;
  count: { sure: number; suggest: number; unknown: number; mine: number }; needs: boolean;
  options: MeaningOpt[]; roleOptions: { value: string; label: string }[];
  binding: SourceBinding | null;
}
export interface ModelIn { settings: Settings; profile: TplProfile | null; file: string; today: ISODate; sheet: RawSheet; cols?: Record<string, string> }
const meaningText = (m: DutyMeaning, settings: Settings): string => (m.t === 'seat' ? (allPosts(settings).find(p => p.k === m.k)?.label || m.k) : m.t === 'kind' ? KIND_NAME[m.kind as DutyKind] + ' (χωρίς θέση)' : m.t === 'status' ? m.name + ' (όχι υπηρεσία)' : 'Δεν είναι υπηρεσία');
export function buildDutyModel(o: ModelIn): DutyModel {
  const lex = buildLexicon({ lists: o.settings.lists }); const prof = o.profile?.duty;
  const g = findDutyGrid(o.sheet, { lex, cols: o.cols ?? prof?.cols });
  const options = meaningOptions(o.settings, lex, Object.values(prof?.codes || {}));
  const roleOptions = [{ value: '', label: 'Δεν χρειάζεται (αγνόησέ την)' }, ...ROLES.map(r => ({ value: r, label: ROLE_LABEL[r] }))];
  const base: DutyModel = { found: !!g, sheet: o.sheet.name, header: g?.header ?? 0, month: null, grid: g, cols: [], codes: [], vocab: { codes: [], numbers: 0, cells: 0, composite: 0 }, count: { sure: 0, suggest: 0, unknown: 0, mine: 0 }, needs: false, options, roleOptions, binding: null };
  if (!g) return { ...base, needs: true };
  const b = gridBinding(g, o.file, o.sheet.name);
  base.binding = b; base.month = bindingMonth(o.sheet, b, o.today);
  base.cols = [...g.left, ...g.right].map(x => ({ ...x, value: x.role || '', label: x.role ? ROLE_LABEL[x.role] : '' }));
  const vocab = collectCodes(o.sheet, g); base.vocab = vocab;
  for (const c of vocab.codes) {
    const saved = prof?.codes[c.key]; const guess = guessCode(c.text, { settings: o.settings, lex });
    const v: CodeView = { text: c.text, key: c.key, n: c.n, people: c.people, state: 'unknown', value: '', to: '', suggest: '', suggestText: '', why: guess.why, saved: !!saved };
    if (saved) { v.state = 'mine'; v.value = meaningValue(saved); v.to = meaningText(saved, o.settings); }
    else if (guess.meaning && guess.sure === 'sure') { v.state = 'sure'; v.value = meaningValue(guess.meaning); v.to = meaningText(guess.meaning, o.settings); }
    else if (guess.meaning) { v.state = 'suggest'; v.suggest = meaningValue(guess.meaning); v.suggestText = meaningText(guess.meaning, o.settings); }
    base.codes.push(v); base.count[v.state]++;
  }
  base.needs = base.count.suggest + base.count.unknown > 0 || !o.profile;
  return base;
}

// ------------------------------------------------------------------ το προφίλ από τις επιλογές
// choices: κωδικός (codeKey) → η έννοια που διάλεξε ο χρήστης (null = σβήσε την παλιά)· οι σίγουρες απαντήσεις μπαίνουν από μόνες τους
export function dutyProfileFrom(m: DutyModel, o: { prev: TplProfile | null; choices: Record<string, DutyMeaning | null>; cols?: Record<string, string> }): TplProfile {
  const codes: Record<string, DutyMeaning> = { ...(o.prev?.duty?.codes || {}) };
  for (const c of m.codes) {
    const ch = o.choices[c.key];
    if (ch === null) { delete codes[c.key]; continue; }
    if (ch) { codes[c.key] = { ...ch, text: c.text }; continue; }
    if (!codes[c.key] && c.state === 'sure') { const mm = meaningFromValue(c.value, c.text, m); if (mm) codes[c.key] = mm; }
  }
  const cols = o.cols ?? o.prev?.duty?.cols;
  const duty: DutyProfile = { codes, ...(cols && Object.keys(cols).length ? { cols } : {}) };
  return { ...(o.prev || { v: PROFILE_VERSION, id: DUTY_PROFILE_ID, kind: 'duties' as const, name: 'Έλεγχος υπηρεσιών', fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [] }), duty };
}
function meaningFromValue(value: string, text: string, m: DutyModel): DutyMeaning | null {
  if (value === 'ignore') return { t: 'ignore', text };
  if (value.startsWith('seat:')) return { t: 'seat', k: value.slice(5), text };
  if (value.startsWith('kind:')) return { t: 'kind', kind: value.slice(5), text };
  if (value.startsWith('status:')) { const id = value.slice(7); return { t: 'status', id, name: m.options.find(x => x.value === value)?.label || id, text }; }
  return null;
}
// τα ονόματα των στηλών που διάλεξε ο χρήστης (ρόλος → επικεφαλίδα)
export function colsByRole(cols: ColView[], pick: Record<number, Role | ''> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of cols) {
    const r = x.c in pick ? pick[x.c] : x.role;
    if (r && !(r in out)) out[r] = x.text; else if (!r && x.role) out['-' + phraseKey(x.text)] = x.text;
  }
  return out;
}

// Το πλέγμα μετακινήθηκε στο φύλλο (γραμμές ή στήλες από πάνω/αριστερά): η αντιστοίχιση ακολουθεί, μόνο όταν η παλιά θέση δεν δουλεύει πια
export function relocateUnit(sheet: RawSheet, b: SourceBinding, o: GridOpts = {}): SourceBinding {
  if (!b.unit || b.cols.d1 == null) return b;
  if (dutyDays(sheet, b).length >= 28 && tableRows(sheet, b.header, b.cols).records.length > 0) return b;
  const g = findDutyGrid(sheet, o); if (!g || !g.rows.length) return b;
  const nb = gridBinding(g, b.file, b.sheet); const cols: Record<string, number> = { d1: nb.cols.d1 };
  for (const k of Object.keys(b.cols)) if (k !== 'd1') cols[k] = nb.cols[k] ?? b.cols[k];
  return { ...b, header: nb.header, cols };
}

// Πόσοι κωδικοί του φύλλου δεν έχουν ακόμα νόημα στο προφίλ (για το «Αντιστοίχιση…» δίπλα στο αρχείο)
export function unresolvedCodes(sheet: RawSheet, b: SourceBinding, settings: Settings): number {
  const rows = tableRows(sheet, b.header, b.cols).records.map(r => r.r);
  const known = dutyProfileOf(settings)?.duty?.codes || {};
  return collectCodes(sheet, { rows, dayCols: dutyDays(sheet, b) }).codes.filter(c => !known[c.key]).length;
}

// ------------------------------------------------------------------ η δοκιμή
export interface Trial {
  people: { rows: number; matched: number; unmatched: string[] };
  days: number; cells: number; numbers: number;
  read: { adds: number; same: number; future: number; errors: number; unknown: string[] };
  meanings: { label: string; n: number }[];
  write: { cells: number; people: number; warn: string[]; notFound: string[] };
  month: string | null;
}
export function dutyTrial(sheet: RawSheet, b: SourceBinding, s: AppState, today: ISODate): Trial {
  const su = withUnit(s, { unit: true }); const month = bindingMonth(sheet, b, today);
  const sp = sheetPeople(sheet, b, su.people, {});
  const records = tableRows(sheet, b.header, b.cols).records; const cols = dutyDays(sheet, b);
  const vocab = collectCodes(sheet, { rows: records.map(r => r.r), dayCols: cols });
  const t: Trial = { people: { rows: records.length, matched: sp.rows.length, unmatched: sp.unmatched.map(x => x.who) }, days: cols.length, cells: vocab.cells, numbers: vocab.numbers,
    read: { adds: 0, same: 0, future: 0, errors: 0, unknown: [] }, meanings: [], write: { cells: 0, people: 0, warn: [], notFound: [] }, month };
  const by = new Map<string, number>(); const cfg = su.settings.unitCodes || {};
  for (const c of vocab.codes) {
    const al = cfg[c.key]; const lab = al === undefined ? 'Δεν ξέρω τι σημαίνει' : al === 'ignore' ? 'Δεν είναι υπηρεσία' : al === 'abs' ? 'Κατάσταση (όχι υπηρεσία)' : al.startsWith('kind:') ? KIND_NAME[al.slice(5) as DutyKind] + ' (χωρίς θέση)' : (allPosts(su.settings).find(p => p.k === al)?.label || al);
    by.set(lab, (by.get(lab) || 0) + c.n);
  }
  t.meanings = [...by].map(([label, n]) => ({ label, n })).sort((a, b2) => b2.n - a.n);
  if (month) {
    const p = planDuties(sheet, b, s, month, today);
    t.read = { adds: p.changes, same: p.same, future: p.future.length, errors: p.errors.length, unknown: p.unknown };
    const w = planDutiesWrite(sheet, b, s, today);
    t.write = { cells: w.sets.length, people: w.changed, warn: w.warn || [], notFound: w.notFound };
  }
  return t;
}
export type { Person };
