// Λίστες ΑΛΛΗΣ μονάδας (πρότυπα άλλων μονάδων, 3β). Καθαρές συναρτήσεις πάνω στο μοντέλο φύλλου (sheetModel.ts), χωρίς αρχεία:
//   Κατάσταση υπηρεσιών ΣΕ ΛΙΣΤΑ (svc*): η λέξη της θέσης στην πρώτη γραμμή κάθε μπλοκ, από κάτω τα νούμερα (1ο, 2ο…), ίσως στήλη βάρδιας (Φ/Κ),
//     και οι στήλες βαθμού / ονοματεπωνύμου που βρίσκονται από τα ΔΕΔΟΜΕΝΑ (η επικεφαλίδα μπορεί να είναι μετατοπισμένη).
//   Εξοδούχοι / Αδειούχοι δίπλα δίπλα (outs*): δύο λίστες με δικές τους στήλες, από τις λέξεις των επικεφαλίδων.
//   Θαλαμιζόμενοι με VLOOKUP (rooms*): τα κελιά-κλειδιά που διαβάζουν οι τύποι της μονάδας πάνω σε λίστα δεδομένων· γράφονται ΜΟΝΟ τα κλειδιά.
// Τίποτα δεν γράφεται εδώ: βγαίνει λίστα PlannedWrite για το safeWrite (ποτέ πάνω σε τύπο, ετικέτα ή παιδί συγχώνευσης).
import { Grid, key as cellKey, type SheetModel } from './sheetModel';
import { buildLexicon, type Lexicon } from './lexicon';
import { normGreek, upper } from './text';
import { blocksOf, blockGroups, coversDay, fullName, groupKey, TYPES, type AppState, type BlockDef, type Person, type Post, type PostDef, type Status, type TypeKey } from './domain';
import { seatMap, activePeople, dutyMin } from './rules';
import { isAway, rankTxt } from './ranks';
import { backBy } from './hours';
import { dmy, type ISODate } from './dates';
import { Evaluator, UNSUPPORTED, type Val } from './sheetEval';
import type { ListProfile, TplProfile } from './tplStore';

export interface Write { sheet: string; r: number; c: number; value: string | number | null; exact?: boolean; over?: string }
export type Sure = 'sure' | 'suggest' | 'unknown';
export const NEW_SVC = '@new:';
const nk = (v: unknown): string => normGreek(v == null ? '' : v instanceof Date ? '' : String(v)).replace(/\s+/g, ' ').trim();
const txt = (v: unknown): string => (v == null || v instanceof Date ? (v instanceof Date ? 'DATE' : '') : String(v)).trim();
const NUM_LABEL = /^(\d{1,2})\s*(Ο|ΟΣ|Η|ΗΣ|ΟΥ|\.)?$/;
const TIMEY = /\d{1,2}\s*[:.]\s*\d{2}|ΩΡΗ\b|^\d+\s*ΩΡ|^ΗΜΕΡΑ$|^ΝΥΧΤΑ$|ΒΑΡΔΙΑ/;
const lexOf = (lex?: Lexicon) => lex ?? buildLexicon();
const ORIGIN = /^(ΕΠΟΠ|ΟΒΑ|ΣΜΥ|ΣΣΕ|ΕΜΘ)\s+/;
// Μοιάζει με βαθμό («ΣΤΡ(ΤΘ)», «ΕΠΟΠ ΑΛΧΙΑΣ», «ΥΠΛΧΟΣ»); το πρόθεμα προέλευσης και η ειδικότητα σε παρένθεση δεν μετρούν
export function rankLike(lex: Lexicon, t: string): boolean {
  const x = nk(t).replace(/\(.*?\)/g, ' ').replace(ORIGIN, '').replace(/\s+/g, ' ').trim(); if (!x || x.length > 24 || /\d/.test(x)) return false;
  const m = lex.match(x, { kinds: ['rank'] }); if (m.concept && m.confidence !== 'unknown') return true;
  return /^(ΣΤΡ|ΔΝΕΑΣ|ΥΔΝΕΑΣ|ΛΧΙΑΣ|ΕΠΛΧΙΑΣ|ΕΠΧΙΑΣ|ΑΛΧΙΑΣ|ΑΡΧ|ΑΝΘΣΤΗΣ|ΑΝΘΛΧΟΣ|ΑΝΘΛΓΟΣ|ΑΝΘΥΠΙΛΑΡΧΟΣ|ΥΠΛΧΟΣ|ΥΠΛΧΓΟΣ|ΙΛΧΟΣ|ΛΧΓΟΣ|ΙΛΑΡΧΟΣ|ΕΠΙΛΑΡΧΟΣ|ΤΑΞΧΟΣ|ΣΥΝΤΑΓΜΑΤΑΡΧΗΣ|ΛΓΟΣ|ΑΝΘΛΓ|ΣΜΙΝΑΡΧΟΣ|ΑΡΧΙΛΟΧΙΑΣ|ΛΟΧΙΑΣ|ΔΕΚΑΝΕΑΣ|ΣΤΡΑΤΙΩΤΗΣ)$/.test(x);
}
const nameLike = (lex: Lexicon, t: string): boolean => { const x = nk(t); return x.length >= 3 && /\p{L}{2}/u.test(x) && !TIMEY.test(x) && !NUM_LABEL.test(x) && !rankLike(lex, t) && !/^(ΩΡΕΣ|ΩΡΗ|ΝΟ|Α\/Α|ΒΑΘΜΟΣ|ΟΝΟΜΑΤΕΠΩΝΥΜΟ)$/.test(x); };

// ------------------------------------------------------------------ κοινά: στήλες
export type ColHow = 'sure' | 'suggest' | 'unknown';
export interface ColPick { c: number | null; how: ColHow; head: number | null; data: number | null }   // head: από την επικεφαλίδα· data: από τα δεδομένα
const mergeStart = (g: Grid, r: number, c: number): number => { const m = g.mergeOf(r, c); return m && m.r1 === r ? m.c1 : c; };

// ------------------------------------------------------------------ ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΣΕ ΛΙΣΤΑ
export type SvcRole = 'label' | 'num' | 'hours' | 'shift' | 'rank' | 'name';
export const SVC_ROLES: SvcRole[] = ['num', 'hours', 'shift', 'rank', 'name'];
export const SVC_ROLE_LABEL: Record<SvcRole, string> = { label: 'Θέση (λέξη του μπλοκ)', num: 'Νούμερο (1ο, 2ο…)', hours: 'Ώρες', shift: 'Βάρδια (Φ/Κ…)', rank: 'Βαθμός', name: 'Ονοματεπώνυμο' };
export interface SvcRow { r: number; num: number | null; shift: string }
export interface SvcBlock { key: string; label: string; occ: number; r: number; rows: SvcRow[]; groups: number[][] }   // groups: ευρετήρια μέσα στο rows (μία ομάδα = ένα νούμερο, ζεύγος Φ/Κ μαζί)
export interface SvcSheet { sheet: string; header: number; title: number | null; sig: number | null; end: number; cols: Record<SvcRole, ColPick>; blocks: SvcBlock[] }

