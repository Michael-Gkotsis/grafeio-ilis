// Ημερομηνίες ως 'YYYY-MM-DD' (τοπική ώρα). Μεσημέρι για να μη μας επηρεάζει η θερινή ώρα.
export type ISODate = string;

export const iso = (dt: Date): ISODate =>
  dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');

// Ρολόι της εφαρμογής: ζώνη ώρας + διόρθωση λεπτών (Ρυθμίσεις › Ώρα και ζώνη ώρας). Μία φορά ανά νήμα (main, worker, UI).
// Το «τώρα» διαβάζεται μόνο από εδώ: today(), nowMin(), nowHM(), nowParts().
export const DEFAULT_TZ = 'Europe/Athens';
export const FIX_MAX = 720;
let clockTz = DEFAULT_TZ,
  clockFix = 0;
const p2 = (n: number) => String(n).padStart(2, '0');
// αλλαγή ρολογιού: ζώνη '' = Αθήνα, 'system' = Windows, αλλιώς όνομα ζώνης (IANA)
export function setClock(o: { tz?: string; fix?: number }): void {
  const tz = (o.tz || '').trim() || DEFAULT_TZ;
  const fix = Math.max(-FIX_MAX, Math.min(FIX_MAX, Math.round(+(o.fix || 0)) || 0));
  if (tz !== clockTz || fix !== clockFix) {
    clockTz = tz;
    clockFix = fix;
    offMemo.clear();
  }
}
export const clockOf = (st?: { tz?: string; clockFix?: number } | null) => setClock({ tz: st?.tz, fix: st?.clockFix });
export const clockZone = (): string => clockTz;
export const clockShift = (): number => clockFix;
// μετατόπιση ζώνης (ms από UTC) ανά τέταρτο ώρας· άκυρη ζώνη → Αθήνα, χωρίς θόρυβο
const fmts = new Map<string, Intl.DateTimeFormat | null>();
const offMemo = new Map<string, [number, number]>();
const fmtOf = (tz: string): Intl.DateTimeFormat | null => {
  let f = fmts.get(tz);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      f = null;
    }
    fmts.set(tz, f);
  }
  return f;
};
export function zoneOffset(tz: string, at: number): number {
  const b = Math.floor(at / 9e5),
    m = offMemo.get(tz);
  if (m && m[0] === b) return m[1];
  const f = fmtOf(tz) || fmtOf(DEFAULT_TZ);
  let off = 0;
  if (f) {
    const o: Record<string, number> = {};
    for (const x of f.formatToParts(new Date(b * 9e5))) if (x.type !== 'literal') o[x.type] = +x.value;
    off = Date.UTC(o.year, o.month - 1, o.day, o.hour % 24, o.minute, o.second) - b * 9e5;
  }
  if (offMemo.size > 8) offMemo.clear();
  offMemo.set(tz, [b, off]);
  return off;
}
export type Parts = { y: number; mo: number; d: number; h: number; mi: number; s: number };
// η ώρα του τοίχου της εφαρμογής (ζώνη + διόρθωση) από στιγμή ms· για 'system' η τοπική ώρα του PC
export function partsAt(ms: number): Parts {
  const t = ms + clockFix * 6e4;
  if (clockTz === 'system') {
    const d = new Date(t);
    return {
      y: d.getFullYear(),
      mo: d.getMonth() + 1,
      d: d.getDate(),
      h: d.getHours(),
      mi: d.getMinutes(),
      s: d.getSeconds(),
    };
  }
  const d = new Date(t + zoneOffset(clockTz, t));
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
  };
}
// κείμενα για την οθόνη: όνομα ζώνης, «UTC+02:00», «1 ώρα και 5 λεπτά»
export const zoneLabel = (tz: string = clockTz): string =>
  tz === DEFAULT_TZ ? 'Ελλάδα, Αθήνα' : tz === 'system' ? 'όπως τα Windows' : tz;
