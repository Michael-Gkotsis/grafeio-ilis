// Αρχεία Excel της Ίλης (Michael, 11/10): για κάθε είδος δεδομένων (ποινές, ιατρικά, άδειες…) από ποιο αρχείο,
// ποιο φύλλο και ποιον πίνακα διαβάζει η εφαρμογή, και πού γράφει τις αλλαγές της.
// Αναγνώριση από τις επικεφαλίδες (06 §3.2)· ό,τι δεν βρεθεί το διαλέγει ο χρήστης με κλικ, με πρόταση όπου υπάρχει.
// Όλα εδώ είναι καθαρές συναρτήσεις: τις τρέχουν και το UI (προεπισκόπηση) και ο main (εισαγωγή, εγγραφή).
import { addDays, type ISODate } from './dates';
import { norm, normGreek, collator, upper } from './text';
import { KIND_NAME, OUT_NOTE, PUN_KINDS, TYPES, fatherTxt, fullName, type AppState, type DutyKind, type Person, type SeatlessDuty, type Status, type TypeKey } from './domain';
import { bareOf, codeOf, readDuty, type CellDuty } from './codes';
import { dm, MONTHS as MONTH_NAMES } from './dates';
import { DN_HEAD, DN_WORD, isDnYes, isPersonRow, stripDn, type CellValue, type RawSheet } from './roster';
import { isHol, postBy } from './rules';
import { listOf, medTypeOf, optionsOf, type ListId, type UserLists } from './ranks';
import { parseSi, siCombos, siLabel } from './si';
import { cellTime, timeNames } from './hours';
import { essoName } from './esso';
export { OUT_NOTE };

export type ListKind = 'people' | 'punish' | 'medical' | 'hospital' | 'step' | 'leave' | 'dn' | 'posts' | 'outside' | 'caps' | 'duties';
export type StatusKind = 'punish' | 'medical' | 'hospital' | 'step' | 'leave' | 'dn';
export type FormKind = 'froura' | 'frouraSpen' | 'hkai' | 'outs' | 'check';
export const FORM_KINDS: FormKind[] = ['froura', 'frouraSpen', 'hkai', 'outs', 'check'];

// Πού βρίσκεται ένα είδος: αρχείο, φύλλο, γραμμή επικεφαλίδων (από 0) και στήλη κάθε πεδίου (από 0)
export interface SourceBinding {
  file: string;
  sheet: string;
  header: number;
  cols: Record<string, number>;
  write?: boolean;                   // η εφαρμογή γράφει εδώ τις αλλαγές της (μόνο για καταστάσεις)
  scope?: 'all' | 'active';          // τι γράφει: όλες τις εγγραφές ή μόνο όσες ισχύουν σήμερα και μετά
  values?: Record<string, TypeKey>;  // τιμές του Excel που δεν αναγνωρίζονται μόνες τους (π.χ. «ΕΛ ΑΡΒ») → είδος
  month?: string;                    // έλεγχος υπηρεσιών: ο μήνας του φύλλου (ΕΕΕΕ-ΜΜ), όταν ο τίτλος δεν τον γράφει
  autoRead?: boolean;                // καταστάσεις: απλές αλλαγές του Excel (νέες εγγραφές, άλλη ημερομηνία) περνούν μόνες τους (προεπιλογή ναι)
  heads?: Record<string, string>;    // επικεφαλίδα (headText) της στήλης κάθε πεδίου όπως ήταν όταν την είδε ο main (stampHeads): ξεχωρίζει «άλλαξε η στήλη του πεδίου» από «πάντα είχε δική σου επικεφαλίδα»
}
// Ο μήνας ενός φύλλου ελέγχου υπηρεσιών: από τον τίτλο, αλλιώς αυτός που διάλεξε ο χρήστης στην ανάγνωση
export const bindingMonth = (sheet: RawSheet, b: SourceBinding, today: ISODate) => sheetMonth(sheet, b.header, today) || b.month || null;
// Έντυπο: ποιο template (αρχείο και φύλλο) και πού βγαίνει. Κενό = προεπιλογή της εφαρμογής.
export interface FormBinding {
  file?: string;
  sheet?: string;                    // ΗΚΑΙ: μπροστινή σελίδα· Εξοδούχοι: φύλλο εξοδούχων
  sheet2?: string;                   // ΗΚΑΙ: πίσω σελίδα· Εξοδούχοι: φύλλο παραμενόντων
  dir?: string;                      // φάκελος εξόδου (κενό = ο γενικός των Ρυθμίσεων)
  monthly?: boolean;                 // υποφάκελος ανά μήνα (προεπιλογή ναι), και στον γενικό φάκελο
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
// Ώρες άδειας (Michael, 13/10): προαιρετικές στήλες· όταν λείπουν και μια άδεια έχει ώρα, η εφαρμογή τις προσθέτει (timeCols)
const TOUT = F('tout', 'Ώρα αναχώρησης', 'ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ', /^ΩΡΑ ΑΝΑΧ|^ΩΡΑ ΑΠΟ$|^ΩΡΑ ΕΝΑΡΞ|^ΩΡΑ ΕΞΟΔ/);
const TIN = F('tin', 'Ώρα επιστροφής', 'ΩΡΑ ΕΠΙΣΤΡΟΦΗΣ', /^ΩΡΑ ΕΠΙΣΤΡ|^ΩΡΑ ΕΩΣ$|^ΩΡΑ ΛΗΞ|^ΩΡΑ ΕΠΑΝ/);
export const TIME_FIELDS = ['tout', 'tin'];
// Νοσοκομείο, αναρρωτική και ΣΤΕΠ (Michael, 18/10): ώρα εισαγωγής και ώρα εξόδου, με τον ίδιο τρόπο
const HOUT = F('tout', 'Ώρα εισαγωγής', 'ΩΡΑ ΕΙΣΑΓΩΓΗΣ', /^ΩΡΑ ΕΙΣ|^ΩΡΑ ΑΠΟ$/);
const HIN = F('tin', 'Ώρα εξόδου', 'ΩΡΑ ΕΞΟΔΟΥ', /^ΩΡΑ ΕΞ|^ΩΡΑ ΕΩΣ$/);

export interface KindDef {
  id: ListKind; label: string; help: string; fields: FieldDef[]; sheetRe: RegExp; titleRe?: RegExp;
  types?: TypeKey[]; title: string; write: boolean;
}
export const KINDS: KindDef[] = [
  { id: 'people', label: 'Προσωπικό (Δυναμολόγιο)', help: 'Βαθμός, ονοματεπώνυμο, ΑΣΜ, τηλέφωνο, θάλαμος, Σ.Ι., ρόλος, δικαίωμα ΔΝ', title: 'ΣΥΝΟΛΙΚΟ', write: false,
    sheetRe: /ΣΥΝΟΛΙΚΟ|ΔΥΝΑΜΟΛΟΓΙΟ/, fields: [F('si', 'Σ.Ι.', 'Σ.Ι', /^Σ\s*\.?\s*Ι\.?$/), F('remarks', 'Παρατηρήσεις (ρόλος)', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$/),
      F('dn', 'Δικαίωμα ΔΝ', 'ΔΝ', DN_HEAD)] },
  { id: 'punish', label: 'Ποινές (τιμωρημένοι)', help: 'Από, έως, είδος ποινής', title: 'ΤΙΜΩΡΗΜΕΝΟΙ', write: true, types: ['PUN'],
    sheetRe: /ΤΙΜΩΡ|ΠΟΙΝ/, titleRe: /ΤΙΜΩΡ|ΠΟΙΝ/,
    fields: [FROM(), TO(), F('kind', 'Είδος ποινής', 'ΕΙΔΟΣ ΠΟΙΝΗΣ', /ΕΙΔΟΣ ΠΟΙΝΗΣ|^ΠΟΙΝΗ$/), F('days', 'Ημέρες', 'ΗΜΕΡΕΣ', /^ΗΜΕΡΕΣ$/),
      F('by', 'Ποιος την επέβαλε', 'ΕΠΕΒΑΛΕ', /ΕΠΕΒΑΛΕ|ΕΠΙΒΛΗΘΗΚΕ|ΤΙΜΩΡΗΣΕ|ΑΠΟ ΠΟΙΟΝ|ΔΙΑΤΑΚΤΗΣ/), F('reason', 'Αιτία (διότι…)', 'ΑΙΤΙΑ', /ΑΙΤΙΑ|ΑΙΤΙΟΛΟΓΙΑ|^ΔΙΟΤΙ|ΠΑΡΑΠΤΩΜΑ/), NOTE] },
  { id: 'medical', label: 'ΕΑ / ΕΥ / ΕΟ', help: 'Είδος (ΕΑ, ΕΥ, ΕΟ, ΕΑΡΒ…), από, έως', title: 'ΕΑ-ΕΥ', write: true, types: ['EA', 'EARV', 'EY', 'EO'],
    sheetRe: /IATR|ΙΑΤΡ|ΕΑ.?ΕΥ/, titleRe: /ΕΑ\s*[-–/]?\s*ΕΥ|ΕΛΕΥΘΕΡ/,
    fields: [F('kind', 'Είδος (ΕΑ, ΕΥ, ΕΟ…)', 'ΕΑ-ΕΥ', /^ΕΑ\s*[-–/]\s*ΕΥ|^ΕΙΔΟΣ|ΕΞΑΙΡΕΣΗ/, { req: true }), FROM(), TO(), NOTE] },
  { id: 'hospital', label: 'Νοσοκομείο / αναρρωτικές', help: 'Πού (νοσοκομείο ή ΑΝ.ΑΔ), είσοδος, έξοδος', title: 'ΕΙΣΑΓΩΓΕΣ ΝΟΣΟΚΟΜΕΙΟ-ΑΝ.ΑΔ.', write: true, types: ['NOS', 'SICK'],
    sheetRe: /IATR|ΙΑΤΡ|ΝΟΣΟΚ/, titleRe: /ΝΟΣΟΚΟΜ|ΑΝ\s*\.?\s*ΑΔ|ΑΝΑΡΡΩΤ/,
    fields: [F('where', 'Εισαγωγή (νοσοκομείο / ΑΝ.ΑΔ)', 'Εισαγωγή', /^ΕΙΣΑΓΩΓΗ$|^ΝΟΣΟΚΟΜΕΙΟ$/), FROM('ΕΙΣ'), HOUT, TO('ΕΞ'), HIN, NOTE] },
  { id: 'step', label: 'Εισαγωγές ΣΤΕΠ', help: 'Είσοδος, έξοδος', title: 'ΕΙΣΑΓΩΓΕΣ ΣΤΕΠ', write: true, types: ['STEP'],
    sheetRe: /IATR|ΙΑΤΡ|ΣΤΕΠ/, titleRe: /ΣΤΕΠ/, fields: [FROM('ΕΙΣ'), HOUT, TO('ΕΞ'), HIN, NOTE] },
  { id: 'leave', label: 'Άδειες', help: 'Είδος άδειας, από, έως', title: 'ΑΔΕΙΕΣ', write: true, types: ['LEAVE', 'HON'],
    sheetRe: /ΑΔΕΙ/, titleRe: /ΑΔΕΙ/, fields: [F('kind', 'Είδος άδειας', 'ΕΙΔΟΣ ΑΔΕΙΑΣ', /ΕΙΔΟΣ ΑΔΕΙΑΣ|^ΑΔΕΙΑ$/), FROM(), TOUT, TO(), TIN, NOTE] },
  { id: 'dn', label: 'ΔΝ (διανυκτερεύσεις)', help: 'Από, έως', title: 'ΔΝ', write: true, types: ['DN'],
    sheetRe: /^Δ\s?\.?\s?Ν(?![Α-Ω])|ΔΙΑΝΥΚΤ/, titleRe: /^Δ\s?\.?\s?Ν(?![Α-Ω])|ΔΙΑΝΥΚΤ/, fields: [FROM(), TO(), NOTE] },
  { id: 'posts', label: 'Πόστα', help: 'Μόνιμες αναθέσεις (ΚΨΜ, ιατρείο…)· διαβάζονται μαζί με το προσωπικό', title: 'ΠΟΣΤΑ', write: false,
    sheetRe: /ΠΟΣΤΑ/, titleRe: /ΠΟΣΤΑ/, fields: [F('post', 'Πόστο', 'Πόστο', /^ΠΟΣΤΟ$/, { req: true })] },
  { id: 'outside', label: 'Εκτός δύναμης', help: 'Αναβολές κ.λπ.· διαβάζονται μαζί με το προσωπικό', title: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ', write: false,
    sheetRe: /ΕΚΤΟΣ/, titleRe: /ΕΚΤΟΣ ΔΥΝΑΜ/, fields: [F('remarks', 'Παρατηρήσεις (λόγος)', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$|^ΑΙΤΙΑ$/)] },
  { id: 'caps', label: 'Δυνατότητες υπηρεσιών', help: 'Ποιος δεν κάνει θαλαμοφύλακας, οπλοφύλακας, μαγειρεία, σκοπιά («-» στη στήλη)', title: 'ΔΥΝΑΤΟΤΗΤΑ ΥΠΗΡΕΣΙΩΝ', write: false,
    sheetRe: /ΔΥΝΑΤΟΤ/, titleRe: /ΔΥΝΑΤΟΤ/,
    fields: [F('th', 'Θαλαμοφύλακας', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ', /^ΘΑΛΑΜΟΦΥΛ/), F('op', 'Οπλοφύλακας', 'ΟΠΛΟΦΥΛΑΚΑΣ', /^ΟΠΛΟΦΥΛ/), F('mg', 'Μαγειρεία', 'ΜΑΓΕΙΡΕΙΑ', /^ΜΑΓΕΙΡ/),
      F('sk', 'Σκοπιά', 'ΣΚΟΠΙΑ', /^ΣΚΟΠ/), F('tae', 'ΤΑΕ', 'ΤΑΕ', /^ΤΑΕ$/), F('capnote', 'Παρατηρήσεις (λόγος)', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$|^ΛΟΓΟΣ$/)] },
  { id: 'duties', label: 'Έλεγχος υπηρεσιών (μηνιαίο)', help: 'Μηνιαίο πλέγμα με Θ/Μ/Σ ανά μέρα: περνούν οι υπηρεσίες που έκανε ο καθένας', title: 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ', write: false,
    sheetRe: /ΕΛΕΓΧΟΣ ΥΠΗΡ/, titleRe: /ΕΛΕΓΧΟΣ ΥΠΗΡ/,
    fields: [F('d1', 'Στήλη της 1ης του μήνα', '1', /^1$/, { req: true })] }
];
export const KIND: Record<ListKind, KindDef> = Object.fromEntries(KINDS.map(k => [k.id, k])) as Record<ListKind, KindDef>;
export const STATUS_KINDS: StatusKind[] = ['punish', 'medical', 'hospital', 'step', 'leave', 'dn'];
// Είδη με ώρες (hours.ts): στήλες ώρας που η εφαρμογή προσθέτει όταν χρειαστούν (timeCols)
export const TIME_KINDS: StatusKind[] = ['leave', 'hospital', 'step'];
export const isStatusKind = (k: ListKind): k is StatusKind => (STATUS_KINDS as string[]).includes(k);
// Είδη που η εφαρμογή φτιάχνει από την αρχή («Νέο αρχείο…»): τίτλος, επικεφαλίδες και ό,τι έχει η ίδια
export const NEW_KINDS: ListKind[] = ['people', ...STATUS_KINDS, 'posts', 'outside', 'caps', 'duties'];
export const canCreate = (k: ListKind) => NEW_KINDS.includes(k);
// Μπαίνουν ως φύλλα στο Δυναμολόγιο, όπως στο αρχείο της Ίλης (ΑΔΕΙΕΣ, ΤΙΜΩΡΗΜΕΝΟΙ, ΠΟΣΤΑ…)
export const inRoster = (k: ListKind) => canCreate(k) && k !== 'people' && k !== 'duties';
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
  // μέρες γραμμένες ως ημερομηνίες: η 1η του μήνα είναι η πρώτη τους
  if (cols.d1 == null && fields.some(x => x.k === 'd1')) { const d = dayColumns(row); if (d.length >= 10) cols.d1 = d[0]; }
  return cols;
}
// Στήλες που μετακινήθηκαν ή προστέθηκαν στο Excel μετά την αντιστοίχιση (π.χ. νέα στήλη «ΔΝ» στο ΣΥΝΟΛΙΚΟ).
// Οι στήλες μετακινούνται όσο μετακινήθηκαν οι περισσότερες με γνωστή επικεφαλίδα (και όσες έχουν δική σου επικεφαλίδα μαζί τους).
// Μία μόνη δική σου στήλη που δεν ταιριάζει δεν αρκεί για αλλαγή. Γνωστές στήλες που δεν είχαν οριστεί προστίθενται.
export function refitCols(kind: ListKind, sheet: RawSheet | undefined, b: SourceBinding): SourceBinding {
  const row = sheet?.rows[b.header]; if (!row) return b;
  const fields = fieldsOf(kind); const found = mapColumns(row, fields);
  const h = (c: number) => headText(row[c]);
  const ok = (k: string, c: number | undefined) => c != null && !!fields.find(f => f.k === k)?.re.test(h(c));
  const known = (c: number) => !h(c) || ALL_FIELDS.some(f => f.re.test(h(c)));
  const cand = Object.entries(b.cols).filter(([k, c]) => !ok(k, c) && found[k] != null && found[k] !== c).map(([k, c]) => ({ k, c, d: found[k] - c, sure: known(c) }));
  // η μετακίνηση που έκαναν οι περισσότερες στήλες (μπήκε ή βγήκε στήλη)
  const mode = (l: typeof cand) => { const n = new Map<number, number>(); l.forEach(x => n.set(x.d, (n.get(x.d) || 0) + 1)); return [...n].sort((x, y) => y[1] - x[1] || Math.abs(x[0]) - Math.abs(y[0]))[0]; };
  const sure = cand.filter(x => x.sure); const m = sure.length ? mode(sure) : cand.length > 1 ? mode(cand) : undefined;
  const D = m && (sure.length || m[1] > 1) ? m[0] : null;
  const cols: Record<string, number> = { ...b.cols };
  if (D != null) {
    const from = Math.min(...cand.filter(x => x.d === D).map(x => x.c));
    for (const [k, c] of Object.entries(b.cols)) {
      if (ok(k, c) || c < from) continue;
      const to = c + D;
      // στη νέα θέση άλλη γνωστή επικεφαλίδα: η στήλη πήγε αλλού (π.χ. δεύτερη νέα στήλη), ακολουθεί την επικεφαλίδα της
      cols[k] = ok(k, to) || !h(to) || !ALL_FIELDS.some(f => f.re.test(h(to))) || found[k] == null ? to : found[k];
    }
  }
  for (const f of fields) if (cols[f.k] == null && found[f.k] != null && !Object.values(cols).includes(found[f.k])) cols[f.k] = found[f.k];
  // η στήλη ενός πεδίου δεν έχει πια την επικεφαλίδα που είχε (μπήκε μπροστά της στήλη με δική της, άγνωστη επικεφαλίδα):
  // ακολουθεί την επικεφαλίδα του πεδίου αν βρίσκεται σε μία μόνο άλλη στήλη· αλλιώς μένει και το remapNeed φρενάρει
  if (b.heads) for (const [k, c] of Object.entries(cols)) {
    const f = fields.find(x => x.k === k), was = b.heads[k]; if (!f || was == null || headOk(f, was, h(c))) continue;
    const at = Array.from({ length: row.length }, (_, j) => j).filter(j => j !== c && (f.re.test(was) ? f.re.test(h(j)) : h(j) === was));
    if (at.length === 1) cols[k] = at[0];
  }
  // δύο πεδία στην ίδια στήλη: κάτι δεν πήγε καλά, μένει η αντιστοίχιση όπως ήταν
  const used = Object.values(cols); if (new Set(used).size !== used.length || used.some(c => c < 0)) return b;
  return JSON.stringify(cols) === JSON.stringify(b.cols) ? b : { ...b, cols };
}
const ALL_FIELDS = [...PERSON_FIELDS, ...KINDS.flatMap(k => k.fields)];
// Τι εμποδίζει την αυτόματη ανάγνωση/εγγραφή μετά το refitCols: πεδίο που λείπει, ή στήλη που η επικεφαλίδα της λέει
// πια άλλο γνωστό πεδίο (π.χ. «ΗΜΕΡΕΣ» στη στήλη του είδους). Δική σου επικεφαλίδα που δεν είναι γνωστό πεδίο δεν μετρά.
export function remapNeed(kind: ListKind, sheet: RawSheet | undefined, b: SourceBinding): string | null {
  const miss = missingFields(kind, b.cols); if (miss.length) return 'λείπει ' + miss.join(', ');
  const row = sheet?.rows[b.header]; if (!row) return null;
  const fields = fieldsOf(kind);
  for (const [k, c] of Object.entries(b.cols)) {
    const h = headText(row[c]); const f = fields.find(x => x.k === k); if (!h || !f || f.re.test(h)) continue;
    if (ALL_FIELDS.some(x => x.re.test(h))) return 'η στήλη ' + colLetter(c) + ' («' + cellText(row[c]) + '») δεν είναι πια ' + f.label.replace(/ \(.*\)$/, '');
  }
  // η στήλη δεν έχει πια την επικεφαλίδα που είχε όταν έγινε η αντιστοίχιση και δεν βρέθηκε αλλού με σιγουριά (refitCols)
  for (const [k, c] of Object.entries(b.cols)) {
    const f = fields.find(x => x.k === k), was = b.heads?.[k]; if (!f || was == null || headOk(f, was, headText(row[c]))) continue;
    return 'η στήλη ' + colLetter(c) + ' («' + (cellText(row[c]) || 'κενή') + '») δεν είναι πια ' + f.label.replace(/ \(.*\)$/, '') + ' («' + was + '»)';
  }
  return null;
}
// Η στήλη του πεδίου έχει ακόμα την επικεφαλίδα της: την ίδια που είχε, ή (αν άλλαξε το κείμενο) μία που ταιριάζει στο πεδίο
const headOk = (f: FieldDef, was: string, now: string) => now === was || f.re.test(now);
// Θυμάται τις επικεφαλίδες των στηλών που είναι σίγουρα της επιλογής του χρήστη: όσες ταιριάζουν στο πεδίο, και δική του
// επικεφαλίδα μόνο όταν δεν υπάρχει αλλού γνωστή επικεφαλίδα του πεδίου ούτε μοιάζει με άλλο πεδίο (αλλιώς δεν ξέρουμε αν η
// στήλη ήταν επιλογή του ή έχει ήδη μετακινηθεί, και μένει όπως ήταν). Ίδιο αντικείμενο αν δεν προστέθηκε τίποτα.
export function stampHeads(kind: ListKind, sheet: RawSheet | undefined, b: SourceBinding): SourceBinding {
  const row = sheet?.rows[b.header]; if (!row) return b;
  const fields = fieldsOf(kind); const found = mapColumns(row, fields); const heads = { ...b.heads }; let n = 0;
  for (const [k, c] of Object.entries(b.cols)) {
    const f = fields.find(x => x.k === k), h = headText(row[c]); if (heads[k] != null || !f || !h) continue;
    if (f.re.test(h) || (found[k] == null && !ALL_FIELDS.some(x => x.re.test(h)))) { heads[k] = h; n++; }
  }
  return n ? { ...b, heads } : b;
}
// Αντιστοίχιση που ήρθε από το UI ή από ανίχνευση: οι επικεφαλίδες (heads) τις βάζει μόνο ο main από το ίδιο το αρχείο, οπότε
// μένουν μόνο όσες ήδη ξέρουμε για τον ίδιο πίνακα και τις ίδιες στήλες· αλλιώς ξαναμπαίνουν στην επόμενη ανάγνωση
export function keepHeads(b: SourceBinding, cur?: SourceBinding): SourceBinding {
  const out = { ...b }; delete out.heads;
  return cur?.heads && cur.sheet === b.sheet && cur.header === b.header && JSON.stringify(cur.cols) === JSON.stringify(b.cols) ? { ...out, heads: cur.heads } : out;
}
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
  // μηνιαίο πλέγμα: πολλές στήλες με αριθμούς ημερών (1, 2, 3…) στις επικεφαλίδες
  const days = dayColumns(header).length;
  if (kind === 'duties') s += days >= 10 ? 10 : -10;
  else if (days >= 10) s -= 20;
  if (kind === 'people') {
    const person = PERSON_FIELDS.filter(f => cols[f.k] != null).length;
    if (cols.from == null && cols.to == null) s += 2;
    s += person * 0.5;
    if (cols.last == null || cols.first == null) s -= 10;
    if (/^Δ\s?\.?\s?Ν(?![Α-Ω])|ΔΙΚΑΙΟΥΧΟΙ/.test(normGreek(sheetName))) s -= 12;   // λίστα δικαιούχων ΔΝ: διαβάζεται μαζί με το προσωπικό
  }
  return s;
}
const THRESHOLD = 8;
// Μέρα του μήνα σε επικεφαλίδα: αριθμός 1–31 (και ως κείμενο) ή ημερομηνία
export const dayNum = (v: CellValue): number | null => {
  if (v instanceof Date) return isNaN(+v) ? null : v.getUTCDate();
  const t = cellText(v); return /^\d{1,2}$/.test(t) && +t >= 1 && +t <= 31 ? +t : null;
};
// Στήλες ημερών του μηνιαίου πλέγματος: από τη στήλη της 1ης και όσες συνεχόμενες λένε μέρα (μέρα = θέση, όχι η τιμή:
// στο δείγμα το 29 είναι γραμμένο δύο φορές)· σταματά στην πρώτη στήλη που δεν λέει μέρα
export function dayColumns(header: CellValue[] | undefined, from?: number): number[] {
  const row = header || [];
  const start = from ?? row.findIndex(v => dayNum(v) === 1); if (start < 0) return [];
  const out: number[] = []; for (let c = start; c < row.length && dayNum(row[c]) != null && out.length < 31; c++) out.push(c);
  return out;
}
// Οι μέρες ενός φύλλου ελέγχου υπηρεσιών: στη γραμμή των επικεφαλίδων, αλλιώς στη γραμμή από πάνω ή από κάτω (επικεφαλίδα
// σε δύο γραμμές)
export function dutyDays(sheet: RawSheet, b: { header: number; cols: Record<string, number> }): number[] {
  let best: number[] = [];
  for (const r of [b.header, b.header - 1, b.header + 1]) { if (r < 0) continue; const c = dayColumns(sheet.rows[r], b.cols.d1); if (c.length > best.length) best = c; if (best.length >= 28) break; }
  return best;
}
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
// Πού είναι τώρα οι επικεφαλίδες ενός πίνακα: αν μπήκαν γραμμές από πάνω (από το Excel ή από την εφαρμογή σε άλλο
// πίνακα του ίδιου φύλλου), ο πίνακας έχει κατέβει. Βαθμός = πόσα πεδία της αντιστοίχισης βρίσκονται στην ίδια στήλη.
// Μένει στη γραμμή του αν εκεί ταιριάζει όσο καλά όσο πουθενά αλλού· αλλιώς πάει στην πιο κοντινή με τον μεγαλύτερο βαθμό.
export function locateHeader(kind: ListKind, sheet: RawSheet, b: SourceBinding): number {
  const fields = fieldsOf(kind); const keys = Object.keys(b.cols);
  const score = (r: number) => { const m = mapColumns(sheet.rows[r], fields); return keys.filter(k => m[k] != null && m[k] === b.cols[k]).length; };
  const s0 = score(b.header); let best = s0, at = b.header;
  for (let r = 0; r < Math.min(sheet.rows.length, 2000); r++) {
    if (r === b.header || !isHeaderRow(sheet.rows[r])) continue;
    const v = score(r);
    if (v > best || (v === best && v > s0 && Math.abs(r - b.header) < Math.abs(at - b.header))) { best = v; at = r; }
  }
  return best > s0 && best >= 3 ? at : b.header;
}
// Προτεινόμενη στήλη για ένα πεδίο, από τις επικεφαλίδες (για το «προτείνεται» στην αντιστοίχιση)
export const suggestCols = (kind: ListKind, sheet: RawSheet | undefined, header: number) => mapColumns(sheet?.rows[header], fieldsOf(kind));