const headCol = (g: Grid, sh: SheetModel, hr: number, re: RegExp): number | null => {
  const row = sh.rows[hr] || [];
  for (let c = 0; c < row.length; c++) { const t = nk(row[c]); if (t && re.test(t)) return mergeStart(g, hr, c); }
  return null;
};
export function svcHeaderRow(sh: SheetModel): number | null {
  for (let r = 0; r < Math.min(sh.rows.length, 40); r++) {
    const ts = (sh.rows[r] || []).map(nk);
    if (ts.some(t => /^ΟΝΟΜΑΤΕΠ/.test(t)) && ts.some(t => /^ΒΑΘΜ/.test(t) || /^(ΝΟ|Α\/Α|ΑΑ)$/.test(t))) return r;
  }
  return null;
}
export function detectSvc(sh: SheetModel, o: { lex?: Lexicon; cols?: Record<string, number> } = {}): SvcSheet | null {
  const lex = lexOf(o.lex); const g = new Grid(sh);
  const hr = svcHeaderRow(sh); if (hr == null) return null;
  let title: number | null = null;
  for (let r = 0; r < hr; r++) if ((sh.rows[r] || []).some(v => /^ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ/.test(nk(v)))) title = r;
  // υπογραφές: η πρώτη γραμμή με κελί «Ο» / «Η» / «ΤΟ» μόνο του
  let sig: number | null = null;
  for (let r = hr + 1; r < sh.rows.length && sig == null; r++) if ((sh.rows[r] || []).some(v => /^(Ο|Η|ΤΟ|ΟΙ)$/.test(nk(v)))) sig = r;
  const end = sig ?? sh.rows.length;
  // φύλλο με τύπους στις στήλες βαθμού/ονόματος (λίστα θαλαμιζομένων που τραβά τους ανθρώπους από άλλο φύλλο) δεν είναι λίστα για γράψιμο
  { const hc = [headCol(g, sh, hr, /^ΒΑΘΜ/), headCol(g, sh, hr, /^ΟΝΟΜΑΤΕΠ/)].filter((x): x is number => x != null); let f = 0, n = 0;
    for (let r = hr + 1; r < end; r++) for (const c of hc) { if (sh.fx.has(cellKey(r, c))) { f++; n++; } else if (txt(sh.rows[r]?.[c]) !== '') n++; }
    if (n >= 4 && f / n >= 0.5) return null; }
  const width = sh.rows.reduce((w, row) => Math.max(w, row ? row.length : 0), 0);
  const cell = (r: number, c: number) => txt(sh.rows[r]?.[c]);
  // η στήλη της λέξης θέσης: αριστερά, με τα περισσότερα κείμενα που δεν είναι νούμερα, ώρες ή βαθμοί
  const labelish = (r: number, c: number) => { const t = cell(r, c); return !!t && t !== 'DATE' && !NUM_LABEL.test(nk(t)) && !TIMEY.test(nk(t)) && !rankLike(lex, t) && /\p{L}/u.test(t); };
  const cnt: number[] = []; for (let c = 0; c < Math.min(width, 4); c++) { let n = 0; for (let r = hr + 1; r < end; r++) if (labelish(r, c)) n++; cnt.push(n); }
  const mx = Math.max(0, ...cnt); if (mx < 2) return null;
  const labelCol = o.cols?.label ?? cnt.findIndex(n => n >= Math.max(2, mx * 0.6));
  // μπλοκ: γραμμή με λέξη στη στήλη θέσης· οι γραμμές από κάτω (χωρίς λέξη) είναι θέσεις του
  const anyIn = (r: number, skip: number) => (sh.rows[r] || []).some((v, c) => c !== skip && txt(v) !== '');
  const blocks: SvcBlock[] = []; const occ = new Map<string, number>();
  const start = (label: string, r: number) => { const k = nk(label).replace(/[^\p{L}\d/ ]/gu, ' ').replace(/\s+/g, ' ').trim(); const n = (occ.get(k) || 0) + 1; occ.set(k, n); blocks.push({ key: k, label: label.trim().replace(/\s+/g, ' '), occ: n, r, rows: [], groups: [] }); };
  for (let r = hr + 1; r < end; r++) {
    const t = cell(r, labelCol);
    if (labelish(r, labelCol)) start(t, r);
    if (!blocks.length) continue;
    if (!anyIn(r, labelCol) && !labelish(r, labelCol)) continue;     // κενή γραμμή (διαχωριστικό)
    blocks[blocks.length - 1].rows.push({ r, num: null, shift: '' });
  }
  const rowsAll = blocks.flatMap(b => b.rows.map(x => x.r));
  const colScore = (c: number, f: (t: string) => boolean) => { let n = 0, tot = 0; for (const r of rowsAll) { const t = cell(r, c); if (!t) continue; tot++; if (f(t)) n++; } return { n, tot }; };
  const best = (f: (t: string) => boolean, skip: number[]): number | null => { let bc: number | null = null, bn = 0; for (let c = 0; c < width; c++) { if (skip.includes(c)) continue; const { n } = colScore(c, f); if (n > bn) { bn = n; bc = c; } } return bc; };
  const numC = o.cols?.num ?? best(t => NUM_LABEL.test(nk(t)), [labelCol]);
  const shiftC = o.cols?.shift ?? best(t => /^[ΑΒΓΔΦΚΝΠ]$/.test(nk(t)), [labelCol, numC ?? -1]);
  const hoursC = o.cols?.hours ?? best(t => TIMEY.test(nk(t)), [labelCol, numC ?? -1, shiftC ?? -1]);
  // βαθμός και όνομα: από τα δεδομένα, με την επικεφαλίδα ως υπόδειξη. Διαφωνία = Πρόταση, όχι Σίγουρο.
  const g0 = g;
  const rankH = headCol(g0, sh, hr, /^ΒΑΘΜ/), nameH = headCol(g0, sh, hr, /^ΟΝΟΜΑΤΕΠ/);
  const used = [labelCol, numC ?? -1, shiftC ?? -1, hoursC ?? -1];
  const rankData = (() => { let bc: number | null = null, bs = 0; for (let c = 0; c < width; c++) { if (used.includes(c)) continue; const { n, tot } = colScore(c, t => rankLike(lex, t)); if (n >= 2 && n / tot >= 0.6 && n > bs) { bs = n; bc = c; } } return bc; })();
  const nameData = (() => { let bc: number | null = null, bs = 0; for (let c = 0; c < width; c++) { if (used.includes(c) || c === rankData) continue; const { n, tot } = colScore(c, t => nameLike(lex, t) && !blocks.some(b => nk(b.label) === nk(t))); if (n >= 2 && n / tot >= 0.6 && n > bs) { bs = n; bc = c; } } return bc; })();
  const pick = (user: number | undefined, head: number | null, data: number | null): ColPick => {
    if (user != null) return { c: user, how: 'sure', head, data };
    if (data != null && head != null) return { c: data, how: data === head ? 'sure' : 'suggest', head, data };
    if (data != null) return { c: data, how: 'suggest', head, data };
    if (head != null) return { c: head, how: 'suggest', head, data };
    return { c: null, how: 'unknown', head, data };
  };
  const rank = pick(o.cols?.rank, rankH, rankData);
  // το όνομα: αν η επικεφαλίδα του και τα δεδομένα συμφωνούν ή τα δεδομένα είναι άδεια (άγραφο πρότυπο) και η επικεφαλίδα δεν πέφτει πάνω στο βαθμό: Σίγουρο
  let name = pick(o.cols?.name, nameH, nameData);
  if (o.cols?.name == null && nameData == null && nameH != null && nameH !== rank.c && !used.includes(nameH)) name = { c: nameH, how: rank.how === 'sure' ? 'sure' : 'suggest', head: nameH, data: null };
  if (rank.c != null && name.c === rank.c) name.how = 'unknown';
  // οι γραμμές των θέσεων: νούμερο, βάρδια, ομάδες
  for (const b of blocks) {
    let prev = 0;
    for (const x of b.rows) {
      const n = numC != null ? NUM_LABEL.exec(nk(cell(x.r, numC))) : null; x.num = n ? Number(n[1]) : null;
      x.shift = shiftC != null ? nk(cell(x.r, shiftC)) : '';
    }
    // ο αριθμός που ξαναρχίζει από 1 σε νέο μπλοκ με την ίδια λέξη (ΠΕΡΙΠ… 1ο 2ο, 1ο 2ο): δεύτερο μπλοκ της ίδιας λέξης
    const out: SvcBlock[] = []; let part: SvcRow[] = [];
    for (const x of b.rows) { if (x.num != null && prev && x.num <= prev && part.length) { out.push({ ...b, rows: part, groups: [] }); part = []; } if (x.num != null) prev = x.num; part.push(x); }
    out.push({ ...b, rows: part, groups: [] });
    if (out.length > 1) { const at = blocks.indexOf(b); blocks.splice(at, 1, ...out); }
    else b.rows = part;
  }
  // occ ξανά (τα μπλοκ που χωρίστηκαν) και ομάδες
  const occ2 = new Map<string, number>();
  for (const b of blocks) {
    b.occ = (occ2.get(b.key) || 0) + 1; occ2.set(b.key, b.occ);
    const gs: number[][] = [];
    b.rows.forEach((x, i) => {
      const pair = gs.length && x.num == null && x.shift !== '' && b.rows[gs[gs.length - 1][0]].shift !== '';
      if (pair) gs[gs.length - 1].push(i); else gs.push([i]);
    });
    b.groups = gs;
  }
  return { sheet: sh.name, header: hr, title, sig, end, cols: { label: { c: labelCol, how: 'sure', head: null, data: labelCol }, num: pick(o.cols?.num, null, numC), hours: pick(o.cols?.hours, null, hoursC), shift: pick(o.cols?.shift, null, shiftC), rank, name }, blocks };
}

