// Ονόματα αρχείων (Michael, 13/11): δικό σου όνομα, διαχωριστικό και μορφή ημερομηνίας για τα αρχεία που βγάζει η εφαρμογή.
// Χωρίς ρυθμίσεις βγαίνουν ακριβώς τα ίδια ονόματα με πριν: κάθε αρχείο κρατά τη δική του προεπιλεγμένη μορφή.
import { HK_MON, type ISODate } from './dates';
import { reportOf } from './unit';
import { imerTitle } from './imer';
import { essoName } from './esso';
import { KIND, type ListKind } from './sources';
import { frouraFile, isOutsAll, phaseName, type Phase, type Settings } from './domain';

export type DateFmt = 'd-m-Y' | 'd-m-y' | 'd.m.Y' | 'd.m.y' | 'd Mon y' | 'd MON Y' | 'Y-m-d';
export type FileSep = ' ' | '-' | '.' | '_';
export type FileId = 'froura' | 'frouraSpen' | 'hkai' | 'outs' | 'hd' | 'weapons' | 'roster' | 'lists' | 'cadre' | 'imer' | 'check' | 'report';
export interface FileNames { date?: DateFmt; per?: Partial<Record<FileId, { name?: string; sep?: FileSep; date?: DateFmt }>> }

const MON = ['Ιαν', 'Φεβ', 'Μάρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'];
export const DATE_FMTS: DateFmt[] = ['d-m-Y', 'd-m-y', 'd.m.Y', 'd.m.y', 'd Mon y', 'd MON Y', 'Y-m-d'];
export const FILE_SEPS: [FileSep, string][] = [[' ', 'κενό'], ['-', 'παύλα'], ['.', 'τελεία'], ['_', 'κάτω παύλα']];

// Μία ημερομηνία στη μορφή f· year = false: χωρίς χρονιά (η αρχή του ΠΣΚ: «14-11 έως 16-11-2026»), εκτός από το Y-m-d
export function fmtDate(d: ISODate, f: DateFmt, year = true): string {
  const y = d.slice(0, 4), m = d.slice(5, 7), dd = d.slice(8, 10), mi = +m - 1;
  switch (f) {
    case 'd-m-y': return dd + '-' + m + (year ? '-' + y.slice(2) : '');
    case 'd.m.Y': return dd + '.' + m + (year ? '.' + y : '');
    case 'd.m.y': return dd + '.' + m + (year ? '.' + y.slice(2) : '');
    case 'd Mon y': return dd + ' ' + MON[mi] + (year ? ' ' + y.slice(2) : '');
    case 'd MON Y': return dd + ' ' + HK_MON[mi] + (year ? ' ' + y : '');
    case 'Y-m-d': return y + '-' + m + '-' + dd;
    default: return dd + '-' + m + (year ? '-' + y : '');
  }
}
// Η μορφή που είχε κάθε αρχείο μέχρι τώρα: μόνο η ΗΚΑΙ γράφει «13.11.26»
const OLD_FMT: Partial<Record<FileId, DateFmt>> = { hkai: 'd.m.y' };
const stemOf: Record<FileId, (st: Settings) => string> = {
  froura: st => frouraFile(st, 'sven').trim(), frouraSpen: st => frouraFile(st, 'spen').trim(), hkai: st => reportOf(st),
  outs: st => (isOutsAll(st) ? 'ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ' : 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ'), hd: () => 'ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ', weapons: () => 'ΟΠΛΙΣΜΟΣ', roster: () => 'ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ',
  lists: () => 'ΔΥΝΑΜΟΛΟΓΙΟ ΚΑΤΑΣΤΑΣΕΙΣ', cadre: () => 'ΔΥΝΑΜΙΚΟ ΣΤΕΛΕΧΩΝ', imer: st => imerTitle(st), check: () => 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ', report: () => 'ΕΝΤΥΠΟ',
};
export const defaultStem = (st: Settings, id: FileId): string => stemOf[id](st);

// Οι γραμμές του πίνακα στις Ρυθμίσεις (με τη σειρά): όνομα στην οθόνη και κατάληξη
export const FILE_ROWS = (st: Settings): { id: FileId; label: string; ext: string }[] => [
  { id: 'froura', label: 'Φρουρά (ΣΒΕΝ)', ext: 'xlsx' }, { id: 'frouraSpen', label: 'Φρουρά (' + phaseName(st, 'spen') + ')', ext: 'xlsx' },
  { id: 'hkai', label: reportOf(st), ext: 'xlsx' }, { id: 'outs', label: 'Εξοδούχοι / Παραμένοντες', ext: 'xlsx' },
  { id: 'hd', label: 'Ημερήσια Διαταγή (Excel, Word)', ext: 'docx' }, { id: 'weapons', label: 'Οπλισμός', ext: 'xlsx' },
  { id: 'roster', label: 'Συνολικό Δυναμολόγιο', ext: 'xlsx' }, { id: 'lists', label: 'Δυναμολόγιο καταστάσεις', ext: 'xlsx' },
  { id: 'cadre', label: 'Δυναμικό στελεχών', ext: 'xlsx' }, { id: 'imer', label: 'Ημερολόγιο κωλυομένων', ext: 'xlsx' },
  { id: 'check', label: 'Έλεγχος υπηρεσιών (μήνας)', ext: 'xlsx' },
];
// Χωρίς \ / : * ? " < > | (και χωρίς κενά στις άκρες)
export const safeName = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '-').trim();

