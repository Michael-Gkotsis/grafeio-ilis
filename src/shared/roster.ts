// Ανάγνωση Δυναμολογίου (δείγμα 12): βρίσκει τις στήλες από τις επικεφαλίδες, όχι από θέσεις κελιών,
// ώστε να δουλεύει και όταν ο λοχίας προσθέσει/μετακινήσει στήλη.
import { norm } from './text';
import type { ImportRow } from './commands';

export type CellValue = string | number | boolean | Date | null | undefined;
export interface RawSheet { name: string; rows: CellValue[][] }
export interface RosterResult {
  rows: ImportRow[]; warnings: string[]; main: string; essos: string;
  skipped: string[];                 // γραμμές που αγνοήθηκαν γιατί δεν είναι άτομα (ΣΥΝΟΛΟ, 1ΟΣ…)
  declared: number | null;           // το «ΣΥΝΟΛΟ» που γράφει το ίδιο το φύλλο
  found: number;                     // άτομα που βρέθηκαν στο κύριο φύλλο
  suspicious: string[];              // πέρασαν, αλλά δεν έχουν ούτε ΑΣΜ ούτε τηλέφωνο ούτε θάλαμο
}

// Δικαίωμα ΔΝ: στήλη «ΔΝ» (ΝΑΙ, Χ, ✓…), η λέξη ΔΝ στις παρατηρήσεις, ή φύλλο «ΔΝ» με λίστα ονομάτων
export const DN_HEAD = /^Δ\s*\.?\s*[ΝN]\s*\.?$|ΔΙΚΑΙΩΜΑ\s*Δ\s*\.?\s*[ΝN]|^ΔΙΑΝΥΚΤΕΡΕΥΣ/;
export const DN_WORD = /(^|[\s,;/(])Δ\s?\.?\s?[ΝN]\s?\.?(?=$|[\s,;/)])/;
export const isDnYes = (v: string) => { const t = norm(v).replace(/\s+/g, ' ').trim(); return !!t && !/^(ΟΧΙ|Ο|NO|N\/A|-+|0|ΧΩΡΙΣ.*)$/.test(t); };
// Ρόλος χωρίς τη λέξη ΔΝ («ΘΑΛΑΜΑΡΧΗΣ ΔΝ» → «ΘΑΛΑΜΑΡΧΗΣ»)
export const stripDn = (v: string) => norm(v).replace(new RegExp(DN_WORD.source, 'g'), ' ').replace(/\s+/g, ' ').replace(/^[\s,;/-]+|[\s,;/-]+$/g, '').trim();
export type Field = 'rank' | 'spec' | 'last' | 'first' | 'father' | 'asm' | 'phone' | 'room' | 'si' | 'remarks' | 'post' | 'dn';
const HEADERS: [Field, RegExp][] = [
  ['rank', /^ΒΑΘΜΟΣ$/], ['spec', /^Ο\s*[/\-]\s*Σ$|^ΕΙΔΙΚΟΤΗΤΑ$/], ['last', /^ΕΠΩΝΥΜΟ$|^ΕΠΙΘΕΤΟ$/], ['first', /^ΟΝΟΜΑ$/],
  ['father', /^ΠΑΤΡΩΝΥΜΟ$/], ['asm', /^ΑΣΜ$|^Α\.Σ\.Μ\.?$|ΑΡ.*ΜΗΤΡΩΟΥ/], ['phone', /ΚΙΝΗΤΟ|ΤΗΛΕΦΩΝΟ/], ['room', /^ΘΑΛΑΜΟΣ$/],
  ['si', /^Σ\.?\s*Ι\.?$/], ['remarks', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$/], ['post', /^ΠΟΣΤΟ$/], ['dn', DN_HEAD]
];
const txt = (v: CellValue): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).replace(/\s+/g, ' ').trim();
};
const up = (v: CellValue) => norm(txt(v));