// ---- τι θέσεις έχει η εφαρμογή
export interface SvcTarget { value: string; label: string; kind: string; groups: Post[][]; posts: Post[]; kept?: boolean }   // kept: ανενεργή υπηρεσία που μένει στο έντυπο (BlockDef.keep): το μπλοκ ταυτίζεται αλλά δεν γεμίζει
// Οι υπηρεσίες του εντύπου (ανενεργές όχι) και ο Λ/Υ, Δ/Υ ως μεμονωμένες θέσεις
export function svcTargets(s: AppState, posts: Post[], phase?: string): SvcTarget[] {
  const out: SvcTarget[] = [];
  for (const b of blocksOf(s.settings, phase).filter(x => (!x.hidden || x.keep) && x.kind !== 'ly')) {
    const ps = posts.filter(p => p.block === b.id);
    if (!ps.length) { if (b.hidden && b.keep) out.push({ value: 'blk:' + b.id, label: b.name, kind: b.kind, groups: [], posts: [], kept: true }); continue; }
    out.push({ value: 'blk:' + b.id, label: b.name, kind: b.kind, groups: blockGroups(ps).map(gp => gp.map(x => ps.find(p => p.k === x.k)!)), posts: ps });
  }
  for (const k of ['ly', 'dy']) { const p = posts.find(x => x.k === k); if (p) out.push({ value: 'post:' + k, label: k === 'ly' ? 'Λ/Υ' : 'Δ/Υ', kind: 'ly', groups: [[p]], posts: [p] }); }
  return out;
}
// ---- καταστάσεις: λίστες ΑΤΟΜΩΝ κάτω από τις υπηρεσίες (ΑΠΕΣΠΑΣΜΕΝΟΙ, ΝΟΣΟΚΟΜΕΙΟ, Ε.Υ…), όπως οι ΤΙΜΩΡΗΜΕΝΟΙ / ΑΠΟΝΤΕΣ της δικής μας ΦΡΟΥΡΑΣ.
// Δεν είναι υπηρεσίες: δεν έχουν θέσεις της εφαρμογής, γεμίζουν με όσους είναι σε αυτή την κατάσταση τη μέρα του εντύπου (τιμές «st:…» στο προφίλ).
export const ST = 'st:';
export interface StateTarget { value: string; label: string; types: TypeKey[] | 'abs' }
export const STATE_TARGETS: StateTarget[] = [
  { value: 'st:APS', label: 'Αποσπασμένοι', types: ['APS'] },
  { value: 'st:NOS', label: 'Νοσοκομείο', types: ['NOS'] },
  { value: 'st:EY', label: 'Ε.Υ (ελεύθεροι υπηρεσίας)', types: ['EY'] },
  { value: 'st:EA', label: 'Ε.Α (ελεύθεροι ασκήσεων)', types: ['EA'] },
  { value: 'st:EO', label: 'Ε.Ο (ελεύθεροι ορθοστασίας)', types: ['EO'] },
  { value: 'st:STEP', label: 'Εισαγωγή ΣΤΕΠ', types: ['STEP'] },
  { value: 'st:PUN', label: 'Τιμωρημένοι', types: ['PUN'] },
  { value: 'st:LEAVE', label: 'Σε κανονική άδεια', types: ['LEAVE'] },
  { value: 'st:SICK', label: 'Σε αναρρωτική άδεια', types: ['SICK'] },
  { value: 'st:ADIK', label: 'Άγνοια, λιποταξία, αδικαιολόγητη απουσία', types: ['AGN', 'LIP', 'ADK'] },
  { value: 'st:ABS', label: 'Όλοι οι απόντες (άδειες, αναρρωτικές, νοσοκομείο…)', types: 'abs' }
];
// Οι λέξεις του αρχείου (μετά το nk και την αφαίρεση σημείων στίξης): ακριβής λέξη = σίγουρο, λέξη μέσα στη φράση = πρόταση («ΚΙΧΝΕ- ΕΥ» δεν το ξέρω ολόκληρο)
const STATE_WORDS: [string, RegExp, RegExp][] = [
  ['st:APS', /^(ΑΠΕΣΠΑΣΜΕΝΟΙ|ΑΠΟΣΠΑΣΜΕΝΟΙ|ΑΠΕΣΠΑΣΜΕΝΟΙ ΣΕ ΑΛΛΗ ΜΟΝΑΔΑ|ΑΠΟΣΠΑΣΗ|ΑΠΟΣΠΑΣΕΙΣ)$/, /ΑΠΕΣΠΑΣΜ|ΑΠΟΣΠΑΣΜ|ΑΠΟΣΠΑΣ/],
  ['st:NOS', /^(ΝΟΣΟΚΟΜΕΙΟ|ΝΟΣΟΚΟΜΕΙΑ|ΝΟΣΗΛΕΥΟΜΕΝΟΙ|ΝΟΣ|ΕΙΣΑΓΩΓΗ ΣΕ ΝΟΣΟΚΟΜΕΙΟ|ΝΟΣΗΛΕΙΑ)$/, /ΝΟΣΟΚΟΜ|ΝΟΣΗΛΕΥ|ΝΟΣΗΛΕΙΑ/],
  ['st:EY', /^(Ε Υ|ΕΥ|ΕΛΕΥΘΕΡΟΙ ΥΠΗΡΕΣΙΑΣ|ΕΛΕΥΘΕΡΟΙ ΥΠΗΡΕΣΙΑΣ Ε Υ)$/, /(^| )(Ε Υ|ΕΥ)( |$)|ΕΛΕΥΘΕΡΟΙ ΥΠΗΡ/],
  ['st:EA', /^(Ε Α|ΕΑ|ΕΛΕΥΘΕΡΟΙ ΑΣΚΗΣΕΩΝ)$/, /(^| )(Ε Α|ΕΑ)( |$)|ΕΛΕΥΘΕΡΟΙ ΑΣΚ/],
  ['st:EO', /^(Ε Ο|ΕΟ|ΕΛΕΥΘΕΡΟΙ ΟΡΘΟΣΤΑΣΙΑΣ)$/, /(^| )(Ε Ο|ΕΟ)( |$)|ΕΛΕΥΘΕΡΟΙ ΟΡΘΟΣΤ/],
  ['st:STEP', /^(ΣΤΕΠ|ΕΙΣΑΓΩΓΗ ΣΤΕΠ)$/, /(^| )ΣΤΕΠ( |$)/],
  ['st:PUN', /^(ΤΙΜΩΡΗΜΕΝΟΙ|ΤΙΜΩΡΙΕΣ|ΠΟΙΝΕΣ)$/, /ΤΙΜΩΡ|ΠΟΙΝΕΣ/],
  ['st:LEAVE', /^(ΑΔΕΙΟΥΧΟΙ|ΣΕ ΑΔΕΙΑ|ΑΔΕΙΕΣ|ΣΕ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ)$/, /ΑΔΕΙΟΥΧ|ΑΔΕΙΑ|ΑΔΕΙΕΣ/],
  ['st:SICK', /^(ΑΝΑΡΡΩΤΙΚΗ|ΑΝΑΡΡΩΤΙΚΕΣ|ΣΕ ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ)$/, /ΑΝΑΡΡΩΤ/],
  ['st:ADIK', /^(ΑΓΝΟΟΥΜΕΝΟΙ|ΑΔΙΚΑΙΟΛΟΓΗΤΗ ΑΠΟΥΣΙΑ|ΛΙΠΟΤΑΚΤΕΣ)$/, /ΑΓΝΟΟΥΜ|ΑΔΙΚΑΙΟΛΟΓΗΤ|ΛΙΠΟΤΑΚΤ/],
  ['st:ABS', /^(ΑΠΟΝΤΕΣ|ΑΠΟΝΤΕΣ ΑΔΕΙΕΣ|ΑΠΟΥΣΙΕΣ)$/, /ΑΠΟΝΤ/]
];
// Η λέξη που γράφεται στο έντυπο όταν μπαίνει νέα λίστα κατάστασης (αναγνωρίζεται ξανά ως «σίγουρη» από το STATE_WORDS)
export const STATE_FILE_WORD: Record<string, string> = { 'st:APS': 'ΑΠΕΣΠΑΣΜΕΝΟΙ', 'st:NOS': 'ΝΟΣΟΚΟΜΕΙΟ', 'st:EY': 'Ε.Υ', 'st:EA': 'Ε.Α', 'st:EO': 'Ε.Ο', 'st:STEP': 'ΣΤΕΠ', 'st:PUN': 'ΤΙΜΩΡΗΜΕΝΟΙ', 'st:LEAVE': 'ΑΔΕΙΟΥΧΟΙ', 'st:SICK': 'ΑΝΑΡΡΩΤΙΚΕΣ', 'st:ADIK': 'ΑΓΝΟΟΥΜΕΝΟΙ', 'st:ABS': 'ΑΠΟΝΤΕΣ' };
const stateLabel = (v: string): string => STATE_TARGETS.find(x => x.value === v)?.label || '';
// Ποιοι είναι σε αυτή την κατάσταση τη μέρα d: οπλίτες (όχι στελέχη), όχι όποιος γυρίζει ως την ώρα έναρξης υπηρεσιών (όπως οι ΑΠΟΝΤΕΣ της ΦΡΟΥΡΑΣ)
export function stateWho(s: AppState, d: ISODate, value: string): Person[] {
  const t = STATE_TARGETS.find(x => x.value === value); if (!t) return [];
  const pm = new Map(activePeople(s).map(p => [p.id, p])); const dm = dutyMin(s.settings);
  const ok = (x: Status) => !x.pending && coversDay(x, d) && !(TYPES[x.type].away && backBy(x, d, dm));
  const pick = (x: Status) => (t.types === 'abs' ? isAway(x, s.settings.lists) && TYPES[x.type].cat !== 'out' : t.types.includes(x.type));
  const ids = new Set<number>(); for (const x of s.statuses) if (ok(x) && pick(x) && pm.has(x.pid)) ids.add(x.pid);
  return [...ids].map(id => pm.get(id)!).sort((a, b) => a.last.localeCompare(b.last, 'el') || a.first.localeCompare(b.first, 'el'));
}
// Οι γραμμές ενός μπλοκ-κατάστασης: όσες είδε η ανίχνευση και όσες καλύπτει το συγχωνευμένο κελί της λέξης (γραμμές χωρίς τίποτα μέσα, π.χ. καθαρό πρότυπο)
export function stateRows(g: Grid, b: SvcBlock, labelCol: number | null, end: number): number[] {
  const rs = new Set(b.rows.map(x => x.r));
  const m = labelCol != null ? g.mergeOf(b.r, labelCol) : null;
  if (m && m.r1 === b.r) for (let r = m.r1; r <= Math.min(m.r2, end - 1); r++) rs.add(r);
  return [...rs].sort((a, c) => a - c);
}
const KIND_WORDS: [string, RegExp, RegExp][] = [
  ['th', /^ΘΑΛΑΜΟΦΥΛΑΚ(ΕΣ|ΑΣ)?$/, /ΘΑΛΑΜΟΦΥΛΑΚ/], ['op', /^ΟΠΛΟΦΥΛΑΚ(ΕΣ|ΑΣ)?$/, /ΟΠΛΟΦΥΛΑΚ/], ['mg', /^(ΜΑΓΕΙΡΕΙΑ|ΜΑΓΕΙΡΟΙ)$/, /ΜΑΓΕΙΡ/], ['sk', /^(ΣΚΟΠΟΙ|ΣΚΟΠΙΕΣ)$/, /ΣΚΟΠ(ΟΣ|ΟΙ|ΙΕΣ|ΙΑ)/], ['tae', /^ΤΑΕ$/, /(^|\s)ΤΑΕ($|\s)/]
];
export interface SvcMatch { block: SvcBlock; value: string; sure: Sure | 'mine' | 'ignored'; why: string; labelKey: string }
export const svcKeyOf = (b: Pick<SvcBlock, 'key' | 'occ'>) => b.key + '#' + b.occ;
export function matchSvc(det: SvcSheet, targets: SvcTarget[], profile: ListProfile | null | undefined): SvcMatch[] {
  const out: SvcMatch[] = []; const kindSeen = new Map<string, number>();
  const labelCount = new Map<string, number>(); for (const b of det.blocks) labelCount.set(b.key, (labelCount.get(b.key) || 0) + 1);
  const taken = new Map<string, number>();
  for (const b of det.blocks) {
    const key = svcKeyOf(b); const user = profile?.posts?.[key];
    if (user != null) { out.push({ block: b, value: user, sure: user === 'ignore' ? 'ignored' : 'mine', why: '', labelKey: key }); continue; }
    const k = b.key.replace(/\s*\/\s*/g, '/'); let value = ''; let sure: Sure = 'unknown'; let why = 'Δεν ξέρω ποια υπηρεσία της εφαρμογής είναι.';
    const ly = /^(Λ\/Υ|ΛΥ|ΛΟΧΙΑΣ ΥΠΗΡΕΣΙΑΣ)$/.test(k), dy = /^(Δ\/Υ|ΔΥ|ΔΕΚΑΝΕΑΣ ΥΠΗΡΕΣΙΑΣ)$/.test(k);
    if (ly || dy) { const t = targets.find(x => x.value === 'post:' + (ly ? 'ly' : 'dy')); if (t) { value = t.value; sure = 'sure'; why = ''; } }
    else {
      const exact = targets.find(x => nk(x.label).replace(/[^\p{L}\d/ ]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/\s*\/\s*/g, '/') === k && !x.value.startsWith('post:'));   // ίδια κανονικοποίηση με το κλειδί του μπλοκ (τόνοι, παρενθέσεις)
      if (exact && (labelCount.get(b.key) || 1) === 1) { value = exact.value; sure = 'sure'; why = ''; }
      else {
        const kw = KIND_WORDS.find(([, strict, loose]) => strict.test(k) || loose.test(k));
        if (kw) {
          const cands = targets.filter(x => x.kind === kw[0] && x.value.startsWith('blk:') && !x.kept);
          const i = kindSeen.get(kw[0]) || 0; kindSeen.set(kw[0], i + 1);
          const t = cands[Math.min(i, cands.length - 1)];
          if (t) {
            value = t.value;
            const same = det.blocks.filter(x => KIND_WORDS.find(([kd, st]) => kd === kw[0] && st.test(x.key.replace(/\s*\/\s*/g, '/')))).length;
            // ίδια λέξη σε δύο μπλοκ (ή δύο πίνακες του ίδιου είδους στην εφαρμογή): ποιο είναι ποιο δεν φαίνεται, άρα ποτέ «σίγουρο»
            sure = kw[1].test(k) && same === 1 && cands.length === 1 ? 'sure' : 'suggest';
            why = sure === 'sure' ? '' : kw[1].test(k) ? 'Η εφαρμογή έχει ' + cands.length + ' υπηρεσίες αυτού του είδους, το αρχείο ' + same + ' μπλοκ με αυτή τη λέξη: δεν φαίνεται ποιο είναι ποιο.' : 'Η λέξη περιέχει «' + kw[0] + '» αλλά δεν είναι ακριβώς το όνομα της υπηρεσίας.';
          }
        }
      }
    }
    // λίστα ατόμων σε κατάσταση (ΑΠΕΣΠΑΣΜΕΝΟΙ, ΝΟΣΟΚΟΜΕΙΟ…) και όχι υπηρεσία
    if (!value && !ly && !dy) { const sw = STATE_WORDS.find(([, strict, loose]) => strict.test(k) || loose.test(k)); if (sw) { value = sw[0]; sure = sw[1].test(k) ? 'sure' : 'suggest'; why = sure === 'sure' ? '' : 'Η λέξη μοιάζει με κατάσταση ατόμων («' + stateLabel(sw[0]) + '»), όχι με υπηρεσία. Έλεγξε αν είναι αυτή.'; } }
    // το ίδιο μπλοκ της εφαρμογής δεν είναι «σίγουρο» για δύο λέξεις του αρχείου
    if (value) { const n = (taken.get(value) || 0) + 1; taken.set(value, n); if (n > 1 && sure === 'sure') { sure = 'suggest'; why = 'Την ίδια υπηρεσία της εφαρμογής την έδειξε ήδη άλλη λέξη του αρχείου.'; } }
    // λιγότερα ή περισσότερα νούμερα από της εφαρμογής: δεν είναι αρκετό για «σίγουρο»
    if (value && sure === 'sure') { const t = targets.find(x => x.value === value); if (t && !t.kept && t.groups.length !== b.groups.length) { sure = 'suggest'; why = 'Το αρχείο έχει ' + b.groups.length + ' νούμερα, η εφαρμογή ' + t.groups.length + '.'; } }
    out.push({ block: b, value, sure, why, labelKey: key });
  }
  return out;
}