export const utcLabel = (offMs: number): string => {
  const m = Math.round(offMs / 6e4),
    a = Math.abs(m);
  return 'UTC' + (m < 0 ? '−' : '+') + p2(Math.floor(a / 60)) + ':' + p2(a % 60);
};
export const durLabel = (min: number): string => {
  const a = Math.abs(Math.round(min)),
    h = Math.floor(a / 60),
    m = a % 60;
  const hh = h === 1 ? '1 ώρα' : h + ' ώρες',
    mm = m === 1 ? '1 λεπτό' : m + ' λεπτά';
  return h && m ? hh + ' και ' + mm : h ? hh : mm;
};
// η ώρα των Windows (τοπική του PC) και πόσα λεπτά πάει μπροστά η εφαρμογή από αυτήν (αρνητικό: πίσω)
export const osParts = (): Parts => {
  const d = new Date();
  return {
    y: d.getFullYear(),
    mo: d.getMonth() + 1,
    d: d.getDate(),
    h: d.getHours(),
    mi: d.getMinutes(),
    s: d.getSeconds(),
  };
};
const wallMin = (p: Parts) => Math.floor(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) / 6e4);
export const appVsOs = (): number => wallMin(nowParts()) - wallMin(osParts());
export const nowParts = (): Parts => partsAt(Date.now());
export const today = (): ISODate => {
  const p = nowParts();
  return p.y + '-' + p2(p.mo) + '-' + p2(p.d);
};
export const parseD = (s: ISODate): Date => new Date(s + 'T12:00:00');
// Οι κανόνες ρωτούν τις ίδιες γειτονικές μέρες χιλιάδες φορές σε κάθε αυτόματη συμπλήρωση: αριθμός ημέρας (από
// 1/1/1970, με αριθμητική, χωρίς Date) ανά ημερομηνία και ημερομηνία ανά αριθμό, κρατημένα
const ordMemo = new Map<ISODate, number>();
const isoMemo = new Map<number, ISODate>();
const ordOf = (s: ISODate): number => {
  let r = ordMemo.get(s);
  if (r === undefined) {
    let y = +s.slice(0, 4);
    const m = +s.slice(5, 7),
      d = +s.slice(8, 10);
    y -= m <= 2 ? 1 : 0;
    const era = Math.floor(y / 400),
      yoe = y - era * 400,
      doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    r = era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
    if (ordMemo.size > 50000) ordMemo.clear();
    ordMemo.set(s, r);
  }
  return r;
};
const isoOf = (z: number): ISODate => {
  let r = isoMemo.get(z);
  if (r === undefined) {
    const t = z + 719468,
      era = Math.floor(t / 146097),
      doe = t - era * 146097,
      yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)),
      mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1,
      m = mp + (mp < 10 ? 3 : -9),
      y = yoe + era * 400 + (m <= 2 ? 1 : 0);
    r = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    if (isoMemo.size > 50000) isoMemo.clear();
    isoMemo.set(z, r);
  }
  return r;
};
export const addDays = (s: ISODate, n: number): ISODate => isoOf(ordOf(s) + n);
export const daysBetween = (a: ISODate, b: ISODate): number =>
  Math.round((parseD(b).getTime() - parseD(a).getTime()) / 864e5) + 1;

export const DOW = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
export const DOW_FULL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
export const DOW_GEN = ['Κυριακής', 'Δευτέρας', 'Τρίτης', 'Τετάρτης', 'Πέμπτης', 'Παρασκευής', 'Σαββάτου'];
export const MONTHS = [
  'Ιανουάριος',
  'Φεβρουάριος',
  'Μάρτιος',
  'Απρίλιος',
  'Μάιος',
  'Ιούνιος',
  'Ιούλιος',
  'Αύγουστος',
  'Σεπτέμβριος',
  'Οκτώβριος',
  'Νοέμβριος',
  'Δεκέμβριος',
];
export const MON_SHORT = ['ΙΑΝ', 'ΦΕΒ', 'ΜΑΡ', 'ΑΠΡ', 'ΜΑΪ', 'ΙΟΥΝ', 'ΙΟΥΛ', 'ΑΥΓ', 'ΣΕΠ', 'ΟΚΤ', 'ΝΟΕ', 'ΔΕΚ'];
// Στρατιωτική μορφή «04 Δεκ 25»
export const MON_MIL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

