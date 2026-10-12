// Ημερομηνίες ως 'YYYY-MM-DD' (τοπική ώρα). Μεσημέρι για να μη μας επηρεάζει η θερινή ώρα.
export type ISODate = string;

export const iso = (dt: Date): ISODate => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
export const today = (): ISODate => iso(new Date());
export const parseD = (s: ISODate): Date => new Date(s + 'T12:00:00');
// Οι κανόνες ρωτούν τις ίδιες γειτονικές μέρες χιλιάδες φορές σε κάθε αυτόματη συμπλήρωση: κρατιούνται, χωρίς νέο Date
const addMemo = new Map<string, ISODate>();
export const addDays = (s: ISODate, n: number): ISODate => {
  const k = s + '|' + n; let r = addMemo.get(k);
  if (r === undefined) {
    const x = parseD(s); x.setDate(x.getDate() + n); r = iso(x);
    if (addMemo.size > 50000) addMemo.clear();
    addMemo.set(k, r);
  }
  return r;
};
export const daysBetween = (a: ISODate, b: ISODate): number => Math.round((parseD(b).getTime() - parseD(a).getTime()) / 864e5) + 1;

export const DOW = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
export const DOW_FULL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
export const DOW_GEN = ['Κυριακής', 'Δευτέρας', 'Τρίτης', 'Τετάρτης', 'Πέμπτης', 'Παρασκευής', 'Σαββάτου'];
export const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
export const MON_SHORT = ['ΙΑΝ', 'ΦΕΒ', 'ΜΑΡ', 'ΑΠΡ', 'ΜΑΪ', 'ΙΟΥΝ', 'ΙΟΥΛ', 'ΑΥΓ', 'ΣΕΠ', 'ΟΚΤ', 'ΝΟΕ', 'ΔΕΚ'];
// Στρατιωτική μορφή «04 Δεκ 25»
export const MON_MIL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

export const dm = (s: ISODate): string => { const x = parseD(s); return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0'); };
export const dmy = (s: ISODate): string => dm(s) + '/' + parseD(s).getFullYear();
export const dmyy = (s: ISODate): string => dm(s) + '/' + String(parseD(s).getFullYear()).slice(2);
export const milDate = (s: ISODate): string => { const x = parseD(s); return String(x.getDate()).padStart(2, '0') + ' ' + MON_MIL[x.getMonth()] + ' ' + String(x.getFullYear()).slice(2); };
export const dow = (s: ISODate): string => DOW[parseD(s).getDay()];
export const fileDate = (s: ISODate): string => dm(s).replace('/', '-');
export const dayName = (s: ISODate, ref: ISODate = today()): string =>
  s === ref ? 'Σήμερα' : s === addDays(ref, 1) ? 'Αύριο' : s === addDays(ref, -1) ? 'Χθες' : dow(s) + ' ' + dm(s);
export const nowHM = (): string => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
// Ημέρα της εβδομάδας με αριθμητική (Sakamoto), χωρίς Date: 0 = Κυριακή
const SAK = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
export const weekday = (d: ISODate): number => { let y = +d.slice(0, 4); const m = +d.slice(5, 7), dd = +d.slice(8, 10); if (m < 3) y--; return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + SAK[m - 1] + dd) % 7; };
export const isWeekend = (d: ISODate): boolean => { const w = weekday(d); return w === 0 || w === 6; };

// Φρουρά ΠΣΚ: Παρασκευή, Σάββατο, Κυριακή του ΣΚ στο οποίο ανήκει η μέρα (Παρ/Σαβ/Κυρ), αλλιώς του επόμενου
export const pskDays = (d: ISODate): ISODate[] => { const w = parseD(d).getDay(); const fri = addDays(d, w === 5 ? 0 : w === 6 ? -1 : w === 0 ? -2 : 5 - w); return [fri, addDays(fri, 1), addDays(fri, 2)]; };