export interface SvcPlan {
  writes: Write[]; placed: { post: string; pid: number; sheet: string; r: number; block?: string }[];
  unplaced: { post: string; label: string; who: string }[];      // η εφαρμογή βάζει άτομο σε θέση που η λίστα της μονάδας δεν έχει (ή δεν αντιστοιχίστηκε)
  cleared: number; kept: number; warnings: string[];
}
const seatName = (p: Person) => fullName(p);
export function planSvc(sh: SheetModel, det: SvcSheet, matches: SvcMatch[], targets: SvcTarget[], s: AppState, date: ISODate, posts: Post[], ours: Record<string, string> = {}, lex?: Lexicon): SvcPlan {
  const l = lexOf(lex); const g = s.guards[date] || {}; const pm = seatMap(s); const g2 = new Grid(sh);
  const plan: SvcPlan = { writes: [], placed: [], unplaced: [], cleared: 0, kept: 0, warnings: [] };
  const rc = det.cols.rank.c, nc = det.cols.name.c;
  if (nc == null) { plan.warnings.push('Δεν βρέθηκε στήλη ονοματεπωνύμου στη λίστα: δεν γράφτηκε κανείς.'); }
  const done = new Set<string>();
  const sit = (r: number, c: number) => { const m = g2.mergeOf(r, c); return m ? { r: m.r1, c: m.c1 } : { r, c }; };
  const put = (r: number, c: number | null, value: string, role: 'rank' | 'name') => {
    if (c == null) return;
    const at = sit(r, c); const cur = txt(sh.rows[at.r]?.[at.c]); const ok = oursKey(sh.name, at.r, at.c);
    if (sh.fx.has(cellKey(at.r, at.c))) return;
    // βαθμός του προτύπου («ΣΤΡ(ΤΘ)») ξαναγράφεται· ό,τι άλλο κείμενο δεν είναι δικό μας και μένει
    const over = cur && cur !== ours[ok] && role === 'rank' && rankLike(l, cur) ? cur : undefined;
    plan.writes.push({ sheet: sh.name, r: at.r, c: at.c, value, ...(over ? { over } : {}) });
  };
  const assigned = new Set<string>();
  for (const m of matches) {
    if (!m.value || m.value === 'ignore') continue;
    const t = targets.find(x => x.value === m.value); if (!t) continue;
    const b = m.block;
    t.groups.forEach((gp, gi) => {
      const ug = b.groups[gi];
      gp.forEach((post, pi) => {
        const pid = g[post.k]; const p = pid != null ? pm.get(pid) : undefined;
        const row = ug ? b.rows[ug[pi] ?? -1] : undefined;
        if (!row) { if (p) plan.unplaced.push({ post: post.k, label: post.label, who: seatName(p) }); return; }
        if (done.has(row.r + '')) return; done.add(row.r + ''); assigned.add(post.k);
        if (p) {
          // το κελί του ονόματος έχει δικό σου κείμενο ή τύπο: ο βαθμός δεν γράφεται μόνος του, το άτομο μένει χωρίς θέση (και το λέει)
          if (nc != null) { const at = sit(row.r, nc); const cur = txt(sh.rows[at.r]?.[at.c]); if (sh.fx.has(cellKey(at.r, at.c)) || (cur && cur !== ours[oursKey(sh.name, at.r, at.c)])) { plan.unplaced.push({ post: post.k, label: post.label, who: seatName(p) }); return; } }
          if (nc == null) { plan.unplaced.push({ post: post.k, label: post.label, who: seatName(p) }); return; }
          put(row.r, rc, rankTxt(p), 'rank'); put(row.r, nc, seatName(p), 'name');
          plan.placed.push({ post: post.k, pid: p.id, sheet: sh.name, r: row.r });
        } else {
          // καμία ανάθεση: καθαρίζονται μόνο όσα έγραψε η εφαρμογή άλλη φορά
          for (const [c, role] of [[rc, 'rank'], [nc, 'name']] as const) {
            if (c == null) continue; const at = sit(row.r, c); const cur = txt(sh.rows[at.r]?.[at.c]);
            if (cur && cur === ours[oursKey(sh.name, at.r, at.c)]) { plan.writes.push({ sheet: sh.name, r: at.r, c: at.c, value: null }); plan.cleared++; } else if (cur) plan.kept++;
            void role;
          }
        }
      });
    });
  }
  // μπλοκ-καταστάσεις: όσοι είναι σε αυτή την κατάσταση τη μέρα, από πάνω προς τα κάτω. Γραμμή με δικό σου κείμενο ή τύπο στο όνομα παραλείπεται (ο επόμενος παίρνει την επόμενη)·
  // όσοι δεν χωράνε αναφέρονται, δεν προστίθενται γραμμές στο αρχείο σου
  for (const m of matches) {
    if (!m.value.startsWith(ST) || !STATE_TARGETS.some(x => x.value === m.value)) continue;
    const b = m.block; const who = stateWho(s, date, m.value); let i = 0;
    for (const r of stateRows(g2, b, det.cols.label.c, det.end)) {
      if (done.has(r + '')) continue; done.add(r + '');
      const own = nc != null ? (() => { const at = sit(r, nc); const cur = txt(sh.rows[at.r]?.[at.c]); return sh.fx.has(cellKey(at.r, at.c)) || (!!cur && cur !== ours[oursKey(sh.name, at.r, at.c)]); })() : true;
      if (own) { plan.kept++; continue; }
      const p = who[i++];
      if (p) { put(r, rc, rankTxt(p), 'rank'); put(r, nc, seatName(p), 'name'); plan.placed.push({ post: m.value, pid: p.id, sheet: sh.name, r, block: b.label }); }
      else for (const c of [rc, nc]) {
        if (c == null) continue; const at = sit(r, c); const cur = txt(sh.rows[at.r]?.[at.c]);
        if (cur && cur === ours[oursKey(sh.name, at.r, at.c)]) { plan.writes.push({ sheet: sh.name, r: at.r, c: at.c, value: null }); plan.cleared++; } else if (cur) plan.kept++;
      }
    }
    for (; i < who.length; i++) plan.unplaced.push({ post: m.value, label: b.label, who: seatName(who[i]) });
  }
  // άτομα της εφαρμογής σε θέσεις που κανένα μπλοκ δεν πήρε
  for (const k of Object.keys(g)) {
    if (assigned.has(k)) continue; const p = pm.get(g[k]); if (!p) continue;
    if (plan.unplaced.some(x => x.post === k)) continue;
    const post = posts.find(x => x.k === k); plan.unplaced.push({ post: k, label: post?.label || k, who: seatName(p) });
  }
  for (const u of plan.unplaced) if (u.post.startsWith(ST)) plan.warnings.push('Στη λίστα «' + u.label + '» δεν υπάρχει γραμμή για τον/την ' + u.who + ' (δεν προστίθενται γραμμές στο αρχείο σου): δεν γράφτηκε.'); else plan.warnings.push('Η θέση «' + u.label + '» (' + u.who + ') δεν γράφτηκε: δεν υπάρχει στη λίστα της μονάδας, δεν αντιστοιχίστηκε ή το κελί έχει δικό σου κείμενο.');
  return plan;
}
export const oursKey = (sheet: string, r: number, c: number) => sheet + '|' + r + ':' + c;