// ΗΚΑΙ (Michael, 17/10): «15 ΟΚΤ 26» και «ΠΑΡ 16 ΟΚΤ 26», αντί για 15/10/2026
export const HK_MON = ['ΙΑΝ', 'ΦΕΒ', 'ΜΑΡ', 'ΑΠΡ', 'ΜΑΙ', 'ΙΟΥΝ', 'ΙΟΥΛ', 'ΑΥΓ', 'ΣΕΠ', 'ΟΚΤ', 'ΝΟΕ', 'ΔΕΚ'];
export const HK_DOW = ['ΚΥΡ', 'ΔΕΥ', 'ΤΡΙ', 'ΤΕΤ', 'ΠΕΜ', 'ΠΑΡ', 'ΣΑΒ'];
export const hkDate = (s: ISODate): string => s.slice(8, 10) + ' ' + HK_MON[+s.slice(5, 7) - 1] + ' ' + s.slice(2, 4);
export const hkDay = (s: ISODate): string => HK_DOW[weekday(s)] + ' ' + hkDate(s);

export const dm = (s: ISODate): string => {
  const x = parseD(s);
  return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0');
};
export const dmy = (s: ISODate): string => dm(s) + '/' + parseD(s).getFullYear();
// «21/10», «21.10.26», «21-10-2026» → εεεε-μμ-ηη· χωρίς χρονιά: η χρονιά του ref. null αν δεν είναι σωστή μέρα (π.χ. 31/02)
export function parseDmy(s: string, ref: ISODate): ISODate | null {
  const m = /^\s*(\d{1,2})\s*[/.\- ]\s*(\d{1,2})(?:\s*[/.\- ]\s*(\d{2}|\d{4}))?\s*$/.exec(s);
  if (!m) return null;
  const d = +m[1],
    mo = +m[2],
    y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +ref.slice(0, 4);
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(y, mo, 0).getDate()) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
export const dmyy = (s: ISODate): string => dm(s) + '/' + String(parseD(s).getFullYear()).slice(2);
export const milDate = (s: ISODate): string => {
  const x = parseD(s);
  return String(x.getDate()).padStart(2, '0') + ' ' + MON_MIL[x.getMonth()] + ' ' + String(x.getFullYear()).slice(2);
};
export const dow = (s: ISODate): string => DOW[parseD(s).getDay()];
export const fileDate = (s: ISODate): string => dm(s).replace('/', '-');
export const dayName = (s: ISODate, ref: ISODate = today()): string =>
  s === ref ? 'Σήμερα' : s === addDays(ref, 1) ? 'Αύριο' : s === addDays(ref, -1) ? 'Χθες' : dow(s) + ' ' + dm(s);
export const nowMin = (): number => {
  const p = nowParts();
  return p.h * 60 + p.mi;
};
export const nowHM = (): string => {
  const p = nowParts();
  return p2(p.h) + ':' + p2(p.mi);
};
// Ημέρα της εβδομάδας με αριθμητική (Sakamoto), χωρίς Date: 0 = Κυριακή
const SAK = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
export const weekday = (d: ISODate): number => {
  let y = +d.slice(0, 4);
  const m = +d.slice(5, 7),
    dd = +d.slice(8, 10);
  if (m < 3) y--;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + SAK[m - 1] + dd) % 7;
};
export const isWeekend = (d: ISODate): boolean => {
  const w = weekday(d);
  return w === 0 || w === 6;
};

// Φρουρά ΠΣΚ: Παρασκευή, Σάββατο, Κυριακή του ΣΚ στο οποίο ανήκει η μέρα (Παρ/Σαβ/Κυρ), αλλιώς του επόμενου
export const pskDays = (d: ISODate): ISODate[] => {
  const w = parseD(d).getDay();
  const fri = addDays(d, w === 5 ? 0 : w === 6 ? -1 : w === 0 ? -2 : 5 - w);
  return [fri, addDays(fri, 1), addDays(fri, 2)];
};

