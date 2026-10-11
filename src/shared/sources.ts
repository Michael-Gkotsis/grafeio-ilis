// Αρχεία Excel της Ίλης (Michael, 11/10): για κάθε είδος δεδομένων (ποινές, ιατρικά, άδειες…) από ποιο αρχείο,
// ποιο φύλλο και ποιον πίνακα διαβάζει η εφαρμογή, και πού γράφει τις αλλαγές της.
// Αναγνώριση από τις επικεφαλίδες (06 §3.2)· ό,τι δεν βρεθεί το διαλέγει ο χρήστης με κλικ, με πρόταση όπου υπάρχει.
// Όλα εδώ είναι καθαρές συναρτήσεις: τις τρέχουν και το UI (προεπισκόπηση) και ο main (εισαγωγή, εγγραφή).
import { addDays, type ISODate } from './dates';
import { norm, normGreek, collator } from './text';
import { PUN_KINDS, TYPES, type AppState, type Person, type Status, type TypeKey } from './domain';
import type { CellValue, RawSheet } from './roster';

export type ListKind = 'people' | 'punish' | 'medical' | 'hospital' | 'step' | 'leave' | 'posts' | 'outside';
export type StatusKind = 'punish' | 'medical' | 'hospital' | 'step' | 'leave';
export type FormKind = 'froura' | 'frouraSpen' | 'hkai' | 'outs' | 'check';

// Πού βρίσκεται ένα είδος: αρχείο, φύλλο, γραμμή επικεφαλίδων (από 0) και στήλη κάθε πεδίου (από 0)
export interface SourceBinding {
  file: string;
  sheet: string;
  header: number;
  cols: Record<string, number>;
  write?: boolean;                   // η εφαρμογή γράφει εδώ τις αλλαγές της (μόνο για καταστάσεις)
  scope?: 'all' | 'active';          // τι γράφει: όλες τις εγγραφές ή μόνο όσες ισχύουν σήμερα και μετά
  values?: Record<string, TypeKey>;  // τιμές του Excel που δεν αναγνωρίζονται μόνες τους (π.χ. «ΕΛ ΑΡΒ») → είδος
}
// Έντυπο: ποιο template (αρχείο και φύλλο) και πού βγαίνει. Κενό = προεπιλογή της εφαρμογής.
export interface FormBinding {
  file?: string;
  sheet?: string;                    // ΗΚΑΙ: μπροστινή σελίδα· Εξοδούχοι: φύλλο εξοδούχων
  sheet2?: string;                   // ΗΚΑΙ: πίσω σελίδα· Εξοδούχοι: φύλλο παραμενόντων
  dir?: string;                      // φάκελος εξόδου (κενό = ο γενικός των Ρυθμίσεων)
  monthly?: boolean;                 // υποφάκελος ανά μήνα (προεπιλογή ναι)
  cells?: Partial<HkaiMap>;          // ΗΚΑΙ: κελιά που άλλαξε ο χρήστης
}

// ------------------------------------------------------------------ πεδία
export interface FieldDef { k: string; label: string; re: RegExp; head: string; req?: boolean; date?: boolean }
const F = (k: string, label: string, head: string, re: RegExp, o: Partial<FieldDef> = {}): FieldDef => ({ k, label, head, re, ...o });
export const PERSON_FIELDS: FieldDef[] = [
  F('aa', 'Α/Α', 'Α/Α', /^Α\s*\/\s*Α$|^Α\.?\s*Α\.?$/),
  F('rank', 'Βαθμός', 'Βαθμός', /^ΒΑΘΜΟΣ$|^ΒΘΜ$|^ΒΑΘΜ$/),
  F('spec', 'Ο/Σ (ειδικότητα)', 'Ο/Σ', /^Ο\s*[/\-]\s*Σ$|^ΕΙΔΙΚΟΤΗΤΑ$/),
  F('last', 'Επώνυμο', 'Επώνυμο', /^ΕΠΩΝΥΜΟ$|^ΕΠΙΘΕΤΟ$/),
  F('first', 'Όνομα', 'Όνομα', /^ΟΝΟΜΑ$/),
  F('name', 'Ονοματεπώνυμο (σε ένα κελί)', 'Ονοματεπώνυμο', /^ΟΝΟΜΑΤΕΠΩΝΥΜΟ$|^ΕΠΩΝΥΜΟ\s*[-–,]?\s*ΟΝΟΜΑ$/),
  F('father', 'Πατρώνυμο', 'Πατρώνυμο', /^ΠΑΤΡΩΝΥΜΟ$/),
  F('asm', 'ΑΣΜ', 'ΑΣΜ', /^ΑΣΜ$|^Α\s*\.?\s*Σ\s*\.?\s*Μ$|ΑΡ.*ΜΗΤΡΩΟΥ/),
  F('phone', 'Τηλέφωνο', 'Τηλέφωνο', /ΚΙΝΗΤΟ|ΤΗΛΕΦΩΝΟ|^ΤΗΛ$/),
  F('room', 'Θάλαμος', 'Θάλαμος', /^ΘΑΛΑΜΟΣ$|^ΘΑΛ$/)
];
const FROM = (head = 'ΑΠΟ') => F('from', 'Από (ημερομηνία)', head, /^ΑΠΟ$|^ΕΝΑΡΞΗ|^ΕΙΣ$|^ΕΙΣΟΔΟΣ$|^ΗΜ\w* ΕΙΣ/, { req: true, date: true });
const TO = (head = 'ΕΩΣ') => F('to', 'Έως (ημερομηνία)', head, /^ΕΩΣ$|^ΛΗΞΗ|^ΕΞ$|^ΕΞΟΔΟΣ$|^ΗΜ\w* ΕΞ/, { date: true });
const NOTE = F('note', 'Παρατηρήσεις', 'Παρατηρήσεις', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$|^ΣΗΜΕΙΩΣΕΙΣ$/);

