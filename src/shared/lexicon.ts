// The Lexicon: every concept of the app (rank, status, service, post, person field, ΗΚΑΙ column and row, form label...) with
// all the names units use for it: built-in synonyms + learned names (stored later in settings) + names the user added.
// Matching survives accents, case, dots, spaces, hyphens, final sigma, singular/plural, abbreviations (ΛΧΙΑΣ = ΛΟΧΙΑΣ),
// Latin look-alike letters inside Greek words and small typos. Every match says how sure it is:
//   sure     the text IS the concept (exact name, inflected form, or a one-letter slip in a long name)
//   suggest  probably, but the user should confirm (compound header, extra words, typo, weak synonym)
//   unknown  no idea. The rule of the engine: prefer unknown to a wrong sure.
import { hkColsOf, listOf, type UserLists } from './ranks';
import { HK_COLS, HK_RANKS, PERSON_FIELDS } from './sources';

export type ConceptKind = 'rank' | 'origin' | 'status' | 'service' | 'post' | 'person' | 'weapon' | 'hkcol' | 'hkrow' | 'label' | 'total' | 'group';
export type Confidence = 'sure' | 'suggest' | 'unknown';
export interface Concept { id: string; kind: ConceptKind; label: string; names: string[]; weak?: string[]; own?: boolean }
export interface Match {
  text: string;
  concept: string | null;
  confidence: Confidence;
  why: string;
  alts?: string[];           // other concepts the same text could be (other kinds, or ambiguous)
  parts?: Match[];           // compound header: what each part is
  compound?: boolean;
  origin?: string;           // ΕΠΟΠ, ΟΒΑ, ΕΜΘ... when the text is «origin + rank»
}
export interface MatchOpts { kinds?: ConceptKind[]; parent?: string }
export interface LexiconOpts {
  lists?: UserLists;                          // own ranks, leave kinds, cadre statuses (settings.lists)
  services?: string[]; posts?: string[];      // own services and posts
  learned?: Record<string, string[]>;         // conceptId -> names learned from files
  user?: Record<string, string[]>;            // conceptId -> names the user added
}