// Αντιστοίχιση που διάλεξε ο χρήστης (Αρχεία Excel): φύλλο, γραμμή επικεφαλίδων και στήλες, αντί για την αυτόματη
export interface RosterOverride { sheet: string; header: number; cols: Partial<Record<Field, number>> }
export interface RosterOverrides { main?: RosterOverride; posts?: RosterOverride; outside?: RosterOverride }
let OV: RosterOverride[] = [];
function headerOf(sheet: RawSheet): { row: number; cols: Partial<Record<Field, number>> } | null {
  const ov = OV.find(o => o.sheet === sheet.name);
  if (ov) return { row: ov.header, cols: ov.cols };
  for (let r = 0; r < Math.min(sheet.rows.length, 12); r++) {
    const cols: Partial<Record<Field, number>> = {};
    (sheet.rows[r] || []).forEach((v, c) => {
      const h = up(v); if (!h) return;
      const f = HEADERS.find(([, re]) => re.test(h));
      if (f && cols[f[0]] == null) cols[f[0]] = c;
    });
    if (cols.last != null && cols.first != null) return { row: r, cols };
  }
  return null;
}

// Το Δυναμολόγιο έχει κάτω από τα ονόματα πίνακες συνόλων (ΣΥΝΟΛΟ, ΘΑΛΑΜΟΙ, 1ΟΣ…8ΟΣ, ΑΔΕΙΕΣ…).
// Σε συγχωνευμένα κελιά το ίδιο κείμενο έρχεται και στο επώνυμο και στο όνομα, και το «πατρώνυμο» είναι αριθμός.
const SUMMARY = /^(ΣΥΝΟΛΟ|ΣΥΝΟΛΑ|ΓΕΝΙΚΟ|ΘΑΛΑΜΟΙ|ΘΑΛΑΜΟΣ|ΕΙΣΑΓΩΓΕΣ|ΑΔΕΙΕΣ|ΑΝΑΡ+ΩΤΙΚΕΣ|ΣΤΡΑΤΙΩΤΕΣ|ΠΑΡΟΝΤΕΣ|ΑΠΟΝΤΕΣ|ΔΥΝΑΜΗ|ΕΚΤΟΣ|ΝΟΣΟΚΟΜΕΙΟ|ΟΥΛΑΜΟΣ|ΔΙΑΘΕΣΙΜΟΙ)\b/;
export function isPersonRow(last: string, first: string, father: string): boolean {
  const L = norm(last), F = norm(first), P = norm(father);
  if (/\d/.test(L) || /\d/.test(F)) return false;           // 1ΟΣ, 8ΟΣ…
  if (L === F) return false;                                  // συγχωνευμένο κελί
  if (SUMMARY.test(L) || SUMMARY.test(F)) return false;
  if (P && /^[\d\s.,]+$/.test(P)) return false;              // αριθμός στη θέση του πατρώνυμου
  return /^[Α-ΩA-Z][Α-ΩA-Z\s'΄\-.]*$/.test(L) && /^[Α-ΩA-Z][Α-ΩA-Z\s'΄\-.]*$/.test(F);
}

interface Rec { rank: string; spec: string; last: string; first: string; father: string; asm: string; phone: string; room: number | null; si: string; remarks: string; post: string; dn: boolean | null }
function records(sheet: RawSheet, skipped: string[] = []): Rec[] {
  const h = headerOf(sheet); if (!h) return [];
  const get = (row: CellValue[], f: Field) => (h.cols[f] == null ? '' : txt(row[h.cols[f]!]));
  const out: Rec[] = [];
  for (const row of sheet.rows.slice(h.row + 1)) {
    if (!row) continue;
    const last = get(row, 'last'), first = get(row, 'first');
    if (!last && !first) continue;
    if (!last || !first || !isPersonRow(last, first, get(row, 'father'))) { skipped.push(norm(last || first)); continue; }
    const roomN = parseInt(get(row, 'room'), 10);
    out.push({
      rank: norm(get(row, 'rank')), spec: norm(get(row, 'spec')), last: norm(last), first: norm(first), father: norm(get(row, 'father')),
      asm: get(row, 'asm').replace(/\s/g, ''), phone: get(row, 'phone').replace(/\s/g, ''),
      room: Number.isFinite(roomN) && roomN > 0 ? roomN : null, si: norm(get(row, 'si')), remarks: get(row, 'remarks'), post: norm(get(row, 'post')),
      dn: h.cols.dn == null ? null : isDnYes(get(row, 'dn'))
    });
  }
  return out;
}
const keyOf = (r: { last: string; first: string; father: string }) => r.last + '|' + r.first + '|' + r.father;