type When = ISODate | { from: ISODate; to: ISODate; psk?: boolean } | { text: string } | null;
// Το όνομα του αρχείου. defaultStem: το όνομα όπως ήταν (χωρίς ημερομηνία)· date: μέρα, διάστημα (psk: «ΠΣΚ 14-11 έως 16-11-2026»),
// {text} (π.χ. ο μήνας του Έλεγχου υπηρεσιών) ή null (χωρίς ημερομηνία)
export function fileName(st: Pick<Settings, 'fileNames'>, id: FileId, defaultStem: string, date: When, ext: string): string {
  const fn = st.fileNames; const own = id === 'report' ? undefined : fn?.per?.[id];
  const stem = safeName(own?.name || '') || defaultStem.trim(); const sep = own?.sep ?? ' ';
  const f = own?.date ?? fn?.date ?? OLD_FMT[id] ?? 'd-m-Y';
  let tail = '';
  if (typeof date === 'string') tail = fmtDate(date, f);
  else if (date && 'text' in date) tail = date.text;
  else if (date) tail = (date.psk ? 'ΠΣΚ ' : '') + fmtDate(date.from, f, !date.psk) + ' έως ' + fmtDate(date.to, f);
  return stem + (tail ? sep + tail : '') + ext.replace(/^\.?/, '.');
}
// Όνομα αρχείου του είδους id με το προεπιλεγμένο όνομά του
export const fileNameOf = (st: Settings, id: FileId, date: When, ext = 'xlsx') => fileName(st, id, defaultStem(st, id), date, ext);
// Η Φρουρά του εντύπου ph (ΣΒΕΝ ή ΣΠΕΝ/δικό σου): το ίδιο «ΦΡΟΥΡΑ …» με πριν
export const frouraName = (st: Settings, ph: Phase, date: When, ext = 'xlsx') => fileName(st, ph === 'sven' ? 'froura' : 'frouraSpen', frouraFile(st, ph), date, ext);

// «Νέο αρχείο…» (Ρυθμίσεις › Αρχεία Excel): το όνομα που παίρνει ένα νέο αρχείο αν δεν γράψεις δικό σου
export function newStem(st: Settings, kind: ListKind, day: ISODate): string {
  const es = st.essos ? essoName(st.essos) : '';
  if (kind === 'duties') return 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + (es || day.slice(0, 4));
  return kind === 'people' ? ('ΔΥΝΑΜΟΛΟΓΙΟ ' + es + ' ' + (st.unitName || '')).replace(/\s+/g, ' ').trim() : KIND[kind].title;
}