// ------------------------------------------------------------------ normalisation
// «Σιτιστές-Γραφείς» → «ΣΙΤΙΣΤΕΣ ΓΡΑΦΕΙΣ»: upper case, no accents, final sigma, Latin look-alikes → Greek, dots and hyphens → spaces
const LOOK: Record<string, string> = { A: 'Α', B: 'Β', E: 'Ε', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ', N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', X: 'Χ', Y: 'Υ', Z: 'Ζ' };
export function normText(s: unknown): string {
  let t = String(s ?? '').normalize('NFD').replace(/[̀-ͯ΄΅΄ʹ'’`´]/g, '').toUpperCase().replace(/[A-Z]/g, c => LOOK[c] || c);
  t = t.replace(/[ \t\r\n]+/g, ' ').replace(/\.(?=\p{L})/gu, '').replace(/(\p{L})\.(?=\s|$|[/\-,;)])/gu, '$1');   // Ε.Π.Ο.Π. → ΕΠΟΠ
  // «Ο/Σ», «Ο-Σ», «Α/Α»: single letters joined by a slash or hyphen are one abbreviation
  for (let i = 0; i < 3; i++) t = t.replace(/(^|[\s(])(\p{L})\s*[/\-]\s*(\p{L})(?=$|[\s/\-,;)])/gu, '$1$2$3');
  return t.replace(/[.:;_*"«»]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// the same, with / - , & + as spaces: the comparison key of a phrase
export const phraseKey = (s: unknown): string => normText(s).replace(/[/\-,&+()]+/g, ' ').replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------ inflection
// All forms a word can take for the number and gender endings of Greek nouns/adjectives (the written name is always one of them).
const ENDS: [string, string[]][] = [
  ['ΕΑΣ', ['ΕΑΣ', 'ΕΙΣ']], ['ΕΙΣ', ['ΕΙΣ', 'ΕΑΣ']],
  ['ΙΑΣ', ['ΙΑΣ', 'ΙΕΣ']], ['ΑΣ', ['ΑΣ', 'ΕΣ']], ['ΗΣ', ['ΗΣ', 'ΕΣ']], ['ΟΣ', ['ΟΣ', 'ΟΙ', 'Η', 'ΕΣ', 'Ο', 'Α']], ['ΟΙ', ['ΟΙ', 'ΟΣ', 'Η', 'ΕΣ', 'Ο', 'Α']],
  ['ΕΙΑ', ['ΕΙΑ', 'ΕΙΟ']], ['ΕΙΟ', ['ΕΙΟ', 'ΕΙΑ']], ['ΙΑ', ['ΙΑ', 'ΙΕΣ']], ['ΙΕΣ', ['ΙΕΣ', 'ΙΑ', 'ΙΑΣ']],
  ['ΕΣ', ['ΕΣ', 'ΑΣ', 'ΗΣ', 'Η', 'Α']], ['Η', ['Η', 'ΕΣ', 'ΟΣ', 'Ο']], ['Α', ['Α', 'ΕΣ', 'Ο']], ['Ο', ['Ο', 'Α', 'ΟΣ', 'Η']], ['Ι', ['Ι', 'ΙΑ']]
];
const wordForms = (w: string): string[] => {
  if (w.length < 4 || /\d/.test(w)) return [w];
  const out = new Set<string>([w]);
  for (const [e, subs] of ENDS) if (w.endsWith(e) && w.length - e.length >= 2) { const stem = w.slice(0, -e.length); for (const s of subs) out.add(stem + s); break; }
  // participles (ΤΟΠΟΘΕΤΗΜΕΝΟΙ ...) also in the genitive plural
  if (/ΜΕΝ(ΟΙ|ΟΣ|Η|ΕΣ|Α|Ο|ΩΝ)$/.test(w)) { const stem = w.replace(/(ΟΙ|ΟΣ|Η|ΕΣ|Α|Ο|ΩΝ)$/, ''); for (const s of ['ΟΙ', 'ΟΣ', 'Η', 'ΕΣ', 'Α', 'Ο', 'ΩΝ']) out.add(stem + s); }
  return [...out];
};
export function phraseForms(key: string): string[] {
  const words = key.split(' '); const sets = words.map(wordForms);
  let out: string[][] = [[]];
  for (const s of sets) { const next: string[][] = []; for (const o of out) for (const f of s) next.push([...o, f]); out = next; if (out.length > 48) out = out.slice(0, 48); }
  return out.map(x => x.join(' '));
}

// ------------------------------------------------------------------ edit distance (Damerau, bounded)
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length, m = b.length; let p2: number[] = [], p1 = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= m; j++) {
      let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      cur.push(v); if (v < best) best = v;
    }
    if (best > max) return max + 1;
    p2 = p1; p1 = cur;
  }
  return p1[m];
}

// ------------------------------------------------------------------ built-in concepts
const C = (kind: ConceptKind, key: string, label: string, names: string[], weak: string[] = []): Concept => ({ id: kind + ':' + key, kind, label, names: [label, ...names], weak });

// Ranks (key = full name). Abbreviations as written in real units.
const RANKS: Concept[] = [
  C('rank', 'ΣΥΝΤΑΓΜΑΤΑΡΧΗΣ', 'Συνταγματάρχης', ['ΣΧΗΣ', 'ΣΥΝΤΧΗΣ', 'ΣΥΝΤΑΓΜΑΤΑΡΧΗΣ']),
  C('rank', 'ΑΝΤΙΣΥΝΤΑΓΜΑΤΑΡΧΗΣ', 'Αντισυνταγματάρχης', ['ΑΝΧΗΣ', 'ΑΝΤΙΣΥΝΤΧΗΣ', 'ΑΣΧΗΣ']),
  C('rank', 'ΤΑΓΜΑΤΑΡΧΗΣ', 'Ταγματάρχης', ['ΤΧΗΣ', 'ΤΑΓΜΧΗΣ', 'ΤΑΓΜΑΤΑΡΧΗΣ', 'Επίλαρχος', 'ΕΠΛΧΟΣ', 'ΕΠΧΟΣ', 'ΕΠΙΛΑΡΧΟΣ']),
  C('rank', 'ΛΟΧΑΓΟΣ', 'Λοχαγός', ['ΛΓΟΣ', 'ΛΧΓΟΣ', 'Ίλαρχος', 'ΙΛΧΟΣ', 'ΙΛΑΡΧΟΣ']),
  C('rank', 'ΥΠΟΛΟΧΑΓΟΣ', 'Υπολοχαγός', ['ΥΠΛΓΟΣ', 'ΥΠΛΧΓΟΣ', 'Υπίλαρχος', 'ΥΠΛΧΟΣ', 'ΥΠΙΛΑΡΧΟΣ']),
  C('rank', 'ΑΝΘΥΠΟΛΟΧΑΓΟΣ', 'Ανθυπολοχαγός', ['ΑΝΘΛΓΟΣ', 'ΑΝΘΥΠΛΓΟΣ', 'ΑΝΘΥΠΙΛΑΡΧΟΣ', 'ΑΝΘΛΧΟΣ', 'ΑΝΘΥΠΛΧΟΣ', 'Ανθυπίλαρχος']),
  C('rank', 'ΑΝΘΥΠΑΣΠΙΣΤΗΣ', 'Ανθυπασπιστής', ['ΑΝΘΣΤΗΣ', 'ΑΝΘΥΠΑΣΠ', 'ΑΝΘΥΠΑΣΠΙΣΤΗΣ']),
  C('rank', 'ΔΕΑ', 'ΔΕΑ', ['Δόκιμος Έφεδρος Αξιωματικός', 'Δ.Ε.Α']),
  C('rank', 'ΑΡΧΙΛΟΧΙΑΣ', 'Αρχιλοχίας', ['ΑΛΧΙΑΣ', 'ΑΡΧΛΧΙΑΣ', 'ΑΡΧΙΛΧΙΑΣ']),
  C('rank', 'ΕΠΙΛΟΧΙΑΣ', 'Επιλοχίας', ['ΕΠΧΙΑΣ', 'ΕΠΛΧΙΑΣ', 'ΕΠΙΛΧΙΑΣ']),
  C('rank', 'ΛΟΧΙΑΣ', 'Λοχίας', ['ΛΧΙΑΣ', 'ΛΟΧΙΑΣ']),
  C('rank', 'ΔΕΚΑΝΕΑΣ', 'Δεκανέας', ['ΔΝΕΑΣ', 'ΔΕΚΑΝΕΑΣ', 'ΔΕΚ']),
  C('rank', 'ΥΠΟΔΕΚΑΝΕΑΣ', 'Υποδεκανέας', ['ΥΔΝΕΑΣ', 'ΥΠΟΔΝΕΑΣ', 'ΥΠΟΔΕΚ']),
  C('rank', 'ΣΤΡΑΤΙΩΤΗΣ', 'Στρατιώτης', ['ΣΤΡΤΗΣ', 'ΣΤΡ', 'ΣΤΡΑΤ', 'ΣΤΡΑΤΙΩΤΗΣ', 'Οπλίτης', 'ΣΤΡΤΗΣ'])
];
// Where the origin/status of service is written before the rank: «ΕΠΟΠ ΔΝΕΑΣ», «ΕΜΘ ΑΝΘΣΤΗΣ»
const ORIGINS: Concept[] = [
  C('origin', 'ΕΠΟΠ', 'ΕΠΟΠ', ['ΕΠ ΟΠ', 'ΕΠΟΠ']), C('origin', 'ΟΒΑ', 'ΟΒΑ', []), C('origin', 'ΕΜΘ', 'ΕΜΘ', []),
  C('origin', 'ΕΦ', 'ΕΦ', ['Έφεδρος', 'ΕΦΕΔΡΟΣ']), C('origin', 'ΣΜΥ', 'ΣΜΥ', []), C('origin', 'ΣΣΕ', 'ΣΣΕ', []), C('origin', 'ΜΟΝΙΜΟΣ', 'Μόνιμος', ['ΜΟΝ', 'Μ'])
];
// Rows of the ΗΚΑΙ / ΗΚΑΛ (keys = HK_RANKS): which ranks count in each row, plus the names of the ΗΚΑΛ
const HKROW_NAMES: Record<string, { names: string[]; weak?: string[]; ranks?: string[] }> = {
  'Επίλαρχοι': { names: ['Επίλαρχοι', 'Ταγματάρχες', 'ΤΧΕΣ'], ranks: ['ΤΑΓΜΑΤΑΡΧΗΣ'] },
  'Ίλαρχοι': { names: ['Ίλαρχοι', 'Λοχαγοί'], ranks: ['ΛΟΧΑΓΟΣ'] },
  'Ανθυπίλαρχοι-Ανθλγοι': { names: ['Ανθυπίλαρχοι-Ανθλγοι', 'Υπολοχαγοί-Ανθυπολοχαγοί', 'Ανθυπολοχαγοί', 'Ανθυπίλαρχοι'], weak: ['Υπολοχαγοί', 'Υπίλαρχοι'], ranks: ['ΑΝΘΥΠΟΛΟΧΑΓΟΣ'] },
  'Ανθυπασπιστές': { names: ['Ανθυπασπιστές', 'ΑΝΘΣΤΕΣ'], ranks: ['ΑΝΘΥΠΑΣΠΙΣΤΗΣ'] },
  'ΔΕΑ': { names: ['ΔΕΑ'], ranks: ['ΔΕΑ'] },
  'Αρχιλοχίες': { names: ['Αρχιλοχίες', 'Αλχίες'], ranks: ['ΑΡΧΙΛΟΧΙΑΣ'] },
  'Επιλοχίες': { names: ['Επιλοχίες', 'Επχίες'], ranks: ['ΕΠΙΛΟΧΙΑΣ'] },
  'Λοχίες': { names: ['Λοχίες', 'Λχίες'], ranks: ['ΛΟΧΙΑΣ'] },
  'Δεκανείς': { names: ['Δεκανείς', 'Δνείς', 'Δεκανέας'], ranks: ['ΔΕΚΑΝΕΑΣ'] },
  'ΕΠΟΠ Στρατιώτης': { names: ['ΕΠΟΠ Στρατιώτης', 'Εποπ Στρ', 'ΕΠΟΠ Στρατιώτες', 'ΕΠΟΠ Στρτης'] },
  'ΟΒΑ Στρατιώτης': { names: ['ΟΒΑ Στρατιώτης', 'ΟΒΑ Στρατιώτες', 'ΟΒΑ Στρ', 'ΟΒΑ Στρτης'] },
  'Στρατιώτες': { names: ['Στρατιώτες', 'Στρτες', 'Οπλίτες'], ranks: ['ΣΤΡΑΤΙΩΤΗΣ'] }
};
const HKROWS: Concept[] = HK_RANKS.map(k => {
  const d = HKROW_NAMES[k] || { names: [] };
  const ranks = (d.ranks || []).flatMap(r => { const c = RANKS.find(x => x.id === 'rank:' + r); return c ? c.names : []; });
  return { id: 'hkrow:' + k, kind: 'hkrow' as const, label: k, names: [k, ...d.names, ...ranks], weak: d.weak || [] };
});
// The ΗΚΑΙ row (key of HK_RANKS) that counts a rank concept («rank:ΛΟΧΑΓΟΣ» → «Ίλαρχοι»), or null
export const hkRowOfRankId = (rankId: string): string | null => HKROWS.find(c => HKROW_NAMES[c.label]?.ranks?.includes(rankId.slice(5)))?.label ?? null;
// Totals and groups of the ΗΚΑΙ rows/columns
const TOTALS: Concept[] = [
  C('total', 'sum', 'Σύνολο', ['ΑΘΡΟΙΣΗ', 'ΑΘΡΟΙΣΜΑ', 'ΣΥΝ', 'ΣΥΝΟΛΙΚΑ', 'TOTAL']),
  C('total', 'officers', 'Σύνολο αξιωματικών', ['ΣΥΝΟΛΟ ΑΞΚΩΝ', 'ΣΥΝΟΛΟ ΑΞΙΩΜΑΤΙΚΩΝ', 'ΑΘΡΟΙΣΗ ΑΞΚΩΝ']),
  C('total', 'nco', 'Σύνολο υπαξιωματικών', ['ΣΥΝΟΛΟ ΥΠΑΞΚΩΝ', 'ΣΥΝΟΛΟ ΥΠΑΞΙΩΜΑΤΙΚΩΝ']),
  C('total', 'soldiers', 'Σύνολο οπλιτών', ['ΣΥΝΟΛΟ ΣΤΡΑΤΙΩΤΩΝ', 'ΑΘΡΟΙΣΗ ΟΠΛΙΤΩΝ']),
  C('total', 'grand', 'Γενικό σύνολο', ['ΓΕΝΙΚΟ ΑΘΡΟΙΣΜΑ', 'ΓΕΝ ΣΥΝΟΛΟ', 'ΣΥΝΟΛΟ ΓΕΝΙΚΟ'])
];
const GROUPS: Concept[] = [
  C('group', 'force', 'Δύναμη', ['ΔΥΝΑΜΗ']), C('group', 'kol', 'Κωλυόμενοι', ['ΚΩΛΥΟΜΕΝΟΙ', 'ΚΩΛΥΟΜΕΝΩΝ']), C('group', 'abs', 'Απόντες', ['ΑΠΟΝΤΕΣ', 'ΑΠΟΝΤΩΝ']),
  C('group', 'detached', 'Αποσπασμένοι', ['ΑΠΕΣΠΑΣΜΕΝΟΙ', 'ΑΠΟΣΠΑΣΜΕΝΟΙ', 'ΑΠΟΣΠΑΣΗ']), C('group', 'officers', 'Αξιωματικοί', ['ΑΞΚΟΙ', 'ΑΞΙΩΜΑΤΙΚΟΙ', 'ΑΞΚΟΣ']),
  C('group', 'nco', 'Υπαξιωματικοί', ['ΥΠΑΞΚΟΙ', 'ΥΠΑΞΙΩΜΑΤΙΚΟΙ', 'ΥΠΞΚΟΙ', 'ΥΠΞΚΟΣ', 'ΥΠΑΞΚΟΣ']), C('group', 'soldiers', 'Οπλίτες', ['ΟΠΛΙΤΕΣ', 'ΣΤΡΑΤΙΩΤΕΣ']),
  C('group', 'ranks', 'Βαθμοί', ['ΒΑΘΜΟΙ', 'ΒΑΘΜΟΣ ΣΤΡΑΤΙΩΤΗΣ'])
];
// Columns of the ΗΚΑΙ (keys = HK_COLS), with the names found in real files
const HKCOL_NAMES: Record<string, { names: string[]; weak?: string[] }> = {
  prov: { names: ['Προβλέπονται από τη σύνθεση', 'Προβλεπόμενοι στη Σύνθεση', 'Προβλεπόμενοι', 'Προβλεπόμενη δύναμη', 'ΠΡΟΒΛΕΠΟΝΤΑΙ'] },
  placed: { names: ['Τοποθετημένοι', 'ΤΟΠΟΘ', 'Τοποθετημένη δύναμη'] },
  attached: { names: ['Προσκολλημένοι', 'Προσκολημένοι', 'Προσκεκολλημένοι', 'Προσκολλ'] },
  sum: { names: ['Σύνολο δύναμης', 'ΣΥΝΟΛΟ ΔΥΝΑΜΗΣ'], weak: ['Σύνολο'] },
  yp: { names: ['Υπηρεσία εντός στρατοπέδου', 'Υπηρεσία εντός', 'Σε υπηρεσία εντός στρατοπέδου'] },
  ey: { names: ['Ελεύθεροι υπηρεσίας', 'Ελεύθεροι υπηρ', 'ΕΥ'] },
  tim: { names: ['Τιμωρημένοι', 'Τιμωρία', 'Ποινές'] },
  os: { names: ['Ο/Σ', 'ΟΣ'] },
  mag: { names: ['Μαγειρεία', 'Μαγειρείο', 'Μαγειρια'] },
  sid: { names: ['Σιδηρουργείο', 'Σιδηρουργεία', 'ΣΙΔΗΡΟΥΡΓΕΙΟΝ'] },
  kin: { names: ['Σε κίνηση', 'Κίνηση', 'Κινήσεως'] },
  sumK: { names: ['Σύνολο κωλυομένων', 'Σύνολο κωλυόμενων', 'ΣΥΝΟΛΟ ΚΩΛΥΟΜΕΝΩΝ', 'Κωλυόμενοι σύνολο'] },
  ka: { names: ['Κανονικές άδειες', 'Κανονική άδεια', 'Κανονικές Άδειες / ΑΜΔ / ΥΕΘΑ', 'ΚΑ', 'ΑΜΔ', 'ΥΕΘΑ', 'Κανονικές'] },
  an: { names: ['Αναρρωτικές άδειες', 'Αναρρωτική άδεια', 'Αναρρωτικές', 'ΑΝ ΑΔ'] },
  eid: { names: ['Ειδικές άδειες', 'Ειδική άδεια', 'Ειδικές'] },
  nos: { names: ['Νοσοκομείο', 'Νοσοκομεία', 'Νοσοκομείο / 401 ΓΣΝΑ', '401 ΓΣΝΑ', 'ΓΣΝΑ', '424 ΓΣΝΘ', 'ΓΣΝΘ'] },
  prat: { names: ['Πρατήριο', 'Πρατήρια'] },
  adik: { names: ['Αγνοούμενοι', 'Αδικαιολόγητα απόντες', 'Αγνοούμενοι/Αδικαιολογήτως Απών', 'Αδικαιολογήτως Απών', 'Αδικαιολογήτως απόντες', 'Αγνοούμενοι / αδικαιολογήτως'] },
  fp: { names: ['Φύλλα πορείας', 'Φύλλο πορείας', 'Φύλλα Πορείας - Μεταβάσεως', 'ΦΠ'] },
  fyl: { names: ['Φυλάκια', 'Φυλάκιο'] },
  apal: { names: ['Απαλλαγή', 'Απαλλαγές'] },
  ekp: { names: ['Σε εκπαίδευση', 'Αποσπασμένοι σε εκπαίδευση', 'Εκπαίδευση'] },
  allh: { names: ['Σε άλλη μονάδα', 'Αποσπασμένοι σε άλλη μονάδα', 'Άλλη μονάδα'], weak: ['Απόσπαση - Διάθεση', 'Απόσπαση'] },
  sumA: { names: ['Σύνολο απόντων', 'ΣΥΝΟΛΟ ΑΠΟΝΤΩΝ'] },
  avail: { names: ['Διαθέσιμοι', 'Διαθέσιμοι για εκπαίδευση', 'Διαθέσιμοι εκπαίδευσης'] },
  ab: { names: ['Μισθοτροφοδοτηθέντες', 'Μισθοτροφοδοτηθέντες την προηγούμενη', 'Μισθοτροφοτηθέντες την προηγούμενη', 'Μισθοτροφοδοτούμενοι'] }
};
const HKCOLS: Concept[] = [
  ...HK_COLS.filter(c => c[0] !== 'bl').map(([k, label]) => ({ id: 'hkcol:' + k, kind: 'hkcol' as const, label, names: [label, ...(HKCOL_NAMES[k]?.names || [])], weak: HKCOL_NAMES[k]?.weak || [] })),
  { id: 'hkcol:prov', kind: 'hkcol' as const, label: 'Προβλέπονται από τη σύνθεση', names: ['Προβλέπονται από τη σύνθεση', ...HKCOL_NAMES.prov.names], weak: [] }
];
// Statuses of a person (the ΚΑΤΑΣΤΑΣΗ column of lists, the words counted by ΗΚΑΛ formulas)
const STATUSES: Concept[] = [
  C('status', 'ΠΑΡΩΝ', 'Παρών', ['ΠΑΡΟΝΤΕΣ', 'ΠΑΡ', 'ΠΑΡΟΥΣΙΑ']),
  C('status', 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ', 'Κανονική άδεια', ['ΚΑ', 'ΚΑΝΟΝΙΚΗ', 'ΑΜΔ', 'ΥΕΘΑ', 'ΑΔΕΙΑ']),
  C('status', 'ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ', 'Αναρρωτική άδεια', ['ΑΝΑΡΡΩΤΙΚΗ', 'ΑΝ ΑΔ', 'ΑΝΑΡ']),
  C('status', 'ΕΙΔΙΚΗ ΑΔΕΙΑ', 'Ειδική άδεια', ['ΕΙΔΙΚΗ']),
  C('status', 'ΕΟΡΤΑΣΤΙΚΗ ΑΔΕΙΑ', 'Εορταστική άδεια', ['ΕΟΡΤΑΣΤΙΚΗ', 'Άδεια Εορταστική']),
  C('status', 'ΤΙΜΗΤΙΚΗ ΑΔΕΙΑ', 'Τιμητική άδεια', ['ΤΙΜΗΤΙΚΗ']),
  C('status', 'ΝΟΣΟΚΟΜΕΙΟ', 'Νοσοκομείο', ['ΝΟΣ', '401 ΓΣΝΑ', 'ΓΣΝΑ', 'ΕΙΣΑΓΩΓΗ ΝΟΣΟΚΟΜΕΙΟ']),
  C('status', 'ΑΠΑΛΛΑΓΗ', 'Απαλλαγή', ['ΑΠΑΛΛ']),
  C('status', 'ΕΚΠΑΙΔΕΥΣΗ', 'Εκπαίδευση', ['ΕΚΠ', 'ΣΕ ΕΚΠΑΙΔΕΥΣΗ']),
  C('status', 'ΑΠΟΣΠΑΣΗ', 'Απόσπαση - Διάθεση', ['ΑΠΟΣΠΑΣΗ', 'ΔΙΑΘΕΣΗ', 'ΑΠΟΣΠΑΣΗ ΔΙΑΘΕΣΗ']),
  C('status', 'ΦΥΛΛΟ ΠΟΡΕΙΑΣ', 'Φύλλο πορείας', ['ΦΠ', 'ΦΥΛΛΑ ΠΟΡΕΙΑΣ']),
  C('status', 'ΦΥΛΑΚΙΟ', 'Φυλάκιο', ['ΦΥΛΑΚΙΑ']),
  C('status', 'ΑΔΙΚΑΙΟΛΟΓΗΤΩΣ ΑΠΩΝ', 'Αδικαιολογήτως απών', ['ΑΠΩΝ ΑΔΙΚΑΙΟΛΟΓΗΤΑ', 'ΑΓΝΟΟΥΜΕΝΟΣ']),
  C('status', 'ΚΑΡΑΝΤΙΝΑ', 'Καραντίνα', ['ΚΑΡΑΝΤΙΝΕΣ']),
  C('status', 'ΤΙΜΩΡΙΑ', 'Τιμωρία', ['ΤΙΜΩΡΗΜΕΝΟΣ', 'ΠΕΡΙΟΡΙΣΜΟΣ', 'ΚΡΑΤΗΣΗ', 'ΦΥΛΑΚΙΣΗ', 'ΣΤΕΡΗΣΗ ΕΞΟΔΟΥ']),
  C('status', 'ΕΞΟΔΟΣ', 'Έξοδος', ['ΕΞΟΔΟΥΧΟΣ', 'ΕΞ']),
  C('status', 'ΥΠΗΡΕΣΙΑ', 'Υπηρεσία', ['ΥΠΗΡ', 'ΣΕ ΥΠΗΡΕΣΙΑ']),
  C('status', 'ΕΥ', 'Ελεύθερος υπηρεσίας', ['ΕΥ']),
  C('status', 'ΕΑ', 'Ελεύθερος ασκήσεων', ['ΕΑ']), C('status', 'ΕΟ', 'Ελεύθερος ορθοστασίας', ['ΕΟ']), C('status', 'ΕΑΡΒ', 'Ελεύθερος αρβύλων', ['ΕΑΡΒ']),
  C('status', 'ΣΤΕΠ', 'ΣΤΕΠ', ['ΕΙΣΑΓΩΓΗ ΣΤΕΠ']),
  C('status', 'ΔΙΑΝΥΚΤΕΡΕΥΣΗ', 'Διανυκτέρευση', ['ΔΝ', 'ΔΙΑΝΥΚΤΕΡΕΥΩΝ', 'ΔΙΑΝΥΚΤΕΡΕΥΣΕΙΣ'])
];
// Services and posts
const SERVICES: Concept[] = [
  C('service', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ', 'Θαλαμοφύλακας', ['ΘΑΛΑΜΟΦΥΛΑΚΕΣ', 'ΘΑΛΑΜΟΦΥΛΑΞ', 'ΘΑΛ']),
  C('service', 'ΟΠΛΟΦΥΛΑΚΑΣ', 'Οπλοφύλακας', ['ΟΠΛΟΦΥΛΑΚΕΣ', 'ΟΠΛΟΦΥΛΑΞ']),
  C('service', 'ΣΚΟΠΟΣ', 'Σκοπός', ['ΣΚΟΠΟΙ', 'ΣΚΟΠΙΑ', 'ΣΚΟΠΙΑΣ', 'ΣΚΟΠΙΜΟΣ']),
  C('service', 'ΠΥΛΗ', 'Πύλη', ['ΠΥΛΕΣ', 'ΦΡΟΥΡΑ ΠΥΛΗΣ']),
  C('service', 'ΕΠΙΦΥΛΑΚΗ', 'Επιφυλακή', ['ΕΠΙΦΥΛΑΚΕΣ', 'ΟΔΗΓΟΣ ΕΠΙΦΥΛΑΚΗΣ']),
  C('service', 'ΕΠΟΠΤΗΣ', 'Εποπτεία', ['ΕΠΟΠΤΗΣ', 'ΕΠΟΠΤΕΣ'], ['ΕΠΟΠΤΗΣ ΕΣΤ']),
  C('service', 'ΤΑΕ', 'ΤΑΕ', ['ΤΑΞΙΑΡΧΙΑ'])
];
const POSTS: Concept[] = [
  C('post', 'ΜΑΓΕΙΡΑΣ', 'Μάγειρας', ['ΜΑΓΕΙΡΕΣ']), C('post', 'ΣΙΤΙΣΤΗΣ', 'Σιτιστής', ['ΣΙΤΙΣΤΕΣ']), C('post', 'ΓΡΑΦΕΑΣ', 'Γραφέας', ['ΓΡΑΦΕΙΣ', 'ΓΡΑΦΕΙΟ']),
  C('post', 'ΕΣΤΙΑΤΟΡΑΣ', 'Εστιάτορας', ['ΕΣΤΙΑΤΟΡΕΣ']), C('post', 'ΠΩΛΗΤΗΣ ΚΨΜ', 'Πωλητής ΚΨΜ', ['ΠΩΛΗΤΗΣ', 'ΠΩΛΗΤΕΣ ΚΨΜ']),
  C('post', 'ΟΔΗΓΟΣ', 'Οδηγός', ['ΟΔΗΓΟΙ', 'ΟΔΗΓΟΣ ΑΥΤΟΚΙΝΗΤΟΥ']), C('post', 'ΤΡΑΥΜΑΤΙΟΦΟΡΕΑΣ', 'Τραυματιοφορέας', ['ΤΡΑΥΜΑΤΙΟΦΟΡΟΙ']),
  C('post', 'ΣΙΔΗΡΟΥΡΓΟΣ', 'Σιδηρουργός', ['ΣΙΔΗΡΟΥΡΓΟΙ']), C('post', 'ΕΠΟΠΤΗΣ ΚΨΜ', 'Εποπτής ΚΨΜ', ['ΕΠΟΠΤ ΚΨΜ', 'ΕΠΟΠΤΕΣ ΚΨΜ'])
];
// Fields of a person (columns of a roster or list). keys of PERSON_FIELDS / roster HEADERS plus common extras.
const PERSON_NAMES: Record<string, string[]> = {
  aa: ['Α/Α', 'ΑΑ', 'Α Α', 'ΝΟ', 'Α.Α.', 'ΑΡ ΣΕΙΡΑΣ', 'ΑΥΞΩΝ ΑΡΙΘΜΟΣ', 'Α/Α Π'],
  rank: ['Βαθμός', 'ΒΑΘΜ', 'ΒΘΜ'],
  origin: ['Προέλευση', 'ΠΡΟΕΛ', 'ΠΡΟΕΛΕΥΣΗ'],
  spec: ['Ο/Σ', 'Ειδικότητα', 'ΟΠΛΟ ΣΩΜΑ', 'Όπλο/Σώμα', 'ΟΠΛΟ - ΣΩΜΑ'],
  last: ['Επώνυμο', 'Επίθετο', 'ΕΠΩΝ'],
  first: ['Όνομα', 'ΟΝΟΜ'],
  name: ['Ονοματεπώνυμο', 'ΟΝΟΜ/ΜΟ', 'ΟΝΟΝ/ΜΟ', 'Επώνυμο - Όνομα', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ ΣΤΡΑΤΙΩΤΗ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ ΣΤΕΛΕΧΟΥΣ'],
  father: ['Πατρώνυμο', 'ΠΑΤΡ'],
  asm: ['ΑΣΜ', 'ΑΜ', 'Αριθμός μητρώου', 'Αρ Μητρώου', 'Α.Σ.Μ.', 'Μητρώο', 'ΑΡ ΜΗΤΡΩΟΥ'],
  phone: ['Τηλέφωνο', 'Κινητό', 'ΤΗΛ', 'Κινητό τηλέφωνο', 'ΤΗΛΕΦΩΝΟ ΕΠΙΚΟΙΝΩΝΙΑΣ'],
  room: ['Θάλαμος', 'ΘΑΛ'],
  si: ['Σ.Ι.', 'Σωματική ικανότητα', 'ΣΙ', 'ΣΩΜΑΤΙΚΗ ΙΚΑΝΟΤΗΤΑ'],
  remarks: ['Παρατηρήσεις', 'ΠΑΡ/ΣΕΙΣ', 'ΠΑΡΑΤΗΡ', 'Σημειώσεις', 'ΣΧΟΛΙΑ'],
  post: ['Πόστο', 'ΘΕΣΗ ΕΡΓΑΣΙΑΣ', 'ΠΟΣΤΑ'],
  dn: ['ΔΝ', 'Δικαίωμα ΔΝ', 'Διανυκτέρευση', 'ΔΙΚΑΙΩΜΑ ΔΝ'],
  essos: ['ΕΣΣΟ', 'Ε.Σ.Σ.Ο.'],
  inOn: ['Ημ/νία εισαγωγής', 'Ημερομηνία εισαγωγής', 'Ημ. εισαγωγής', 'ΗΜΕΡΟΜΗΝΙΑ ΠΑΡΟΥΣΙΑΣΗΣ'],
  sub: ['Λόχος', 'Ίλη', 'Υπομονάδα', 'Λόχος/Ίλη', 'ΙΛΗ/ΛΟΧΟΣ'],
  iban: ['IBAN', 'ΑΡ ΛΟΓΑΡΙΑΣΜΟΥ'], amka: ['ΑΜΚΑ'], afm: ['ΑΦΜ'],
  status: ['Κατάσταση', 'ΚΑΤΑΣΤΑΣΗ ΠΡΟΣΩΠΟΥ', 'ΚΑΤ'],
  from: ['Από', 'Έναρξη', 'Είσοδος', 'ΗΜ ΑΠΟ'], to: ['Έως', 'Λήξη', 'Έξοδος', 'ΗΜ ΕΩΣ'],
  kind: ['Είδος', 'Είδος άδειας', 'Είδος ποινής'], days: ['Ημέρες', 'Ημέρες ποινής'], dest: ['Κατεύθυνση', 'Προορισμός'],
  note: ['Σημείωση'], tout: ['Ώρα αναχώρησης'], tin: ['Ώρα επιστροφής'],
  hours: ['Ώρες', 'ΩΡΕΣ ΥΠΗΡΕΣΙΑΣ'], discharge: ['Ημ. Απόλυσης', 'ΗΜ ΑΠΟΛ', 'ΑΠΟΛΥΣΗ', 'Ημερομηνία απόλυσης'],
  duty: ['Υπηρεσία', 'ΥΠΗΡ', 'ΥΠΗΡΕΣΙΕΣ']
};
const personConcepts = (): Concept[] => {
  const keys = new Set<string>([...PERSON_FIELDS.map(f => f.k), ...Object.keys(PERSON_NAMES)]);
  return [...keys].map(k => {
    const f = PERSON_FIELDS.find(x => x.k === k);
    return { id: 'person:' + k, kind: 'person' as const, label: f?.label || PERSON_NAMES[k]?.[0] || k, names: [...(f ? [f.head, f.label] : []), ...(PERSON_NAMES[k] || [])], weak: [] };
  });
};
// Fields of a weapon list
const WEAPONS: Concept[] = [
  C('weapon', 'type', 'Τύπος όπλου', ['ΤΥΠΟΣ ΟΠΛΟΥ', 'Τύπος']), C('weapon', 'number', 'Αριθμός όπλου', ['ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'Α/Α ΟΠΛΟΥ', 'Σειριακός αριθμός', 'ΑΡ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΠΙΣΤΟΛΙΟΥ', 'ΣΕΙΡΙΑΚΟΣ']),
  C('weapon', 'slot', 'Θέση στον οπλοβαστό', ['ΘΕΣΗ ΣΤΟΝ ΟΠΛΟΒΑ', 'ΘΕΣΗ ΣΤΟΝ ΟΠΛΟΒΑΣΤΟ', 'ΑΡΙΘΜΟΣ ΘΕΣΗΣ ΟΠΛΟΒΑΣΤΟΥ', 'ΑΡΙΘΜΟΣ ΘΕΣΗΣ ΟΠΛΟΥ ΣΤΟΝ ΟΠΛΟΒΑΣΤΟ', 'ΘΕΣΗ ΟΠΛΟΒΑΣΤΟΥ', 'ΑΡΙΘΜΟΣ ΘΕΣΗΣ ΟΠΛΟΒ']),
  C('weapon', 'barrel', 'Κάνη', ['ΑΡΙΘΜΟΣ ΚΑΝΗΣ', 'ΚΑΝΗ', 'Α/Α ΚΑΝΗΣ']), C('weapon', 'spareBarrel', 'Εφεδρική κάνη', ['ΑΡΙΘΜΟΣ ΕΦΕΔΡΙΚΗΣ ΚΑΝΗΣ', 'ΕΦΕΔΡΙΚΗ ΚΑΝΗ']), C('weapon', 'second', 'Δεύτερο όπλο', ['ΔΕΥΤΕΡΟ ΟΠΛΟ', 'ΔΕΥΤΕΡΟΝ ΟΠΛΟΝ']),
  C('weapon', 'armed', 'Χρεωμένο', ['ΧΡΕΩΜΕΝΟ', 'ΑΧΡΕΩΤΟ', 'ΧΡΕΩΣΗ'])
];
// Labels of a form (a word followed by a value) and the three lists of the back of the ΗΚΑΙ
const LABELS: Concept[] = [
  C('label', 'cmdrDay', 'Λ/Υ', ['ΛΟΧΙΑΣ ΥΠΗΡΕΣΙΑΣ', 'ΛΥ']), C('label', 'offDay', 'Δ/Υ', ['ΔΙΕΥΘΥΝΤΗΣ ΥΠΗΡΕΣΙΑΣ', 'ΔΥ', 'ΔΙΕΥΘΥΝΤΗΣ']),
  C('label', 'unit', 'Μονάδα', ['ΜΟΝΑΔΑ']), C('label', 'subunit', 'Υπομονάδα', ['ΥΠΟΜΟΝΑΔΑ']), C('label', 'date', 'Ημερομηνία', ['ΗΜΕΡΟΜΗΝΙΑ', 'ΗΜ/ΝΙΑ', 'ΗΜΕΡΑ']),
  C('label', 'month', 'Μήνας', ['ΜΗΝΑΣ']),
  C('label', 'title', 'Ημερήσια αναφορά', ['ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ', 'ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ', 'ΑΝΑΦΟΡΑ ΗΜΕΡΗΣΙΑ']),
  C('label', 'enroll', 'Εγγραφές', ['ΕΓΓΡΑΦΕΣ', 'ΕΓΓΡΑΦΗΚΑΝ', 'ΕΓΓΡΑΦΗ']), C('label', 'delete', 'Διαγραφές', ['ΔΙΑΓΡΑΦΕΣ', 'ΔΙΑΓΡΑΦΗΚΑΝ']),
  C('label', 'leaves', 'Άδειες', ['ΑΔΕΙΕΣ']), C('label', 'punish', 'Ποινές', ['ΠΟΙΝΕΣ']), C('label', 'requests', 'Αιτήσεις', ['ΑΙΤΗΣΕΙΣ', 'ΑΙΤΗΣΕΙΣ ΑΝΑΦΟΡΕΣ']),
  C('label', 'misc', 'Λοιπά', ['ΛΟΙΠΑ', 'ΛΟΙΠΕΣ ΜΕΤΑΒΟΛΕΣ']), C('label', 'reports', 'Αναφορές', ['ΑΝΑΦΟΡΕΣ']), C('label', 'absences', 'Απουσίες', ['ΑΠΟΥΣΙΕΣ']), C('label', 'attach', 'Προσκολλήσεις', ['ΠΡΟΣΚΟΛΛΗΘΗΚΑΝ', 'ΠΡΟΣΚΟΛΗΘΗΚΑΝ']),
  C('label', 'notes', 'Παρατηρήσεις', ['ΠΑΡΑΤΗΡΗΣΕΙΣ']), C('label', 'changes', 'Μεταβολές', ['ΜΕΤΑΒΟΛΕΣ', 'ΜΕΤΑΒΟΛΕΣ ΤΗΣ ΠΡΟΗΓΟΥΜΕΝΗΣ ΗΜΕΡΑΣ']),
  C('label', 'guards', 'Χορηγούμενες φρουρές', ['ΧΟΡΗΓΟΥΜΕΝΕΣ ΦΡΟΥΡΕΣ']), C('label', 'vehicles', 'Κατάσταση οχημάτων', ['ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ']),
  C('label', 'accidents', 'Ατυχήματα', ['ΑΤΥΧΗΜΑΤΑ']), C('label', 'weapons', 'Οπλισμός', ['ΟΠΛΙΣΜΟΣ', 'ΑΝΑΦΕΡΕΤΑΙ ΠΛΗΡΟΤΗΤΑ ΟΠΛΙΣΜΟΥ ΚΑΙ ΛΟΙΠΩΝ']),
  C('label', 'decisions', 'Αποφάσεις Διοικητή', ['ΑΠΟΦΑΣΕΙΣ ΔΙΟΙΚΗΤΗ', 'ΑΠΟΦΑΣΕΙΣ'])
];
// Words of the day-grid (month) header and its rows
const ALL_BUILTIN: Concept[] = [...RANKS, ...ORIGINS, ...HKROWS, ...TOTALS, ...GROUPS, ...HKCOLS, ...STATUSES, ...SERVICES, ...POSTS, ...personConcepts(), ...WEAPONS, ...LABELS];

// Qualifiers in brackets that do not change the meaning of a rank (yet the match is only a suggestion: the row may count other ranks)
const BRACKET_WORDS = /\([^)]*\)/g;

const DEFAULT_ORDER: ConceptKind[] = ['person', 'rank', 'status', 'hkcol', 'hkrow', 'service', 'post', 'weapon', 'label', 'total', 'group', 'origin'];
export interface Entry { key: string; concept: Concept; weak: boolean; words: number; exact: boolean }

export class Lexicon {
  readonly concepts = new Map<string, Concept>();
  private exact = new Map<string, Entry[]>();
  private fuzzyKeys: Entry[] = [];
  private cache = new Map<string, Match>();
  private originWords = new Set<string>();
  constructor(readonly opts: LexiconOpts = {}) {
    const list = ALL_BUILTIN.map(c => ({ ...c, names: [...c.names], weak: [...(c.weak || [])] }));
    const by = new Map(list.map(c => [c.id, c]));
    const add = (id: string, names: string[], weak = false) => {
      let c = by.get(id);
      if (!c) { const kind = id.slice(0, id.indexOf(':')) as ConceptKind; c = { id, kind, label: names[0] || id, names: [], weak: [], own: true }; by.set(id, c); list.push(c); }
      (weak ? c.weak! : c.names).push(...names);
    };
    // own ranks, leave kinds and statuses of the unit's settings (anything not already known becomes its own concept)
    const known = new Set(RANKS.flatMap(c => c.names.map(phraseKey)));
    for (const id of ['soldierRanks', 'cadreRanks'] as const) for (const n of listOf(opts.lists, id)) if (!known.has(phraseKey(n))) { add('rank:' + phraseKey(n), [n]); known.add(phraseKey(n)); }
    const kstat = new Set(STATUSES.flatMap(c => c.names.map(phraseKey)));
    for (const n of listOf(opts.lists, 'leaveKinds')) if (!kstat.has(phraseKey(n))) { add('status:' + phraseKey(n), [n]); kstat.add(phraseKey(n)); }
    for (const n of listOf(opts.lists, 'cadreAbs')) if (!kstat.has(phraseKey(n))) { add('status:' + phraseKey(n), [n]); kstat.add(phraseKey(n)); }
    // the unit's own columns of the ΗΚΑΙ (Ρυθμίσεις › Δικές μου στήλες): a template column with that name counts that state (the short name is only a guess)
    for (const o of hkColsOf(opts.lists)) { add('hkcol:' + o.key, [o.name]); if (o.short && phraseKey(o.short).length >= 3 && phraseKey(o.short) !== phraseKey(o.name)) add('hkcol:' + o.key, [o.short], true); }
    for (const n of opts.services || []) add('service:' + phraseKey(n), [n]);
    for (const n of opts.posts || []) add('post:' + phraseKey(n), [n]);
    for (const [id, names] of Object.entries(opts.learned || {})) add(id, names);
    for (const [id, names] of Object.entries(opts.user || {})) add(id, names);
    for (const c of list) {
      this.concepts.set(c.id, c);
      if (c.kind === 'origin') for (const n of c.names) this.originWords.add(phraseKey(n));
      for (const w of [false, true]) for (const n of (w ? c.weak! : c.names)) this.index(c, n, w);
    }
    // origin words the user taught are NOT used as prefixes unless they are ≥ 2 letters
    for (const o of [...this.originWords]) if (o.length < 2) this.originWords.delete(o);
  }
  private index(c: Concept, name: string, weak: boolean) {
    const key = phraseKey(name); if (!key) return;
    const words = key.split(' ').length;
    const original = key;
    // names of columns/fields are written as they are (the plural «ΒΑΘΜΟΙ» of the field «ΒΑΘΜΟΣ» is a group of ranks)
    for (const f of (c.kind === 'person' || c.kind === 'weapon' ? [key] : phraseForms(key))) {
      const arr = this.exact.get(f); const e: Entry = { key: f, concept: c, weak, words, exact: f === original };
      if (arr) { if (!arr.some(x => x.concept === c)) arr.push(e); else if (f === original) { const x = arr.find(y => y.concept === c)!; x.exact = true; if (!weak) x.weak = false; } } else this.exact.set(f, [e]);
    }
    if (!/\d/.test(key) && key.length >= 6) this.fuzzyKeys.push({ key, concept: c, weak, words, exact: true });
  }
  concept(id: string): Concept | undefined { return this.concepts.get(id); }
  label(id: string | null): string { return id ? this.concepts.get(id)?.label || id : ''; }

  // The kinds a match may take, in order of preference. Without kinds: all.
  match(text: unknown, o: MatchOpts = {}): Match {
    const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
    const ck = (o.kinds ? o.kinds.join(',') : '*') + '|' + (o.parent || '') + '|' + raw;
    const hit = this.cache.get(ck); if (hit) return hit;
    const r = this.matchRaw(raw, o); if (this.cache.size > 20000) this.cache.clear(); this.cache.set(ck, r); return r;
  }
  private unknown(text: string, why: string): Match { return { text, concept: null, confidence: 'unknown', why }; }
  private matchRaw(raw: string, o: MatchOpts): Match {
    if (!raw) return this.unknown(raw, 'κενό');
    if (/^[\d\s.,:/+\-–]+$/.test(raw)) return this.unknown(raw, 'αριθμός ή ημερομηνία');
    // brackets: «Λχίες (ΕΠΟΠ)» – the base may be right, the extra condition is not known
    if (/\(/.test(raw)) {
      const base = raw.replace(BRACKET_WORDS, ' ').replace(/\s+/g, ' ').trim(); const q = [...raw.matchAll(BRACKET_WORDS)].map(m => m[0].slice(1, -1).trim()).filter(x => x && !/^[\d\s.]+$/.test(x));
      if (base && q.length) {
        const m = this.matchPlain(base, o);
        if (m.concept) return { ...m, text: raw, confidence: 'suggest', why: m.why + ' · με επιπλέον όρο (' + q.join(', ') + '): ίσως μετράει κάτι διαφορετικό' };
        return { ...m, text: raw };
      }
    }
    const m = this.matchPlain(raw, o);
    return { ...m, text: raw };
  }
  private kindsOk(c: Concept, o: MatchOpts) { return !o.kinds || o.kinds.includes(c.kind); }
  private rankKinds(o: MatchOpts) { return !o.kinds || o.kinds.includes('rank') || o.kinds.includes('hkrow'); }
  private pick(text: string, es: Entry[], o: MatchOpts, why: string, level: Confidence): Match | null {
    const ok = es.filter(e => this.kindsOk(e.concept, o)); if (!ok.length) return null;
    // the first preferred kind that has a hit
    const order = o.kinds || DEFAULT_ORDER;
    const rankOf = (e: Entry) => { const i = order.indexOf(e.concept.kind); return i < 0 ? 99 : i; };
    ok.sort((a, b) => rankOf(a) - rankOf(b) || Number(a.weak) - Number(b.weak));
    const top = ok[0]; const same = ok.filter(e => rankOf(e) === rankOf(top) && e.concept.id !== top.concept.id && e.weak === top.weak);
    const alts = ok.filter(e => e.concept.id !== top.concept.id).map(e => e.concept.id);
    if (same.length) return { text, concept: top.concept.id, confidence: 'suggest', why: 'διφορούμενο: ' + [top, ...same].map(e => e.concept.label).join(' ή '), alts };
    const weak = top.weak || level === 'suggest';
    return { text, concept: top.concept.id, confidence: weak ? 'suggest' : 'sure', why: weak ? (top.weak ? 'παρόμοια λέξη του λεξικού: «' + top.concept.label + '»' : why) : why, ...(alts.length ? { alts } : {}) };
  }
  private matchPlain(raw: string, o: MatchOpts): Match {
    const key = phraseKey(raw);
    if (!key) return this.unknown(raw, 'κενό');
    // 1. the name itself (or its singular/plural)
    const hit = this.exact.get(key);
    if (hit) { const m = this.pick(raw, hit, o, hit.some(e => e.exact) ? 'ακριβές όνομα' : 'ενικός/πληθυντικός', 'sure'); if (m) return m; }
    // «origin rank»: ΕΠΟΠ ΔΝΕΑΣ, ΕΜΘ ΑΝΘΣΤΗΣ, Εποπ Στρ
    const words = key.split(' ');
    if (words.length >= 2 && this.rankKinds(o)) {
      for (let i = 0; i < words.length; i++) {
        const org = [...this.originWords].find(w => w === words[i] && w.length >= 2); if (!org) continue;
        const rest = words.filter((_, j) => j !== i).join(' ');
        const rk = this.exact.get(rest)?.filter(e => e.concept.kind === 'rank');
        if (rk?.length) {
          const orig = this.originConcept(org); const rank = rk[0].concept;
          if (o.kinds && o.kinds.includes('hkrow') && (!o.kinds.includes('rank') || o.kinds.indexOf('hkrow') < o.kinds.indexOf('rank'))) {
            const row = this.hkRowOfRank(rank.id, orig);
            if (row) return { text: raw, concept: row.concept, confidence: row.confidence, why: row.why, origin: orig };
          } else return { text: raw, concept: rank.id, confidence: 'sure', why: 'προέλευση ' + orig + ' + βαθμός ' + rank.label, origin: orig };
        }
      }
    }
    // 2. compound header «Α - Β / Γ»
    const parts = this.splitParts(raw);
    if (parts.length >= 2) {
      const ms = parts.map(p => this.matchPlain(p, o));
      const found = ms.filter(m => m.concept);
      if (found.length) {
        const ids = new Set(found.map(m => m.concept)); const all = found.length === ms.length;
        if (ids.size === 1 && all && found.every(m => m.confidence === 'sure')) return { text: raw, concept: found[0].concept, confidence: 'sure', why: 'όλα τα μέρη είναι το ίδιο: «' + this.label(found[0].concept) + '»', parts: ms, compound: true };
        return { text: raw, concept: found[0].concept, confidence: 'suggest', why: 'σύνθετη επικεφαλίδα: ' + ms.map(m => '«' + m.text + '»→' + (m.concept ? this.label(m.concept) : '?')).join(' · '), parts: ms, compound: true, ...(ids.size > 1 ? { alts: [...ids].filter(x => x !== found[0].concept) as string[] } : {}) };
      }
    }
    // 3. typos
    if (key.length >= 6 && !/\d/.test(key)) {
      let bestD = 99; let cands: Entry[] = [];
      for (const e of this.fuzzyKeys) {
        if (!this.kindsOk(e.concept, o)) continue;
        const L = e.key.length; const max = L >= 20 ? 3 : L >= 10 ? 2 : L >= 6 ? 1 : 0;
        const d = editDistance(key, e.key, max); if (d > max) continue;
        if (d < bestD) { bestD = d; cands = [e]; } else if (d === bestD) cands.push(e);
      }
      if (cands.length) {
        const ids = new Set(cands.map(e => e.concept.id)); const L = Math.min(...cands.map(e => e.key.length));
        const m = this.pick(raw, cands, o, 'μικρό ορθογραφικό λάθος του «' + cands[0].key + '»', 'suggest');
        if (m) return { ...m, confidence: bestD === 1 && L >= 12 && ids.size === 1 && !m.alts?.length && m.confidence !== 'unknown' && !cands[0].weak ? 'sure' : 'suggest', why: 'μικρό ορθογραφικό λάθος του «' + this.label(m.concept) + '»' };
      }
    }
    // 4. the name inside a longer text («Φυλάκιο Κορυφή-900», «Κανονικές Άδειες ΑΜΔ»)
    if (words.length <= 8) {
      const padded = ' ' + key + ' '; let best: Entry | null = null;
      for (const [k, es] of this.exact) {
        if (k.length < (k.includes(' ') ? 8 : 7) || !padded.includes(' ' + k + ' ')) continue;
        for (const e of es) if (this.kindsOk(e.concept, o) && (!best || k.length > best.key.length)) best = { ...e, key: k };
      }
      if (best) { const m = this.pick(raw, this.exact.get(best.key)!, o, 'περιέχει «' + best.key + '»', 'suggest'); if (m) return { ...m, confidence: 'suggest', why: 'περιέχει «' + this.label(m.concept) + '» και άλλες λέξεις' }; }
    }
    return this.unknown(raw, 'δεν υπάρχει στο λεξικό');
  }
  private originConcept(w: string): string { for (const c of this.concepts.values()) if (c.kind === 'origin' && c.names.some(n => phraseKey(n) === w)) return c.label; return w; }
  private hkRowOfRank(rankId: string, origin: string): { concept: string; confidence: Confidence; why: string } | null {
    if (rankId === 'rank:ΣΤΡΑΤΙΩΤΗΣ') {
      if (origin === 'ΕΠΟΠ') return { concept: 'hkrow:ΕΠΟΠ Στρατιώτης', confidence: 'sure', why: 'ΕΠΟΠ στρατιώτης' };
      if (origin === 'ΟΒΑ') return { concept: 'hkrow:ΟΒΑ Στρατιώτης', confidence: 'sure', why: 'ΟΒΑ στρατιώτης' };
    }
    const row = HKROWS.find(c => HKROW_NAMES[c.label]?.ranks?.includes(rankId.slice(5)));
    return row ? { concept: row.id, confidence: 'suggest', why: 'βαθμός ' + this.label(rankId) + ' με προέλευση ' + origin + ': η ΗΚΑΙ έχει ενιαία γραμμή' } : null;
  }
  private splitParts(raw: string): string[] {
    const t = raw.replace(BRACKET_WORDS, ' ');
    // hyphens inside Latin/Greek single letters are abbreviations (Ο-Σ): normText joins them first
    const n = normText(t); const parts = n.split(/\s*(?:[/,&+]|\s-\s|-|\sΚΑΙ\s)\s*/).map(x => x.trim()).filter(x => x.length > 1 && !/^[\d\s.]+$/.test(x));
    return parts.length >= 2 ? parts : [];
  }
  // All concepts of a kind (for the screens that list them)
  ofKind(k: ConceptKind): Concept[] { return [...this.concepts.values()].filter(c => c.kind === k); }
}

let DEFAULT: Lexicon | null = null;
export const defaultLexicon = (): Lexicon => (DEFAULT ||= new Lexicon());
export const buildLexicon = (o?: LexiconOpts): Lexicon => (o ? new Lexicon(o) : defaultLexicon());