// τίτλος «ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ <ημερομηνία>»: η παλιά ημερομηνία αντικαθίσταται, ό,τι άλλο γράφει ο τίτλος μένει
const DATE_TAIL = /\s*(\d{1,2}\s+[Α-Ωα-ωά-ώΑ-ΩA-Za-z]{3,}\s+\d{2,4}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|[_….\s]+)\s*$/u;
const MONTHS = ['ΙΑΝΟΥΑΡΙΟΥ', 'ΦΕΒΡΟΥΑΡΙΟΥ', 'ΜΑΡΤΙΟΥ', 'ΑΠΡΙΛΙΟΥ', 'ΜΑΪΟΥ', 'ΙΟΥΝΙΟΥ', 'ΙΟΥΛΙΟΥ', 'ΑΥΓΟΥΣΤΟΥ', 'ΣΕΠΤΕΜΒΡΙΟΥ', 'ΟΚΤΩΒΡΙΟΥ', 'ΝΟΕΜΒΡΙΟΥ', 'ΔΕΚΕΜΒΡΙΟΥ'];
export function planTitle(sh: SheetModel, row: number | null, date: ISODate, re: RegExp = /^ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ/, what = 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ'): { write: Write | null; warning: string | null } {
  if (row == null) return { write: null, warning: 'Η λίστα δεν έχει τίτλο «' + what + '»: η ημερομηνία δεν γράφτηκε' };
  const g = new Grid(sh);
  for (let c = 0; c < (sh.rows[row]?.length ?? 0); c++) {
    const raw = sh.rows[row][c]; if (typeof raw !== 'string' || !re.test(nk(raw))) continue;
    if (g.isFormula(row, c)) return { write: null, warning: 'Ο τίτλος είναι τύπος: η ημερομηνία δεν γράφτηκε' };
    const head = raw.replace(/\s+/g, ' ').trim().replace(DATE_TAIL, '').trim();
    if (!/(ΤΗΣ|ΤΗΝ|ΓΙΑ|ΣΤΙΣ|ΗΜΕΡΑΣ)$/.test(nk(head))) return { write: null, warning: 'Ο τίτλος «' + raw.trim().slice(0, 40) + '» έχει κείμενο μετά τις λέξεις του: η ημερομηνία δεν γράφτηκε' };
    const [y, m, d] = date.split('-').map(Number);
    return { write: { sheet: sh.name, r: row, c, value: head + ' ' + d + ' ' + MONTHS[m - 1] + ' ' + y, exact: true, over: raw }, warning: null };
  }
  return { write: null, warning: null };
}