export interface KindDef {
  id: ListKind; label: string; help: string; fields: FieldDef[]; sheetRe: RegExp; titleRe?: RegExp;
  types?: TypeKey[]; title: string; write: boolean;
}
export const KINDS: KindDef[] = [
  { id: 'people', label: 'Προσωπικό (Δυναμολόγιο)', help: 'Βαθμός, ονοματεπώνυμο, ΑΣΜ, τηλέφωνο, θάλαμος, Σ.Ι., ρόλος', title: 'ΣΥΝΟΛΙΚΟ', write: false,
    sheetRe: /ΣΥΝΟΛΙΚΟ|ΔΥΝΑΜΟΛΟΓΙΟ/, fields: [F('si', 'Σ.Ι.', 'Σ.Ι', /^Σ\s*\.?\s*Ι\.?$/), F('remarks', 'Παρατηρήσεις (ρόλος)', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$/)] },
  { id: 'punish', label: 'Ποινές (τιμωρημένοι)', help: 'Από, έως, είδος ποινής', title: 'ΤΙΜΩΡΗΜΕΝΟΙ', write: true, types: ['PUN'],
    sheetRe: /ΤΙΜΩΡ|ΠΟΙΝ/, titleRe: /ΤΙΜΩΡ|ΠΟΙΝ/,
    fields: [FROM(), TO(), F('kind', 'Είδος ποινής', 'ΕΙΔΟΣ ΠΟΙΝΗΣ', /ΕΙΔΟΣ ΠΟΙΝΗΣ|^ΠΟΙΝΗ$/), F('days', 'Ημέρες', 'ΗΜΕΡΕΣ', /^ΗΜΕΡΕΣ$/),
      F('by', 'Ποιος την επέβαλε', 'ΕΠΕΒΑΛΕ', /ΕΠΕΒΑΛΕ|ΕΠΙΒΛΗΘΗΚΕ|ΤΙΜΩΡΗΣΕ|ΑΠΟ ΠΟΙΟΝ|ΔΙΑΤΑΚΤΗΣ/), F('reason', 'Αιτία (διότι…)', 'ΑΙΤΙΑ', /ΑΙΤΙΑ|ΑΙΤΙΟΛΟΓΙΑ|^ΔΙΟΤΙ|ΠΑΡΑΠΤΩΜΑ/), NOTE] },
  { id: 'medical', label: 'ΕΑ / ΕΥ / ΕΟ', help: 'Είδος (ΕΑ, ΕΥ, ΕΟ, ΕΛ ΑΡΒ…), από, έως', title: 'ΕΑ-ΕΥ', write: true, types: ['EA', 'EY', 'EO'],
    sheetRe: /IATR|ΙΑΤΡ|ΕΑ.?ΕΥ/, titleRe: /ΕΑ\s*[-–/]?\s*ΕΥ|ΕΛΕΥΘΕΡ/,
    fields: [F('kind', 'Είδος (ΕΑ, ΕΥ, ΕΟ…)', 'ΕΑ-ΕΥ', /^ΕΑ\s*[-–/]\s*ΕΥ|^ΕΙΔΟΣ|ΕΞΑΙΡΕΣΗ/, { req: true }), FROM(), TO(), NOTE] },
  { id: 'hospital', label: 'Νοσοκομείο / αναρρωτικές', help: 'Πού (νοσοκομείο ή ΑΝ.ΑΔ), είσοδος, έξοδος', title: 'ΕΙΣΑΓΩΓΕΣ ΝΟΣΟΚΟΜΕΙΟ-ΑΝ.ΑΔ.', write: true, types: ['NOS', 'SICK'],
    sheetRe: /IATR|ΙΑΤΡ|ΝΟΣΟΚ/, titleRe: /ΝΟΣΟΚΟΜ|ΑΝ\s*\.?\s*ΑΔ|ΑΝΑΡΡΩΤ/,
    fields: [F('where', 'Εισαγωγή (νοσοκομείο / ΑΝ.ΑΔ)', 'Εισαγωγή', /^ΕΙΣΑΓΩΓΗ$|^ΝΟΣΟΚΟΜΕΙΟ$/), FROM('ΕΙΣ'), TO('ΕΞ'), NOTE] },
  { id: 'step', label: 'Εισαγωγές ΣΤΕΠ', help: 'Είσοδος, έξοδος', title: 'ΕΙΣΑΓΩΓΕΣ ΣΤΕΠ', write: true, types: ['STEP'],
    sheetRe: /IATR|ΙΑΤΡ|ΣΤΕΠ/, titleRe: /ΣΤΕΠ/, fields: [FROM('ΕΙΣ'), TO('ΕΞ'), NOTE] },
  { id: 'leave', label: 'Άδειες', help: 'Είδος άδειας, από, έως', title: 'ΑΔΕΙΕΣ', write: true, types: ['LEAVE', 'HON'],
    sheetRe: /ΑΔΕΙ/, titleRe: /ΑΔΕΙ/, fields: [F('kind', 'Είδος άδειας', 'ΕΙΔΟΣ ΑΔΕΙΑΣ', /ΕΙΔΟΣ ΑΔΕΙΑΣ|^ΑΔΕΙΑ$/), FROM(), TO(), NOTE] },
  { id: 'posts', label: 'Πόστα', help: 'Μόνιμες αναθέσεις (ΚΨΜ, ιατρείο…)· διαβάζονται μαζί με το προσωπικό', title: 'ΠΟΣΤΑ', write: false,
    sheetRe: /ΠΟΣΤΑ/, titleRe: /ΠΟΣΤΑ/, fields: [F('post', 'Πόστο', 'Πόστο', /^ΠΟΣΤΟ$/, { req: true })] },
  { id: 'outside', label: 'Εκτός δύναμης', help: 'Αναβολές κ.λπ.· διαβάζονται μαζί με το προσωπικό', title: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ', write: false,
    sheetRe: /ΕΚΤΟΣ/, titleRe: /ΕΚΤΟΣ ΔΥΝΑΜ/, fields: [F('remarks', 'Παρατηρήσεις (λόγος)', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$|^ΑΙΤΙΑ$/)] }
];
export const KIND: Record<ListKind, KindDef> = Object.fromEntries(KINDS.map(k => [k.id, k])) as Record<ListKind, KindDef>;
export const STATUS_KINDS: StatusKind[] = ['punish', 'medical', 'hospital', 'step', 'leave'];
export const isStatusKind = (k: ListKind): k is StatusKind => (STATUS_KINDS as string[]).includes(k);
// Το προσωπικό δεν έχει «ονοματεπώνυμο σε ένα κελί» (το Δυναμολόγιο τα έχει χωριστά) ούτε Α/Α που να μετράει
export const fieldsOf = (k: ListKind): FieldDef[] => [...PERSON_FIELDS.filter(f => !(k === 'people' || k === 'posts' || k === 'outside') || f.k !== 'name'), ...KIND[k].fields];
export const kindOfType = (t: TypeKey): StatusKind | null => (STATUS_KINDS.find(k => KIND[k].types!.includes(t)) || null);

