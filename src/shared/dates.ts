// Ημερομηνίες ως 'YYYY-MM-DD' (τοπική ώρα). Μεσημέρι για να μη μας επηρεάζει η θερινή ώρα.
export type ISODate = string;

export const iso = (dt: Date): ISODate => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
export const today = (): ISODate => iso(new Date());
export const parseD = (s: ISODate): Date => new Date(s + 'T12:00:00');
// Οι κανόνες ρωτούν τις ίδιες γειτονικές μέρες χιλιάδες φορές σε κάθε αυτόματη συμπλήρωση: αριθμός ημέρας (από
// 1/1/1970, με αριθμητική, χωρίς Date) ανά ημερομηνία και ημερομηνία ανά αριθμό, κρατημένα
const ordMemo = new Map<ISODate, number>(); const isoMemo = new Map<number, ISODate>();
const ordOf = (s: ISODate): number => {
  let r = ordMemo.get(s);
  if (r === undefined) {
    let y = +s.slice(0, 4); const m = +s.slice(5, 7), d = +s.slice(8, 10); y -= m <= 2 ? 1 : 0;
    const era = Math.floor(y / 400), yoe = y - era * 400, doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    r = era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
    if (ordMemo.size > 50000) ordMemo.clear();
    ordMemo.set(s, r);
  }
  return r;
};
const isoOf = (z: number): ISODate => {
  let r = isoMemo.get(z);
  if (r === undefined) {
    const t = z + 719468, era = Math.floor(t / 146097), doe = t - era * 146097, yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9), y = yoe + era * 400 + (m <= 2 ? 1 : 0);
    r = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    if (isoMemo.size > 50000) isoMemo.clear();
    isoMemo.set(z, r);
  }
  return r;
};
export const addDays = (s: ISODate, n: number): ISODate => isoOf(ordOf(s) + n);
export const daysBetween = (a: ISODate, b: ISODate): number => Math.round((parseD(b).getTime() - parseD(a).getTime()) / 864e5) + 1;

export const DOW = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
export const DOW_FULL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
export const DOW_GEN = ['Κυριακής', 'Δευτέρας', 'Τρίτης', 'Τετάρτης', 'Πέμπτης', 'Παρασκευής', 'Σαββάτου'];
export const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
export const MON_SHORT = ['ΙΑΝ', 'ΦΕΒ', 'ΜΑΡ', 'ΑΠΡ', 'ΜΑΪ', 'ΙΟΥΝ', 'ΙΟΥΛ', 'ΑΥΓ', 'ΣΕΠ', 'ΟΚΤ', 'ΝΟΕ', 'ΔΕΚ'];
// Στρατιωτική μορφή «04 Δεκ 25»
export const MON_MIL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

// ΗΚΑΙ (Michael, 17/10): «15 ΟΚΤ 26» και «ΠΑΡ 16 ΟΚΤ 26», αντί για 15/10/2026
export const HK_MON = ['ΙΑΝ', 'ΦΕΒ', 'ΜΑΡ', 'ΑΠΡ', 'ΜΑΙ', 'ΙΟΥΝ', 'ΙΟΥΛ', 'ΑΥΓ', 'ΣΕΠ', 'ΟΚΤ', 'ΝΟΕ', 'ΔΕΚ'];
export const HK_DOW = ['ΚΥΡ', 'ΔΕΥ', 'ΤΡΙ', 'ΤΕΤ', 'ΠΕΜ', 'ΠΑΡ', 'ΣΑΒ'];
export const hkDate = (s: ISODate): string => s.slice(8, 10) + ' ' + HK_MON[+s.slice(5, 7) - 1] + ' ' + s.slice(2, 4);
export const hkDay = (s: ISODate): string => HK_DOW[weekday(s)] + ' ' + hkDate(s);

