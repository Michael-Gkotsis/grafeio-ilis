// Στελέχη (Michael, 17/10): δική τους καρτέλα, χωριστά από το Δυναμολόγιο των οπλιτών. Οι καταστάσεις τους είναι οι
// στήλες της ΗΚΑΙ (κωλυόμενοι ή απόντες), όχι οι καταστάσεις των οπλιτών. Ίδια λογική για την οθόνη και το Excel.
import { dmy, type ISODate } from './dates';
import type { AppState, Cadre, CadreAbs } from './domain';
import { cadreAbsOf, type UserLists } from './ranks';
import { cadreAbsOn, HK_A, HK_K, HK_NCO, HK_OFFICERS } from './rules';
import { collator, normGreek } from './text';
import type { RosterSheet } from './rosterLists';

// οι γραμμές της ΗΚΑΙ όπου μπαίνει στέλεχος (αξιωματικοί, ανθυπασπιστές, ΔΕΑ, αρχιλοχίες, επιλοχίες, λοχίες)
export const HK_CADRE = [...HK_OFFICERS, ...HK_NCO.slice(0, 3)];
// σειρά της ΗΚΑΙ (βαθμός), μετά επώνυμο
export const byCadreRank = (a: Cadre, b: Cadre) => HK_CADRE.indexOf(a.hk) - HK_CADRE.indexOf(b.hk) || collator.compare(a.last, b.last) || collator.compare(a.first, b.first);

export type CadreGroup = 'kol' | 'apo' | 'list';
export const GROUP_NAME: Record<CadreGroup, string> = { kol: 'Κωλυόμενος', apo: 'Απών', list: 'Μόνο στη λίστα' };
// σε ποια ομάδα της ΗΚΑΙ μετρά μια στήλη (κενή: σε καμία)
export const groupOfCol = (col: string | undefined): CadreGroup => (col && HK_K.some(x => x[0] === col) ? 'kol' : col && HK_A.some(x => x[0] === col) ? 'apo' : 'list');
// η σύντομη επικεφαλίδα της στήλης στο έντυπο (Υπηρ., Κ.Άδ.…)
export const colShort = (col: string) => [...HK_K, ...HK_A].find(x => x[0] === col)?.[1] || '';

export interface CadreStatus { abs: CadreAbs; label: string; col: string; group: CadreGroup }
export function cadreStatusOf(abs: CadreAbs, lists?: UserLists): CadreStatus {
  const k = cadreAbsOf(abs.kind, lists); const col = k?.[2] || '';
  return { abs, label: k?.[1] || abs.kind, col, group: groupOfCol(col) };
}
export function cadreStatusOn(s: Pick<AppState, 'cadreAbs' | 'settings'>, cid: string, d: ISODate): CadreStatus | undefined {
  const a = cadreAbsOn(s, cid, d); return a && cadreStatusOf(a, s.settings.lists);
}
// οι καταστάσεις που δεν έχουν λήξει ως τη μέρα d (η τωρινή και οι επόμενες), με τη σειρά
export const cadreAbsFrom = (s: Pick<AppState, 'cadreAbs'>, cid: string, d: ISODate) => (s.cadreAbs || []).filter(a => a.cid === cid && a.to >= d).sort((a, b) => a.from.localeCompare(b.from));
// επικάλυψη με άλλη κατάσταση του ίδιου (η οθόνη ρωτά πριν τη γράψει στη θέση της)
export const cadreClash = (s: Pick<AppState, 'cadreAbs'>, abs: { id?: string; cid: string; from: ISODate; to: ISODate }) => (s.cadreAbs || []).filter(a => a.id !== abs.id && a.cid === abs.cid && a.from <= abs.to && abs.from <= a.to);

