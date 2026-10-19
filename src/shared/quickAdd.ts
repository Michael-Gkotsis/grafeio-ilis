// Γρήγορη εισαγωγή στρατιωτών (Michael, 19/10: στη Νέα ΕΣΣΟ «τον ένα στρατιώτη μετά τον άλλον» χωρίς αποθήκευση κάθε φορά):
// πίνακας σαν το Excel, επικόλληση πολλών γραμμών, έλεγχος για διπλούς πριν από την προσθήκη
import { HEADERS } from './roster';
import { norm } from './text';
import { personKey, type NewPerson } from './commands';
import type { Person } from './domain';

export const QA_COLS = ['rank', 'spec', 'last', 'first', 'father', 'asm', 'phone', 'room'] as const;
export type QaKey = typeof QA_COLS[number];
export type QaRow = Record<QaKey, string>;
// έρχονται ίδια με τη γραμμή από πάνω
export const CARRY: QaKey[] = ['rank', 'spec', 'room'];

export const emptyRow = (carry: Partial<QaRow> = {}): QaRow => ({ rank: '', spec: '', last: '', first: '', father: '', asm: '', phone: '', room: '', ...carry });
export const carryOf = (r: QaRow): Partial<QaRow> => Object.fromEntries(CARRY.map(k => [k, r[k]]));
// γραμμή με στρατιώτη: ό,τι δεν έρχεται από πάνω
export const isFilled = (r: QaRow) => !!(r.last.trim() || r.first.trim() || r.father.trim() || r.asm.trim() || r.phone.trim());

const clean = (v: string) => v.replace(/\s+/g, ' ').trim();
const asmOf = (v: string) => v.replace(/\s/g, '');
// «3», «Θ3», «3ος» → 3
const roomOf = (v: string) => { const m = /\d+/.exec(v); return m && +m[0] > 0 ? +m[0] : null; };

export function toNewPerson(r: QaRow, essos: string): NewPerson {
  return { rank: clean(r.rank), spec: clean(r.spec), last: clean(r.last), first: clean(r.first), father: clean(r.father), asm: asmOf(r.asm), phone: asmOf(r.phone),
    room: roomOf(r.room), si: '', post: null, role: null, essos: clean(essos), attached: false, notes: '' };
}

// Τι δεν πάει σε κάθε γραμμή (null = εντάξει ή κενή): λείπει επώνυμο/όνομα, ίδιο ΑΣΜ ή ονοματεπώνυμο και πατρώνυμο
// με κάποιον που υπάρχει ή με γραμμή πιο πάνω
export function checkRows(people: Person[], rows: QaRow[]): (string | null)[] {
  const byAsm = new Map<string, Person>(); const byKey = new Map<string, Person>();
  for (const p of people) { if (p.asm) byAsm.set(p.asm, p); byKey.set(personKey(p), p); }
  const gAsm = new Map<string, number>(); const gKey = new Map<string, number>();
  return rows.map((r, i) => {
    if (!isFilled(r)) return null;
    const last = clean(r.last), first = clean(r.first);
    if (!last && !first) return 'Λείπουν επώνυμο και όνομα';
    if (!last) return 'Λείπει το επώνυμο';
    if (!first) return 'Λείπει το όνομα';
    const asm = asmOf(r.asm); const key = personKey({ last, first, father: clean(r.father) });
    const tw = (asm && byAsm.get(asm)) || byKey.get(key);
    const err = tw ? 'Υπάρχει ήδη' + (tw.asm && tw.asm === asm ? ' με ΑΣΜ ' + asm + ': ' : ': ') + tw.last + ' ' + tw.first + (tw.active ? '' : ' (εκτός δύναμης)')
      : asm && gAsm.has(asm) ? 'Ίδιο ΑΣΜ με τη γραμμή ' + (gAsm.get(asm)! + 1)
      : gKey.has(key) ? 'Ίδιος με τη γραμμή ' + (gKey.get(key)! + 1)
      : null;
    if (asm && !gAsm.has(asm)) gAsm.set(asm, i);
    if (!gKey.has(key)) gKey.set(key, i);
    return err;
  });
}

// Επικόλληση από Excel ή Word (στήλες με Tab, γραμμές με Enter). Με γραμμή επικεφαλίδων («Επώνυμο», «Όνομα»…) οι στήλες
// βρίσκονται από τα ονόματά τους, όπως στην εισαγωγή του Δυναμολογίου· αλλιώς μπαίνουν με τη σειρά από τη στήλη του κέρσορα.
// null: απλό κείμενο ενός κελιού, που επικολλάται κανονικά
export function parsePaste(text: string, startCol: number): Partial<QaRow>[] | null {
  if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return null;
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.split('\t').map(clean));
  while (lines.length && lines[lines.length - 1].every(c => !c)) lines.pop();
  if (!lines.length) return null;
  // επικεφαλίδες σε μία από τις πρώτες γραμμές
  for (let h = 0; h < Math.min(lines.length, 5); h++) {
    const cols: Partial<Record<QaKey, number>> = {};
    lines[h].forEach((v, c) => {
      const f = HEADERS.find(([, re]) => re.test(norm(v)))?.[0] as QaKey | undefined;
      if (f && (QA_COLS as readonly string[]).includes(f) && cols[f] == null) cols[f] = c;
    });
    if (cols.last == null || cols.first == null) continue;
    return lines.slice(h + 1).map(l => Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, l[c as number] || '']))).filter(r => r.last || r.first);
  }
  // χωρίς επικεφαλίδες: πρώτη στήλη Α/Α (1, 2, 3…) πριν από το επώνυμο ή τον βαθμό δεν είναι δική μας
  const aa = lines.every(l => /^\d{1,3}\.?$/.test(l[0] || '')) && QA_COLS[startCol] !== 'asm' && QA_COLS[startCol] !== 'phone' && QA_COLS[startCol] !== 'room';
  return lines.map(l => {
    const cells = aa ? l.slice(1) : l; const r: Partial<QaRow> = {};
    cells.forEach((v, j) => { const k = QA_COLS[startCol + j]; if (k) r[k] = v; });
    return r;
  }).filter(r => Object.values(r).some(Boolean));
}