export const dm = (s: ISODate): string => { const x = parseD(s); return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0'); };
export const dmy = (s: ISODate): string => dm(s) + '/' + parseD(s).getFullYear();
// «21/10», «21.10.26», «21-10-2026» → εεεε-μμ-ηη· χωρίς χρονιά: η χρονιά του ref. null αν δεν είναι σωστή μέρα (π.χ. 31/02)
export function parseDmy(s: string, ref: ISODate): ISODate | null {
  const m = /^\s*(\d{1,2})\s*[/.\- ]\s*(\d{1,2})(?:\s*[/.\- ]\s*(\d{2}|\d{4}))?\s*$/.exec(s); if (!m) return null;
  const d = +m[1], mo = +m[2], y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +ref.slice(0, 4);
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(y, mo, 0).getDate()) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
export const dmyy = (s: ISODate): string => dm(s) + '/' + String(parseD(s).getFullYear()).slice(2);
export const milDate = (s: ISODate): string => { const x = parseD(s); return String(x.getDate()).padStart(2, '0') + ' ' + MON_MIL[x.getMonth()] + ' ' + String(x.getFullYear()).slice(2); };
export const dow = (s: ISODate): string => DOW[parseD(s).getDay()];
export const fileDate = (s: ISODate): string => dm(s).replace('/', '-');
export const dayName = (s: ISODate, ref: ISODate = today()): string =>
  s === ref ? 'Σήμερα' : s === addDays(ref, 1) ? 'Αύριο' : s === addDays(ref, -1) ? 'Χθες' : dow(s) + ' ' + dm(s);
export const nowMin = (): number => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const nowHM = (): string => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
// Ημέρα της εβδομάδας με αριθμητική (Sakamoto), χωρίς Date: 0 = Κυριακή
const SAK = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
export const weekday = (d: ISODate): number => { let y = +d.slice(0, 4); const m = +d.slice(5, 7), dd = +d.slice(8, 10); if (m < 3) y--; return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + SAK[m - 1] + dd) % 7; };
export const isWeekend = (d: ISODate): boolean => { const w = weekday(d); return w === 0 || w === 6; };

// Φρουρά ΠΣΚ: Παρασκευή, Σάββατο, Κυριακή του ΣΚ στο οποίο ανήκει η μέρα (Παρ/Σαβ/Κυρ), αλλιώς του επόμενου
export const pskDays = (d: ISODate): ISODate[] => { const w = parseD(d).getDay(); const fri = addDays(d, w === 5 ? 0 : w === 6 ? -1 : w === 0 ? -2 : 5 - w); return [fri, addDays(fri, 1), addDays(fri, 2)]; };

// Ορθόδοξο Πάσχα (Meeus, στο ιουλιανό ημερολόγιο, και +13 μέρες για το γρηγοριανό: σωστό για 1900–2099)
export function orthodoxEaster(y: number): ISODate {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const m = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return addDays(y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0'), 13);
}
// Οι επίσημες αργίες ενός έτους: σταθερές και κινητές από το Πάσχα
const FIXED_HOL: [string, string][] = [['01-01', 'Πρωτοχρονιά'], ['01-06', 'Θεοφάνεια'], ['03-25', '25η Μαρτίου'], ['05-01', 'Πρωτομαγιά'], ['08-15', 'Δεκαπενταύγουστος'], ['10-28', '28η Οκτωβρίου'], ['12-25', 'Χριστούγεννα'], ['12-26', 'Σύναξη Θεοτόκου']];
const EASTER_HOL: [number, string][] = [[-48, 'Καθαρά Δευτέρα'], [-2, 'Μεγάλη Παρασκευή'], [1, 'Δευτέρα του Πάσχα'], [50, 'Αγίου Πνεύματος']];
export function greekHolidays(y: number): Record<ISODate, string> {
  const out: Record<ISODate, string> = {};
  for (const [md, n] of FIXED_HOL) out[y + '-' + md] = n;
  const e = orthodoxEaster(y); for (const [k, n] of EASTER_HOL) out[addDays(e, k)] = n;
  return out;
}