// ------------------------------------------------------------------ ΕΞΟΔΟΥΧΟΙ / ΑΔΕΙΟΥΧΟΙ δίπλα δίπλα
export type OutsRole = 'aa' | 'sub' | 'rank' | 'name' | 'from' | 'to' | 'note';
export const OUTS_ROLES: OutsRole[] = ['aa', 'sub', 'rank', 'name', 'from', 'to', 'note'];
export const OUTS_ROLE_LABEL: Record<OutsRole, string> = { aa: 'Α/Α', sub: 'Ίλη', rank: 'Βαθμός', name: 'Ονοματεπώνυμο', from: 'Έναρξη', to: 'Επιστροφή', note: 'Παρατηρήσεις' };
export interface OutsList { side: 'o' | 'l'; title: string; titleRow: number; header: number; first: number; last: number; c1: number; c2: number; cols: Partial<Record<OutsRole, number>> }
export interface OutsSheet { sheet: string; lists: OutsList[]; titleRow: number | null; sig: number | null }
const OUT_HEAD: [OutsRole, RegExp][] = [['aa', /^(Α\/Α|ΑΑ|Α\.Α\.?)$/], ['sub', /^(ΙΛΗ|ΛΟΧΟΣ|ΤΜΗΜΑ)$/], ['rank', /^ΒΑΘΜ/], ['name', /^(ΟΝΟΜΑΤΕΠΩΝΥΜΟ|ΟΝΟΜ\/?ΜΟ)$/], ['from', /^(ΕΝΑΡΞΗ|ΑΠΟ|ΑΝΑΧΩΡΗΣΗ)$/], ['to', /^(ΕΠΙΣΤΡΟΦΗ|ΕΩΣ|ΜΕΧΡΙ|ΛΗΞΗ)$/], ['note', /^(ΠΑΡΑΤΗΡΗΣΕΙΣ|ΠΑΡ\/ΣΕΙΣ)$/]];
const OUT_TITLES: ['o' | 'l', RegExp][] = [['o', /^(ΕΞΟΔΟΥΧΟΙ|ΠΑΡΑΜΕΝΟΝΤΕΣ)$/], ['l', /^(ΑΔΕΙΟΥΧΟΙ|ΣΕ ΑΔΕΙΑ)$/]];
export function detectOuts(sh: SheetModel, o: { cols?: Record<string, number> } = {}): OutsSheet | null {
  const g = new Grid(sh); const titles: { side: 'o' | 'l'; title: string; r: number; c: number }[] = [];
  for (let r = 0; r < Math.min(sh.rows.length, 60); r++) (sh.rows[r] || []).forEach((v, c) => {
    const t = nk(v); const hit = OUT_TITLES.find(([, re]) => re.test(t)); if (hit && typeof v === 'string' && !g.isFormula(r, c)) titles.push({ side: hit[0], title: t, r, c });
  });
  if (!titles.length) return null;
  const sorted = [...titles].sort((a, b) => a.r - b.r || a.c - b.c); const lists: OutsList[] = [];
  const sigAt = (from: number): number | null => { for (let r = from; r < sh.rows.length; r++) if ((sh.rows[r] || []).some(v => /^(Ο|Η|ΤΟ|ΟΙ)$/.test(nk(v)))) return r; return null; };
  for (const t of sorted) {
    // το εύρος στηλών της λίστας: από το αριστερό όριο (ο τίτλος ή η στήλη μετά την προηγούμενη λίστα της ίδιας γραμμής) ως την επόμενη λίστα
    // (ο τίτλος μπορεί να είναι ενωμένος πάνω από τις στήλες της λίστας του): η λίστα πιάνει από την αριστερή άκρη του τίτλου της ως την αριστερή άκρη του επόμενου
    const left = (x: { r: number; c: number }) => mergeStart(g, x.r, x.c);
    const next = sorted.filter(x => x.r === t.r && x.c > t.c).map(left)[0];
    const c1 = left(t); const c2 = next != null ? next - 1 : 60;
    for (let r = t.r + 1; r <= t.r + 4 && r < sh.rows.length; r++) {
      const cols: Partial<Record<OutsRole, number>> = {};
      (sh.rows[r] || []).forEach((v, c) => { if (c < c1 || c > c2) return; const k = OUT_HEAD.find(([, re]) => re.test(nk(v)))?.[0]; if (k && cols[k] == null) cols[k] = mergeStart(g, r, c); });
      if (!(Object.keys(cols).length >= 2 && (cols.name != null || cols.rank != null))) continue;
      if (o.cols) for (const [k, c] of Object.entries(o.cols)) if (k.startsWith(t.side + '.')) cols[k.slice(2) as OutsRole] = c;
      const hEnd = Math.max(r, ...Object.values(cols).map(c => g.mergeOf(r, c as number)?.r2 ?? r));
      const first = hEnd + 1; const sig = sigAt(first) ?? sh.rows.length; const keyC = cols.aa;
      // έτοιμες γραμμές: όσο η στήλη Α/Α έχει αρίθμηση (αριθμός, «1ο» ή τύπος) και πριν τις υπογραφές ή μια νέα λίστα
      let last = first;
      if (keyC == null) { last = first - 1; for (let rr = first; rr < sig && rr < first + 60 && !titles.some(x => x.r === rr); rr++) { if ((sh.rows[rr] || []).slice(c1, c2 + 1).some(v => txt(v) !== '')) break; last = rr; } if (last < first) last = first; }
      if (keyC != null) { last = first - 1; for (let rr = first; rr < sig && !titles.some(x => x.r === rr && x.c >= c1 && x.c <= c2); rr++) { const v = sh.rows[rr]?.[keyC]; if (typeof v === 'number' || NUM_LABEL.test(nk(v)) || sh.fx.has(cellKey(rr, keyC))) last = rr; else break; } if (last < first) last = first; }
      lists.push({ side: t.side, title: t.title, titleRow: t.r, header: r, first, last, c1, c2: Math.min(c2, Math.max(0, ...Object.values(cols).map(Number)) + 3), cols });
      break;
    }
  }
  if (!lists.length) return null;
  let titleRow: number | null = null; for (let r = 0; r < Math.min(...lists.map(l => l.titleRow)); r++) if ((sh.rows[r] || []).some(v => /^ΚΑΤΑΣΤΑΣΗ ΕΞΟΔΟΥΧΩΝ/.test(nk(v)))) titleRow = r;
  return { sheet: sh.name, lists, titleRow, sig: sigAt(Math.max(...lists.map(l => l.last)) + 1) };
}
export interface OutsRow { p: Person; from: string; to: string; sub: string }
// Οι εξοδούχοι της μέρας και οι αδειούχοι (άδεια που καλύπτει τη μέρα): με τη σειρά του Δυναμολογίου
export function outsRowsOf(s: AppState, d: ISODate, outs: { p: Person }[]): { outs: OutsRow[]; leaves: OutsRow[] } {
  const leaves: OutsRow[] = []; const seen = new Set<number>();
  for (const p of activePeople(s)) {
    const st = s.statuses.find(x => x.pid === p.id && x.type === 'LEAVE' && x.from <= d && (x.open || x.to >= d));
    if (!st || seen.has(p.id)) continue; seen.add(p.id);
    leaves.push({ p, from: dmy(st.from), to: st.open ? '' : dmy(st.to), sub: p.sub || '' });
  }
  return { outs: outs.map(x => ({ p: x.p, from: '', to: '', sub: x.p.sub || '' })), leaves };
}
export interface OutsPlan { writes: Write[]; counts: { o: number; l: number }; unplaced: { side: 'o' | 'l'; who: string }[]; cleared: number; warnings: string[] }
export function planOuts(sh: SheetModel, det: OutsSheet, rows: { outs: OutsRow[]; leaves: OutsRow[] }, ours: Record<string, string> = {}): OutsPlan {
  const plan: OutsPlan = { writes: [], counts: { o: 0, l: 0 }, unplaced: [], cleared: 0, warnings: [] }; const g = new Grid(sh);
  const stop = det.sig ?? Infinity;
  const mine = (r: number, c: number) => oursKey(sh.name, r, c);
  for (const L of det.lists) {
    const data = L.side === 'o' ? rows.outs : rows.leaves; const cols = L.cols;
    let i = 0; let rr = L.first;
    const cellAt = (r: number, c: number | undefined) => { if (c == null) return null; const m = g.mergeOf(r, c); const at = m ? { r: m.r1, c: m.c1 } : { r, c }; return { ...at, cur: txt(sh.rows[at.r]?.[at.c]), fx: sh.fx.has(cellKey(at.r, at.c)), child: !!m && (m.r1 !== r || m.c1 !== c) && at.c !== c } };
    const roleKeys = (['rank', 'name', 'sub', 'from', 'to', 'note'] as OutsRole[]).filter(k => cols[k] != null);
    for (; i < data.length && rr <= L.last && rr < stop; rr++) {
      const x = data[i];
      // γραμμή με ξένο κείμενο στα κελιά που θα γράφαμε: μένει όπως είναι
      const busy = roleKeys.some(k => { const a = cellAt(rr, cols[k]); return !!a && (a.fx || (a.cur !== '' && a.cur !== ours[mine(a.r, a.c)] && !(k === 'rank' && rankLike(lexOf(), a.cur)))); });
      if (busy) continue;
      const v: Partial<Record<OutsRole, string>> = { rank: rankTxt(x.p), name: fullName(x.p), sub: x.sub, from: x.from, to: x.to };
      for (const k of roleKeys) { if (v[k] === undefined) continue; const a = cellAt(rr, cols[k])!; plan.writes.push({ sheet: sh.name, r: a.r, c: a.c, value: v[k]!, ...(a.cur && a.cur !== ours[mine(a.r, a.c)] ? { over: a.cur } : {}) }); }
      if (cols.aa != null) { const a = cellAt(rr, cols.aa)!; if (!a.fx && a.cur === '' && sh.rows[a.r]?.[a.c] == null) plan.writes.push({ sheet: sh.name, r: a.r, c: a.c, value: i + 1 }); }
      i++; plan.counts[L.side]++;
    }
    for (; i < data.length; i++) { plan.unplaced.push({ side: L.side, who: fullName(data[i].p) }); }
    // γραμμές που έγραψε η εφαρμογή άλλη φορά και τώρα περισσεύουν: καθαρίζονται
    for (let r = rr; r < Math.min(stop, L.last + 1); r++) for (const k of roleKeys) {
      const a = cellAt(r, cols[k]); if (a && !a.fx && a.cur && a.cur === ours[mine(a.r, a.c)]) { plan.writes.push({ sheet: sh.name, r: a.r, c: a.c, value: null }); plan.cleared++; }
    }
  }
  for (const u of plan.unplaced) plan.warnings.push((u.side === 'o' ? 'Εξοδούχος' : 'Αδειούχος') + ' ' + u.who + ' δεν χώρεσε στη λίστα του αρχείου: δεν γράφτηκε.');
  const sides = new Set(det.lists.map(l => l.side));
  if (!sides.has('o') && rows.outs.length) plan.warnings.push('Το αρχείο δεν έχει λίστα εξοδούχων: ' + rows.outs.length + ' δεν γράφτηκαν.');
  if (!sides.has('l') && rows.leaves.length) plan.warnings.push('Το αρχείο δεν έχει λίστα αδειούχων: ' + rows.leaves.length + ' δεν γράφτηκαν.');
  return plan;
}

