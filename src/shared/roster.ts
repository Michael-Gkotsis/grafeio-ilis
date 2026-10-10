// Ανάγνωση Δυναμολογίου (δείγμα 12): βρίσκει τις στήλες από τις επικεφαλίδες, όχι από θέσεις κελιών,
// ώστε να δουλεύει και όταν ο λοχίας προσθέσει/μετακινήσει στήλη.
import { norm } from './text';
import type { ImportRow } from './commands';

export type CellValue = string | number | boolean | Date | null | undefined;
export interface RawSheet { name: string; rows: CellValue[][] }
export interface RosterResult { rows: ImportRow[]; warnings: string[]; main: string; essos: string }

type Field = 'rank' | 'spec' | 'last' | 'first' | 'father' | 'asm' | 'phone' | 'room' | 'si' | 'remarks' | 'post';
const HEADERS: [Field, RegExp][] = [
  ['rank', /^ΒΑΘΜΟΣ$/], ['spec', /^Ο\s*[/\-]\s*Σ$|^ΕΙΔΙΚΟΤΗΤΑ$/], ['last', /^ΕΠΩΝΥΜΟ$|^ΕΠΙΘΕΤΟ$/], ['first', /^ΟΝΟΜΑ$/],
  ['father', /^ΠΑΤΡΩΝΥΜΟ$/], ['asm', /^ΑΣΜ$|^Α\.Σ\.Μ\.?$|ΑΡ.*ΜΗΤΡΩΟΥ/], ['phone', /ΚΙΝΗΤΟ|ΤΗΛΕΦΩΝΟ/], ['room', /^ΘΑΛΑΜΟΣ$/],
  ['si', /^Σ\.?\s*Ι\.?$/], ['remarks', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$/], ['post', /^ΠΟΣΤΟ$/]
];
const txt = (v: CellValue): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).replace(/\s+/g, ' ').trim();
};
const up = (v: CellValue) => norm(txt(v));

function headerOf(sheet: RawSheet): { row: number; cols: Partial<Record<Field, number>> } | null {
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

interface Rec { rank: string; spec: string; last: string; first: string; father: string; asm: string; phone: string; room: number | null; si: string; remarks: string; post: string }
function records(sheet: RawSheet): Rec[] {
  const h = headerOf(sheet); if (!h) return [];
  const get = (row: CellValue[], f: Field) => (h.cols[f] == null ? '' : txt(row[h.cols[f]!]));
  const out: Rec[] = [];
  for (const row of sheet.rows.slice(h.row + 1)) {
    if (!row) continue;
    const last = get(row, 'last'), first = get(row, 'first');
    if (!last || !first) continue;
    const roomN = parseInt(get(row, 'room'), 10);
    out.push({
      rank: norm(get(row, 'rank')), spec: norm(get(row, 'spec')), last: norm(last), first: norm(first), father: norm(get(row, 'father')),
      asm: get(row, 'asm').replace(/\s/g, ''), phone: get(row, 'phone').replace(/\s/g, ''),
      room: Number.isFinite(roomN) && roomN > 0 ? roomN : null, si: norm(get(row, 'si')), remarks: get(row, 'remarks'), post: norm(get(row, 'post'))
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

export function parseRoster(sheets: RawSheet[]): RosterResult {
  const warnings: string[] = [];
  const byName = (re: RegExp) => sheets.find(s => re.test(norm(s.name)));
  const main = byName(/^ΣΥΝΟΛΙΚΟ/) || sheets.find(s => headerOf(s) && !/ΠΟΣΤΑ|ΕΚΤΟΣ|ΑΔΕΙΕΣ|ΤΙΜΩΡ|IATR|ΙΑΤΡ/.test(norm(s.name)));
  if (!main) return { rows: [], warnings: ['Δεν βρέθηκε φύλλο με στήλες «Επώνυμο» και «Όνομα».'], main: '', essos: '' };
  const essos = essosOf(txt((main.rows[0] || [])[0]));
  const posts = new Map<string, string>();
  const postSheet = byName(/^ΠΟΣΤΑ/);
  if (postSheet) for (const r of records(postSheet)) if (r.post) { posts.set(keyOf(r), r.post); if (r.asm) posts.set('#' + r.asm, r.post); }
  const out = new Map<string, Rec>();
  for (const r of records(main)) {
    const k = r.asm ? '#' + r.asm : keyOf(r);
    if (out.has(k)) { warnings.push('Διπλή εγγραφή: ' + r.last + ' ' + r.first + ' (κρατήθηκε η πρώτη)'); continue; }
    out.set(k, r);
  }
  const outside = byName(/^ΕΚΤΟΣ/);
  const inactive = new Map<string, string>();
  if (outside) for (const r of records(outside)) { inactive.set(r.asm ? '#' + r.asm : keyOf(r), r.remarks); if (!out.has(r.asm ? '#' + r.asm : keyOf(r))) out.set(r.asm ? '#' + r.asm : keyOf(r), r); }
  const rows: ImportRow[] = [...out.entries()].map(([k, r]) => {
    const post = posts.get('#' + r.asm) || posts.get(keyOf(r)) || null;
    const off = inactive.has(k);
    // Στο ΣΥΝΟΛΙΚΟ οι «ΠΑΡΑΤΗΡΗΣΕΙΣ» είναι ρόλοι (ΘΑΛΑΜΑΡΧΗΣ, ΓΡΑΦΕΑΣ…)
    return {
      rank: r.rank || 'ΣΤΡ', spec: r.spec, last: r.last, first: r.first, father: r.father, asm: r.asm, phone: r.phone, room: r.room,
      si: r.si, post, role: !off && r.remarks ? norm(r.remarks) : null, essos, attached: false, notes: off ? 'Εκτός δύναμης' + (r.remarks ? ': ' + r.remarks : '') : '',
      active: !off
    };
  });
  const noRoom = rows.filter(r => r.active && r.room == null).length;
  if (noRoom) warnings.push(noRoom + ' άτομα χωρίς θάλαμο: δεν θα μπαίνουν στην πρόταση εξόδου ανά θάλαμο.');
  const noAsm = rows.filter(r => !r.asm).length;
  if (noAsm) warnings.push(noAsm + ' άτομα χωρίς ΑΣΜ: ταιριάζουν μόνο με ονοματεπώνυμο και πατρώνυμο.');
  return { rows, warnings, main: main.name, essos };
}