// Ορθόδοξο Πάσχα (Meeus, στο ιουλιανό ημερολόγιο, και +13 μέρες για το γρηγοριανό: σωστό για 1900–2099)
export function orthodoxEaster(y: number): ISODate {
  const a = y % 4,
    b = y % 7,
    c = y % 19,
    d = (19 * c + 15) % 30,
    e = (2 * a + 4 * b - d + 34) % 7;
  const m = Math.floor((d + e + 114) / 31),
    day = ((d + e + 114) % 31) + 1;
  return addDays(y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0'), 13);
}
// Οι επίσημες αργίες ενός έτους: σταθερές και κινητές από το Πάσχα
const FIXED_HOL: [string, string][] = [
  ['01-01', 'Πρωτοχρονιά'],
  ['01-06', 'Θεοφάνεια'],
  ['03-25', '25η Μαρτίου'],
  ['05-01', 'Πρωτομαγιά'],
  ['08-15', 'Δεκαπενταύγουστος'],
  ['10-28', '28η Οκτωβρίου'],
  ['12-25', 'Χριστούγεννα'],
  ['12-26', 'Σύναξη Θεοτόκου'],
];
const EASTER_HOL: [number, string][] = [
  [-48, 'Καθαρά Δευτέρα'],
  [-2, 'Μεγάλη Παρασκευή'],
  [1, 'Δευτέρα του Πάσχα'],
  [50, 'Αγίου Πνεύματος'],
];
export function greekHolidays(y: number): Record<ISODate, string> {
  const out: Record<ISODate, string> = {};
  for (const [md, n] of FIXED_HOL) out[y + '-' + md] = n;
  const e = orthodoxEaster(y);
  for (const [k, n] of EASTER_HOL) out[addDays(e, k)] = n;
  return out;
}
// Το πρώτο Σάββατο–Κυριακή που δεν έχει περάσει (Κυριακή: μόνο η σημερινή μέρα), και το επόμενο
export function weekendFrom(today: ISODate, next: boolean): [ISODate, ISODate] {
  const w = weekday(today);
  const sat = w === 6 ? today : w === 0 ? addDays(today, -1) : addDays(today, 6 - w);
  const from = (w === 0 ? today : sat) as ISODate;
  const to = addDays(sat, 1);
  return next ? [addDays(sat, 7), addDays(sat, 8)] : [from, to];
}

export const DAY_CHOICES: { value: string; label: string }[] = [
  { value: '', label: 'Όπως το έντυπο' },
  { value: 'next', label: 'Επόμενη εργάσιμη' },
  { value: '+1', label: 'Αύριο' },
  { value: '+2', label: 'Σε 2 μέρες' },
  { value: '+3', label: 'Σε 3 μέρες' },
  { value: 'wd5', label: 'Η Παρασκευή' },
  { value: 'wd6', label: 'Το Σάββατο' },
  { value: 'wd0', label: 'Η Κυριακή' },
];
// Επόμενη εργάσιμη μέρα μετά τη d (Παρασκευή → Δευτέρα): isOff = Σαββατοκύριακο ή αργία της εφαρμογής (rules.ts isHol)
export function nextWorkday(d: ISODate, isOff: (d: ISODate) => boolean = isWeekend): ISODate {
  let x = addDays(d, 1);
  for (let i = 0; i < 40 && isOff(x); i++) x = addDays(x, 1);
  return x;
}
// «Για ποια μέρα» (Έντυπα): '' = όπως το έντυπο, 'next' = επόμενη εργάσιμη, '+N'/'-N' = N μέρες μετά/πριν, 'wd0'…'wd6' = η πρώτη
// Κυριακή…Σάββατο από τη μέρα του εντύπου και μετά (αυτή η μέρα αν είναι ήδη)
export function dayFor(spec: string | undefined, d: ISODate, isOff: (d: ISODate) => boolean = isWeekend): ISODate {
  if (!spec) return d;
  if (spec === 'next') return nextWorkday(d, isOff);
  if (/^[+-]\d{1,3}$/.test(spec)) return addDays(d, Number(spec));
  const m = /^wd([0-6])$/.exec(spec);
  if (m) {
    let x = d;
    for (let i = 0; i < 7 && weekday(x) !== +m[1]; i++) x = addDays(x, 1);
    return x;
  }
  return d;
}