// ------------------------------------------------------------------ κείμενα κελιών
export const cellText = (v: CellValue): string => {
  if (v == null) return '';
  if (v instanceof Date) return isoOf(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v).replace(/\s+/g, ' ').trim();
};
// Επικεφαλίδα: κεφαλαία χωρίς τόνους, μονά κενά, χωρίς τελείες/άνω-κάτω τελεία στο τέλος
export const headText = (v: CellValue) => normGreek(cellText(v)).replace(/\s+/g, ' ').replace(/[.:]+$/, '').trim();
const isoOf = (d: Date) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
export const colLetter = (n: number) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// Ημερομηνία από κελί: ημερομηνία του Excel, αριθμός ημερών, ή κείμενο 17/9/26, 17-09-2026, 17.9.2026
export function parseDate(v: CellValue): ISODate | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(+v) ? null : isoOf(v);
  if (typeof v === 'number') return v > 20000 && v < 80000 ? isoOf(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)) : null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2}|\d{4})$/.exec(s);
  if (m) return ok(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}
function ok(y: number, m: number, d: number): ISODate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const x = new Date(Date.UTC(y, m - 1, d)); if (x.getUTCMonth() !== m - 1) return null;
  return isoOf(x);
}

// ------------------------------------------------------------------ αναγνώριση πινάκων
export function mapColumns(row: CellValue[] | undefined, fields: FieldDef[]): Record<string, number> {
  const cols: Record<string, number> = {};
  (row || []).forEach((v, c) => {
    const h = headText(v); if (!h) return;
    const f = fields.find(x => cols[x.k] == null && x.re.test(h));
    if (f) cols[f.k] = c;
  });
  return cols;
}
const ALL_FIELDS = [...PERSON_FIELDS, ...KINDS.flatMap(k => k.fields)];
const IDENT = ['last', 'name', 'asm'];
// Γραμμή επικεφαλίδων: τουλάχιστον 3 γνωστές επικεφαλίδες, μία από τις οποίες δείχνει άτομο
export function isHeaderRow(row: CellValue[] | undefined): boolean {
  if (!row) return false;
  let t = 0; for (const v of row) if (typeof v === 'string' && v.trim()) t++;
  if (t < 3) return false;
  let n = 0, id = false;
  for (const v of row) { const h = headText(v); if (!h) continue; const f = ALL_FIELDS.find(x => x.re.test(h)); if (f) { n++; if (IDENT.includes(f.k)) id = true; } }
  return n >= 3 && id;
}
export interface TableHit { sheet: string; header: number; title: string; rows: number; best: ListKind | null; score: Partial<Record<ListKind, number>>; cols: Record<string, number> }

function titleAbove(sheet: RawSheet, header: number): string {
  for (let r = header - 1; r >= Math.max(0, header - 3); r--) {
    const t = (sheet.rows[r] || []).map(cellText).filter(Boolean);
    if (t.length && t.length <= 2 && /[Α-ΩA-Zα-ωa-z]/.test(t[0])) return t[0];
  }
  return '';
}
export function scoreKind(kind: ListKind, sheetName: string, title: string, header: CellValue[] | undefined): number {
  const k = KIND[kind]; const cols = mapColumns(header, fieldsOf(kind));
  const own = k.fields.filter(f => cols[f.k] != null).length, miss = k.fields.filter(f => f.req && cols[f.k] == null).length;
  let s = own * 3 - miss * 6;
  if (k.sheetRe.test(normGreek(sheetName))) s += 4;
  if (k.titleRe && k.titleRe.test(normGreek(title))) s += 6;
  if (kind === 'people') {
    const person = PERSON_FIELDS.filter(f => cols[f.k] != null).length;
    if (cols.from == null && cols.to == null) s += 2;
    s += person * 0.5;
    if (cols.last == null || cols.first == null) s -= 10;
  }
  return s;
}
const THRESHOLD = 8;
// Όλοι οι πίνακες με άτομα σε όλα τα φύλλα, με το είδος που μοιάζουν περισσότερο (ένα είδος ανά αρχείο, το πιο σίγουρο)
export function detectTables(sheets: RawSheet[]): TableHit[] {
  const hits: TableHit[] = [];
  for (const sh of sheets) {
    const max = Math.min(sh.rows.length, 2000);
    for (let r = 0; r < max; r++) {
      if (!isHeaderRow(sh.rows[r])) continue;
      const title = titleAbove(sh, r) || sh.name;
      const score: Partial<Record<ListKind, number>> = {};
      for (const k of KINDS) score[k.id] = scoreKind(k.id, sh.name, title, sh.rows[r]);
      const rows = tableRows(sh, r, mapColumns(sh.rows[r], ALL_FIELDS)).records.length;
      hits.push({ sheet: sh.name, header: r, title, rows, best: null, score, cols: {} });
    }
  }
  // κάθε είδος στον πίνακα που ταιριάζει καλύτερα· οι υπόλοιποι παίρνουν το επόμενο είδος ή κανένα
  const taken = new Set<ListKind>();
  const order = hits.flatMap(h => (Object.entries(h.score) as [ListKind, number][]).map(([k, v]) => ({ h, k, v }))).filter(x => x.v >= THRESHOLD).sort((a, b) => b.v - a.v);
  for (const { h, k } of order) { if (h.best || taken.has(k)) continue; h.best = k; taken.add(k); }
  for (const h of hits) if (h.best) h.cols = mapColumns(sheets.find(s => s.name === h.sheet)!.rows[h.header], fieldsOf(h.best));
  return hits;
}
// Ο πίνακας που ταιριάζει καλύτερα σε ένα είδος (όταν ο χρήστης διάλεξε αρχείο για συγκεκριμένο είδος)
export function bestFor(kind: ListKind, sheets: RawSheet[]): { sheet: string; header: number; cols: Record<string, number> } | null {
  let best: { sheet: string; header: number; cols: Record<string, number>; v: number } | null = null;
  for (const sh of sheets) for (let r = 0; r < Math.min(sh.rows.length, 2000); r++) {
    if (!isHeaderRow(sh.rows[r])) continue;
    const v = scoreKind(kind, sh.name, titleAbove(sh, r) || sh.name, sh.rows[r]);
    if (!best || v > best.v) best = { sheet: sh.name, header: r, cols: mapColumns(sh.rows[r], fieldsOf(kind)), v };
  }
  return best && { sheet: best.sheet, header: best.header, cols: best.cols };
}
// Προτεινόμενη στήλη για ένα πεδίο, από τις επικεφαλίδες (για το «προτείνεται» στην αντιστοίχιση)
export const suggestCols = (kind: ListKind, sheet: RawSheet | undefined, header: number) => mapColumns(sheet?.rows[header], fieldsOf(kind));