// ------------------------------------------------------------------ γραμμές πίνακα
export interface TableRow { r: number; v: Record<string, CellValue> }
export interface TableScan { records: TableRow[]; free: number[]; end: number; open: boolean; width: [number, number]; partial: number[] }
// Από κάτω από τις επικεφαλίδες ως τον επόμενο τίτλο ή πίνακα: εγγραφές (με άτομο), ελεύθερες γραμμές
// (κενές ή μόνο με Α/Α και προσυμπληρωμένο βαθμό/ειδικότητα ή τύπο) και πού τελειώνει ο πίνακας. open = ως το τέλος του φύλλου.
// partial: γραμμές μισογραμμένες χωρίς όνομα (π.χ. μόνο ημερομηνίες): δεν είναι ελεύθερες, δεν γράφεται τίποτα πάνω τους.
export function tableRows(sheet: RawSheet, header: number, cols: Record<string, number>): TableScan {
  const head = sheet.rows[header] || [];
  const used = Object.values(cols);
  const hcols = head.map((v, i) => (cellText(v) ? i : -1)).filter(i => i >= 0);
  const width: [number, number] = [Math.min(...hcols, ...used, 99), Math.max(...hcols, ...used, 0)];
  const mapped = new Set(used); const aa = cols.aa;
  const records: TableRow[] = []; const free: number[] = []; const partial: number[] = [];
  const blankOk = new Set(['aa', 'rank', 'spec', 'days']);
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
    if (Object.entries(cols).some(([k, c]) => !blankOk.has(k) && !sheet.fx?.has(r + ':' + c) && cellText(row[c]) !== '')) { partial.push(r); empty = 0; last = r; continue; }
    free.push(r); last = Math.max(last, r);
    if (++empty > 60) break;
  }
  // κενές γραμμές ακριβώς πριν από τον επόμενο τίτλο χωρίζουν τους πίνακες: δεν είναι ελεύθερες θέσεις
  const lastUsed = Math.max(records.length ? records[records.length - 1].r : header, partial.length ? partial[partial.length - 1] : header);
  if (r < max) while (free.length && free[free.length - 1] > lastUsed && !(sheet.rows[free[free.length - 1]] || []).some(v => cellText(v))) free.pop();
  if (r < max) last = Math.max(lastUsed, free.length ? free[free.length - 1] : header);
  return { records, free, end: last, open: r >= max, width, partial };
}

