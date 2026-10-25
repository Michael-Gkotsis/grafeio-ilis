// Έντυπα › σελίδα δημιουργίας: καθαρή λογική (διαδρομή, δείγμα προεπισκόπησης, σελίδες) χωρίς React και χωρίς Node, για να ελέγχεται με tests.
// Το δείγμα ισχύει ΜΟΝΟ στην προεπισκόπηση: δεν μπαίνει στο έντυπο (Report), ούτε φτάνει στο βγάλσιμο (rep:run).
import type { Report } from './reports';

export const PV_SAMPLES = [5, 10, 20, 0] as const;   // πόσες γραμμές δείχνει κάθε πίνακας· 0 = όλοι
export const PV_SAMPLE_DEF = 10;
export const PV_MAX = 400;    // «Όλοι»: ως τόσες γραμμές ανά πίνακα στην προεπισκόπηση (το έντυπο που βγαίνει δεν έχει όριο εδώ)
export const PV_PAGES = 12;   // πόσες σελίδες ζωγραφίζει η προεπισκόπηση το πολύ
export const sampleName = (n: number) => (n > 0 ? String(n) : 'Όλοι');
export const pvCap = (n: number) => (n > 0 ? n : PV_MAX);
export const cutSample = <T>(rows: T[], n: number): T[] => rows.slice(0, pvCap(n));
export interface PvCount { shown: number; total: number }
// «Δείγμα: 5 από 130»· τίποτα όταν φαίνονται όλοι
export const sampleText = (c?: PvCount) => (c && c.shown < c.total ? 'Δείγμα: ' + c.shown + ' από ' + c.total : '');
// ανά έντυπο, μέσα στη συνεδρία (όχι στο αρχείο του εντύπου)
const samples = new Map<string, number>();
export const getSample = (id: string) => samples.get(id) ?? PV_SAMPLE_DEF;
export const setSample = (id: string, n: number) => { samples.set(id, n); };

// σελίδες της προεπισκόπησης: ‹ Σελίδα 2 από 5 ›
export const shownPages = (pages: number) => Math.min(Math.max(0, pages), PV_PAGES);
export const clampPage = (p: number, pages: number) => Math.max(1, Math.min(p, Math.max(1, shownPages(pages))));
export const pageText = (p: number, pages: number) => 'Σελίδα ' + clampPage(p, pages) + ' από ' + pages;

// διαδρομή: ποιο έντυπο ανοίγει η σελίδα (param repForm της οθόνης Έντυπα)· id: υπάρχον έντυπο, αλλιώς νέο
export const FORM_PARAM = 'repForm';
export interface FormArg { id?: string; start?: 'upload' | 'build' | 'tpl'; preset?: string; tpl?: string }
export interface FormOpen { arg: FormArg; r?: Report; key: string }
export function formOpen(params: Record<string, any>, reports: Report[]): FormOpen | null {
  const a = params[FORM_PARAM]; if (!a || typeof a !== 'object') return null;
  const arg: FormArg = {};
  if (typeof a.id === 'string') arg.id = a.id;
  if (a.start === 'upload' || a.start === 'build' || a.start === 'tpl') arg.start = a.start;
  if (typeof a.preset === 'string') arg.preset = a.preset;
  if (typeof a.tpl === 'string') arg.tpl = a.tpl;
  if (arg.id == null) return { arg, key: 'new:' + (arg.start || '') + ':' + (arg.preset || arg.tpl || '') + ':' + (typeof a.n === 'number' ? a.n : 0) };
  const r = reports.find(x => x.id === arg.id);
  return r ? { arg, r, key: arg.id } : null;   // έντυπο που δεν υπάρχει πια (σβήστηκε): σαν να μην ζητήθηκε σελίδα
}
// νέο έντυπο: το n αλλάζει κάθε φορά, ώστε δεύτερο «Νέο έντυπο» να ξεκινά καθαρό
export const newForm = (arg: Omit<FormArg, 'id'> = {}): Record<string, any> => ({ [FORM_PARAM]: { ...arg, n: Date.now() } });
export const editForm = (id: string): Record<string, any> => ({ [FORM_PARAM]: { id } });
export const noForm = (): Record<string, any> => ({ [FORM_PARAM]: undefined });