// ------------------------------------------------------------------ γραμμές πίνακα
export interface TableRow { r: number; v: Record<string, CellValue> }
export interface TableScan { records: TableRow[]; free: number[]; end: number; open: boolean; width: [number, number] }
// Από κάτω από τις επικεφαλίδες ως τον επόμενο τίτλο ή πίνακα: εγγραφές (με άτομο), ελεύθερες γραμμές
// (κενές ή μόνο με Α/Α και προσυμπληρωμένο βαθμό) και πού τελειώνει ο πίνακας. open = ως το τέλος του φύλλου.
export function tableRows(sheet: RawSheet, header: number, cols: Record<string, number>): TableScan {
  const head = sheet.rows[header] || [];
  const used = Object.values(cols);
  const hcols = head.map((v, i) => (cellText(v) ? i : -1)).filter(i => i >= 0);
  const width: [number, number] = [Math.min(...hcols, ...used, 99), Math.max(...hcols, ...used, 0)];
  const mapped = new Set(used); const aa = cols.aa;
  const records: TableRow[] = []; const free: number[] = [];
  let empty = 0, r = header + 1, last = header;
  const max = sheet.rows.length;
  for (; r < max; r++) {
    const row = sheet.rows[r] || [];
    if (isHeaderRow(row)) break;
    const has = (k: string) => cols[k] != null && cellText(row[cols[k]]) !== '';
    if (has('last') || has('first') || has('name') || has('asm')) {
      const v: Record<string, CellValue> = {}; for (const k in cols) v[k] = row[cols[k]];
      records.push({ r, v }); empty = 0; last = r; continue;
    }
    // τίτλος επόμενου πίνακα ή σύνολα: κείμενο σε στήλη χωρίς πεδίο, ή κείμενο στη στήλη Α/Α
    const stop = row.some((v, c) => { const t = cellText(v); if (!t) return false; return (c === aa && !/^\d+$/.test(t)) || (!mapped.has(c) && /[Α-ΩA-Zα-ωa-z]/.test(t)); });
    if (stop) break;
    free.push(r); last = Math.max(last, r);
    if (++empty > 60) break;
  }
  return { records, free, end: last, open: r >= max, width };
}