// ------------------------------------------------------------------ άτομα
// alts: συνονόματοι που ταιριάζουν όλοι (ίδιο ονοματεπώνυμο και πατρώνυμο, χωρίς ΑΣΜ), πριν διαλεχτεί ο ενεργός, ή
// και όταν δεν διαλέγεται κανείς (πολλοί ενεργοί: pid null). Για την ανάγνωση αρκεί ο ενεργός· η εγγραφή όμως δεν πρέπει
// να γράψει στη γραμμή του άλλου, ούτε να ξαναγράψει κάποιον τους σε νέα γραμμή (X2).
export interface Matcher { (v: Record<string, CellValue>): { pid: number | null; cands: Person[]; alts?: Person[] } }
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
    // «ΓΕΩΡΓΙΟΣ του ΙΩΑΝΝΗ»: έτσι γράφει η εφαρμογή τους συνονόματους όταν δεν υπάρχει στήλη πατρώνυμου
    let father = v.father != null ? cellText(v.father) : null;
    const tou = /^(.*?)\s+ΤΟΥ\s+(.+)$/.exec(normGreek(first));
    if (tou) { first = tou[1]; if (!father) father = tou[2]; }
    if (last) {
      let l = byName.get(key2(last, first)) || [];
      // «ΝΙΚΟΛΑΟΣ/ΛΟΥΚΑΣ»: διπλό όνομα με «/», ταιριάζει με όποιο από τα δύο έχει η εφαρμογή
      if (!l.length && first.includes('/')) l = [...new Set(first.split('/').flatMap(f => byName.get(key2(last, f)) || []))];
      if (l.length > 1 && father != null) { const f = normGreek(father); const x = l.filter(p => normGreek(p.father) === f); if (x.length) l = x; }
      // συνονόματοι σε άλλο θάλαμο: η στήλη ΘΑΛΑΜΟΣ του φύλλου λέει ποιος είναι (μόνο αν δείχνει έναν)
      const room = v.room != null ? parseInt(cellText(v.room), 10) : NaN;
      if (l.length > 1 && room > 0) { const x = l.filter(p => p.room === room); if (x.length === 1) return { pid: x[0].id, cands: [] }; }
      const all = l;
      if (l.length > 1) { const act = l.filter(p => p.active); if (act.length) l = act; }
      if (l.length === 1) return all.length > 1 ? { pid: l[0].id, cands: [], alts: all } : { pid: l[0].id, cands: [] };
      if (l.length > 1) return { pid: null, cands: l.slice(0, 4), alts: all };   // πολλοί ενεργοί: δεν ξέρουμε ποιος
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
export interface Cand { r: number; who: string; pid: number | null; cands: Person[]; type: TypeKey | null; raw: string; from: ISODate; to: ISODate; kind?: string; note?: string; by?: string; reason?: string; noEnd?: boolean; fromTime?: string; toTime?: string }
export interface ParseOut { cands: Cand[]; skipped: { r: number; who: string; why: string }[]; unknown: string[] }
const vk = (s: string) => normGreek(s).replace(/[^Α-ΩA-Z0-9]/g, '');
// Τιμή στη στήλη «είδος» → είδος κατάστασης. null = άγνωστο (το διαλέγει ο χρήστης· ως τότε μπαίνει η προεπιλογή του είδους).
// lists: τα δικά σου ιατρικά (Ρυθμίσεις › Λίστες) αναγνωρίζονται πρώτα, πριν από τους κανόνες και ό,τι είχες διαλέξει
export function typeOfValue(kind: StatusKind, raw: string, values?: Record<string, TypeKey>, lists?: UserLists): TypeKey | null {
  const v = vk(raw);
  if (kind === 'medical') { const own = medTypeOf(raw, lists); if (own) return own; }
  // ΕΑΡΒ / «ΕΛ ΑΡΒ»: δικό του είδος (πριν υπάρξει διαβαζόταν ως ΕΑ, ή όπως το είχες διαλέξει)
  if (kind === 'medical' && /^(ΕΑΡΒ|ΕΛΑΡΒ)|ΑΡΒΥΛ/.test(v)) return 'EARV';
  if (values && v && values[v]) return values[v];
  switch (kind) {
    case 'punish': return 'PUN';
    case 'step': return 'STEP';
    case 'dn': return 'DN';
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
export const DEFAULT_TYPE: Record<StatusKind, TypeKey> = { punish: 'PUN', medical: 'EA', hospital: 'NOS', step: 'STEP', leave: 'LEAVE', dn: 'DN' };
// και τα δικά σου είδη (Λίστες): το Excel τα έχει με κεφαλαία, η εφαρμογή κρατά το όνομα όπως το έγραψες
const punKind = (raw: string, lists?: UserLists) => { const v = vk(raw); return PUN_KINDS.find(k => vk(k) === v || v.startsWith(vk(k).slice(0, 5))) || listOf(lists, 'punKinds').find(k => vk(k) === v) || (raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : ''); };

export function parseStatuses(kind: StatusKind, sheet: RawSheet, b: SourceBinding, people: Person[], today: ISODate, lists?: UserLists): ParseOut {
  const scan = tableRows(sheet, b.header, b.cols); const match = makeMatcher(people);
  const out: ParseOut = { cands: [], skipped: [], unknown: [] }; const unk = new Map<string, string>();
  for (const { r, v } of scan.records) {
    const who = rowName(v);
    const from = parseDate(v.from); let to = parseDate(v.to);
    if (!from) { out.skipped.push({ r, who, why: cellText(v.from) ? 'η ημερομηνία «' + cellText(v.from) + '» δεν διαβάζεται' : 'χωρίς ημερομηνία έναρξης' }); continue; }
    let noEnd = false;
    // κενό «έως» = χωρίς λήξη· χωρίς στήλη «έως» η εγγραφή είναι μίας μέρας
    if (!to && b.cols.to == null) to = from;
    else if (!to) { to = from > today ? from : today; noEnd = true; }
    if (to < from) { out.skipped.push({ r, who, why: 'το «έως» είναι πριν από το «από»' }); continue; }
    const raw = cellText(kind === 'hospital' ? v.where : v.kind);
    const type = typeOfValue(kind, raw, b.values, lists);
    if (!type && raw && !unk.has(vk(raw))) unk.set(vk(raw), raw);
    const m = match(v);
    const c: Cand = { r, who, pid: m.pid, cands: m.cands, type, raw, from, to, noEnd };
    if (kind === 'punish') { if (raw) c.kind = punKind(raw, lists); if (cellText(v.by)) c.by = cellText(v.by); if (cellText(v.reason)) c.reason = cellText(v.reason); }
    else if (kind === 'medical' || kind === 'leave') { if (raw && !(kind === 'medical' && TYPES[type || 'EA'].label === norm(raw))) c.kind = raw; }
    else if (kind === 'hospital' && raw) c.kind = raw;
    if (cellText(v.note)) c.note = cellText(v.note);
    if (TIME_KINDS.includes(kind)) { const f = cellTime(v.tout), t = cellTime(v.tin); if (f) c.fromTime = f; if (t && !noEnd) c.toTime = t; }
    out.cands.push(c);
  }
  out.unknown = [...unk.values()];
  return out;
}

// Ταυτότητα εγγραφής για σύγκριση Excel ↔ εφαρμογή: άτομο, ομάδα ειδών και ημερομηνία έναρξης. Στα ιατρικά και το
// είδος, γιατί ο ίδιος μπορεί να έχει την ίδια μέρα και ΕΑ και ΕΟ (ή «ΕΛ ΑΡΒ») σε χωριστές γραμμές.
export const identity = (pid: number, kind: StatusKind, from: ISODate, sub = '') => pid + '|' + kind + '|' + from + (sub ? '|' + sub : '');
const subOf = (kind: StatusKind, text: string) => (kind === 'medical' ? vk(text) : '');
const statusId = (kind: StatusKind, x: Status) => identity(x.pid, kind, x.from, subOf(kind, x.kind || TYPES[x.type].label));
const candId = (kind: StatusKind, pid: number, c: Cand) => identity(pid, kind, c.from, subOf(kind, c.raw || TYPES[c.type || DEFAULT_TYPE[kind]].label));
// Μια εγγραφή όπως τη γράφει και τη διαβάζει το Excel: για να φαίνεται τι άλλαξε στην εφαρμογή από την τελευταία
// ανάγνωση/εγγραφή (base), ώστε στην ανάγνωση να ξεχωρίζουν όσες άλλαξαν και στις δύο πλευρές
// χωρίς λήξη: «open» αντί για ημερομηνία, ώστε η καθημερινή επέκταση να μη μετρά ως αλλαγή στην εφαρμογή
// οι ώρες της άδειας μπαίνουν στο τέλος μόνο όταν υπάρχουν: χωρίς ώρες η τιμή μένει ίδια με των παλιότερων εκδόσεων
export const recVal = (x: Pick<Status, 'to' | 'type' | 'kind' | 'note' | 'by' | 'reason' | 'open' | 'fromTime' | 'toTime'>) =>
  [x.open ? 'open' : x.to, x.type, x.kind || '', x.note || '', x.by || '', x.reason || '', ...(x.fromTime || x.toTime ? [x.fromTime || '', x.toTime || ''] : [])].join('\u0001');
export function baseOf(kind: StatusKind, s: AppState, keys: string[]): Record<string, string> {
  const want = new Set(keys); const out: Record<string, string> = {}; const types = KIND[kind].types!;
  for (const x of s.statuses) if (types.includes(x.type)) { const id = statusId(kind, x); if (want.has(id)) out[id] = recVal(x); }
  return out;
}
const sameText = (a: string | undefined, b: string | undefined) => normGreek(a || '') === normGreek(b || '');
const appText = (x: Status) => 'έως ' + x.to.slice(8) + '/' + x.to.slice(5, 7) + (x.kind ? ', ' + x.kind : '') + (x.note ? ', «' + x.note + '»' : '');
export interface DiffUpdate { id: string; patch: Partial<Status>; who: string; what: string; conflict?: string }   // conflict: τι έχει η εφαρμογή (άλλαξε και εκεί)
export interface Diff {
  add: Omit<Status, 'id'>[]; update: DiffUpdate[]; same: number;
  unmatched: Cand[]; dup: Cand[]; appOnly: Status[]; keys: string[];
  removed: Status[];   // ήταν στο Excel στην προηγούμενη ανάγνωση/εγγραφή και σβήστηκαν από εκεί
  kept: string[];      // άλλαξαν μόνο στην εφαρμογή (το Excel έχει ό,τι είχε): μένουν και γράφονται στο Excel
}
// choices: γραμμή → άτομο, για όσους δεν ταίριαξαν μόνοι τους (null = παράλειψη)
// synced: ποιες εγγραφές είχε το Excel στην προηγούμενη ανάγνωση/εγγραφή. Όσες λείπουν τώρα σβήστηκαν εκεί· αν στη θέση
// τους υπάρχει νέα γραμμή του ίδιου ατόμου, είναι η ίδια εγγραφή με άλλη ημερομηνία έναρξης.
// base: οι εγγραφές όπως ήταν στην τελευταία ανάγνωση/εγγραφή (recVal ανά ταυτότητα)
export function diffStatuses(kind: StatusKind, s: AppState, parsed: ParseOut, b: SourceBinding, choices: Record<number, number | null> = {}, synced: string[] = [], base: Record<string, string> = {}): Diff {
  const changedInApp = (x: Status) => { const v = base[statusId(kind, x)]; return v != null && v !== recVal(x); };
  const types = KIND[kind].types!;
  const mine = s.statuses.filter(x => types.includes(x.type));
  const idx = new Map(mine.map(x => [statusId(kind, x), x]));
  const d: Diff = { add: [], update: [], same: 0, unmatched: [], dup: [], appOnly: [], keys: [], removed: [], kept: [] };
  const seen = new Set<string>(); const pm = new Map(s.people.map(p => [p.id, p]));
  const has = (k: string) => b.cols[k] != null;
  // Άλλαξε το Excel αυτή την εγγραφή από την τελευταία ανάγνωση/εγγραφή; Ό,τι δεν έχει στήλη μετρά όπως ήταν.
  const cols = { to: has('to'), type: has('kind') || has('where'), kind: has('kind') || has('where'), note: has('note'), by: has('by'), reason: has('reason'), fromTime: has('tout'), toTime: has('tin') };
  const excelMoved = (cur: Status, patch: Partial<Status>) => {
    const v = base[statusId(kind, cur)]; if (v == null) return true;
    const [to, type, k, note, by, reason, fromTime = '', toTime = ''] = v.split('\u0001'); const was: Record<keyof typeof cols, string> = { to, type, kind: k, note, by, reason, fromTime, toTime };
    const now = { ...was }; for (const f of Object.keys(cols) as (keyof typeof cols)[]) if (cols[f]) now[f] = String(((f === 'fromTime' || f === 'toTime') && f in patch ? patch[f] : patch[f] ?? cur[f]) ?? '');
    if (cols.to) { const open = 'open' in patch ? patch.open : cur.open; now.to = open ? 'open' : String(patch.to ?? cur.to); }
    return recVal({ ...now, type: now.type as TypeKey, open: now.to === 'open' }) !== v;
  };
  for (const c of parsed.cands) {
    const pid = c.pid ?? (c.r in choices ? choices[c.r] : null);
    if (pid == null) { if (!(c.r in choices)) d.unmatched.push(c); continue; }
    const id = candId(kind, pid, c);
    if (seen.has(id)) { d.dup.push(c); continue; }
    seen.add(id); d.keys.push(id);
    const type = c.type || DEFAULT_TYPE[kind];
    const cur = idx.get(id);
    if (!cur) {
      const st: Omit<Status, 'id'> = { pid, type, from: c.from, to: c.to };
      if (c.noEnd && has('to')) st.open = true;   // χωρίς στήλη «έως» δεν είναι «χωρίς λήξη»: μένει μίας μέρας, όπως πριν
      if (c.kind) st.kind = c.kind; if (c.note) st.note = c.note;
      if (c.fromTime) st.fromTime = c.fromTime; if (c.toTime) st.toTime = c.toTime;
      if (kind === 'punish') { st.kind = c.kind || PUN_KINDS[0]; if (c.by) st.by = c.by; if (c.reason) st.reason = c.reason; }
      d.add.push(st); continue;
    }
    // αλλάζει μόνο ό,τι υπάρχει ως στήλη στο Excel· ό,τι δεν υπάρχει μένει όπως είναι στην εφαρμογή
    const patch: Partial<Status> = {}; const what: string[] = [];
    // κενό «έως» στο Excel σε εγγραφή που είχε λήξη: από εδώ και πέρα χωρίς λήξη (η εφαρμογή δεν ξαναγράφει ημερομηνία)
    if (has('to') && c.noEnd && !cur.open) { patch.open = true; what.push('χωρίς λήξη'); }
    if (has('to') && !c.noEnd && (cur.to !== c.to || cur.open)) { patch.to = c.to; if (cur.open) patch.open = false; what.push('έως ' + c.to.slice(8) + '/' + c.to.slice(5, 7)); }
    if ((has('kind') || has('where')) && c.raw && cur.type !== type) { patch.type = type; what.push(TYPES[type].label); }
    // η εφαρμογή γράφει στο Excel με κεφαλαία: ίδιο κείμενο όσο ταιριάζουν τα γράμματα (χωρίς πεζά/κεφαλαία και τόνους)
    if ((has('kind') || has('where')) && c.kind && !sameText(c.kind, cur.kind)) { patch.kind = c.kind; what.push(c.kind); }
    if (has('note') && !sameText(c.note, cur.note)) { patch.note = c.note || ''; what.push('παρατηρήσεις'); }
    const tn = timeNames(type), timed = TIME_KINDS.includes(kind);
    if (timed && has('tout') && (c.fromTime || '') !== (cur.fromTime || '')) { patch.fromTime = c.fromTime || ''; what.push(c.fromTime ? tn.from + ' ' + c.fromTime : 'χωρίς ώρα ' + tn.fromG); }
    if (timed && has('tin') && !c.noEnd && (c.toTime || '') !== (cur.toTime || '')) { patch.toTime = c.toTime || ''; what.push(c.toTime ? tn.to + ' ' + c.toTime : 'χωρίς ώρα ' + tn.toG); }
    if (kind === 'punish' && has('by') && c.by && !sameText(c.by, cur.by)) { patch.by = c.by; what.push('ποιος την επέβαλε'); }
    if (kind === 'punish' && has('reason') && c.reason && !sameText(c.reason, cur.reason)) { patch.reason = c.reason; what.push('αιτία'); }
    if (cur.pending && kind === 'punish') { patch.pending = false; what.push('εγκρίθηκε'); }
    const who = pm.get(pid) ? fullName(pm.get(pid)!) : c.who;
    if (what.length && changedInApp(cur) && !excelMoved(cur, patch)) {
      // το άλλαξες μόνο στην εφαρμογή: κρατιέται (και γράφεται στο Excel)· η έγκριση ποινής περνά
      d.kept.push(cur.id);
      if (patch.pending === false) d.update.push({ id: cur.id, patch: { pending: false }, who, what: 'εγκρίθηκε' });
      else d.same++;
    } else if (what.length) d.update.push({ id: cur.id, patch, who, what: what.join(', '), ...(changedInApp(cur) ? { conflict: appText(cur) } : {}) });
    else d.same++;
  }
  d.appOnly = mine.filter(x => !seen.has(statusId(kind, x)));
  const was = new Set(synced);
  const gone = d.appOnly.filter(x => was.has(statusId(kind, x)));
  if (gone.length) {
    d.appOnly = d.appOnly.filter(x => !gone.includes(x));
    const days = (a: { from: string; to: string }, c: { from: string; to: string }) => Math.max(0, Math.min(Date.parse(a.to), Date.parse(c.to)) - Math.max(Date.parse(a.from), Date.parse(c.from)));
    for (const x of gone) {
      // η ίδια εγγραφή με άλλο «από»: νέα γραμμή του ίδιου ατόμου (και του ίδιου είδους στα ιατρικά), όσο πιο κοντά.
      // Μόνο αν οι μέρες πέφτουν μαζί ή απέχουν το πολύ μία μέρα· αλλιώς είναι άλλη εγγραφή (σβήστηκε η μία, γράφτηκε άλλη)
      const sub = subOf(kind, x.kind || TYPES[x.type].label);
      const gap = (a: { from: string; to: string }) => Math.max(Date.parse(a.from) - Date.parse(x.to), Date.parse(x.from) - Date.parse(a.to));
      const near = d.add.map((a, i) => ({ a, i })).filter(({ a }) => a.pid === x.pid && subOf(kind, a.kind || TYPES[a.type].label) === sub && gap(a) <= 86400000)
        .sort((p, q) => days(q.a, x) - days(p.a, x) || Math.abs(Date.parse(p.a.from) - Date.parse(x.from)) - Math.abs(Date.parse(q.a.from) - Date.parse(x.from)))[0];
      if (!near) {
        // μια γραμμή που δεν ταίριαξε με άτομο μπορεί να είναι αυτή: δεν σβήνεται μέχρι να διαλέξει ο χρήστης
        if (!d.unmatched.some(c => c.from === x.from || c.cands.some(p => p.id === x.pid))) d.removed.push(x);
        else d.appOnly.push(x);
        continue;
      }
      d.add.splice(near.i, 1);
      const a = near.a; const patch: Partial<Status> = { from: a.from, to: a.to }; const what = ['από ' + a.from.slice(8) + '/' + a.from.slice(5, 7)];
      if (!!a.open !== !!x.open) patch.open = !!a.open;
      if (a.open && !x.open) what.push('χωρίς λήξη'); else if (!a.open && (a.to !== x.to || x.open)) what.push('έως ' + a.to.slice(8) + '/' + a.to.slice(5, 7));
      if (a.type !== x.type) { patch.type = a.type; what.push(TYPES[a.type].label); }
      // όπως στις αλλαγές πιο πάνω: οι παρατηρήσεις περνούν όπως είναι στη νέα γραμμή, και κενές (αλλιώς θα έμενε η παλιά)
      for (const k of ['kind', 'by', 'reason'] as const) if (a[k] && a[k] !== x[k]) patch[k] = a[k];
      if (has('note') && (a.note || '') !== (x.note || '')) patch.note = a.note || '';
      if (has('tout') && (a.fromTime || '') !== (x.fromTime || '')) patch.fromTime = a.fromTime || '';
      if (has('tin') && (a.toTime || '') !== (x.toTime || '')) patch.toTime = a.toTime || '';
      if (x.pending && kind === 'punish') { patch.pending = false; what.push('εγκρίθηκε'); }
      d.update.push({ id: x.id, patch, who: pm.get(x.pid) ? fullName(pm.get(x.pid)!) : '', what: what.join(', '), ...(changedInApp(x) ? { conflict: appText(x) } : {}) });
    }
  }
  return d;
}

// ------------------------------------------------------------------ εγγραφή στο Excel
export type WVal = string | number | { date: ISODate } | null;
export interface WritePlan {
  sets: { r: number; c: number; v: WVal }[];                  // σε υπάρχουσες γραμμές (από 0)
  insert: { after: number; n: number; tpl: number } | null;   // νέες γραμμές μετά από αυτή, με τη μορφή της tpl
  header: { r: number; c: number; v: string; title?: boolean }[]; // καινούργιος πίνακας: τίτλος και επικεφαλίδες
  keys: string[]; added: number; changed: number; cleared: number; foreign: number;
  ambiguous?: number[];   // γραμμές συνονόματων που δεν ξέρουμε σε ποιον ανήκουν: δεν αγγίζονται
  warn?: string[];
}
// Νέες ολόκληρες γραμμές μετά την after (από 0) σπρώχνουν προς τα κάτω ό,τι είναι από κάτω σε όλες τις στήλες: αν έξω
// από τις στήλες του πίνακα υπάρχει κάτι δίπλα του (από τις επικεφαλίδες ως την after) που συνεχίζει και πιο κάτω, π.χ.
// διπλανός πίνακας, θα κοβόταν στα δύο (X12). Πίνακας ολόκληρος πιο κάτω (και πιο φαρδύς) απλώς κατεβαίνει.
// Οι στήλες του πίνακα: από τις στήλες της αντιστοίχισης, όσο οι επικεφαλίδες συνεχίζουν χωρίς κενό (ο διπλανός
// πίνακας έχει δικές του επικεφαλίδες, μετά από κενή στήλη)
export function sideBy(sheet: RawSheet | null | undefined, b: { header: number; cols: Record<string, number> }, after: number): boolean {
  if (!sheet) return false;
  const head = sheet.rows[b.header] || []; const used = Object.values(b.cols); if (!used.length) return false;
  let a = Math.min(...used), z = Math.max(...used);
  while (a > 0 && cellText(head[a - 1]) !== '') a--;
  while (z + 1 < head.length && cellText(head[z + 1]) !== '') z++;
  const out = (r: number) => (sheet.rows[r] || []).some((v, c) => (c < a || c > z) && cellText(v) !== '');
  let beside = false; for (let r = b.header; r <= after && !beside; r++) beside = out(r);
  if (!beside) return false;
  for (let r = after + 1; r < sheet.rows.length; r++) if (out(r)) return true;
  return false;
}
export const noRoomTxt = (sheet: string, who: string[]) => 'Δεν χωράει στο φύλλο «' + sheet + '» χωρίς να κοπεί στα δύο ό,τι είναι δίπλα στον πίνακα (πιο κάτω, σε άλλες στήλες): ' + who.slice(0, 5).join(', ') + (who.length > 5 ? ' κ.ά.' : '') + '. Πρόσθεσε κενές γραμμές στο τέλος του πίνακα ή μετακίνησε τον διπλανό πίνακα· γράφεται μόνο του μόλις χωρέσει.';
const num = (s: string): string | number => (/^[1-9]\d{0,14}$/.test(s) ? Number(s) : s);
// Στήλη «Ονοματεπώνυμο» (ή «Όνομα» χωρίς αυτήν): στους συνονόματους και «του <πατρώνυμο>», αν ο πίνακας δεν έχει δική
// του στήλη πατρώνυμου, όπως στον Έλεγχο υπηρεσιών και στους Εξοδούχους (το makeMatcher το ξεχωρίζει στην ανάγνωση)
const nameCell = (p: Person, b?: { cols: Record<string, number> }) => p.last + ' ' + p.first + (b && b.cols.father != null ? '' : fatherTxt(p));
// Τιμές ενός πεδίου για μια κατάσταση της εφαρμογής
export function fieldValue(k: string, kind: StatusKind, st: Status, p: Person | undefined, b?: { cols: Record<string, number> }): WVal {
  switch (k) {
    case 'rank': return p?.rank || null;
    case 'spec': return p?.spec || null;
    case 'last': return p?.last || null;
    case 'first': return p ? p.first + (b && b.cols.father == null && b.cols.name == null ? fatherTxt(p) : '') || null : null;
    case 'name': return p ? nameCell(p, b) : null;
    case 'father': return p?.father || null;
    case 'asm': return p?.asm ? num(p.asm) : null;
    case 'phone': return p?.phone ? num(p.phone) : null;
    case 'room': return p?.room ?? null;
    case 'from': return { date: st.from };
    case 'to': return st.open ? null : { date: st.to };
    case 'days': return st.open ? null : st.days || Math.round((Date.parse(st.to) - Date.parse(st.from)) / 86400000) + 1;   // στέρηση εξόδου: οι ημέρες της ποινής
    case 'kind': return kind === 'medical' ? (st.kind || TYPES[st.type].label) : kind === 'leave' ? (st.kind || (st.type === 'HON' ? 'ΤΙΜΗΤΙΚΗ' : 'ΚΑΝΟΝΙΚΗ')) : kind === 'punish' ? (st.kind ? upper(st.kind) : null) : (st.kind || null);
    case 'where': return st.kind || (st.type === 'SICK' ? 'ΑΝ.ΑΔ' : 'ΝΟΣΟΚΟΜΕΙΟ');
    case 'note': return st.note || null;
    case 'tout': return st.fromTime || null;
    case 'tin': return st.open ? null : st.toTime || null;
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
// Καινούργιος πίνακας: επικεφαλίδες (και τίτλος από πάνω) αν η γραμμή είναι κενή
export function newHeader(kind: ListKind, rows: CellValue[][], b: SourceBinding, title = KIND[kind].title): WritePlan['header'] {
  if ((rows[b.header] || []).some(v => cellText(v))) return [];
  const defs = fieldsOf(kind); const out: WritePlan['header'] = [];
  for (const [k, c] of Object.entries(b.cols)) out.push({ r: b.header, c, v: defs.find(f => f.k === k)?.head || k });
  if (b.header > 0 && !(rows[b.header - 1] || []).some(v => cellText(v))) out.push({ r: b.header - 1, c: Math.min(...Object.values(b.cols)), v: title, title: true });
  return out;
}
// Τι αλλάζει στο φύλλο ώστε να έχει ό,τι έχει η εφαρμογή. Δεν αγγίζει γραμμές που δεν ξέρει (γράφτηκαν με το χέρι
// και δεν έχουν περάσει ακόμα στην εφαρμογή): μόνο όσες ταιριάζουν με εγγραφή της ή όσες έγραψε η ίδια παλιότερα (synced).
export function planWrite(kind: StatusKind, sheet: RawSheet | null, b: SourceBinding, s: AppState, synced: string[], today: ISODate): WritePlan {
  const plan: WritePlan = { sets: [], insert: null, header: [], keys: [], added: 0, changed: 0, cleared: 0, foreign: 0 };
  const pm = new Map(s.people.map(p => [p.id, p]));
  const want = wanted(kind, s, b, today);
  const rows = sheet?.rows || [];
  const fields = Object.keys(b.cols).filter(k => k !== 'aa');
  plan.header = newHeader(kind, rows, b);
  const scan = sheet ? tableRows(sheet, b.header, b.cols) : { records: [], free: [], end: b.header, open: true, width: [0, 0] as [number, number], partial: [] };
  const match = makeMatcher(s.people);
  const byId = new Map(want.map(x => [statusId(kind, x), x]));
  const syncedSet = new Set(synced); const placed = new Set<string>(); const hold = new Set<number>();
  const free = [...scan.free];
  const clearRow = (r: number) => {
    const row = rows[r] || [];
    for (let c = scan.width[0]; c <= scan.width[1]; c++) if (c !== b.cols.aa && cellText(row[c]) !== '') plan.sets.push({ r, c, v: null });
  };
  for (const { r, v } of scan.records) {
    const m = match(v); const from = parseDate(v.from);
    const raw = cellText(v.kind); const type = typeOfValue(kind, raw, b.values, s.settings.lists) || DEFAULT_TYPE[kind];
    const idOf = (pid: number) => identity(pid, kind, from!, subOf(kind, raw || TYPES[type].label));
    let id = m.pid != null && from ? idOf(m.pid) : null;
    // συνονόματοι: η γραμμή είναι αυτού που έχει εγγραφή με την ίδια έναρξη. Αν την έχουν περισσότεροι, δεν ξέρουμε
    // ποιανού είναι: δεν γράφεται, και δεν ξαναμπαίνει ως νέα για κανέναν τους
    if (m.alts && from) {
      const hits = m.alts.map(p => idOf(p.id)).filter(x => byId.has(x) && !placed.has(x));
      if (hits.length > 1) { hits.forEach(x => { placed.add(x); plan.keys.push(x); }); (plan.ambiguous = plan.ambiguous || []).push(r); continue; }
      if (hits.length === 1) id = hits[0];
      else id = m.alts.map(p => idOf(p.id)).find(x => syncedSet.has(x) && !byId.has(x)) || id;
      // πολλοί ενεργοί και καμία εγγραφή τους με αυτή την έναρξη: η γραμμή είναι κάποιου τους, δεν ξέρουμε ποιου
      if (m.pid == null && !id) { m.alts.forEach(p => hold.add(p.id)); (plan.ambiguous = plan.ambiguous || []).push(r); continue; }
    }
    const st = id ? byId.get(id) : undefined;
    if (st && !placed.has(id!)) {
      placed.add(id!); plan.keys.push(id!);
      let ch = false;
      for (const k of fields) {
        if (['rank', 'spec', 'last', 'first', 'name', 'father', 'asm', 'phone', 'room'].includes(k)) continue;   // τα στοιχεία του ατόμου τα κρατά το Excel
        if (st.open && (k === 'to' || k === 'days' || k === 'tin')) continue;   // χωρίς λήξη: το «έως» του Excel δεν το αγγίζει η εφαρμογή
        const val = fieldValue(k, kind, st, pm.get(st.pid), b);
        if (TIME_FIELDS.includes(k) ? cellTime(v[k]) !== val : !same(v[k], val)) { plan.sets.push({ r, c: b.cols[k], v: val }); ch = true; }
      }
      if (ch) plan.changed++;
    } else if (id && syncedSet.has(id) && !byId.has(id)) { clearRow(r); free.push(r); plan.cleared++; }   // την είχε γράψει η εφαρμογή και σβήστηκε
    else plan.foreign++;
  }
  free.sort((a, c) => a - c);
  const fresh = want.filter(x => !placed.has(statusId(kind, x)) && !hold.has(x.pid));
  const put = (r: number, st: Status) => { for (const k of fields) { const val = fieldValue(k, kind, st, pm.get(st.pid), b); if (val != null) plan.sets.push({ r, c: b.cols[k], v: val }); } };
  // Α/Α: ο αύξων αριθμός στις γραμμές που δεν τον έχουν
  const aa = (r: number, n: number) => { if (b.cols.aa != null && cellText((rows[r] || [])[b.cols.aa]) === '') plan.sets.push({ r, c: b.cols.aa, v: n }); };
  let n = scan.records.length - plan.cleared;
  let i = 0;
  for (; i < fresh.length && i < free.length; i++) { put(free[i], fresh[i]); aa(free[i], ++n); plan.keys.push(statusId(kind, fresh[i])); }
  const rest = fresh.slice(i);
  const after = Math.max(scan.end, b.header);
  if (rest.length && sideBy(sheet, b, after)) plan.warn = [noRoomTxt(b.sheet, rest.map(st => (pm.get(st.pid) ? fullName(pm.get(st.pid)!) : '?')))];
  else if (rest.length) {
    const tpl = scan.records.length ? scan.records[scan.records.length - 1].r : scan.free.length ? scan.free[0] : b.header;
    plan.insert = { after, n: rest.length, tpl };
    rest.forEach((st, j) => { const r = after + 1 + j; put(r, st); if (b.cols.aa != null) plan.sets.push({ r, c: b.cols.aa, v: ++n }); plan.keys.push(statusId(kind, st)); });
  }
  plan.added = fresh.length - (plan.warn ? rest.length : 0);
  return plan;
}
// Στήλες για τις ώρες (άδειες, νοσοκομείο, ΣΤΕΠ) σε πίνακα που δεν τις έχει: μπαίνουν μόνο όταν κάποια εγγραφή έχει ώρα, στο τέλος του
// πίνακα (στις πρώτες στήλες που είναι κενές από τις επικεφαλίδες ως κάτω), ώστε να μη μετακινηθεί καμία δική σου στήλη.
// head: οι επικεφαλίδες που γράφονται (σε καινούργιο πίνακα τις γράφει το planWrite με τις υπόλοιπες).
export function timeCols(kind: ListKind, sheet: RawSheet | null, b: SourceBinding, s: AppState, today: ISODate): { b: SourceBinding; head: { r: number; c: number; v: string }[] } {
  const timed = isStatusKind(kind) && TIME_KINDS.includes(kind);
  const need = timed ? TIME_FIELDS.filter(k => b.cols[k] == null) : [];
  if (!timed || !need.length || !wanted(kind as StatusKind, s, b, today).some(x => x.fromTime || (x.toTime && !x.open))) return { b, head: [] };
  const rows = sheet?.rows || [];
  const fresh = !(rows[b.header] || []).some(v => cellText(v));
  const scan = sheet && !fresh ? tableRows(sheet, b.header, b.cols) : null;
  const last = scan ? Math.max(scan.end, b.header) : b.header;
  const empty = (c: number) => { for (let r = b.header; r <= last; r++) if (cellText((rows[r] || [])[c]) !== '') return false; return true; };
  const cols = { ...b.cols }; const head: { r: number; c: number; v: string }[] = [];
  let c = Math.max(scan ? scan.width[1] : 0, ...Object.values(b.cols)) + 1;
  for (const k of need) {
    while (Object.values(cols).includes(c) || !empty(c)) c++;
    cols[k] = c;
    if (!fresh) head.push({ r: b.header, c, v: KIND[kind].fields.find(f => f.k === k)!.head });
    c++;
  }
  return { b: { ...b, cols }, head };
}
// ------------------------------------------------------------------ μορφή των φύλλων που γράφει η εφαρμογή
// Τίτλοι πάνω από τον πίνακα (κείμενο μόνο στην πρώτη στήλη του, ως 3 γραμμές πάνω από τις επικεφαλίδες): στο κέντρο,
// σε συγχωνευμένα κελιά στο πλάτος του πίνακα. Ποιοι είναι ήδη συγχωνευμένοι το ξέρει όποιος έχει το αρχείο (xlsx.ts).
export function titleSpans(kind: ListKind, sheet: RawSheet, b: SourceBinding): { r: number; c1: number; c2: number }[] {
  if (kind === 'duties') return [];      // μηνιαίο πλέγμα: ο τίτλος του είναι όπως τον έστησε ο λοχίας
  const head = sheet.rows[b.header] || []; const hc = head.map((v, i) => (cellText(v) ? i : -1)).filter(i => i >= 0);
  if (hc.length < 2) return [];
  const c1 = Math.min(...hc, ...Object.values(b.cols)), c2 = Math.max(...hc, ...Object.values(b.cols));
  const out: { r: number; c1: number; c2: number }[] = [];
  for (let r = b.header - 1; r >= Math.max(0, b.header - 3); r--) {
    const row = sheet.rows[r] || []; const filled = row.map((v, i) => (cellText(v) ? i : -1)).filter(i => i >= 0);
    if (!filled.length) continue;
    if (filled.length !== 1 || filled[0] !== c1 || typeof row[c1] !== 'string') break;
    out.push({ r, c1, c2 });
  }
  return out;
}
// Λίστες επιλογής (dropdown) για βαθμό και Ο/Σ στις γραμμές του πίνακα και στις κενές από κάτω του (ως τον επόμενο
// πίνακα ή 200 γραμμές). Η βασική λίστα και όσες άλλες τιμές έχει ήδη η στήλη· ο Excel δέχεται και άλλη τιμή.
// Με τις Λίστες των Ρυθμίσεων (lists): ό,τι πρόσθεσες μπαίνει και στο dropdown, ό,τι έκρυψες όχι
// και για τη Σ.Ι.: οι συνδυασμοί του πίνακα Σ.Ι. (Ι1 … Ι3 ΜΕ ΟΠΛΟ, Ι3 ΧΩΡΙΣ ΟΠΛΟ, Ι4 …)
export const LIST_FIELDS: [string, ListId | 'si', string][] = [['rank', 'soldierRanks', 'Βαθμός'], ['spec', 'specs', 'Ο/Σ'], ['si', 'si', 'Σ.Ι.']];
const fieldList = (lists: UserLists | undefined, id: ListId | 'si') => (id === 'si' ? siCombos(lists?.si) : listOf(lists, id));
export function listColumns(kind: ListKind, sheet: RawSheet, b: SourceBinding, lists?: UserLists): { c: number; r1: number; r2: number; items: string[]; what: string; base: string[] }[] {
  if (kind === 'duties') return [];
  const scan = tableRows(sheet, b.header, b.cols);
  let r = scan.end + 1; while (r < sheet.rows.length && !(sheet.rows[r] || []).some(v => cellText(v))) r++;
  const r1 = b.header + 1, r2 = r < sheet.rows.length ? r - 1 : Math.max(scan.end, b.header) + 200;
  if (r2 < r1) return [];
  const out: { c: number; r1: number; r2: number; items: string[]; what: string; base: string[] }[] = [];
  for (const [k, id, what] of LIST_FIELDS) {
    const c = b.cols[k]; if (c == null) continue;
    // Σ.Ι.: ό,τι είναι ήδη στη λίστα με άλλο όνομα (π.χ. το παλιό «Ι3 ΑΟΠΛΟ» = «Ι3 ΧΩΡΙΣ ΟΠΛΟ») δεν μπαίνει δεύτερη φορά
    const known = (v: string) => { if (id !== 'si') return false; const x = parseSi(v, lists?.si); return !!x?.ok && fieldList(lists, id).includes(siLabel(x.base, x.sub)); };
    const seen = scan.records.map(x => cellText(x.v[k])).filter(v => !/[,"]/.test(v) && !known(v));
    // ο Excel δέχεται ως 255 χαρακτήρες στη λίστα: οι σπάνιες τιμές από το τέλος φεύγουν
    const base = fieldList(lists, id); const items = optionsOf(base, seen); while (items.join(',').length > 250) items.pop();
    out.push({ c, r1, r2, items, what, base });
  }
  return out;
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
  if (kind === 'caps' && !CAP_COLS.some(k => cols[k] != null)) out.push('μία τουλάχιστον στήλη υπηρεσίας (Θαλαμοφύλακας, Μαγειρεία…)');
  return out;
}
// Αποτύπωμα του πίνακα ενός είδους: μόνο οι στήλες που διαβάζει η εφαρμογή (και οι μέρες του μηνιαίου πλέγματος), από τις
// επικεφαλίδες ως το τέλος του πίνακα. Αλλαγή σε άλλο φύλλο ή άλλο πίνακα του ίδιου αρχείου δεν το αλλάζει (Michael, 11/10).
// Η θέση κάθε γραμμής μετράει από τις επικεφαλίδες, ώστε ο ίδιος πίνακας λίγο πιο κάτω (γραμμές από πάνω) να μη φαίνεται
// «αλλαγμένος». Τα κελιά με τύπο δεν μετράνε: το Excel τα ξαναϋπολογίζει στο άνοιγμα (π.χ. σύνολα θαλάμων κάτω από το
// ΣΥΝΟΛΙΚΟ) και θα έδειχναν «Άλλαξε στο Excel» χωρίς να άλλαξε τίποτα.
export function tableHash(sheet: RawSheet | undefined, b: SourceBinding): string {
  if (!sheet) return '-';
  const cols = [...new Set([...Object.values(b.cols), ...(b.cols.d1 != null ? dutyDays(sheet, b) : [])])].sort((a, c) => a - c);
  const line = (r: number) => cols.map(c => (sheet.fx?.has(r + ':' + c) ? '' : cellText((sheet.rows[r] || [])[c]))).join('\t');
  const scan = tableRows(sheet, b.header, b.cols);
  // και οι μισογραμμένες γραμμές: όταν συμπληρωθούν (ή σβηστούν) ο πίνακας άλλαξε
  const rows = [...scan.records.map(x => x.r), ...scan.partial].sort((a, c) => a - c);
  const text = [line(b.header), ...rows.map(r => r - b.header + ':' + line(r))].join('\n');
  let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return HASH_V + (h >>> 0).toString(16) + ':' + text.length;
}
export const HASH_V = 'v2:';
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
  cols: { prov: 'B', placed: 'C', attached: 'D', sum: 'E', yp: 'F', ey: 'G', tim: 'H', bl: 'I', os: 'J', mag: 'K', sid: 'L', kin: 'M', sumK: 'N', ka: 'O', an: 'P', eid: 'Q', nos: 'R', prat: 'S', adik: 'T', fp: 'U', fyl: 'V', apal: 'W', ekp: 'X', allh: 'Y', sumA: 'Z', avail: 'AA', ab: 'AB' }
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
  // «Προβλέπονται από τη σύνθεση»: προαιρετική στήλη (Ρυθμίσεις της ΗΚΑΙ), δεν μετρά στα «βρέθηκαν»
  let pv: string | null = null;
  for (let r = Math.max(0, top - 14); r < top && !pv; r++) (rows[r] || []).forEach((v, c) => { if (!pv && /^ΠΡΟΒΛΕΠΟΝΤΑΙ/.test(headText(v))) pv = colLetter(c); });
  if (pv) map.cols.prov = pv;
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
// Γραμμές δεν σβήνονται: το Δυναμολόγιο μένει η λίστα του λοχία. Μόνη εξαίρεση ο «Νέος στρατιώτης» της εφαρμογής:
// μπαίνει σε νέα γραμμή κάτω από τον τελευταίο (added = οι γραμμές που έβαλε η εφαρμογή), και αν αναιρεθεί, η γραμμή
// του αδειάζει.
export const PEOPLE_SYNC = ['rank', 'spec', 'last', 'first', 'father', 'asm', 'phone', 'room', 'si', 'remarks', 'dn'];
export type PersonSnap = Record<string, string>;
// Χωρίς στήλη ΔΝ, το δικαίωμα ΔΝ γράφεται ως λέξη στις παρατηρήσεις (όπως το διαβάζει η εισαγωγή)
const remarksOf = (role: string, dn: boolean, inRemarks: boolean) => [stripDn(role), inRemarks && dn ? 'ΔΝ' : ''].filter(Boolean).join(' ');
export const personVals = (p: Person, b?: SourceBinding): PersonSnap => ({
  rank: p.rank || '', spec: p.spec || '', last: p.last || '', first: p.first || '', father: p.father || '', asm: p.asm || '',
  phone: p.phone || '', room: p.room == null ? '' : String(p.room), si: p.si || '', remarks: remarksOf(p.role || '', !!p.dn, !!b && b.cols.dn == null),
  dn: p.dn ? 'ΝΑΙ' : ''
});
export const snapPeople = (people: Person[]): Record<number, PersonSnap> => Object.fromEntries(people.map(p => [p.id, personVals(p)]));
// Γραμμές που μπαίνουν σε ένα φύλλο: after/tpl είναι γραμμές του φύλλου όπως ήταν (από 0), με αύξουσα σειρά. steps: πώς
// μπαίνουν μία-μία (κάθε βήμα στις θέσεις μετά τα προηγούμενα), fin: πού καταλήγει μια γραμμή του φύλλου, at: η πρώτη
// καινούργια γραμμή του k.
export interface RowInsert { after: number; n: number; tpl: number }
export function placeRows(ins: RowInsert[]): { steps: RowInsert[]; fin: (r: number) => number; at: (k: number) => number } {
  const fin = (r: number) => r + ins.reduce((t, x) => t + (x.after < r ? x.n : 0), 0);
  const steps = ins.map((x, k) => ({ after: x.after + ins.slice(0, k).reduce((t, y) => t + y.n, 0), n: x.n, tpl: x.tpl + ins.slice(0, k).reduce((t, y) => t + (y.after < x.tpl ? y.n : 0), 0) }));
  return { steps, fin, at: k => fin(ins[k].after) + 1 };
}
// Ένα φύλλο με τις γραμμές που μπαίνουν κενές (για την προεπισκόπηση: ποιος είναι σε κάθε γραμμή μετά την εγγραφή)
export function withRows(sheet: RawSheet, steps: RowInsert[]): RawSheet {
  const rows = [...sheet.rows];
  for (const x of steps) rows.splice(x.after + 1, 0, ...Array.from({ length: x.n }, () => [] as CellValue[]));
  return { ...sheet, rows };
}
// grow: οι νέοι μπήκαν ακριβώς κάτω από τον τελευταίο (γραμμή last, από 1) ως τη γραμμή to· οι περιοχές των τύπων που
// σταματούν στον τελευταίο (π.χ. COUNTIF(I4:I158, "1") στα σύνολα θαλάμων) μεγαλώνουν ως εκεί, όπως θα έκανε το Excel.
// inserts: νέες γραμμές (steps του placeRows)· οι τιμές (sets) είναι στις θέσεις μετά από αυτές. deletes: γραμμές που
// σβήνονται μετά τις τιμές (από κάτω προς τα πάνω). fresh/gone: όσοι μπήκαν και όσοι έφυγαν (για το φύλλο ΘΑΛΑΜΟΙ).
export interface PeoplePlan { sets: { r: number; c: number; v: WVal }[]; changed: number; notFound: string[]; snap: Record<number, PersonSnap>;
  inserts: RowInsert[]; deletes: number[]; added: number; cleared: number; keys: string[]; grow: { from: number; last: number; to: number } | null;
  fresh: number[]; gone: PersonSnap[]; warn?: string[] }
const snapVal = (k: string, v: string): WVal => (v === '' ? null : k === 'room' ? Number(v) : k === 'asm' || k === 'phone' ? num(v) : v);
const roomNo = (v: CellValue) => { const n = parseInt(cellText(v), 10); return n > 0 ? n : null; };
const byNameCmp = (a: { last: string; first: string }, c: { last: string; first: string }) => collator.compare(a.last, c.last) || collator.compare(a.first, c.first);
const rowName2 = (x: TableRow) => ({ last: cellText(x.v.last), first: cellText(x.v.first) });
// αλφαβητικά με το επώνυμο (στους συνεπώνυμους το όνομα δεν μετράει: ο λοχίας δεν τους βάζει πάντα με τη σειρά)
const sortedRows = (l: TableRow[]) => l.every((x, i) => !i || collator.compare(rowName2(l[i - 1]).last, rowName2(x).last) <= 0);
// Πού μπαίνει ένας νέος στον πίνακα του Δυναμολογίου: όταν τα άτομα είναι ομαδοποιημένα ανά θάλαμο (1, 2, 3…), στον θάλαμό
// του, αλφαβητικά αν η ομάδα είναι αλφαβητική (ο θαλαμάρχης μένει πρώτος), αλλιώς στο τέλος της ομάδας· θάλαμος χωρίς
// ομάδα μπαίνει ανάμεσα στους διπλανούς. null: στο τέλος του πίνακα.
// Μέσα σε μια ομάδα (θάλαμο): αλφαβητικά αν είναι αλφαβητική (ο θαλαμάρχης μένει πρώτος), αλλιώς στο τέλος της
function groupSlot(m: TableRow[], p: { last: string; first: string }): { after: number; tpl: number } {
  const lead = m.length > 1 && (/ΘΑΛΑΜΑΡΧ/.test(normGreek(cellText(m[0].v.remarks))) || (!sortedRows(m) && sortedRows(m.slice(1))));
  const body = lead ? m.slice(1) : m;
  const i = sortedRows(body) ? body.findIndex(x => byNameCmp(p, rowName2(x)) < 0) : -1;
  return i < 0 ? { after: m[m.length - 1].r, tpl: body[body.length - 1].r } : { after: body[i].r - 1, tpl: body[i].r };
}
function slotOf(people: TableRow[], p: Person, header: number): { after: number; tpl: number } | null {
  if (p.room == null || !people.length) return null;
  const runs: { room: number | null; rows: TableRow[] }[] = [];
  for (const x of people) { const r = roomNo(x.v.room); const l = runs[runs.length - 1]; if (l && l.room === r) l.rows.push(x); else runs.push({ room: r, rows: [x] }); }
  if (runs.length > 1 && runs[runs.length - 1].room == null) runs.pop();   // όσοι δεν έχουν θάλαμο, στο τέλος (όπως στο νέο Δυναμολόγιο)
  if (runs.some((g, i) => g.room == null || (i && g.room <= runs[i - 1].room!))) return null;   // όχι ομάδες θαλάμων
  const last = people[people.length - 1].r;
  const end = (after: number) => (after === last ? null : after);
  const g = runs.find(x => x.room === p.room);
  if (g) { const x = groupSlot(g.rows, p); if (x.after === g.rows[g.rows.length - 1].r && end(x.after) == null) return null; return x; }
  const prev = runs.filter(x => x.room! < p.room!).pop();
  if (!prev) return { after: header, tpl: (runs[0].rows[1] || runs[0].rows[0]).r };
  const a = end(prev.rows[prev.rows.length - 1].r); if (a == null) return null;
  return { after: a, tpl: (prev.rows.length > 1 ? prev.rows[prev.rows.length - 1] : prev.rows[0]).r };
}
export function planPeopleWrite(sheet: RawSheet, b: SourceBinding, s: AppState, snap: Record<number, PersonSnap>, keys: string[] = []): PeoplePlan {
  const plan: PeoplePlan = { sets: [], changed: 0, notFound: [], snap: { ...snap }, inserts: [], deletes: [], added: 0, cleared: 0, keys: [], grow: null, fresh: [], gone: [] };
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
  const orig: { r: number; c: number; v: WVal }[] = [];   // σε γραμμές του φύλλου όπως είναι τώρα
  const pm = new Map(s.people.map(p => [p.id, p]));
  for (const p of s.people) {
    const old = snap[p.id]; if (!old) continue;
    const cur = personVals(p, b);
    // κενό δεν σβήνει κελί, εκτός από το ΔΝ και τις παρατηρήσεις (εκεί το «όχι» είναι κενό)
    const diff = PEOPLE_SYNC.filter(k => b.cols[k] != null && cur[k] !== (old[k] || '') && (cur[k] !== '' || ((k === 'dn' || k === 'remarks') && p.active)));
    if (!diff.length) continue;
    const row = find(old) || find(cur);
    if (!row) { plan.notFound.push(fullName(p)); continue; }
    let ch = false;
    for (const k of diff) {
      const v = snapVal(k, cur[k]);
      if (!same(row.v[k], v)) { orig.push({ r: row.r, c: b.cols[k], v }); ch = true; }
    }
    if (ch) plan.changed++;
    plan.snap[p.id] = cur;
  }
  const people = scan.records.filter(x => b.cols.last == null || b.cols.first == null || isPersonRow(cellText(x.v.last), cellText(x.v.first), cellText(x.v.father)));
  const last = people.length ? people[people.length - 1].r : b.header;
  const blank = (r: number) => !(sheet.rows[r] || []).some(v => cellText(v));
  // νέος που αναιρέθηκε (δεν υπάρχει πια στην εφαρμογή): η γραμμή που του έβαλε η εφαρμογή φεύγει (στο τέλος του πίνακα
  // απλώς αδειάζει, για να μείνουν τα σύνολα από κάτω εκεί που ήταν)
  const dels: number[] = [];
  for (const id of new Set(keys.map(Number))) {
    if (pm.has(id)) { plan.keys.push(String(id)); continue; }
    const row = snap[id] && find(snap[id]); if (snap[id]) plan.gone.push(snap[id]); delete plan.snap[id];
    if (!row) continue;
    if (row.r === last && blank(row.r + 1)) { for (let c = scan.width[0]; c <= scan.width[1]; c++) if (c !== b.cols.aa && cellText((sheet.rows[row.r] || [])[c]) !== '') orig.push({ r: row.r, c, v: null }); }
    else dels.push(row.r);
    plan.cleared++;
  }
  // νέοι από την εφαρμογή που δεν είναι ακόμα στο φύλλο
  // (ίδιος μόνο με ίδιο ΑΣΜ, ή ίδιο ονοματεπώνυμο και πατρώνυμο χωρίς άλλο ΑΣΜ: όχι στη γραμμή συνονόματου)
  const written = (v: PersonSnap) => (v.asm && byAsm.get(v.asm)) || (byName.get(key2(v.last, v.first)) || []).find(x => normGreek(cellText(x.v.father)) === normGreek(v.father) && (!v.asm || !cellText(x.v.asm)));
  const fresh = s.people.filter(p => p.added && p.active && !plan.snap[p.id]).filter(p => {
    const cur = personVals(p, b); if (!written(cur)) return true;
    plan.snap[p.id] = cur; plan.keys.push(String(p.id)); return false;   // τον έγραψε ήδη ο λοχίας με το χέρι
  }).sort(byNameCmp);
  // θέσεις: μέσα στον πίνακα (στον θάλαμό τους) ή στο τέλος
  const slots = new Map<number, { tpl: number; ps: Person[] }>(); const atEnd: Person[] = [];
  // μέσα στον πίνακα μόνο αν η νέα γραμμή δεν κόβει διπλανό πίνακα (αλλιώς στο τέλος, σε κενή γραμμή αν υπάρχει)
  const side = (after: number) => sideBy(sheet, b, after);
  for (const p of fresh) { const x = slotOf(people.filter(y => !dels.includes(y.r)), p, b.header); if (!x || side(x.after)) { atEnd.push(p); continue; } const sl = slots.get(x.after) || { tpl: x.tpl, ps: [] }; sl.ps.push(p); slots.set(x.after, sl); }
  // στο τέλος: ελεύθερες γραμμές κάτω από τον τελευταίο· μία κενή μένει πριν από ό,τι ακολουθεί (σύνολα, άλλος πίνακας)
  const next = scan.records.find(x => x.r > last)?.r ?? Infinity;
  const free = scan.free.filter(r => r > last && r < next - 1).slice(0, atEnd.length);
  let rest = atEnd.slice(free.length);
  const ins: (RowInsert & { ps: Person[] })[] = [...slots].map(([after, x]) => ({ after, n: x.ps.length, tpl: x.tpl, ps: x.ps }));
  if (rest.length && side(free.length ? free[free.length - 1] : last)) { plan.warn = [noRoomTxt(b.sheet, rest.map(fullName))]; rest = []; }
  if (rest.length) ins.push({ after: free.length ? free[free.length - 1] : last, n: rest.length, tpl: people.length ? last : b.header, ps: rest });
  ins.sort((x, y) => x.after - y.after);
  const { steps, fin, at } = placeRows(ins);
  plan.inserts = steps;
  // Α/Α: αν η στήλη μετράει 1, 2, 3… (σχεδόν παντού), οι από κάτω αλλάζουν αριθμό όπως θα τους άλλαζε ο λοχίας
  const aaCol = b.cols.aa;
  const aaOf = (r: number) => { if (aaCol == null || sheet.fx?.has(r + ':' + aaCol)) return null; const t = cellText((sheet.rows[r] || [])[aaCol]); return /^\d+$/.test(t) ? Number(t) : null; };
  const seq = aaCol != null && people.length > 0 && people.filter((x, i) => aaOf(x.r) === i + 1).length >= people.length * 0.8;
  const newAbove = (r: number) => ins.reduce((t, x) => t + (x.after < r ? x.n : 0), 0) + free.filter(f => f < r).length;
  const delAbove = (r: number) => dels.filter(d => d < r).length;
  if (seq) for (const x of people) {
    if (dels.includes(x.r)) continue;
    const a = aaOf(x.r); const d = newAbove(x.r) - delAbove(x.r);
    if (a != null && d) orig.push({ r: x.r, c: aaCol!, v: a + d });
  }
  plan.sets = orig.map(x => ({ ...x, r: fin(x.r) }));
  // τα στοιχεία των νέων
  let k = 0;
  const put = (r: number, p: Person, aa: number | null) => {
    const cur = personVals(p, b);
    for (const f of PEOPLE_SYNC) if (b.cols[f] != null && cur[f] !== '') plan.sets.push({ r, c: b.cols[f], v: snapVal(f, cur[f]) });
    if (b.cols.name != null) plan.sets.push({ r, c: b.cols.name, v: nameCell(p, b) });
    if (aa != null) plan.sets.push({ r, c: aaCol!, v: aa });
    plan.snap[p.id] = cur; plan.keys.push(String(p.id)); plan.fresh.push(p.id); k++;
  };
  // ο αριθμός του j-ού νέου κάτω από τη γραμμή after: όσοι είναι από πάνω του + 1
  const aaAt = (after: number, j: number) => (aaCol == null ? null : seq ? people.filter(x => x.r <= after && !dels.includes(x.r)).length + ins.reduce((t, x) => t + (x.after < after ? x.n : 0), 0) + free.filter(f => f <= after).length + j + 1 : people.length + k + 1);
  const endRows: number[] = [];
  free.forEach((r, j) => { put(fin(r), atEnd[j], aaCol != null && cellText((sheet.rows[r] || [])[aaCol]) === '' ? aaAt(r - 1, 0) : null); endRows.push(fin(r)); });
  ins.forEach((x, i) => x.ps.forEach((p, j) => { put(at(i) + j, p, aaAt(x.after, j)); if (x.ps === rest) endRows.push(at(i) + j); }));
  plan.added = k;
  plan.deletes = dels.map(fin).sort((x, y) => y - x);
  const l1 = fin(last) + 1;   // ο τελευταίος, από 1
  if (people.length && endRows.length && endRows.every((r, j) => r === fin(last) + 1 + j)) plan.grow = { from: b.header + 1, last: l1, to: l1 + endRows.length };
  return plan;
}
// ------------------------------------------------------------------ νέο Δυναμολόγιο (όπως το ΔΥΝΑΜΟΛΟΓΙΟ της Ίλης)
// ΣΥΝΟΛΙΚΟ: όλοι οι ενεργοί, ανά θάλαμο (όσοι δεν έχουν θάλαμο στο τέλος) και αλφαβητικά, με Α/Α 1, 2, 3…· από κάτω,
// μετά από μία κενή γραμμή, τα σύνολα ανά θάλαμο με COUNTIF στη στήλη του θαλάμου (όπως στο δικό σας: ετικέτα στο
// επώνυμο, αριθμός στο πατρώνυμο). Ο νέος στρατιώτης μπαίνει μετά πάνω από τα σύνολα και οι τύποι μεγαλώνουν (grow).
export interface Extra { r: number; c: number; v?: string; f?: string; head?: boolean }
export interface Span { r: number; c1: number; c2: number }
export const rosterTitle = (s: AppState) => ('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ ' + (s.settings.unitName || '') + (s.settings.essos ? ' ' + essoName(s.settings.essos) : '')).replace(/\s+/g, ' ').trim();
// ανά θάλαμο, ο θαλαμάρχης πρώτος (όπως στο δικό σας), μετά αλφαβητικά
const isLead = (p: Person) => (/ΘΑΛΑΜΑΡΧ/.test(normGreek(p.role || '')) ? 0 : 1);
const byRoom = (a: Person, c: Person) => (a.room ?? 999) - (c.room ?? 999) || isLead(a) - isLead(c) || byNameCmp(a, c);
const ordinal = (n: number) => n + 'ος';
export function planPeopleNew(b: SourceBinding, s: AppState): Omit<FullPlan, 'psnap'> {
  const people = s.people.filter(p => p.active).sort(byRoom);
  const plan = { sets: [] as { r: number; c: number; v: WVal }[], insert: null, header: newHeader('people', [], b, rosterTitle(s)), keys: [] as string[], added: 0, changed: 0, cleared: 0, foreign: 0, notFound: [] as string[],
    snap: {} as Record<number, PersonSnap>, inserts: [], deletes: [], fresh: [], gone: [], extra: [] as Extra[], merges: [] as Span[] };
  people.forEach((p, i) => {
    const r = b.header + 1 + i; const cur = personVals(p, b);
    if (b.cols.aa != null) plan.sets.push({ r, c: b.cols.aa, v: i + 1 });
    for (const f of PEOPLE_SYNC) if (b.cols[f] != null && cur[f] !== '') plan.sets.push({ r, c: b.cols[f], v: snapVal(f, cur[f]) });
    plan.snap[p.id] = cur;
    if (p.added) plan.keys.push(String(p.id));
  });
  const { last, first, father, room } = b.cols;
  const rooms = [...new Set(people.map(p => p.room).filter((x): x is number => x != null))].sort((x, y) => x - y);
  if (people.length && rooms.length && last != null && father != null && room != null) {
    const L = (c: number) => colLetter(c), r1 = b.header + 2, r2 = b.header + 1 + people.length;   // από 1
    let r = r2 + 1;   // μία κενή γραμμή (από 0: r2 είναι η κενή)
    const label = (rr: number, v: string, head = false) => { plan.extra.push({ r: rr, c: last, v, head }); if (first != null && first === last + 1) plan.merges.push({ r: rr, c1: last, c2: first }); };
    label(r, 'ΘΑΛΑΜΟΙ', true); plan.extra.push({ r, c: father, v: 'ΣΤΡΑΤΙΩΤΕΣ', head: true });
    const from = r + 2;   // πρώτη γραμμή συνόλων, από 1
    for (const n of rooms) { r++; label(r, ordinal(n)); plan.extra.push({ r, c: father, f: `COUNTIF(${L(room)}${r1}:${L(room)}${r2},"${n}")` }); }
    r++; label(r, 'ΣΥΝΟΛΟ', true); plan.extra.push({ r, c: father, f: `SUM(${L(father)}${from}:${L(father)}${r})`, head: true });
  }
  plan.added = 0;
  return plan;
}
// ΘΑΛΑΜΟΙ: ένας πίνακας ανά θάλαμο («ΔΥΝΑΜΟΛΟΓΙΟ 1ου ΘΑΛΑΜΟΥ», επικεφαλίδες, άτομα), με κενή γραμμή ανάμεσα, όπως
// το διαβάζει το roomBlocks. Οι στήλες που δεν κρατά η εφαρμογή (e-mail, νούμερο, ομάδα αίματος) μένουν κενές για τον λοχία.
export const ROOM_HEAD = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Κινητό Τηλέφωνο', 'E-mail', 'E-mail συγγενικού προσώπου', 'Νούμερο παραλλαγής', 'Ομάδα αίματος'];
export function roomSheetNew(people: Person[]): { cells: { r: number; c: number; v: WVal; st: 'title' | 'head' | 'data' }[]; merges: Span[] } {
  const out = { cells: [] as { r: number; c: number; v: WVal; st: 'title' | 'head' | 'data' }[], merges: [] as Span[] };
  const act = people.filter(p => p.active && p.room != null).sort(byRoom);
  const rooms = [...new Set(act.map(p => p.room!))];
  let r = 0;
  for (const n of rooms) {
    out.cells.push({ r, c: 0, v: 'ΔΥΝΑΜΟΛΟΓΙΟ ' + n + 'ου ΘΑΛΑΜΟΥ', st: 'title' }); out.merges.push({ r, c1: 0, c2: ROOM_HEAD.length - 1 }); r++;
    ROOM_HEAD.forEach((h, c) => out.cells.push({ r, c, v: h, st: 'head' })); r++;
    act.filter(p => p.room === n).forEach((p, i) => {
      const v: WVal[] = [i + 1, p.rank || null, p.spec || null, p.last, p.first, p.father || null, p.asm ? num(p.asm) : null, p.phone ? num(p.phone) : null];
      for (let c = 0; c < ROOM_HEAD.length; c++) out.cells.push({ r, c, v: v[c] ?? null, st: 'data' });
      r++;
    });
    r++;
  }
  return out;
}
// Μετά από τα βήματα του placeRows: πού πήγε μια γραμμή του φύλλου, και ποιες γραμμές είναι καινούργιες
export const stepFin = (steps: RowInsert[]) => (r: number) => steps.reduce((x, st) => (x > st.after ? x + st.n : x), r);
export const stepRows = (steps: RowInsert[]) => new Set(steps.flatMap(st => Array.from({ length: st.n }, (_, i) => st.after + 1 + i)));

// ------------------------------------------------------------------ φύλλο ΘΑΛΑΜΟΙ: ένας πίνακας ανά θάλαμο
// («ΔΥΝΑΜΟΛΟΓΙΟ 1ου ΘΑΛΑΜΟΥ», επικεφαλίδες, άτομα). Δεν διαβάζεται· ο νέος στρατιώτης μπαίνει στο τέλος του θαλάμου του.
export interface RoomBlock { room: number; header: number; cols: Record<string, number>; rows: TableRow[] }
export function roomBlocks(sheet: RawSheet): RoomBlock[] {
  const out: RoomBlock[] = [];
  for (let r = 0; r < sheet.rows.length; r++) {
    const t = (sheet.rows[r] || []).map(cellText).filter(Boolean); if (t.length !== 1) continue;
    const m = /(\d+)\s*(?:ΟΥ|ΟΣ|Ο)?\s*ΘΑΛΑΜ|ΘΑΛΑΜ\S*\s+(\d+)/.exec(normGreek(t[0])); if (!m) continue;
    let h = r + 1; while (h <= r + 2 && !isHeaderRow(sheet.rows[h])) h++;
    if (h > r + 2) continue;
    const cols = mapColumns(sheet.rows[h], PERSON_FIELDS.filter(f => f.k !== 'name'));
    if (cols.last == null) continue;
    out.push({ room: Number(m[1] || m[2]), header: h, cols, rows: tableRows(sheet, h, cols).records });
    r = h;
  }
  return out;
}
export interface RoomsPlan { inserts: RowInsert[]; sets: { r: number; c: number; v: WVal }[]; deletes: number[]; missing: Person[] }
export function planRoomSheet(sheet: RawSheet, add: Person[], gone: PersonSnap[]): RoomsPlan {
  const blocks = roomBlocks(sheet); const out: RoomsPlan = { inserts: [], sets: [], deletes: [], missing: [] };
  const same2 = (x: TableRow, v: { asm?: string; last?: string; first?: string; father?: string }) => {
    const asm = cellText(x.v.asm).replace(/\s/g, '');
    if (v.asm && asm) return asm === v.asm;
    return key2(cellText(x.v.last), cellText(x.v.first)) === key2(v.last || '', v.first || '') && normGreek(cellText(x.v.father)) === normGreek(v.father || '');
  };
  const aaOf = (bl: RoomBlock, r: number) => { const c = bl.cols.aa; if (c == null || sheet.fx?.has(r + ':' + c)) return null; const t = cellText((sheet.rows[r] || [])[c]); return /^\d+$/.test(t) ? Number(t) : null; };
  const dels: { bl: RoomBlock; r: number }[] = [];
  for (const g of gone) for (const bl of blocks) { const x = bl.rows.find(y => same2(y, g)); if (x) { dels.push({ bl, r: x.r }); break; } }
  const ins: (RowInsert & { bl: RoomBlock; ps: Person[] })[] = [];
  for (const p of add) {
    if (p.room == null) continue;
    const bl = blocks.find(x => x.room === p.room); if (!bl) { out.missing.push(p); continue; }
    if (bl.rows.some(y => same2(y, p))) continue;
    const at0 = bl.rows.length ? groupSlot(bl.rows, p) : { after: bl.header, tpl: bl.header };
    const x = ins.find(y => y.after === at0.after); if (x) { x.n++; x.ps.push(p); continue; }
    ins.push({ ...at0, n: 1, bl, ps: [p] });
  }
  ins.sort((x, y) => x.after - y.after);
  // Α/Α του θαλάμου: όσοι είναι κάτω από νέο παίρνουν τον επόμενο αριθμό, όσοι είναι κάτω από γραμμή που φεύγει τον προηγούμενο
  const shift = (bl: RoomBlock, r: number) => ins.reduce((t, x) => t + (x.bl === bl && x.after < r ? x.n : 0), 0) - dels.filter(e => e.bl === bl && e.r < r).length;
  const { steps, fin, at } = placeRows(ins);
  out.inserts = steps;
  const orig: { r: number; c: number; v: WVal }[] = [];
  for (const bl of blocks) for (const x of bl.rows) { const a = aaOf(bl, x.r); const d = shift(bl, x.r); if (a != null && d && !dels.some(e => e.r === x.r)) orig.push({ r: x.r, c: bl.cols.aa!, v: a + d }); }
  out.sets = orig.map(x => ({ ...x, r: fin(x.r) }));
  ins.forEach((x, i) => x.ps.forEach((p, j) => {
    const r = at(i) + j; const c = x.bl.cols;
    // ο αριθμός του από πάνω + 1 (ή 1 αν είναι πρώτος)
    const above = x.bl.rows.filter(y => y.r <= x.after && !dels.some(e => e.r === y.r));
    const prevAa = above.length ? aaOf(x.bl, above[above.length - 1].r) : 0;
    const vals: Record<string, WVal> = { aa: prevAa == null ? null : (above.length ? prevAa + shift(x.bl, above[above.length - 1].r) : 0) + 1 + j, rank: p.rank || null, spec: p.spec || null, last: p.last, first: p.first, father: p.father || null, asm: p.asm ? num(p.asm) : null, phone: p.phone ? num(p.phone) : null };
    for (const [k, v] of Object.entries(vals)) if (c[k] != null && v != null) out.sets.push({ r, c: c[k], v });
  }));
  out.deletes = dels.map(d => fin(d.r)).sort((x, y) => y - x);
  return out;
}
// Οι τιμές του Excel για κάθε άτομο που βρέθηκε, όπως θα τις έγραφε η εισαγωγή: αφετηρία για το τι άλλαξε στην εφαρμογή.
// Ό,τι διαφέρει στην εφαρμογή (π.χ. διόρθωση πριν οριστεί το αρχείο) θα γραφτεί στην επόμενη ενημέρωση.
export function snapFromSheet(sheet: RawSheet, b: SourceBinding, people: Person[]): Record<number, PersonSnap> {
  const match = makeMatcher(people); const out: Record<number, PersonSnap> = {};
  for (const { v } of tableRows(sheet, b.header, b.cols).records) {
    const m = match(v); if (m.pid == null || out[m.pid]) continue;
    const t = (k: string) => (b.cols[k] == null ? null : cellText(v[k]));
    const p = people.find(x => x.id === m.pid)!; const cur = personVals(p, b);
    const snap: PersonSnap = {};
    for (const k of PEOPLE_SYNC) {
      const x = t(k);
      if (x == null) { snap[k] = cur[k]; continue; }          // η στήλη δεν υπάρχει: τίποτα να γραφτεί
      if (!p.active && (k === 'remarks' || k === 'dn')) { snap[k] = cur[k]; continue; }   // εκτός δύναμης: ο ρόλος δεν περνά στην εφαρμογή
      snap[k] = k === 'asm' || k === 'phone' ? x.replace(/\s/g, '') : k === 'room' ? (parseInt(x, 10) > 0 ? String(parseInt(x, 10)) : '')
        : k === 'dn' ? (isDnYes(x) ? 'ΝΑΙ' : '') : k === 'remarks' ? remarksOf(x, DN_WORD.test(norm(x)), b.cols.dn == null)
        : k === 'rank' || k === 'spec' || k === 'si' ? normGreek(x) : norm(x);   // όπως τα διαβάζει το Δυναμολόγιο (roster.ts)
    }
    out[m.pid] = snap;
  }
  return out;
}
// Γραμμές για την προεπισκόπηση μιας εγγραφής: «Γραμμή 14 · ΠΑΠΑΔΟΠΟΥΛΟΣ Γ.: Σ.Ι Ι1 → Ι3»
export interface PlanLine { r: number; who: string; text: string }
// Γραμμές συνονόματων που δεν αγγίζονται (X2)
export const ambiguousLines = (sheet: RawSheet, b: SourceBinding, rows: number[] = []): PlanLine[] => rows.map(r => {
  const v: Record<string, CellValue> = {}; for (const k in b.cols) v[k] = (sheet.rows[r] || [])[b.cols[k]];
  return { r, who: rowName(v), text: 'αμφίσημη γραμμή: ίδιο ονοματεπώνυμο με άλλον χωρίς ΑΣΜ, δεν αγγίζεται' };
});
const fmtW = (v: WVal) => (v == null ? '(κενό)' : typeof v === 'object' ? v.date.slice(8) + '/' + v.date.slice(5, 7) + '/' + v.date.slice(0, 4) : String(v));
export function describeSets(kind: ListKind, sheet: RawSheet, b: SourceBinding, sets: { r: number; c: number; v: WVal }[], newRows: Set<number> = new Set()): PlanLine[] {
  const label = new Map<number, string>(); const defs = fieldsOf(kind);
  if (kind === 'duties') dutyDays(sheet, b).forEach((c, i) => label.set(c, 'μέρα ' + (i + 1)));
  for (const [k, c] of Object.entries(b.cols)) if (k !== 'd1') label.set(c, defs.find(f => f.k === k)?.label.replace(/ \(.*\)$/, '') || k);
  const byRow = new Map<number, { c: number; v: WVal }[]>();
  for (const x of sets) { const l = byRow.get(x.r) || []; l.push(x); byRow.set(x.r, l); }
  const out: PlanLine[] = [];
  for (const [r, l] of [...byRow].sort((a, c) => a[0] - c[0])) {
    const row = sheet.rows[r] || [];
    const v: Record<string, CellValue> = {}; for (const k in b.cols) v[k] = row[b.cols[k]];
    if (newRows.has(r) || !rowName(v).trim() || rowName(v) === '(χωρίς όνομα)') {
      const nv: Record<string, CellValue> = {}; for (const x of l) for (const k in b.cols) if (b.cols[k] === x.c) nv[k] = typeof x.v === 'object' && x.v ? x.v.date : x.v;
      out.push({ r, who: rowName(nv), text: 'νέα εγγραφή' + (nv.from ? ' ' + fmtW({ date: String(nv.from) }) + (nv.to ? '–' + fmtW({ date: String(nv.to) }) : '') : '') });
      continue;
    }
    if (l.every(x => x.v == null)) { out.push({ r, who: rowName(v), text: 'σβήνεται (δεν υπάρχει πια στην εφαρμογή)' }); continue; }
    if (l.every(x => x.c === b.cols.aa)) continue;   // μόνο το Α/Α, επειδή μπήκε ή έφυγε κάποιος από πάνω
    out.push({ r, who: rowName(v), text: l.filter(x => x.c !== b.cols.aa).map(x => (label.get(x.c) || colLetter(x.c)) + ': ' + (row[x.c] instanceof Date ? fmtW({ date: cellText(row[x.c]) }) : cellText(row[x.c]) || '(κενό)') + ' → ' + fmtW(x.v)).join(' · ') });
  }
  return out;
}

// ------------------------------------------------------------------ πόστα, εκτός δύναμης, δυνατότητες, έλεγχος υπηρεσιών
// Φύλλα που δεν είναι καταστάσεις: κάθε ένα διαβάζεται μόνο του, με δική του προεπισκόπηση (Michael, 11/10: «μου έδειχνε
// τα νούμερα σαν να τα διάβασε από το συνολικό φύλλο»).
export interface SheetPerson { r: number; who: string; pid: number | null; cands: Person[]; v: Record<string, CellValue> }
export interface SheetPeople { rows: (SheetPerson & { pid: number })[]; unmatched: SheetPerson[]; dup: number }
// Τα άτομα ενός πίνακα: ποιος είναι ποιος στην εφαρμογή (choices: γραμμή → άτομο για όσους δεν ταίριαξαν, null = παράλειψη)
export function sheetPeople(sheet: RawSheet, b: SourceBinding, people: Person[], choices: Record<number, number | null> = {}): SheetPeople {
  const match = makeMatcher(people); const out: SheetPeople = { rows: [], unmatched: [], dup: 0 }; const seen = new Set<number>();
  for (const { r, v } of tableRows(sheet, b.header, b.cols).records) {
    // σύνολα κάτω από τον πίνακα («ΣΥΝΟΛΟ» στη στήλη του ονόματος) δεν είναι άτομα
    if (b.cols.last != null && b.cols.first != null && !isPersonRow(cellText(v.last), cellText(v.first), cellText(v.father))) continue;
    const m = match(v); const pid = m.pid ?? (r in choices ? choices[r] : null);
    const row: SheetPerson = { r, who: rowName(v), pid, cands: m.cands, v };
    if (pid == null) { if (!(r in choices)) out.unmatched.push(row); continue; }
    if (seen.has(pid)) { out.dup++; continue; }
    seen.add(pid); out.rows.push({ ...row, pid });
  }
  return out;
}
// όσοι μπορεί να είναι κάποια γραμμή που δεν ταίριαξε: δεν τους αλλάζει τίποτα «επειδή λείπουν από το φύλλο»
const maybeIn = (sp: SheetPeople) => new Set(sp.unmatched.flatMap(u => u.cands.map(p => p.id)));
const nameOf = fullName;

export type PeoplePatch = Partial<Pick<Person, 'post' | 'active' | 'notes'>>;
export interface PeopleChange { pid: number; patch: PeoplePatch; who: string; what: string }
export interface FieldsPlan { changes: PeopleChange[]; same: number; listed: number; sp: SheetPeople }
// Πόστα: όσοι είναι στο φύλλο παίρνουν το πόστο τους· όσοι έχουν πόστο στην εφαρμογή και δεν είναι στο φύλλο το χάνουν
export function planPosts(sheet: RawSheet, b: SourceBinding, s: AppState, choices: Record<number, number | null> = {}): FieldsPlan {
  const sp = sheetPeople(sheet, b, s.people, choices); const pm = new Map(s.people.map(p => [p.id, p]));
  const plan: FieldsPlan = { changes: [], same: 0, listed: 0, sp }; const has = new Set<number>();
  for (const row of sp.rows) {
    const post = norm(cellText(row.v.post)); if (!post) continue;
    const p = pm.get(row.pid)!; has.add(p.id); plan.listed++;
    if ((p.post || '') === post) plan.same++;
    else plan.changes.push({ pid: p.id, patch: { post }, who: nameOf(p), what: (p.post ? p.post + ' → ' : 'πόστο ') + post });
  }
  const maybe = maybeIn(sp);
  for (const p of s.people) if (p.post && !has.has(p.id) && !maybe.has(p.id)) plan.changes.push({ pid: p.id, patch: { post: null }, who: nameOf(p), what: 'χωρίς πόστο (δεν είναι στο φύλλο)' });
  return plan;
}
// Εκτός δύναμης: όσοι είναι στο φύλλο βγαίνουν εκτός δύναμης με τον λόγο τους· όσοι είχαν βγει έτσι και δεν είναι πια
// στο φύλλο επιστρέφουν σε δύναμη
export function planOutside(sheet: RawSheet, b: SourceBinding, s: AppState, choices: Record<number, number | null> = {}): FieldsPlan {
  const sp = sheetPeople(sheet, b, s.people, choices); const pm = new Map(s.people.map(p => [p.id, p]));
  const plan: FieldsPlan = { changes: [], same: 0, listed: 0, sp }; const has = new Set<number>();
  for (const row of sp.rows) {
    const p = pm.get(row.pid)!; has.add(p.id); plan.listed++;
    const why = cellText(row.v.remarks); const notes = OUT_NOTE + (why ? ': ' + why : '');
    if (!p.active && p.notes === notes) { plan.same++; continue; }
    plan.changes.push({ pid: p.id, patch: { active: false, notes }, who: nameOf(p), what: p.active ? 'εκτός δύναμης' + (why ? ' (' + why + ')' : '') : 'λόγος: ' + (why || '—') });
  }
  const maybe = maybeIn(sp);
  for (const p of s.people) if (!p.active && p.notes.startsWith(OUT_NOTE) && !has.has(p.id) && !maybe.has(p.id)) plan.changes.push({ pid: p.id, patch: { active: true, notes: '' }, who: nameOf(p), what: 'ξανά σε δύναμη (δεν είναι πια στο φύλλο)' });
  return plan;
}

// Δυνατότητα υπηρεσιών (δείγμα 02): ένα «-» (ή ΟΧΙ, ΔΕΝ…) στη στήλη = δεν κάνει. Κενό = κάνει: φεύγει ό,τι εμπόδιο έχει
// βάλει η εφαρμογή, ενώ τα αυτόματα (πόστο, Σ.Ι. Ι4/άοπλος) μένουν. Όσοι δεν είναι στο φύλλο δεν αλλάζουν.
export const CAP_COLS: DutyKind[] = ['th', 'op', 'mg', 'sk', 'tae'];
export const capNo = (t: string) => /^[-–—_.]+$|^ΟΧΙ|^ΔΕΝ|^0$/.test(normGreek(t).trim());
export interface CapChange { pid: number; kind: DutyKind; reason: string | null; who: string }
export interface CapsPlan { changes: CapChange[]; same: number; listed: number; sp: SheetPeople }
export function planCaps(sheet: RawSheet, b: SourceBinding, s: AppState, choices: Record<number, number | null> = {}): CapsPlan {
  const sp = sheetPeople(sheet, b, s.people, choices); const pm = new Map(s.people.map(p => [p.id, p]));
  const plan: CapsPlan = { changes: [], same: 0, listed: sp.rows.length, sp };
  const cols = CAP_COLS.filter(k => b.cols[k] != null);
  for (const row of sp.rows) {
    const p = pm.get(row.pid)!; const cur = s.caps[p.id] || {};
    const note = cellText(row.v.capnote); const reason = 'Από Excel' + (note ? ': ' + note : '');
    let ch = false;
    for (const k of cols) {
      const no = capNo(cellText(row.v[k])); const now = cur[k];
      if (no && typeof now !== 'string') { plan.changes.push({ pid: p.id, kind: k, reason, who: nameOf(p) }); ch = true; }
      else if (!no && typeof now === 'string') { plan.changes.push({ pid: p.id, kind: k, reason: null, who: nameOf(p) }); ch = true; }
    }
    if (!ch) plan.same++;
  }
  return plan;
}

// Έλεγχος υπηρεσιών (δείγμα 03): μηνιαίο πλέγμα, μία στήλη ανά μέρα με τον κωδικό της υπηρεσίας. Κωδικός θέσης
// (Θ1α, Μ2, ΛΥ) → η θέση· σκέτο γράμμα (Θ, Μ, Σ) → υπηρεσία χωρίς θέση με ημερομηνία (δεν μαντεύουμε θέση).
// Κρατιέται η εφαρμογή: περνά ό,τι λείπει από την εφαρμογή, για μέρες ως σήμερα· ό,τι διαφέρει μένει της εφαρμογής και
// γράφεται μετά στο Excel. Ξανά η ίδια ανάγνωση δεν προσθέτει τίποτα.
const MONTHS = ['ΙΑΝ', 'ΦΕΒ', 'ΜΑΡ', 'ΑΠΡ', 'ΜΑΙ', 'ΙΟΥΝ', 'ΙΟΥΛ', 'ΑΥΓ', 'ΣΕΠ', 'ΟΚΤ', 'ΝΟΕ', 'ΔΕΚ'];
// «ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ 2026» → 2026-09· χωρίς έτος: ο πιο πρόσφατος τέτοιος μήνας ως σήμερα
export function monthOf(text: string, today: ISODate): string | null {
  const t = normGreek(text).replace(/[^Α-ΩA-Z0-9]+/g, ' ');
  const i = MONTHS.findIndex(m => new RegExp('(^| )' + m + '[Α-Ω]*( |$)').test(t)); if (i < 0) return null;
  const y = /(20\d\d)/.exec(t); const cy = +today.slice(0, 4);
  const year = y ? +y[1] : i + 1 > +today.slice(5, 7) ? cy - 1 : cy;
  return year + '-' + String(i + 1).padStart(2, '0');
}
export function sheetMonth(sheet: RawSheet, header: number, today: ISODate): string | null {
  for (let r = header - 1; r >= Math.max(0, header - 4); r--) for (const v of sheet.rows[r] || []) { const m = monthOf(cellText(v), today); if (m) return m; }
  return monthOf(sheet.name, today);
}
export { dutyCode, isAbsCode } from './codes';
// Μία μέρα του ελέγχου υπηρεσιών: θέσεις και υπηρεσίες χωρίς θέση (όπως guards[d] και dutyLog[d])
export interface DutyDay { seats: Record<string, number>; seatless: SeatlessDuty[] }
// Ένα κελί του φύλλου με υπηρεσία: ποιος, θέση (αν τη λέει ο κωδικός), είδος και ό,τι γράφει το κελί
export interface DutyCell { pid: number; k?: string; kind: DutyKind; raw: string }
// add: ό,τι περνά στην εφαρμογή (θέση, ή χωρίς θέση όταν η θέση είναι ήδη άλλου: by)· differ: το Excel λέει άλλο,
// κρατιέται της εφαρμογής· gone: το είχε δει η εφαρμογή και το έσβησες εκεί (σβήνεται και από το Excel)
export interface DutyAdd { pid: number; k?: string; kind: DutyKind; label: string; by?: number }
// dup: ίδιος κωδικός θέσης σε δύο άτομα (η μέρα δεν περνά)
export interface DutyMerge { day: DutyDay; adds: DutyAdd[]; differ: { pid: number; app: string; excel: string }[]; gone: { pid: number; excel: string }[]; dup?: { raw: string; pids: number[] }[] }
const dutyLabel = (s: AppState, k: string | undefined, kind: DutyKind) => (k ? postBy(s, k)?.label || k : KIND_NAME[kind] + ' χωρίς θέση');
const dkey = (d: ISODate, pid: number) => d + '|' + pid;
// Κρατιέται η εφαρμογή (Michael, 14/10): ό,τι έχει το Excel και λείπει από την εφαρμογή μπαίνει (στη θέση του αν είναι
// ελεύθερη, αλλιώς χωρίς θέση)· όπου διαφέρουν μένει της εφαρμογής. Το ίδιο τρέχουν η προεπισκόπηση και η εντολή, ώστε
// να περνά ακριβώς ό,τι έδειξε η προεπισκόπηση. seen: «μέρα|άτομο» που είχε ήδη δει η εφαρμογή στο Excel (ανάγνωση ή εγγραφή).
export function mergeDuties(s: AppState, d: ISODate, cells: DutyCell[], seen?: Set<string>): DutyMerge {
  const g0 = s.guards[d] || {}; const log0 = s.dutyLog?.[d] || [];
  const out: DutyMerge = { day: { seats: { ...g0 }, seatless: log0.map(e => ({ pid: e.pid, kind: e.kind })) }, adds: [], differ: [], gone: [] };
  // ίδιος κωδικός θέσης σε δύο άτομα: η μέρα δεν περνά μέχρι να διορθωθεί στο Excel
  const n = new Map<string, DutyCell[]>(); for (const e of cells) if (e.k) n.set(e.k, [...(n.get(e.k) || []), e]);
  const dup = [...n.values()].filter(l => l.length > 1);
  if (dup.length) { out.dup = dup.map(l => ({ raw: l[0].raw, pids: l.map(e => e.pid) })); return out; }
  const taken = new Set(Object.keys(g0));
  for (const e of cells) {
    const seats = Object.keys(g0).filter(k => g0[k] === e.pid); const sl = log0.filter(x => x.pid === e.pid);
    if (seats.length || sl.length) {
      const same = e.k ? seats.includes(e.k) || (!seats.length && sl.some(x => x.kind === e.kind)) : seats.some(x => postBy(s, x)?.kind === e.kind) || sl.some(x => x.kind === e.kind);
      // η εφαρμογή τον έχει χωρίς θέση και το Excel λέει τη θέση (ελεύθερη): παίρνει τη θέση
      if (same && e.k && !seats.includes(e.k) && !taken.has(e.k)) {
        out.day.seats[e.k] = e.pid; taken.add(e.k);
        const i = out.day.seatless.findIndex(x => x.pid === e.pid && x.kind === e.kind); if (i >= 0) out.day.seatless.splice(i, 1);
        out.adds.push({ pid: e.pid, k: e.k, kind: e.kind, label: dutyLabel(s, e.k, e.kind) });
      } else if (!same) out.differ.push({ pid: e.pid, app: [...seats.map(k => dutyLabel(s, k, postBy(s, k)?.kind || 'other')), ...sl.map(x => dutyLabel(s, undefined, x.kind))].join(', '), excel: e.raw });
      continue;
    }
    if (seen?.has(dkey(d, e.pid))) { out.gone.push({ pid: e.pid, excel: e.raw }); continue; }
    if (e.k && !taken.has(e.k)) { out.day.seats[e.k] = e.pid; taken.add(e.k); out.adds.push({ pid: e.pid, k: e.k, kind: e.kind, label: dutyLabel(s, e.k, e.kind) }); }
    else { out.day.seatless.push({ pid: e.pid, kind: e.kind }); out.adds.push({ pid: e.pid, kind: e.kind, label: dutyLabel(s, undefined, e.kind), ...(e.k ? { by: g0[e.k] } : {}) }); }
  }
  return out;
}
// Μια μέρα στην προεπισκόπηση: extra = ό,τι έχει μόνο η εφαρμογή (γράφεται στο Excel)· locked = περασμένη (κλειδωμένη)
// μέρα· twice = άτομα με δύο υπηρεσίες τη μέρα (⚠, περνά)
export interface DutyDayPlan extends DutyMerge { date: ISODate; cells: DutyCell[]; extra: { pid: number; label: string }[]; locked: boolean; twice: number[] }
export interface DutiesPlan {
  month: string; days: DutyDayPlan[]; changes: number; same: number;
  errors: { date: ISODate; text: string }[];   // ίδια θέση σε δύο άτομα: η μέρα δεν περνά
  future: ISODate[];                            // μετά από σήμερα: δεν περνούν ποτέ
  noRow: number[];                              // άτομα με υπηρεσίες χωρίς γραμμή στο φύλλο: δεν γράφονται εκεί
  keys: string[];                               // «μέρα|άτομο» του Excel που έχει δει πια η εφαρμογή (μετά την ανάγνωση)
  warn?: string[];                              // στήλες ημερών που δεν ταιριάζουν με τον μήνα
  unknown: string[]; sp: SheetPeople;
}
// Η εντολή: ανά μέρα τα κελιά του Excel που περνούν (όχι όσα έσβησες στην εφαρμογή)
export const dutiesCmd = (p: DutiesPlan): { days: Record<ISODate, DutyCell[]> } =>
  ({ days: Object.fromEntries(p.days.filter(x => x.adds.length).map(x => [x.date, x.cells.filter(c => !x.gone.some(g => g.pid === c.pid))])) });
// synced: «μέρα|άτομο» που είχε δει η εφαρμογή στο Excel στην προηγούμενη ανάγνωση/εγγραφή
export function planDuties(sheet: RawSheet, b: SourceBinding, s: AppState, month: string, today: ISODate, choices: Record<number, number | null> = {}, synced: string[] = []): DutiesPlan {
  const sp = sheetPeople(sheet, b, s.people, choices); const pm = new Map(s.people.map(p => [p.id, p]));
  const plan: DutiesPlan = { month, days: [], changes: 0, same: 0, errors: [], future: [], noRow: [], keys: [], unknown: [], sp };
  const cols = dutyDays(sheet, b);
  const [y, m] = month.split('-').map(Number); const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate(); const nDays = Math.min(cols.length, inMonth);
  const warn: string[] = [];
  if (cols.length !== inMonth) warn.push('Βρέθηκαν ' + cols.length + ' στήλες ημερών, ενώ ο μήνας έχει ' + inMonth + ': έλεγξε τη στήλη της 1ης («Στήλες…»).');
  const rowOf = [b.header, b.header - 1, b.header + 1].find(r => r >= 0 && dayColumns(sheet.rows[r], b.cols.d1).length === cols.length) ?? b.header;
  const off = cols.map((c, i) => [c, i + 1, dayNum((sheet.rows[rowOf] || [])[c])] as const).filter(([, i, v]) => v != null && v !== i);
  if (off.length) warn.push('Οι στήλες μετρούν με τη σειρά τους: ' + off.slice(0, 3).map(([c, i, v]) => 'η ' + colLetter(c) + ' γράφει ' + v + ' αλλά είναι η ' + i + 'η μέρα').join(', ') + (off.length > 3 ? '…' : '') + '.');
  const byDay = new Map<ISODate, DutyCell[]>(); const unk = new Map<string, string>();
  for (const row of sp.rows) cols.forEach((c, i) => {
    if (i >= nDays) return;
    const raw = cellText((sheet.rows[row.r] || [])[c]); const x = readDuty(raw, s.settings);
    if (x === 'unknown') { unk.set(normGreek(raw), raw); return; }
    if (!x || x === 'abs') return;
    const d = month + '-' + String(i + 1).padStart(2, '0'); const l = byDay.get(d) || []; l.push({ pid: row.pid, ...x, raw: raw.trim() }); byDay.set(d, l);
  });
  plan.unknown = [...unk.values()];
  const who = (pid: number) => (pm.get(pid) ? nameOf(pm.get(pid)!) : '?');
  const seen = new Set(synced); const keys = new Set<string>(); const inSheet = new Set(sp.rows.map(r => r.pid)); const noRow = new Set<number>();
  const appDays = [...new Set([...Object.keys(s.guards), ...Object.keys(s.dutyLog || {})])].filter(d => d.slice(0, 7) === month && +d.slice(8) <= nDays);
  for (const d of [...new Set([...byDay.keys(), ...appDays])].sort()) {
    const cells = byDay.get(d) || [];
    // μελλοντικές μέρες και μέρες με λάθος: ό,τι είχε δει ήδη η εφαρμογή μένει «ιδωμένο», τα άλλα όχι
    const keepSeen = () => cells.forEach(c => { if (seen.has(dkey(d, c.pid))) keys.add(dkey(d, c.pid)); });
    if (d > today) { if (cells.length) plan.future.push(d); keepSeen(); continue; }
    const r = mergeDuties(s, d, cells, seen);
    if (r.dup) { plan.errors.push({ date: d, text: r.dup.map(x => x.raw + ' δύο φορές: ' + x.pids.map(who).join(', ')).join(' · ') }); keepSeen(); continue; }
    cells.forEach(c => keys.add(dkey(d, c.pid)));
    const has = new Set(cells.map(c => c.pid)); const g = s.guards[d] || {};
    const extra = [...Object.keys(g).map(k => ({ pid: g[k], label: dutyLabel(s, k, postBy(s, k)?.kind || 'other') })), ...(s.dutyLog?.[d] || []).map(e => ({ pid: e.pid, label: dutyLabel(s, undefined, e.kind) }))]
      .filter(x => !has.has(x.pid) && (inSheet.has(x.pid) || (noRow.add(x.pid), false)));
    if (!r.adds.length && !r.differ.length && !r.gone.length && !extra.length) { plan.same++; continue; }
    const pids = [...Object.values(r.day.seats), ...r.day.seatless.map(e => e.pid)];
    plan.days.push({ ...r, date: d, cells, extra, locked: d < today, twice: [...new Set(pids.filter((p, i) => pids.indexOf(p) !== i))] });
    plan.changes += r.adds.length;
  }
  plan.noRow = [...noRow]; plan.keys = [...keys]; if (warn.length) plan.warn = warn;
  return plan;
}

// ------------------------------------------------------------------ εγγραφή πίσω: πόστα, εκτός δύναμης, δυνατότητες, έλεγχος
const personField = (k: string, p: Person, b: SourceBinding): WVal => fieldValue(k, 'punish', { id: '', pid: p.id, type: 'PUN', from: '', to: '' }, p, b);
const PERSON_KEYS = ['rank', 'spec', 'last', 'first', 'name', 'father', 'asm', 'phone', 'room'];
// Τι θέλει η εφαρμογή σε έναν πίνακα με ένα άτομο ανά γραμμή: upd = κελιά στις γραμμές που υπάρχουν, add = νέες γραμμές
// (με τα στοιχεία του ατόμου), drop = γραμμές που σβήνονται. Γραμμές που δεν ξέρει δεν τις αγγίζει.
interface ListWant { upd: Map<number, Record<string, WVal>>; add: Map<number, Record<string, WVal>>; drop: Set<number> }
export interface SourcePlan extends WritePlan { notFound: string[]; warn?: string[] }
function planList(sheet: RawSheet, b: SourceBinding, s: AppState, w: ListWant, eq: (k: string, cell: CellValue, v: WVal) => boolean = (_k, cell, v) => same(cell, v)): SourcePlan {
  const plan: SourcePlan = { sets: [], insert: null, header: [], keys: [], added: 0, changed: 0, cleared: 0, foreign: 0, notFound: [] };
  const rows = sheet.rows; const scan = tableRows(sheet, b.header, b.cols); const match = makeMatcher(s.people);
  const pm = new Map(s.people.map(p => [p.id, p])); const placed = new Set<number>(); const free = [...scan.free];
  let n = 0;
  for (const { r, v } of scan.records) {
    if (b.cols.last != null && b.cols.first != null && !isPersonRow(cellText(v.last), cellText(v.first), cellText(v.father))) continue;
    n++;
    const m = match(v); let pid = m.pid;
    // Συνονόματοι: η γραμμή είναι αυτού που ανήκει σε αυτή τη λίστα (π.χ. ο μόνος με πόστο). Αν ανήκουν περισσότεροι,
    // δεν ξέρουμε ποιανού είναι: δεν αγγίζεται και κανείς τους δεν ξαναγράφεται ως νέος. Αν δεν ανήκει κανείς, σβήνεται.
    if (m.alts) {
      const mine = m.alts.filter(p => w.upd.has(p.id) && !w.drop.has(p.id) && !placed.has(p.id));
      if (mine.length === 1) pid = mine[0].id;
      else if (mine.length || !m.alts.every(p => w.drop.has(p.id))) { m.alts.forEach(p => placed.add(p.id)); (plan.ambiguous = plan.ambiguous || []).push(r); continue; }
    }
    if (pid == null || placed.has(pid)) { plan.foreign++; continue; }
    placed.add(pid);
    if (w.drop.has(pid)) {
      const row = rows[r] || [];
      for (let c = scan.width[0]; c <= scan.width[1]; c++) if (c !== b.cols.aa && cellText(row[c]) !== '') plan.sets.push({ r, c, v: null });
      free.push(r); plan.cleared++; continue;
    }
    const u = w.upd.get(pid); if (!u) continue;
    let ch = false;
    for (const [k, val] of Object.entries(u)) if (b.cols[k] != null && !eq(k, v[k], val)) { plan.sets.push({ r, c: b.cols[k], v: val }); ch = true; }
    if (ch) plan.changed++;
  }
  free.sort((a, c) => a - c);
  const fresh = [...w.add.keys()].filter(pid => !placed.has(pid) && pm.has(pid)).sort((a, c) => collator.compare(pm.get(a)!.last, pm.get(c)!.last) || collator.compare(pm.get(a)!.first, pm.get(c)!.first));
  const put = (r: number, pid: number) => {
    const p = pm.get(pid)!; const vals = w.add.get(pid)!;
    for (const [k, c] of Object.entries(b.cols)) { if (k === 'aa') continue; const val = PERSON_KEYS.includes(k) ? personField(k, p, b) : vals[k]; if (val != null) plan.sets.push({ r, c, v: val }); }
  };
  const aa = (r: number, i: number) => { if (b.cols.aa != null && cellText((rows[r] || [])[b.cols.aa]) === '') plan.sets.push({ r, c: b.cols.aa, v: i }); };
  n -= plan.cleared;
  let i = 0;
  for (; i < fresh.length && i < free.length; i++) { put(free[i], fresh[i]); aa(free[i], ++n); }
  const rest = fresh.slice(i);
  const after = Math.max(scan.end, b.header);
  if (rest.length && sideBy(sheet, b, after)) plan.warn = [noRoomTxt(b.sheet, rest.map(pid => fullName(pm.get(pid)!)))];
  else if (rest.length) {
    const tpl = scan.records.length ? scan.records[scan.records.length - 1].r : scan.free.length ? scan.free[0] : b.header;
    plan.insert = { after, n: rest.length, tpl };
    rest.forEach((pid, j) => { const r = after + 1 + j; put(r, pid); if (b.cols.aa != null) plan.sets.push({ r, c: b.cols.aa, v: ++n }); });
  }
  plan.added = fresh.length - (plan.warn ? rest.length : 0);
  return plan;
}
// Πόστα: ένα άτομο ανά πόστο· όποιος δεν έχει πια πόστο φεύγει από το φύλλο
export function planPostsWrite(sheet: RawSheet, b: SourceBinding, s: AppState): SourcePlan {
  const w: ListWant = { upd: new Map(), add: new Map(), drop: new Set() };
  for (const p of s.people) {
    if (p.post) { w.upd.set(p.id, { post: p.post }); if (p.active) w.add.set(p.id, { post: p.post }); } else w.drop.add(p.id);
  }
  return planList(sheet, b, s, w);
}
// Εκτός δύναμης: όσοι βγήκαν εκτός δύναμης με λόγο (από το φύλλο ή την εφαρμογή)· όποιος γύρισε σε δύναμη φεύγει
export function planOutsideWrite(sheet: RawSheet, b: SourceBinding, s: AppState): SourcePlan {
  const w: ListWant = { upd: new Map(), add: new Map(), drop: new Set() };
  for (const p of s.people) {
    if (!p.active && p.notes.startsWith(OUT_NOTE)) { const why = p.notes.slice(OUT_NOTE.length).replace(/^:\s*/, ''); const v = { remarks: why || null }; w.upd.set(p.id, v); w.add.set(p.id, v); }
    else if (p.active) w.drop.add(p.id);
  }
  return planList(sheet, b, s, w);
}
// Δυνατότητα υπηρεσιών: «-» όπου η εφαρμογή λέει «δεν κάνει», κενό όπου λέει ρητά «κάνει». Νέα γραμμή για όποιον
// απέκτησε εμπόδιο στην εφαρμογή. Τα αυτόματα εμπόδια (πόστο, Σ.Ι.) δεν γράφονται, όπως και στο δικό σου φύλλο.
export function planCapsWrite(sheet: RawSheet, b: SourceBinding, s: AppState): SourcePlan {
  const w: ListWant = { upd: new Map(), add: new Map(), drop: new Set() };
  const cols = CAP_COLS.filter(k => b.cols[k] != null); const active = new Set(s.people.filter(p => p.active).map(p => p.id));
  for (const [id, c] of Object.entries(s.caps)) {
    const pid = Number(id); const u: Record<string, WVal> = {}; let no = false; let why = '';
    for (const k of cols) if (k in c) { u[k] = typeof c[k] === 'string' ? '-' : null; if (typeof c[k] === 'string') { no = true; why = why || String(c[k]); } }
    if (!Object.keys(u).length) continue;
    w.upd.set(pid, u);
    if (no && active.has(pid)) w.add.set(pid, { ...u, capnote: why.replace(/^Από Excel:?\s*/, '') || null });
  }
  return planList(sheet, b, s, w, (k, cell, v) => ((CAP_COLS as string[]).includes(k) ? capNo(cellText(cell)) === (v === '-') : same(cell, v)));
}
// Έλεγχος υπηρεσιών (το δικό σου μηνιαίο αρχείο): ο κωδικός της θέσης (Θ1α, Μ2…) στο κελί της μέρας, για όσες μέρες
// έχει υπηρεσίες η εφαρμογή· για υπηρεσία χωρίς θέση το σκέτο γράμμα. Αν το φύλλο μετρά με COUNTIF(…, "Θ"), γράφεται
// το σκέτο γράμμα (αλλιώς τα σύνολά του θα έβγαιναν 0) μέχρι οι τύποι να γίνουν "Θ*". Κελί που λέει ήδη τη σωστή θέση
// (και με τον κωδικό του άλλου εντύπου) δεν ξαναγράφεται. Κωδικοί απουσίας (Κ.Α, Ε.Υ…) μένουν όπως είναι.
// Σβήνεται μόνο κελί που είχε δει η εφαρμογή (synced: «μέρα|άτομο» από την προηγούμενη ανάγνωση/εγγραφή) και δεν το έχει
// πια: υπηρεσία του Excel που δεν πέρασε ποτέ στην εφαρμογή δεν σβήνεται ποτέ. Μέρα με τον ίδιο κωδικό θέσης δύο φορές
// δεν διαβάζεται (planDuties), οπότε ούτε γράφεται. keys: ό,τι έχει δει η εφαρμογή μετά την εγγραφή.
export function planDutiesWrite(sheet: RawSheet, b: SourceBinding, s: AppState, today: ISODate, synced: string[] = []): SourcePlan {
  const plan: SourcePlan = { sets: [], insert: null, header: [], keys: [], added: 0, changed: 0, cleared: 0, foreign: 0, notFound: [] };
  const month = bindingMonth(sheet, b, today); if (!month) { plan.notFound.push('(δεν βρέθηκε ο μήνας στον τίτλο του φύλλου)'); return plan; }
  const exact = !sheet.countif?.length;
  if (!exact) plan.warn = ['Το φύλλο μετρά με COUNTIF σκέτο γράμμα (' + countifTxt(sheet.countif!) + '): γράφεται «Θ», «Μ»… αντί για τον κωδικό της θέσης. Άλλαξε στους τύπους το "Θ" σε "Θ*" (και το "Μ" σε "Μ*", το "Σ" σε "Σ*") για να γράφονται οι κωδικοί.'];
  const cols = dutyDays(sheet, b);
  const [y, m] = month.split('-').map(Number); const nDays = Math.min(cols.length, new Date(Date.UTC(y, m, 0)).getUTCDate());
  const seenBefore = new Set(synced); const dateOf = (i: number) => month + '-' + String(i + 1).padStart(2, '0');
  const seenDays = new Set(synced.map(x => x.split('|')[0]));
  type Want = { k?: string; kind: DutyKind; code: string };
  const pm = new Map(s.people.map(p => [p.id, p])); const want = new Map<number, Map<number, Want>>(); const days: number[] = [];
  const put = (pid: number, i: number, w: Want) => { const x = want.get(pid) || new Map<number, Want>(); if (!x.get(i)?.k) x.set(i, w); want.set(pid, x); };
  for (let i = 0; i < nDays; i++) {
    const d = dateOf(i); const g = s.guards[d] || {}; const log = s.dutyLog?.[d] || [];
    if (!Object.keys(g).length && !log.length && !seenDays.has(d)) continue;
    days.push(i);
    for (const e of log) put(e.pid, i, { kind: e.kind, code: bareOf(undefined, e.kind) });
    for (const [k, pid] of Object.entries(g)) {
      const post = postBy(s, k); if (!post) continue;
      put(pid, i, { k, kind: post.kind, code: exact ? codeOf(s.settings, k, post.kind) : bareOf(k, post.kind) });
    }
  }
  if (!days.length) return plan;
  // το κελί λέει ήδη αυτό που θέλει η εφαρμογή; (σκέτο γράμμα: αρκεί το είδος, εκτός αν το κελί λέει θέση που η εφαρμογή
  // έχει δώσει σε άλλον· θέση: η ίδια θέση, και σκέτο γράμμα όταν γράφουμε γράμματα)
  const ok = (cur: CellDuty, w: Want, i: number, pid: number) => cur.kind === w.kind && (w.k ? cur.k === w.k || (!exact && !cur.k) : !cur.k || (s.guards[dateOf(i)] || {})[cur.k] == null || (s.guards[dateOf(i)] || {})[cur.k] === pid);
  const match = makeMatcher(s.people); const seen = new Set<number>();
  const recs = tableRows(sheet, b.header, b.cols).records.filter(({ v }) => b.cols.last == null || b.cols.first == null || isPersonRow(cellText(v.last), cellText(v.first), cellText(v.father)))
    .map(x => ({ ...x, m: match(x.v) }));
  const twice = (i: number) => { const k = new Set<string>(); return recs.some(({ r }) => { const x = readDuty(cellText((sheet.rows[r] || [])[cols[i]]), s.settings); if (!x || typeof x !== 'object' || !x.k) return false; if (k.has(x.k)) return true; k.add(x.k); return false; }); };
  const bad = days.filter(twice);
  if (bad.length) {
    const ds = bad.map(i => dm(dateOf(i)));
    plan.warn = [...(plan.warn || []), (ds.length === 1 ? 'Στις ' + ds[0] : 'Στις ' + ds.join(', ')) + ' το Excel έχει τον ίδιο κωδικό θέσης δύο φορές: δεν γράφεται τίποτα εκεί μέχρι να το διορθώσεις στο Excel και να ξαναδιαβαστεί.'];
    for (const i of bad) for (const x of synced) if (x.startsWith(dateOf(i) + '|')) plan.keys.push(x);
    days.splice(0, days.length, ...days.filter(i => !bad.includes(i)));
  }
  // συνονόματοι με δική του γραμμή ο καθένας: δεν ξέρουμε ποια είναι ποιανού, δεν γράφονται (μία μόνο γραμμή πάει στον ενεργό)
  const group = (m: { alts?: Person[] }) => (m.alts ? m.alts.map(p => p.id).sort((a, c) => a - c).join(',') : '');
  const nGroup = new Map<string, number>(); for (const { m } of recs) if (m.alts) nGroup.set(group(m), (nGroup.get(group(m)) || 0) + 1);
  let unseen = 0;
  for (const { r, m } of recs) {
    if (m.alts && (m.pid == null || nGroup.get(group(m))! > 1)) { m.alts.forEach(p => seen.add(p.id)); (plan.ambiguous = plan.ambiguous || []).push(r); continue; }
    const pid = m.pid; if (pid == null || seen.has(pid)) { plan.foreign++; continue; }
    seen.add(pid);
    const x = want.get(pid); let ch = false;
    for (const i of days) {
      const raw = cellText((sheet.rows[r] || [])[cols[i]]); const cur = readDuty(raw, s.settings); const wnt = x?.get(i);
      const duty = cur && typeof cur === 'object' ? cur : null; const key = dateOf(i) + '|' + pid;
      if (wnt) { plan.keys.push(key); if (!duty || !ok(duty, wnt, i, pid)) { plan.sets.push({ r, c: cols[i], v: wnt.code }); ch = true; } }
      else if (duty && seenBefore.has(key)) { plan.sets.push({ r, c: cols[i], v: null }); ch = true; }   // την είχε η εφαρμογή και τη σβήσες εκεί
      else if (duty && dateOf(i) <= today) unseen++;
    }
    if (ch) plan.changed++;
  }
  if (unseen) plan.warn = [...(plan.warn || []), (unseen === 1 ? '1 υπηρεσία' : unseen + ' υπηρεσίες') + ' του Excel δεν είναι ακόμα στην εφαρμογή και δεν σβήνονται· πάτα «Ανανέωση από Excel» για να περάσουν.'];
  for (const pid of want.keys()) if (!seen.has(pid) && pm.has(pid)) plan.notFound.push(nameOf(pm.get(pid)!));
  return plan;
}
// ------------------------------------------------------------------ νέος έλεγχος υπηρεσιών (όπως το δείγμα 03)
// Ένα φύλλο ανά μήνα: τίτλος «ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΟΚΤΩΒΡΙΟΥ 2026», μία γραμμή ανά ενεργό (ανά θάλαμο και αλφαβητικά),
// μετρητές ανά είδος και μία στήλη ανά μέρα. Οι μετρητές μετράνε με «Θ*», «Μ*»… ώστε να μετράνε και τους κωδικούς
// θέσεων (Θ1α, Μ2)· οι ΣΚ και οι αργίες βγαίνουν από το ημερολόγιο της εφαρμογής (γκρι, και στη στήλη ΑΡΓΙΑ).
export const DUTY_HEAD = ['Α/Α', 'ΒΘΜ', 'Ο-Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΘΑΛΑΜΟΣ', 'ΑΡΓΙΑ', 'ΚΑΘΗΜΕΡΙΝΗ', 'ΣΥΝΟΛΟ', 'ΣΚΟΠΙΑ', 'ΜΑΓΕΙΡΕΙΑ', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ', 'ΟΠΛΟΦΥΛΑΚΑΣ', 'Λ/Υ-Δ/Υ'];
const DUTY_COUNT: [number, string[]][] = [[9, ['Σ*']], [10, ['Μ*']], [11, ['Θ*']], [12, ['ΟΠ*']], [13, ['ΛΥ*', 'ΔΥ*']]];
const ANY_DUTY = ['Θ*', 'Μ*', 'Σ*', 'ΟΠ*', 'ΛΥ*', 'ΔΥ*', 'Τ*', 'Υ*'];
const monthUp = (ym: string) => norm(MONTH_NAMES[Number(ym.slice(5, 7)) - 1]);
export const dutiesTitle = (ym: string) => 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + monthUp(ym).replace(/ΟΣ$/, 'ΟΥ') + ' ' + ym.slice(0, 4);
export const dutiesSheet = (ym: string) => monthUp(ym) + ' ' + ym.slice(0, 4);
export const dutiesBinding = (file: string, ym: string, sheet = dutiesSheet(ym)): SourceBinding =>
  ({ file, sheet, header: 1, cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4, room: 5, d1: DUTY_HEAD.length }, write: true, scope: 'all', month: ym });
export interface NewCell { r: number; c: number; v?: WVal; f?: string; st: 'title' | 'head' | 'data' | 'code'; gray?: boolean }
export function planDutiesNew(b: SourceBinding, s: AppState, today: ISODate): { cells: NewCell[]; merges: Span[]; widths: Record<number, number>; rows: number; filled: number; keys: string[] } {
  const ym = b.month!; const [y, m] = ym.split('-').map(Number); const nd = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d1 = b.cols.d1; const days = Array.from({ length: nd }, (_, i) => ym + '-' + String(i + 1).padStart(2, '0') as ISODate);
  const hol = days.map(d => isHol(s.settings, d));
  const people = s.people.filter(p => p.active).sort(byRoom);
  const cells: NewCell[] = []; const last = d1 + nd - 1; const L = colLetter;
  cells.push({ r: 0, c: 0, v: dutiesTitle(ym), st: 'title' });
  DUTY_HEAD.forEach((h, c) => cells.push({ r: 1, c, v: h, st: 'head' }));
  days.forEach((_, i) => cells.push({ r: 1, c: d1 + i, v: i + 1, st: 'head', gray: hol[i] }));
  const any = (rng: string) => 'SUM(COUNTIF(' + rng + ',{' + ANY_DUTY.map(x => '"' + x + '"').join(',') + '}))';
  // συνεχόμενες μέρες ΣΚ/αργιών: μία περιοχή η καθεμία
  const runs: [number, number][] = []; hol.forEach((h, i) => { if (!h) return; const l = runs[runs.length - 1]; if (l && l[1] === i - 1) l[1] = i; else runs.push([i, i]); });
  const raw: CellValue[][] = [[dutiesTitle(ym)], [...DUTY_HEAD, ...days.map((_, i) => i + 1)]];
  people.forEach((p, i) => {
    const r = 2 + i, R = r + 1; const row = L(d1) + R + ':' + L(last) + R;
    const vals: WVal[] = [i + 1, p.rank || null, p.spec || null, p.last, p.first, p.room ?? null];
    vals.forEach((v, c) => cells.push({ r, c, v, st: 'data' }));
    raw.push(vals.map(v => (v != null && typeof v === 'object' ? null : v)));
    cells.push({ r, c: 6, f: runs.length ? runs.map(([a, z]) => any(L(d1 + a) + R + ':' + L(d1 + z) + R)).join('+') : '0', st: 'data' });
    cells.push({ r, c: 7, f: L(8) + R + '-' + L(6) + R, st: 'data' });
    cells.push({ r, c: 8, f: any(row), st: 'data' });
    for (const [c, codes] of DUTY_COUNT) cells.push({ r, c, f: codes.map(x => 'COUNTIF(' + row + ',"' + x + '")').join('+'), st: 'data' });
    days.forEach((_, j) => cells.push({ r, c: d1 + j, st: 'code', gray: hol[j] }));
  });
  // ΣΥΝΟΛΑ: ανά στήλη μετρητή και ανά μέρα (όπως στο δείγμα, στη στήλη του ονόματος)
  const tr = 2 + people.length, TR = tr + 1;
  if (people.length) {
    cells.push({ r: tr, c: 4, v: 'ΣΥΝΟΛΑ', st: 'head' });
    for (let c = 6; c < DUTY_HEAD.length; c++) cells.push({ r: tr, c, f: 'SUM(' + L(c) + '3:' + L(c) + (TR - 1) + ')', st: 'head' });
    days.forEach((_, j) => cells.push({ r: tr, c: d1 + j, f: any(L(d1 + j) + '3:' + L(d1 + j) + (TR - 1)), st: 'head', gray: hol[j] }));
  }
  // οι υπηρεσίες που έχει ήδη η εφαρμογή για τον μήνα, όπως τις γράφει και στο δικό σου αρχείο
  const plan = planDutiesWrite({ name: b.sheet, rows: raw }, b, s, today);
  const at = new Map(cells.map(x => [x.r + ':' + x.c, x]));
  for (const x of plan.sets) { const c = at.get(x.r + ':' + x.c); if (c) c.v = x.v; }
  const widths: Record<number, number> = { 1: 5, 2: 7, 3: 7, 4: 18, 5: 14, 6: 6 };
  for (let c = 6; c < DUTY_HEAD.length; c++) widths[c + 1] = 8;
  for (let j = 0; j < nd; j++) widths[d1 + j + 1] = 4.5;
  return { cells, merges: [{ r: 0, c1: 0, c2: last }], widths, rows: people.length, filled: plan.changed, keys: plan.keys };
}
const countifTxt = (refs: string[]) => refs.slice(0, 3).join(', ') + (refs.length > 3 ? ' κ.ά.' : '');

// Στοιχεία ατόμου (βαθμός, θάλαμος, τηλέφωνο…) που άλλαξαν στην εφαρμογή από την τελευταία ανάγνωση/εγγραφή αυτού του
// πίνακα: γράφονται και εδώ, στη γραμμή του ίδιου ατόμου, ώστε όλα τα φύλλα να λένε το ίδιο.
const LINKED = ['rank', 'spec', 'last', 'first', 'father', 'asm', 'phone', 'room'];
export function personSets(sheet: RawSheet, b: SourceBinding, s: AppState, psnap: Record<number, PersonSnap>, taken: Set<string> = new Set()): { sets: { r: number; c: number; v: WVal }[]; changed: number } {
  const out = { sets: [] as { r: number; c: number; v: WVal }[], changed: 0 };
  const fields = LINKED.filter(k => b.cols[k] != null); const name = b.cols.name != null;
  if (!fields.length && !name) return out;
  const moved = s.people.filter(p => { const o = psnap[p.id]; if (!o) return false; const c = personVals(p); return LINKED.some(k => (c[k] || '') !== (o[k] || '')); });
  if (!moved.length) return out;
  // ταίριασμα με τα παλιά στοιχεία (αν άλλαξε το επώνυμο, το φύλλο έχει ακόμα το παλιό)
  const old = s.people.map(p => (psnap[p.id] ? { ...p, last: psnap[p.id].last, first: psnap[p.id].first, father: psnap[p.id].father, asm: psnap[p.id].asm } : p));
  const matchOld = makeMatcher(old), matchNew = makeMatcher(s.people); const ids = new Set(moved.map(p => p.id));
  for (const { r, v } of tableRows(sheet, b.header, b.cols).records) {
    const mo = matchOld(v), mn = matchNew(v); if (mo.alts || (mo.pid == null && mn.alts)) continue;   // συνονόματοι: όχι στη γραμμή του άλλου
    const pid = mo.pid ?? mn.pid; if (pid == null || !ids.has(pid)) continue;
    const p = s.people.find(x => x.id === pid)!; const o = psnap[pid]; const c = personVals(p); let ch = false;
    for (const k of fields) {
      if ((c[k] || '') === (o[k] || '') || taken.has(r + ':' + b.cols[k])) continue;
      const val: WVal = c[k] === '' ? null : k === 'room' ? Number(c.room) : k === 'asm' || k === 'phone' ? num(c[k]) : c[k];
      if (!same(v[k], val)) { out.sets.push({ r, c: b.cols[k], v: val }); ch = true; }
    }
    if (name && ((c.last !== o.last) || (c.first !== o.first)) && !same(v.name, nameCell(p, b))) { out.sets.push({ r, c: b.cols.name, v: nameCell(p, b) }); ch = true; }
    if (ch) out.changed++;
  }
  return out;
}

// Ένα σχέδιο εγγραφής για κάθε είδος (το χρησιμοποιούν η προεπισκόπηση, η εγγραφή και η δοκιμή στον browser)
export interface SyncMeta { keys?: string[]; snap?: Record<number, PersonSnap>; psnap?: Record<number, PersonSnap> }
export interface FullPlan extends SourcePlan { snap?: Record<number, PersonSnap>; psnap: Record<number, PersonSnap>; grow?: PeoplePlan['grow'];
  inserts?: RowInsert[]; deletes?: number[]; fresh?: number[]; gone?: PersonSnap[];   // μόνο το προσωπικό (planPeopleWrite)
  extra?: Extra[]; merges?: Span[] }   // νέο Δυναμολόγιο: τα σύνολα θαλάμων κάτω από τον πίνακα
export function planSource(kind: ListKind, sheet: RawSheet | null, b: SourceBinding, s: AppState, meta: SyncMeta | undefined, today: ISODate): FullPlan {
  const psnap = snapPeople(s.people); const sh = sheet || { name: b.sheet, rows: [] };
  if (kind === 'people' && !(sh.rows[b.header] || []).some(v => cellText(v))) return { ...planPeopleNew(b, s), psnap };
  if (kind === 'people') {
    const p = planPeopleWrite(sh, b, s, meta?.snap || snapFromSheet(sh, b, s.people), meta?.keys);
    return { sets: p.sets, insert: null, inserts: p.inserts, deletes: p.deletes, fresh: p.fresh, gone: p.gone, header: [], keys: p.keys, added: p.added, changed: p.changed, cleared: p.cleared, foreign: 0, notFound: p.notFound, snap: p.snap, psnap, grow: p.grow, ...(p.warn ? { warn: p.warn } : {}) };
  }
  const plan: SourcePlan = isStatusKind(kind) ? { ...planWrite(kind, sheet, b, s, meta?.keys || [], today), notFound: [] }
    : kind === 'posts' ? planPostsWrite(sh, b, s) : kind === 'outside' ? planOutsideWrite(sh, b, s) : kind === 'caps' ? planCapsWrite(sh, b, s) : planDutiesWrite(sh, b, s, today, meta?.keys);
  if (!isStatusKind(kind) && canCreate(kind)) plan.header = newHeader(kind, sh.rows, b);
  if (meta?.psnap && sheet) {
    const ps = personSets(sheet, b, s, meta.psnap, new Set(plan.sets.map(x => x.r + ':' + x.c)));
    plan.sets.push(...ps.sets); plan.changed += ps.changed;
  }
  return { ...plan, psnap };
}

// Ποια είδη αφορά μια αλλαγή στα άτομα (P2): μόνο όσα έχουν στήλη για κάποιο πεδίο που άλλαξε (και τα πεδία που
// διαβάζει το ίδιο το είδος: πόστο, εκτός δύναμης, Σ.Ι., ρόλος…). Νέο ή σβησμένο άτομο αφορά όλα.
const KIND_PERSON: Partial<Record<ListKind, string[]>> = {
  people: ['rank', 'spec', 'last', 'first', 'father', 'asm', 'phone', 'room', 'si', 'role', 'dn', 'added', 'active'],
  posts: ['post', 'active'], outside: ['active', 'notes'], caps: ['active']
};
export function kindsForPeople(prev: Person[], next: Person[], sources: Partial<Record<ListKind, SourceBinding>>): Set<ListKind> {
  const all = new Set((Object.keys(sources) as ListKind[]).filter(k => sources[k]));
  const was = new Map(prev.map(p => [p.id, p]));
  if (prev.length !== next.length || next.some(p => !was.has(p.id))) return all;
  const changed = new Set<string>();
  for (const p of next) {
    const o = was.get(p.id)!; if (o === p) continue;
    for (const k of new Set([...Object.keys(o), ...Object.keys(p)])) if (JSON.stringify((o as unknown as Record<string, unknown>)[k]) !== JSON.stringify((p as unknown as Record<string, unknown>)[k])) changed.add(k);
  }
  const out = new Set<ListKind>();
  for (const k of all) {
    const cols = new Set(Object.keys(sources[k]!.cols).filter(c => LINKED.includes(c)));
    // ονοματεπώνυμο σε ένα κελί ή όνομα χωρίς πατρώνυμο: «του <πατρώνυμο>» στους συνονόματους
    if (sources[k]!.cols.name != null) ['last', 'first', 'father'].forEach(c => cols.add(c));
    if (sources[k]!.cols.first != null) cols.add('father');
    if ([...cols, ...(KIND_PERSON[k] || [])].some(c => changed.has(c))) out.add(k);
  }
  return out;
}