// ------------------------------------------------------------------ ΘΑΛΑΜΙΖΟΜΕΝΟΙ: κελιά-κλειδιά που διαβάζουν οι τύποι (VLOOKUP) της μονάδας
export interface RoomSheet { sheet: string; keyCol: number; rows: number[]; table: { sheet: string; keyCol: number; first: number; last: number; headerRow: number | null; lastC: number | null; firstC: number | null; formulas: number }; lookups: number }
const VL = /VLOOKUP\(\s*\$?([A-Z]{1,3})\$?(\d+)\s*,\s*(?:'((?:[^']|'')+)'|([^'!,()]+))!\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)\s*,\s*(\d+)\s*,\s*(0|FALSE)\s*\)/i;
const colNo = (s: string) => s.toUpperCase().split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export function detectRooms(sheets: SheetModel[], o: { sheet?: string } = {}): RoomSheet[] {
  const out: RoomSheet[] = [];
  for (const sh of sheets) {
    if (o.sheet && sh.name !== o.sheet) continue;
    const byKey = new Map<string, { col: number; rows: Set<number>; table: string; k1: number; r1: number; r2: number; n: number }>();
    for (const [k, f] of sh.formulas) {
      const [r, c] = k.split(':').map(Number); const m = VL.exec(f); if (!m) continue;
      const tsheet = (m[3] ? m[3].replace(/''/g, "'") : m[4]).trim(); if (tsheet === sh.name || !sheets.some(x => x.name === tsheet)) continue;
      const kc = colNo(m[1]), kr = Number(m[2]) - 1; if (kr !== r || kc === c) continue;       // το κλειδί είναι στην ίδια γραμμή
      const id = kc + '|' + tsheet + '|' + m[5] + m[6] + ':' + m[7] + m[8];
      const x = byKey.get(id) || { col: kc, rows: new Set<number>(), table: tsheet, k1: colNo(m[5]), r1: Number(m[6]) - 1, r2: Number(m[8]) - 1, n: 0 };
      x.rows.add(r); x.n++; byKey.set(id, x);
    }
    // κελιά-κλειδιά που είναι τύποι (η μονάδα τα τραβά από άλλο φύλλο) δεν γράφονται ποτέ: μετρούν μόνο όσα είναι κενά ή κείμενο
    for (const x of byKey.values()) for (const r of [...x.rows]) if (sh.fx.has(cellKey(r, x.col))) x.rows.delete(r);
    const best = [...byKey.values()].sort((a, b) => b.rows.size - a.rows.size)[0];
    if (!best || best.rows.size < 3) continue;
    const t = sheets.find(x => x.name === best.table)!;
    // επικεφαλίδες του πίνακα δεδομένων: ΕΠΩΝΥΜΟ και ΟΝΟΜΑ σε γραμμή πάνω από την περιοχή του VLOOKUP
    let headerRow: number | null = null, lastC: number | null = null, firstC: number | null = null;
    for (let r = 0; r < Math.min(t.rows.length, best.r1 + 1, 40) && headerRow == null; r++) {
      const row = t.rows[r] || []; const li = row.findIndex(v => /^ΕΠΩΝΥΜΟ$/.test(nk(v))), fi = row.findIndex(v => /^ΟΝΟΜΑ$/.test(nk(v)));
      if (li >= 0 && fi >= 0) { headerRow = r; lastC = li; firstC = fi; }
    }
    out.push({ sheet: sh.name, keyCol: best.col, rows: [...best.rows].sort((a, b) => a - b), table: { sheet: best.table, keyCol: best.k1, first: best.r1, last: Math.min(best.r2, t.rows.length - 1), headerRow, lastC, firstC, formulas: best.n }, lookups: best.n });
  }
  return out;
}
export interface RoomPlan { writes: Write[]; keys: { pid: number; key: string; r: number }[]; unplaced: { who: string; why: string }[]; full: number; cross: { checked: number; matched: number; unevaluated: number; mismatches: string[] }; warnings: string[] }
// who: '' = όλοι οι ενεργοί με θάλαμο, αλλιώς η Ίλη/Λόχος
export function planRooms(sheets: SheetModel[], det: RoomSheet, s: AppState, o: { who?: string; ours?: Record<string, string> } = {}): RoomPlan {
  const sh = sheets.find(x => x.name === det.sheet)!; const t = sheets.find(x => x.name === det.table.sheet)!; const ours = o.ours || {};
  const plan: RoomPlan = { writes: [], keys: [], unplaced: [], full: 0, cross: { checked: 0, matched: 0, unevaluated: 0, mismatches: [] }, warnings: [] };
  const ev = new Evaluator(sheets);
  if (det.table.headerRow == null || det.table.lastC == null || det.table.firstC == null) { plan.warnings.push('Η λίστα δεδομένων «' + t.name + '» δεν έχει στήλες ΕΠΩΝΥΜΟ και ΟΝΟΜΑ: δεν βρέθηκε ποιος είναι ποιος, τίποτα δεν γράφτηκε.'); return plan; }
  const want = activePeople(s).filter(p => p.room != null && (!o.who || nk(p.sub || '') === nk(o.who)));
  want.sort((a, b) => (a.room ?? 0) - (b.room ?? 0) || a.last.localeCompare(b.last, 'el') || a.first.localeCompare(b.first, 'el'));
  // η γραμμή κάθε ατόμου στη λίστα δεδομένων: ίδιο επώνυμο + όνομα (χωρίς τόνους/πεζά) και μία μόνο γραμμή
  const rowsOfKey = new Map<string, number[]>();
  for (let r = det.table.first; r <= det.table.last; r++) {
    const l = nk(t.rows[r]?.[det.table.lastC]), f = nk(t.rows[r]?.[det.table.firstC]); if (!l || !f) continue;
    const k = l + '|' + f; rowsOfKey.set(k, [...(rowsOfKey.get(k) || []), r]);
  }
  const free = det.rows.filter(r => { const cur = txt(sh.rows[r]?.[det.keyCol]); return cur === '' || cur === ours[oursKey(sh.name, r, det.keyCol)]; });
  const existing = new Set(det.rows.map(r => nk(sh.rows[r]?.[det.keyCol])).filter(Boolean));
  const keyOf = (p: Person): string | null => {
    const hit = rowsOfKey.get(nk(p.last) + '|' + nk(p.first)); if (!hit) { plan.unplaced.push({ who: fullName(p), why: 'δεν υπάρχει στη λίστα δεδομένων' }); return null; }
    if (hit.length > 1) { plan.unplaced.push({ who: fullName(p), why: 'υπάρχει πάνω από μία φορά στη λίστα δεδομένων' }); return null; }
    const v = ev.cell(t, hit[0], det.table.keyCol);
    if (v === UNSUPPORTED || v == null || v === '' || typeof v === 'object') { plan.unplaced.push({ who: fullName(p), why: 'το κλειδί του στη λίστα δεδομένων δεν διαβάζεται' }); return null; }
    return String(v);
  };
  let i = 0;
  for (const p of want) {
    const k = keyOf(p); if (k == null) continue;
    if (existing.has(nk(k))) continue;               // ήδη γραμμένος στο φύλλο (από το γραφείο)
    if (i >= free.length) { plan.full++; plan.unplaced.push({ who: fullName(p), why: 'δεν υπάρχει ελεύθερη γραμμή στο φύλλο' }); continue; }
    const r = free[i++]; plan.writes.push({ sheet: sh.name, r, c: det.keyCol, value: k, exact: true }); plan.keys.push({ pid: p.id, key: k, r });
  }
  // έλεγχος με τον υπολογιστή τύπων: με τα κλειδιά μέσα, οι τύποι της γραμμής δίνουν τη γραμμή του ατόμου στη λίστα δεδομένων (όχι #N/A)
  if (plan.keys.length) {
    const copy: SheetModel = { ...sh, rows: sh.rows.map(r => (r ? [...r] : [])), fx: sh.fx, formulas: sh.formulas };
    for (const w of plan.writes) { while (copy.rows.length <= w.r) copy.rows.push([]); copy.rows[w.r][w.c] = w.value as string; }
    const ev2 = new Evaluator(sheets.map(x => (x.name === sh.name ? copy : x)));
    for (const kx of plan.keys) for (const [fk, f] of sh.formulas) {
      const [r, c] = fk.split(':').map(Number); if (r !== kx.r || c === det.keyCol) continue;
      const m = VL.exec(f); if (!m) continue; plan.cross.checked++;
      const v = ev2.cell(copy, r, c) as Val | typeof UNSUPPORTED;
      if (v === UNSUPPORTED) plan.cross.unevaluated++; else if (typeof v === 'string' && v.startsWith('#')) plan.cross.mismatches.push(sh.name + '!' + String.fromCharCode(65 + c) + (r + 1)); else plan.cross.matched++;
    }
  }
  for (const u of plan.unplaced) plan.warnings.push(u.who + ': ' + u.why + ' (δεν μπήκε στο φύλλο «' + sh.name + '»)');
  return plan;
}
export type { BlockDef, PostDef, TplProfile };
void groupKey; void upper;