// π.χ. «ΔΥΝΑΜΟΛΟΓΙΟ Β' ΕΣΣΟ 2026» → «2026 Β΄»
export function essosOf(title: string): string {
  const m = /([Α-Δ])\s*['΄’`]?\s*ΕΣΣΟ\s*(\d{4})/.exec(norm(title));
  return m ? m[2] + ' ' + m[1] + '΄' : '';
}

export function parseRoster(sheets: RawSheet[], ov: RosterOverrides = {}): RosterResult {
  OV = [ov.main, ov.posts, ov.outside].filter((o): o is RosterOverride => !!o && sheets.some(s => s.name === o.sheet));
  try { return parse(sheets, ov); } finally { OV = []; }
}
function parse(sheets: RawSheet[], ov: RosterOverrides): RosterResult {
  const warnings: string[] = [];
  const named = (o?: RosterOverride) => (o ? sheets.find(s => s.name === o.sheet) : undefined);
  const byName = (re: RegExp) => sheets.find(s => re.test(norm(s.name)));
  const main = named(ov.main) || byName(/^ΣΥΝΟΛΙΚΟ/) || sheets.find(s => headerOf(s) && !/ΠΟΣΤΑ|ΕΚΤΟΣ|ΑΔΕΙΕΣ|ΤΙΜΩΡ|IATR|ΙΑΤΡ/.test(norm(s.name)));
  if (!main) return { rows: [], warnings: ['Δεν βρέθηκε φύλλο με στήλες «Επώνυμο» και «Όνομα».'], main: '', essos: '', skipped: [], declared: null, found: 0, suspicious: [] };
  const essos = essosOf(txt((main.rows[0] || [])[0]));
  const posts = new Map<string, string>();
  const postSheet = named(ov.posts) || byName(/^ΠΟΣΤΑ/);
  if (postSheet) for (const r of records(postSheet)) if (r.post) { posts.set(keyOf(r), r.post); if (r.asm) posts.set('#' + r.asm, r.post); }
  const out = new Map<string, Rec>();
  const skipped: string[] = [];
  let recs = records(main, skipped);
  // Αν σχεδόν όλοι έχουν βαθμό, όσοι δεν έχουν είναι γραμμές σημειώσεων, όχι άνθρωποι
  const withRank = recs.filter(r => r.rank).length;
  if (withRank >= recs.length * 0.8) { const drop = recs.length - withRank; if (drop) warnings.push(drop + ' γραμμές χωρίς βαθμό αγνοήθηκαν (δεν μοιάζουν με άτομα)'); recs.filter(r => !r.rank).forEach(r => skipped.push(r.last + ' ' + r.first)); recs = recs.filter(r => r.rank); }
  for (const r of recs) {
    const k = r.asm ? '#' + r.asm : keyOf(r);
    if (out.has(k)) { warnings.push('Διπλή εγγραφή: ' + r.last + ' ' + r.first + ' (κρατήθηκε η πρώτη)'); continue; }
    out.set(k, r);
  }
  // Φύλλο «ΔΝ» / «ΔΙΚΑΙΟΥΧΟΙ ΔΝ» χωρίς ημερομηνίες: όσοι είναι εκεί έχουν δικαίωμα ΔΝ, οι άλλοι όχι.
  // (Με «ΑΠΟ/ΕΩΣ» είναι διανυκτερεύσεις και διαβάζονται από τα Αρχεία Excel ως είδος «ΔΝ».)
  const dnSheet = sheets.find(sh => sh !== main && isDnSheet(sh));
  const dnList = new Set<string>();
  if (dnSheet) for (const r of records(dnSheet)) { dnList.add(keyOf(r)); if (r.asm) dnList.add('#' + r.asm); }
  const dnCol = recs.some(r => r.dn != null);
  const outside = named(ov.outside) || byName(/^ΕΚΤΟΣ/);
  const inactive = new Map<string, string>();
  if (outside) for (const r of records(outside)) { inactive.set(r.asm ? '#' + r.asm : keyOf(r), r.remarks); if (!out.has(r.asm ? '#' + r.asm : keyOf(r))) out.set(r.asm ? '#' + r.asm : keyOf(r), r); }
  const rows: ImportRow[] = [...out.entries()].map(([k, r]) => {
    const post = posts.get('#' + r.asm) || posts.get(keyOf(r)) || null;
    const off = inactive.has(k);
    // Στο ΣΥΝΟΛΙΚΟ οι «ΠΑΡΑΤΗΡΗΣΕΙΣ» είναι ρόλοι (ΘΑΛΑΜΑΡΧΗΣ, ΓΡΑΦΕΑΣ…)· η λέξη ΔΝ εκεί σημαίνει δικαίωμα ΔΝ
    const dnWord = !off && DN_WORD.test(norm(r.remarks));
    const role = !off && r.remarks ? stripDn(r.remarks) || null : null;
    const row: ImportRow = {
      rank: r.rank || 'ΣΤΡ', spec: r.spec, last: r.last, first: r.first, father: r.father, asm: r.asm, phone: r.phone, room: r.room,
      si: r.si, post, role, essos, attached: false, notes: off ? 'Εκτός δύναμης' + (r.remarks ? ': ' + r.remarks : '') : '',
      active: !off
    };
    // μόνο όταν το αρχείο λέει κάτι για ΔΝ· αλλιώς μένει ό,τι έχει οριστεί στην εφαρμογή
    if (dnSheet || dnCol) row.dn = !!r.dn || dnWord || dnList.has('#' + r.asm) || dnList.has(keyOf(r));
    else if (dnWord) row.dn = true;
    return row;
  });
  const nDn = rows.filter(r => r.active && r.dn).length;
  if (nDn) warnings.push(nDn + ' άτομα με δικαίωμα ΔΝ' + (dnSheet ? ' (φύλλο «' + dnSheet.name + '»)' : dnCol ? ' (στήλη ΔΝ)' : ' (παρατηρήσεις)') + '.');
  const noRoom = rows.filter(r => r.active && r.room == null).length;
  if (noRoom) warnings.push(noRoom + ' άτομα χωρίς θάλαμο: δεν θα μπαίνουν στην πρόταση εξόδου ανά θάλαμο.');
  const noAsm = rows.filter(r => !r.asm).length;
  if (noAsm) warnings.push(noAsm + ' άτομα χωρίς ΑΣΜ: ταιριάζουν μόνο με ονοματεπώνυμο και πατρώνυμο.');
  // Δεύτερη ασφάλεια: το φύλλο γράφει το δικό του «ΣΥΝΟΛΟ». Αν δεν συμφωνεί με όσους βρήκαμε, το λέμε πριν την εισαγωγή.
  const declared = declaredTotal(main);
  const found = recs.length;
  if (declared != null && declared !== found) warnings.unshift('Το Δυναμολόγιο γράφει ΣΥΝΟΛΟ ' + declared + ', αλλά βρέθηκαν ' + found + ' άτομα στο φύλλο ' + main.name + '. Έλεγξε τη λίστα πριν την εισαγωγή.');
  const suspicious = rows.filter(r => r.active && !r.asm && !r.phone && r.room == null).map(r => r.last + ' ' + r.first);
  return { rows, warnings, main: main.name, essos, skipped, declared, found, suspicious };
}
export function isDnSheet(sh: RawSheet): boolean {
  if (!/^Δ\s?\.?\s?[ΝN](?![Α-ΩA-Z])|ΔΙΚΑΙΟΥΧΟΙ\s*Δ\s?\.?\s?[ΝN]|ΔΙΑΝΥΚΤΕΡΕΥΣ/.test(norm(sh.name))) return false;
  const h = headerOf(sh); if (!h) return false;
  return !(sh.rows[h.row] || []).some(v => /^(ΑΠΟ|ΕΩΣ|ΗΜΕΡΟΜΗΝΙΑ|ΗΜΕΡ\/ΝΙΑ)$/.test(up(v)));
}
function declaredTotal(sheet: RawSheet): number | null {
  for (const row of sheet.rows) {
    if (!row) continue;
    const i = row.findIndex(v => /^ΣΥΝΟΛΟ( ΑΤΟΜΩΝ| ΔΥΝΑΜΗΣ)?:?$/.test(up(v)));
    if (i < 0) continue;
    for (const v of row.slice(i + 1)) { const t = txt(v); if (/^\d+$/.test(t)) return Number(t); }
  }
  return null;
}