// ------------------------------------------------------------------ άτομα
export interface Matcher { (v: Record<string, CellValue>): { pid: number | null; cands: Person[] } }
const key2 = (a: string, b: string) => normGreek(a).replace(/[^Α-ΩA-Z0-9]/g, '') + '|' + normGreek(b).replace(/[^Α-ΩA-Z0-9]/g, '');
function lev(a: string, b: string): number {
  if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return m + n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
export function makeMatcher(people: Person[]): Matcher {
  const byAsm = new Map<string, Person>(), byName = new Map<string, Person[]>();
  for (const p of people) {
    if (p.asm) byAsm.set(p.asm.replace(/\s/g, ''), p);
    for (const k of [key2(p.last, p.first), key2(p.first, p.last)]) { const l = byName.get(k) || []; l.push(p); byName.set(k, l); }
  }
  const flat = people.map(p => ({ p, k: normGreek(p.last + p.first).replace(/[^Α-ΩA-Z]/g, '') }));
  return v => {
    const asm = cellText(v.asm).replace(/\s/g, '');
    if (asm && byAsm.has(asm)) return { pid: byAsm.get(asm)!.id, cands: [] };
    let last = cellText(v.last), first = cellText(v.first);
    if (!last && v.name != null) { const parts = cellText(v.name).split(' '); last = parts[0] || ''; first = parts.slice(1).join(' '); }
    if (last) {
      let l = byName.get(key2(last, first)) || [];
      if (l.length > 1 && v.father != null) { const f = normGreek(cellText(v.father)); const x = l.filter(p => normGreek(p.father) === f); if (x.length) l = x; }
      if (l.length > 1) { const act = l.filter(p => p.active); if (act.length) l = act; }
      if (l.length === 1) return { pid: l[0].id, cands: [] };
      if (l.length > 1) return { pid: null, cands: l.slice(0, 4) };
      // «ΠΑΠΑΔΟΠΟΥΛΟΣ Γ.»: επώνυμο και αρχικό
      if (/^[Α-ΩA-Z]\.?$/.test(normGreek(first))) {
        const ini = normGreek(first).charAt(0);
        const m = people.filter(p => normGreek(p.last) === normGreek(last) && normGreek(p.first).startsWith(ini));
        if (m.length === 1) return { pid: m[0].id, cands: [] };
      }
      const k = normGreek(last + first).replace(/[^Α-ΩA-Z]/g, '');
      const near = flat.map(x => ({ p: x.p, d: lev(k, x.k) / Math.max(k.length, x.k.length, 1) })).filter(x => x.d <= 0.34).sort((a, b) => a.d - b.d).slice(0, 4).map(x => x.p);
      return { pid: null, cands: near };
    }
    return { pid: null, cands: [] };
  };
}
export const rowName = (v: Record<string, CellValue>) => (cellText(v.name) || [cellText(v.rank), cellText(v.last), cellText(v.first)].filter(Boolean).join(' ')) || '(χωρίς όνομα)';

// ------------------------------------------------------------------ καταστάσεις από Excel
export interface Cand { r: number; who: string; pid: number | null; cands: Person[]; type: TypeKey | null; raw: string; from: ISODate; to: ISODate; kind?: string; note?: string; by?: string; reason?: string; noEnd?: boolean }
export interface ParseOut { cands: Cand[]; skipped: { r: number; who: string; why: string }[]; unknown: string[] }
const vk = (s: string) => normGreek(s).replace(/[^Α-ΩA-Z0-9]/g, '');
// Τιμή στη στήλη «είδος» → είδος κατάστασης. null = άγνωστο (το διαλέγει ο χρήστης· ως τότε μπαίνει η προεπιλογή του είδους).
export function typeOfValue(kind: StatusKind, raw: string, values?: Record<string, TypeKey>): TypeKey | null {
  const v = vk(raw);
  if (values && v && values[v]) return values[v];
  switch (kind) {
    case 'punish': return 'PUN';
    case 'step': return 'STEP';
    case 'leave': return /ΤΙΜΗΤ/.test(v) ? 'HON' : 'LEAVE';
    case 'hospital': return /^ΑΝ|ΑΝΑΡ/.test(v) ? 'SICK' : 'NOS';
    case 'medical':
      if (/^ΕΥ/.test(v) || /ΕΛΕΥΘΕΡΟΣΥΠΗΡ/.test(v)) return 'EY';
      if (/^ΕΟ/.test(v) || /ΟΡΘΟΣΤ/.test(v)) return 'EO';
      if (/^ΕΑ/.test(v) || /ΑΣΚΗΣ/.test(v)) return 'EA';
      return null;
  }
}
export const valueKey = vk;
export const DEFAULT_TYPE: Record<StatusKind, TypeKey> = { punish: 'PUN', medical: 'EA', hospital: 'NOS', step: 'STEP', leave: 'LEAVE' };
const punKind = (raw: string) => { const v = vk(raw); return PUN_KINDS.find(k => vk(k) === v || v.startsWith(vk(k).slice(0, 5))) || (raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : ''); };

export function parseStatuses(kind: StatusKind, sheet: RawSheet, b: SourceBinding, people: Person[], today: ISODate): ParseOut {
  const scan = tableRows(sheet, b.header, b.cols); const match = makeMatcher(people);
  const out: ParseOut = { cands: [], skipped: [], unknown: [] }; const unk = new Map<string, string>();
  for (const { r, v } of scan.records) {
    const who = rowName(v);
    const from = parseDate(v.from); let to = parseDate(v.to);
    if (!from) { out.skipped.push({ r, who, why: cellText(v.from) ? 'η ημερομηνία «' + cellText(v.from) + '» δεν διαβάζεται' : 'χωρίς ημερομηνία έναρξης' }); continue; }
    let noEnd = false;
    if (!to) { to = from > today ? from : today; noEnd = true; }
    if (to < from) { out.skipped.push({ r, who, why: 'το «έως» είναι πριν από το «από»' }); continue; }
    const raw = cellText(kind === 'hospital' ? v.where : v.kind);
    const type = typeOfValue(kind, raw, b.values);
    if (!type && raw && !unk.has(vk(raw))) unk.set(vk(raw), raw);
    const m = match(v);
    const c: Cand = { r, who, pid: m.pid, cands: m.cands, type, raw, from, to, noEnd };
    if (kind === 'punish') { if (raw) c.kind = punKind(raw); if (cellText(v.by)) c.by = cellText(v.by); if (cellText(v.reason)) c.reason = cellText(v.reason); }
    else if (kind === 'medical' || kind === 'leave') { if (raw && !(kind === 'medical' && TYPES[type || 'EA'].label === norm(raw))) c.kind = raw; }
    else if (kind === 'hospital' && raw) c.kind = raw;
    if (cellText(v.note)) c.note = cellText(v.note);
    out.cands.push(c);
  }
  out.unknown = [...unk.values()];
  return out;
}

// Ταυτότητα εγγραφής για σύγκριση Excel ↔ εφαρμογή: άτομο, ομάδα ειδών και ημερομηνία έναρξης
export const identity = (pid: number, kind: StatusKind, from: ISODate) => pid + '|' + kind + '|' + from;
export interface Diff {
  add: Omit<Status, 'id'>[]; update: { id: string; patch: Partial<Status>; who: string; what: string }[]; same: number;
  unmatched: Cand[]; dup: Cand[]; appOnly: Status[]; keys: string[];
}
// choices: γραμμή → άτομο, για όσους δεν ταίριαξαν μόνοι τους (null = παράλειψη)
export function diffStatuses(kind: StatusKind, s: AppState, parsed: ParseOut, b: SourceBinding, choices: Record<number, number | null> = {}): Diff {
  const types = KIND[kind].types!;
  const mine = s.statuses.filter(x => types.includes(x.type));
  const idx = new Map(mine.map(x => [identity(x.pid, kind, x.from), x]));
  const d: Diff = { add: [], update: [], same: 0, unmatched: [], dup: [], appOnly: [], keys: [] };
  const seen = new Set<string>(); const pm = new Map(s.people.map(p => [p.id, p]));
  const has = (k: string) => b.cols[k] != null;
  for (const c of parsed.cands) {
    const pid = c.pid ?? (c.r in choices ? choices[c.r] : null);
    if (pid == null) { if (!(c.r in choices)) d.unmatched.push(c); continue; }
    const id = identity(pid, kind, c.from);
    if (seen.has(id)) { d.dup.push(c); continue; }
    seen.add(id); d.keys.push(id);
    const type = c.type || DEFAULT_TYPE[kind];
    const cur = idx.get(id);
    if (!cur) {
      const st: Omit<Status, 'id'> = { pid, type, from: c.from, to: c.to };
      if (c.kind) st.kind = c.kind; if (c.note) st.note = c.note;
      if (kind === 'punish') { st.kind = c.kind || PUN_KINDS[0]; if (c.by) st.by = c.by; if (c.reason) st.reason = c.reason; }
      d.add.push(st); continue;
    }
    // αλλάζει μόνο ό,τι υπάρχει ως στήλη στο Excel· ό,τι δεν υπάρχει μένει όπως είναι στην εφαρμογή
    const patch: Partial<Status> = {}; const what: string[] = [];
    if (has('to') && !c.noEnd && cur.to !== c.to) { patch.to = c.to; what.push('έως ' + c.to.slice(8) + '/' + c.to.slice(5, 7)); }
    if ((has('kind') || has('where')) && c.raw && cur.type !== type) { patch.type = type; what.push(TYPES[type].label); }
    if ((has('kind') || has('where')) && (c.kind || '') !== (cur.kind || '') && c.kind) { patch.kind = c.kind; what.push(c.kind); }
    if (has('note') && (c.note || '') !== (cur.note || '')) { patch.note = c.note || ''; what.push('παρατηρήσεις'); }
    if (kind === 'punish' && has('by') && c.by && c.by !== (cur.by || '')) { patch.by = c.by; what.push('ποιος την επέβαλε'); }
    if (kind === 'punish' && has('reason') && c.reason && c.reason !== (cur.reason || '')) { patch.reason = c.reason; what.push('αιτία'); }
    if (cur.pending && kind === 'punish') { patch.pending = false; what.push('εγκρίθηκε'); }
    if (what.length) d.update.push({ id: cur.id, patch, who: pm.get(pid) ? pm.get(pid)!.last + ' ' + pm.get(pid)!.first : c.who, what: what.join(', ') });
    else d.same++;
  }
  d.appOnly = mine.filter(x => !seen.has(identity(x.pid, kind, x.from)));
  return d;
}

// ------------------------------------------------------------------ εγγραφή στο Excel
export type WVal = string | number | { date: ISODate } | null;
export interface WritePlan {
  sets: { r: number; c: number; v: WVal }[];                  // σε υπάρχουσες γραμμές (από 0)
  insert: { after: number; n: number; tpl: number } | null;   // νέες γραμμές μετά από αυτή, με τη μορφή της tpl
  header: { r: number; c: number; v: string; title?: boolean }[]; // καινούργιος πίνακας: τίτλος και επικεφαλίδες
  keys: string[]; added: number; changed: number; cleared: number; foreign: number;
}
const num = (s: string): string | number => (/^[1-9]\d{0,14}$/.test(s) ? Number(s) : s);
// Τιμές ενός πεδίου για μια κατάσταση της εφαρμογής
export function fieldValue(k: string, kind: StatusKind, st: Status, p: Person | undefined): WVal {
  switch (k) {
    case 'rank': return p?.rank || null;
    case 'spec': return p?.spec || null;
    case 'last': return p?.last || null;
    case 'first': return p?.first || null;
    case 'name': return p ? p.last + ' ' + p.first : null;
    case 'father': return p?.father || null;
    case 'asm': return p?.asm ? num(p.asm) : null;
    case 'phone': return p?.phone ? num(p.phone) : null;
    case 'room': return p?.room ?? null;
    case 'from': return { date: st.from };
    case 'to': return { date: st.to };
    case 'days': return Math.round((Date.parse(st.to) - Date.parse(st.from)) / 86400000) + 1;
    case 'kind': return kind === 'medical' ? (st.kind || TYPES[st.type].label) : kind === 'leave' ? (st.kind || (st.type === 'HON' ? 'ΤΙΜΗΤΙΚΗ' : 'ΚΑΝΟΝΙΚΗ')) : (st.kind || null);
    case 'where': return st.kind || (st.type === 'SICK' ? 'ΑΝ.ΑΔ' : 'ΝΟΣΟΚΟΜΕΙΟ');
    case 'note': return st.note || null;
    case 'by': return st.by || null;
    case 'reason': return st.reason || null;
    default: return null;
  }
}
const same = (a: CellValue, b: WVal) => {
  if (b == null) return cellText(a) === '';
  if (typeof b === 'object') return parseDate(a) === b.date;
  return normGreek(cellText(a)) === normGreek(String(b));
};
// Οι εγγραφές της εφαρμογής που ανήκουν σε αυτό το Excel
export function wanted(kind: StatusKind, s: AppState, b: SourceBinding, today: ISODate): Status[] {
  const types = KIND[kind].types!; const pm = new Map(s.people.map(p => [p.id, p]));
  // ποινή που ακόμα αιτείται δεν είναι «τιμωρημένος»: μπαίνει στο Excel όταν εγκριθεί
  return s.statuses.filter(x => types.includes(x.type) && pm.has(x.pid) && !x.pending && (b.scope !== 'active' || x.to >= today))
    .sort((a, b2) => a.from.localeCompare(b2.from) || collator.compare(pm.get(a.pid)!.last, pm.get(b2.pid)!.last));
}
// Τι αλλάζει στο φύλλο ώστε να έχει ό,τι έχει η εφαρμογή. Δεν αγγίζει γραμμές που δεν ξέρει (γράφτηκαν με το χέρι
// και δεν έχουν περάσει ακόμα στην εφαρμογή): μόνο όσες ταιριάζουν με εγγραφή της ή όσες έγραψε η ίδια παλιότερα (synced).
export function planWrite(kind: StatusKind, sheet: RawSheet | null, b: SourceBinding, s: AppState, synced: string[], today: ISODate): WritePlan {
  const plan: WritePlan = { sets: [], insert: null, header: [], keys: [], added: 0, changed: 0, cleared: 0, foreign: 0 };
  const pm = new Map(s.people.map(p => [p.id, p]));
  const want = wanted(kind, s, b, today);
  const rows = sheet?.rows || [];
  const fields = Object.keys(b.cols).filter(k => k !== 'aa');
  // καινούργιος πίνακας: επικεφαλίδες (και τίτλος από πάνω) αν η γραμμή είναι κενή
  if (!(rows[b.header] || []).some(v => cellText(v))) {
    const defs = fieldsOf(kind);
    for (const [k, c] of Object.entries(b.cols)) plan.header.push({ r: b.header, c, v: defs.find(f => f.k === k)?.head || k });
    if (b.header > 0 && !(rows[b.header - 1] || []).some(v => cellText(v))) plan.header.push({ r: b.header - 1, c: Math.min(...Object.values(b.cols)), v: KIND[kind].title, title: true });
  }
  const scan = sheet ? tableRows(sheet, b.header, b.cols) : { records: [], free: [], end: b.header, open: true, width: [0, 0] as [number, number] };
  const match = makeMatcher(s.people);
  const byId = new Map(want.map(x => [identity(x.pid, kind, x.from), x]));
  const syncedSet = new Set(synced); const placed = new Set<string>();
  const free = [...scan.free];
  const clearRow = (r: number) => {
    const row = rows[r] || [];
    for (let c = scan.width[0]; c <= scan.width[1]; c++) if (c !== b.cols.aa && cellText(row[c]) !== '') plan.sets.push({ r, c, v: null });
  };
  for (const { r, v } of scan.records) {
    const m = match(v); const from = parseDate(v.from);
    const id = m.pid != null && from ? identity(m.pid, kind, from) : null;
    const st = id ? byId.get(id) : undefined;
    if (st && !placed.has(id!)) {
      placed.add(id!); plan.keys.push(id!);
      let ch = false;
      for (const k of fields) {
        if (['rank', 'spec', 'last', 'first', 'name', 'father', 'asm', 'phone', 'room'].includes(k)) continue;   // τα στοιχεία του ατόμου τα κρατά το Excel
        const val = fieldValue(k, kind, st, pm.get(st.pid));
        if (!same(v[k], val)) { plan.sets.push({ r, c: b.cols[k], v: val }); ch = true; }
      }
      if (ch) plan.changed++;
    } else if (id && (syncedSet.has(id) || placed.has(id))) { clearRow(r); free.push(r); plan.cleared++; }
    else plan.foreign++;
  }
  free.sort((a, c) => a - c);
  const fresh = want.filter(x => !placed.has(identity(x.pid, kind, x.from)));
  const put = (r: number, st: Status) => { for (const k of fields) { const val = fieldValue(k, kind, st, pm.get(st.pid)); if (val != null) plan.sets.push({ r, c: b.cols[k], v: val }); } };
  // Α/Α: ο αύξων αριθμός στις γραμμές που δεν τον έχουν
  const aa = (r: number, n: number) => { if (b.cols.aa != null && cellText((rows[r] || [])[b.cols.aa]) === '') plan.sets.push({ r, c: b.cols.aa, v: n }); };
  let n = scan.records.length - plan.cleared;
  let i = 0;
  for (; i < fresh.length && i < free.length; i++) { put(free[i], fresh[i]); aa(free[i], ++n); plan.keys.push(identity(fresh[i].pid, kind, fresh[i].from)); }
  const rest = fresh.slice(i);
  if (rest.length) {
    const after = Math.max(scan.end, b.header);
    const tpl = scan.records.length ? scan.records[scan.records.length - 1].r : scan.free.length ? scan.free[0] : b.header;
    plan.insert = { after, n: rest.length, tpl };
    rest.forEach((st, j) => { const r = after + 1 + j; put(r, st); if (b.cols.aa != null) plan.sets.push({ r, c: b.cols.aa, v: ++n }); plan.keys.push(identity(st.pid, kind, st.from)); });
  }
  plan.added = fresh.length;
  return plan;
}
// Προεπιλεγμένη διάταξη για καινούργιο πίνακα (όπως τα φύλλα του Δυναμολογίου)
export function defaultBinding(kind: ListKind, file: string, sheet = KIND[kind].title.slice(0, 31)): SourceBinding {
  const keys = ['aa', 'rank', 'spec', 'last', 'first', 'father', 'asm', 'phone', 'room', ...KIND[kind].fields.filter(f => f.k !== 'days').map(f => f.k)];
  return { file, sheet, header: 1, cols: Object.fromEntries(keys.map((k, i) => [k, i])), write: isStatusKind(kind), scope: 'all' };
}
// Τι λείπει από μια αντιστοίχιση για να δουλέψει
export function missingFields(kind: ListKind, cols: Record<string, number>): string[] {
  const out: string[] = [];
  const hasPerson = cols.asm != null || cols.name != null || (cols.last != null && cols.first != null);
  if (!hasPerson) out.push('Επώνυμο και Όνομα (ή ΑΣΜ)');
  for (const f of KIND[kind].fields) if (f.req && cols[f.k] == null) out.push(f.label);
  return out;
}
export const bindingText = (b: SourceBinding) => b.file.split(/[\\/]/).pop() + ' › ' + b.sheet + ' · γραμμή ' + (b.header + 1);
export const addDaysSafe = addDays;

// ------------------------------------------------------------------ ΗΚΑΙ: πού μπαίνει κάθε αριθμός
// Γραμμή ανά βαθμό και στήλη ανά είδος (κωλυόμενοι, απόντες), όπως στο έντυπο του δείγματος 15.
export interface HkaiMap { title: string; date: string; rows: Record<string, number>; cols: Record<string, string> }
export const HK_RANKS = ['Επίλαρχοι', 'Ίλαρχοι', 'Ανθυπίλαρχοι-Ανθλγοι', 'Ανθυπασπιστές', 'ΔΕΑ', 'Αρχιλοχίες', 'Επιλοχίες', 'Λοχίες', 'Δεκανείς', 'ΕΠΟΠ Στρατιώτης', 'ΟΒΑ Στρατιώτης', 'Στρατιώτες'];
// κλειδί → [όνομα για τον χρήστη, επικεφαλίδα στο έντυπο]
export const HK_COLS: [string, string, RegExp][] = [
  ['placed', 'Τοποθετημένοι', /ΤΟΠΟΘΕΤΗΜΕΝΟΙ/], ['attached', 'Προσκολλημένοι', /ΠΡΟΣΚΟΛ/], ['sum', 'Σύνολο δύναμης (τύπος)', /^ΣΥΝΟΛΟ$/],
  ['yp', 'Υπηρεσία εντός στρατοπέδου', /ΥΠΗΡΕΣΙΑ ΕΝΤΟΣ/], ['ey', 'Ελεύθεροι υπηρεσίας', /ΕΛΕΥΘΕΡΟΙ ΥΠΗΡ/], ['tim', 'Τιμωρημένοι', /ΤΙΜΩΡΗΜΕΝΟΙ/], ['bl', '(κενή στήλη)', /^$/],
  ['os', 'Ο/Σ', /^Ο\s*\/\s*Σ$/], ['mag', 'Μαγειρεία', /ΜΑΓΕΙΡ/], ['sid', 'Σιδηρουργείο', /ΣΙΔΗΡΟΥΡΓ/], ['kin', 'Σε κίνηση', /ΚΙΝΗΣΗ/], ['sumK', 'Σύνολο κωλυομένων (τύπος)', /ΣΥΝΟΛΟ ΚΩΛΥΟΜ/],
  ['ka', 'Κανονικές άδειες', /ΚΑΝΟΝΙΚΕΣ/], ['an', 'Αναρρωτικές', /ΑΝΑΡΡΩΤ/], ['eid', 'Ειδικές άδειες', /ΕΙΔΙΚΕΣ/], ['nos', 'Νοσοκομείο', /ΝΟΣΟΚΟΜ/], ['prat', 'Πρατήριο', /ΠΡΑΤΗΡΙΟ/],
  ['adik', 'Αγνοούμενοι / αδικαιολόγητα', /ΑΓΝΟΟΥΜ|ΑΔΙΚΑΙΟΛ/], ['fp', 'Φύλλα πορείας', /ΠΟΡΕΙΑΣ/], ['fyl', 'Φυλάκια', /ΦΥΛΑΚΙΑ/], ['apal', 'Απαλλαγή', /ΑΠΑΛΛΑΓΗ/],
  ['ekp', 'Αποσπασμένοι σε εκπαίδευση', /ΣΕ ΕΚΠΑΙΔΕΥΣΗ/], ['allh', 'Αποσπασμένοι σε άλλη μονάδα', /ΑΛΛΗ ΜΟΝΑΔΑ/], ['sumA', 'Σύνολο απόντων (τύπος)', /ΣΥΝΟΛΟ ΑΠΟΝΤ/],
  ['avail', 'Διαθέσιμοι (τύπος)', /ΔΙΑΘΕΣΙΜΟΙ/], ['ab', 'Μισθοτροφοδοτηθέντες', /ΜΙΣΘΟΤΡΟΦ/]
];
export const HKAI_DEFAULT: HkaiMap = {
  title: 'A4', date: 'V34',
  rows: Object.fromEntries(HK_RANKS.map((r, i) => [r, i < 5 ? 17 + i : 23 + i - 5])),
  cols: { placed: 'C', attached: 'D', sum: 'E', yp: 'F', ey: 'G', tim: 'H', bl: 'I', os: 'J', mag: 'K', sid: 'L', kin: 'M', sumK: 'N', ka: 'O', an: 'P', eid: 'Q', nos: 'R', prat: 'S', adik: 'T', fp: 'U', fyl: 'V', apal: 'W', ekp: 'X', allh: 'Y', sumA: 'Z', avail: 'AA', ab: 'AB' }
};
// Βρίσκει γραμμές και στήλες της ΗΚΑΙ από τα κείμενα του εντύπου. Ό,τι δεν βρεθεί μένει όπως στο δείγμα.
export function detectHkai(sheet: RawSheet, place = 'Αυλώνας'): { map: HkaiMap; found: number; total: number; missing: string[] } {
  const map: HkaiMap = JSON.parse(JSON.stringify(HKAI_DEFAULT)); const missing: string[] = []; let found = 0;
  const rows = sheet.rows.slice(0, 120);
  const rk = (s: string) => normGreek(s).replace(/[^Α-ΩA-Z]/g, '');
  for (const r of HK_RANKS) {
    const i = rows.findIndex(row => (row || []).slice(0, 4).some(v => rk(cellText(v)) === rk(r)));
    if (i >= 0) { map.rows[r] = i + 1; found++; } else missing.push(r);
  }
  // επικεφαλίδες: οι γραμμές πάνω από τον πρώτο βαθμό
  const top = Math.min(...Object.values(map.rows)) - 1;
  const at: Record<string, number> = {};
  for (let r = Math.max(0, top - 14); r < top; r++) (rows[r] || []).forEach((v, c) => {
    const h = headText(v); if (!h) return;
    for (const [k, , re] of HK_COLS) if (at[k] == null && k !== 'bl' && re.test(h)) { at[k] = c; break; }
  });
  if (at.tim != null && at.os != null && at.os - at.tim === 2) at.bl = at.tim + 1;
  for (const [k, label] of HK_COLS) { if (at[k] != null) { map.cols[k] = colLetter(at[k]); found++; } else missing.push(label); }
  const cell = (re: RegExp) => { for (let r = 0; r < rows.length; r++) { const row = rows[r] || []; for (let c = 0; c < row.length; c++) if (re.test(headText(row[c]))) return colLetter(c) + (r + 1); } return null; };
  const t = cell(/ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ/); if (t) { map.title = t; found++; } else missing.push('Τίτλος');
  const pl = normGreek(place).replace(/[^Α-ΩA-Z]/g, '');
  const d = pl ? cell(new RegExp('^' + pl + '\\s*,')) : null; if (d) { map.date = d; found++; } else missing.push('Τόπος και ημερομηνία');
  return { map, found, total: HK_RANKS.length + HK_COLS.length + 2, missing };
}
export const hkaiMapOf = (cells?: Partial<HkaiMap>): HkaiMap => ({
  title: cells?.title || HKAI_DEFAULT.title, date: cells?.date || HKAI_DEFAULT.date,
  rows: { ...HKAI_DEFAULT.rows, ...(cells?.rows || {}) }, cols: { ...HKAI_DEFAULT.cols, ...(cells?.cols || {}) }
});

// ------------------------------------------------------------------ προσωπικό: διορθώσεις πίσω στο Δυναμολόγιο
// Γράφονται μόνο όσα άλλαξαν στην εφαρμογή από την τελευταία ανάγνωση/εγγραφή (snap), στη γραμμή του ίδιου ατόμου.
// Γραμμές δεν προστίθενται ούτε σβήνονται: το Δυναμολόγιο μένει η λίστα του λοχία.
export const PEOPLE_SYNC = ['rank', 'spec', 'last', 'first', 'father', 'asm', 'phone', 'room', 'si', 'remarks'];
export type PersonSnap = Record<string, string>;
export const personVals = (p: Person): PersonSnap => ({
  rank: p.rank || '', spec: p.spec || '', last: p.last || '', first: p.first || '', father: p.father || '', asm: p.asm || '',
  phone: p.phone || '', room: p.room == null ? '' : String(p.room), si: p.si || '', remarks: p.role || ''
});
export const snapPeople = (people: Person[]): Record<number, PersonSnap> => Object.fromEntries(people.map(p => [p.id, personVals(p)]));
export interface PeoplePlan { sets: { r: number; c: number; v: WVal }[]; changed: number; notFound: string[]; snap: Record<number, PersonSnap> }
export function planPeopleWrite(sheet: RawSheet, b: SourceBinding, s: AppState, snap: Record<number, PersonSnap>): PeoplePlan {
  const plan: PeoplePlan = { sets: [], changed: 0, notFound: [], snap: { ...snap } };
  const scan = tableRows(sheet, b.header, b.cols);
  const byAsm = new Map<string, TableRow>(), byName = new Map<string, TableRow[]>();
  for (const row of scan.records) {
    const asm = cellText(row.v.asm).replace(/\s/g, ''); if (asm) byAsm.set(asm, row);
    const k = key2(cellText(row.v.last), cellText(row.v.first)); const l = byName.get(k) || []; l.push(row); byName.set(k, l);
  }
  const find = (v: PersonSnap): TableRow | undefined => {
    if (v.asm && byAsm.has(v.asm)) return byAsm.get(v.asm);
    const l = byName.get(key2(v.last, v.first)) || [];
    return l.length === 1 ? l[0] : l.find(x => normGreek(cellText(x.v.father)) === normGreek(v.father));
  };
  for (const p of s.people) {
    const old = snap[p.id]; if (!old) continue;
    const cur = personVals(p);
    const diff = PEOPLE_SYNC.filter(k => b.cols[k] != null && cur[k] !== (old[k] || '') && cur[k] !== '');
    if (!diff.length) continue;
    const row = find(old) || find(cur);
    if (!row) { plan.notFound.push(p.last + ' ' + p.first); continue; }
    let ch = false;
    for (const k of diff) {
      const v: WVal = k === 'room' ? Number(cur.room) : k === 'asm' || k === 'phone' ? num(cur[k]) : cur[k];
      if (!same(row.v[k], v)) { plan.sets.push({ r: row.r, c: b.cols[k], v }); ch = true; }
    }
    if (ch) plan.changed++;
    plan.snap[p.id] = cur;
  }
  return plan;
}