export type CadreFilter = 'all' | 'kol' | 'apo' | 'inactive';
export const CADRE_FILTERS: [CadreFilter, string][] = [['all', 'Όλοι'], ['kol', 'Κωλυόμενοι'], ['apo', 'Απόντες'], ['inactive', 'Εκτός δύναμης']];
export function cadreMatch(f: CadreFilter, c: Cadre, st: CadreStatus | undefined): boolean {
  if (f === 'inactive') return !c.active;
  if (!c.active) return false;
  return f === 'all' || st?.group === f;
}
// αναζήτηση χωρίς τόνους: βαθμός, όνομα, θέση, τηλέφωνο
// ΗΚΑΙ, «Όργανα υπηρεσίας › Αξιωματικοί»: ό,τι γράφτηκε στην οθόνη της ΗΚΑΙ, αλλιώς οι αξιωματικοί (αξιωματικοί, ανθυπασπιστές,
// ΔΕΑ) της καρτέλας Στελέχη που έχουν «Υπηρεσία εντός στρατοπέδου» τη μέρα, με τη σειρά του βαθμού
export function dutyOfficers(s: Pick<AppState, 'cadreList' | 'cadreAbs' | 'settings'>, d: ISODate): string {
  return (s.cadreList || []).filter(c => c.active && HK_OFFICERS.includes(c.hk) && cadreStatusOn(s, c.id, d)?.col === 'yp').sort(byCadreRank)
    .map(c => [c.rank, c.last, c.first].filter(Boolean).join(' ')).join(', ');
}
export const hkOffText = (s: Pick<AppState, 'cadreList' | 'cadreAbs' | 'settings' | 'hkaiManual'>, d: ISODate) => s.hkaiManual?.[d]?.text?.off?.trim() || dutyOfficers(s, d);
export const cadreSearch = (c: Cadre, q: string) => { const k = normGreek(q).trim(); return !k || normGreek([c.rank, c.last, c.first, c.role, c.phone, c.hk].join(' ')).includes(k); };

// Excel «Δυναμικό στελεχών»: όσοι είναι σε δύναμη με την κατάσταση της μέρας, όλες οι καταστάσεις από εκείνη τη μέρα
// και μετά, και όσοι είναι εκτός δύναμης (αν υπάρχουν). Τα κεφαλαία τα βάζει το excel.ts, όπως σε κάθε Excel της εφαρμογής.
export const CADRE_COLS = ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΘΕΣΗ', 'ΤΗΛΕΦΩΝΟ', 'ΓΡΑΜΜΗ ΗΚΑΙ'];
export function cadreSheets(s: AppState, d: ISODate): RosterSheet[] {
  const lists = s.settings.lists; const all = [...(s.cadreList || [])].sort(byCadreRank);
  const cells = (c: Cadre) => [c.rank, c.last, c.first, c.role || '', c.phone || '', c.hk];
  const where = (st: CadreStatus) => (st.group === 'list' ? 'ΜΟΝΟ ΣΤΗ ΛΙΣΤΑ' : (st.group === 'kol' ? 'ΚΩΛΥΟΜΕΝΟΙ' : 'ΑΠΟΝΤΕΣ') + ' · ' + colShort(st.col));
  const active = all.filter(c => c.active);
  const now = active.map((c, i) => {
    const st = cadreStatusOn(s, c.id, d);
    return [i + 1, ...cells(c), st ? st.label : 'ΠΑΡΩΝ', st ? dmy(st.abs.from) : '', st ? dmy(st.abs.to) : ''];
  });
  const rows: (string | number)[][] = [];
  for (const c of active) for (const a of cadreAbsFrom(s, c.id, d)) {
    const st = cadreStatusOf(a, lists);
    rows.push([rows.length + 1, c.rank, c.last, c.first, st.label, where(st), dmy(a.from), dmy(a.to), a.note || '']);
  }
  const out: RosterSheet[] = [
    { name: 'ΣΤΕΛΕΧΗ', title: 'ΔΥΝΑΜΙΚΟ ΣΤΕΛΕΧΩΝ ' + dmy(d), head: [...CADRE_COLS, 'ΚΑΤΑΣΤΑΣΗ', 'ΑΠΟ', 'ΕΩΣ'], rows: now },
    { name: 'ΚΑΤΑΣΤΑΣΕΙΣ', title: 'ΚΑΤΑΣΤΑΣΕΙΣ ΣΤΕΛΕΧΩΝ ΑΠΟ ' + dmy(d), head: ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΚΑΤΑΣΤΑΣΗ', 'ΣΤΗΛΗ ΗΚΑΙ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΗ'], rows }
  ];
  const off = all.filter(c => !c.active);
  if (off.length) out.push({ name: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ', title: 'ΣΤΕΛΕΧΗ ΕΚΤΟΣ ΔΥΝΑΜΗΣ', head: CADRE_COLS, rows: off.map((c, i) => [i + 1, ...cells(c)]) });
  return out;
}
