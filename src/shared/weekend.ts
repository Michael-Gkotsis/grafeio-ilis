// Σαββατοκύριακο και επιστροφές (Michael, 18/10): «ΔΝ ΣΚ» το Σάββατο = ΔΝ το Σάββατο και εξοδούχος την Κυριακή, και
// για όσους λείπουν, πότε πρέπει να γυρίσουν (νωρίτερα αν έχουν υπηρεσία). Οι παρατηρήσεις των εξοδούχων και των
// παραμενόντων γράφονται δίπλα στην κατάσταση, σε παρένθεση: «ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)».
import { TYPES, type AppState, type Person, type Status } from './domain';
import { activePeople, postOf, postSpan, statusesOn } from './rules';
import { addDays, dm, parseD, DOW_FULL, type ISODate } from './dates';
import { hasTimes } from './hours';

// Το είδος («kind») της ΔΝ του Σαββάτου και της εξόδου της Κυριακής που μπήκε μόνη της από αυτήν
export const WK = 'ΣΚ';
export const isSat = (d: ISODate) => parseD(d).getDay() === 6;
export const isWk = (s: Pick<Status, 'type' | 'kind'>) => TYPES[s.type].cat === 'out' && s.kind === WK;
// «ΔΝ ΣΚ» στα κείμενα της εφαρμογής και στο Excel· αλλιώς ΔΝ / Εξοδούχος
export const outLbl = (s: Pick<Status, 'type' | 'kind'>) => (isWk(s) ? 'ΔΝ ΣΚ' : TYPES[s.type].label);

// Παρατήρηση της μέρας δίπλα σε ό,τι γράφει η εφαρμογή: «ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)», ή σκέτη αν δεν υπάρχει κάτι άλλο
export const withNote = (auto: string, note?: string) => { const n = (note || '').trim(); return !n ? auto : auto ? auto + ' (' + n + ')' : n; };
export const outNoteOf = (s: Pick<AppState, 'outNotes'>, d: ISODate, pid: number) => s.outNotes?.[d]?.[pid] || '';

// Η υπηρεσία του τη μέρα d και από τι ώρα (της θέσης· η μαγειρεία και η ΤΑΕ δεν έχουν ώρα: «πρωί»)
export function dutyAt(s: AppState, d: ISODate, pid: number): { label: string; time: string } | null {
  const post = postOf(s, d, pid); if (!post) return null;
  const st = postSpan(post).start;
  const time = st == null ? '' : String(Math.floor((st % 1440) / 60)).padStart(2, '0') + ':' + String(st % 60).padStart(2, '0');
  return { label: post.label, time };
}

// Πότε γυρίζει όποιος λείπει τη μέρα d. day: η μέρα της επιστροφής· time: ως τι ώρα· part: πρωί/βράδυ όταν δεν
// ξέρουμε ώρα· duty: γυρίζει για υπηρεσία (νωρίτερα από τη λήξη, ή αμέσως μετά από ΔΝ), dutyTime: από τι ώρα·
// open: χωρίς λήξη.
export interface Back { p: Person; st: Status; day: ISODate; time: string; part: '' | 'πρωί' | 'βράδυ'; why: string; duty?: string; dutyTime?: string; open?: boolean }
const MAX_DAYS = 120;
export function returnsOn(s: AppState, d: ISODate): Back[] {
  const out: Back[] = [];
  const away = (pid: number, x: ISODate) => statusesOn(s.statuses, pid, x).filter(y => TYPES[y.type].away && !y.pending);
  for (const p of activePeople(s)) {
    const now = away(p.id, d); if (!now.length) continue;
    const st = now.find(y => TYPES[y.type].cat !== 'out') || now[0];
    let last = d, lastSt = st, back: Back | null = null;
    for (let i = 0, x = d; i < MAX_DAYS; i++, x = addDays(x, 1)) {
      const a = away(p.id, x); if (!a.length) break;
      last = x; lastSt = a.find(y => TYPES[y.type].cat !== 'out') || a[0];
      if (lastSt.open) { back = { p, st, day: x, time: '', part: '', why: 'χωρίς λήξη', open: true }; break; }
      // υπηρεσία μέσα στις μέρες που λείπει (π.χ. ΔΝ ΣΚ και τον έβαλες την Κυριακή): γυρίζει γι' αυτήν
      const duty = i > 0 && dutyAt(s, x, p.id);
      if (duty) { back = { p, st, day: x, time: duty.time, part: duty.time ? '' : 'πρωί', why: 'υπηρεσία', duty: duty.label }; break; }
    }
    if (!back) {
      const t = TYPES[lastSt.type];
      if (lastSt.type === 'OUT') back = { p, st, day: last, time: '', part: 'βράδυ', why: isWk(lastSt) ? 'τέλος ΔΝ ΣΚ' : 'τέλος εξόδου' };
      else if (lastSt.toTime && hasTimes(lastSt.type)) back = { p, st, day: last, time: lastSt.toTime, part: '', why: 'τέλος ' + t.label };
      else back = { p, st, day: addDays(last, 1), time: '', part: 'πρωί', why: lastSt.type === 'DN' ? 'μετά τη ΔΝ' : 'τέλος ' + t.label };
      // την επόμενη μέρα έχει υπηρεσία: το λέμε, με την ώρα της
      const duty = dutyAt(s, back.day, p.id);
      if (duty) Object.assign(back, { why: 'υπηρεσία', duty: duty.label, dutyTime: duty.time }, back.time && duty.time && duty.time < back.time ? { time: duty.time } : {});
    }
    out.push(back);
  }
  const ord = (b: Back) => (b.open ? '9' : b.day + (b.duty ? '0' : '1') + (b.time || (b.part === 'πρωί' ? '00:00' : '23:59')));
  return out.sort((a, b) => ord(a).localeCompare(ord(b)) || a.p.last.localeCompare(b.p.last, 'el'));
}
// «Κυριακή 19/10 ως 14:00 · Λ/Υ», «Κυριακή 19/10 βράδυ · τέλος εξόδου»
export const backDay = (b: Back) => (b.open ? 'Χωρίς λήξη' : DOW_FULL[parseD(b.day).getDay()] + ' ' + dm(b.day));
export const backWhen = (b: Back) => (b.open ? 'χωρίς λήξη' : (b.time ? 'ως ' + b.time : b.part) + ' · ' + (b.duty ? b.duty + (b.dutyTime && !b.time ? ' από ' + b.dutyTime : '') : b.why));
export const backTxt = (b: Back) => (b.open ? 'χωρίς λήξη' : backDay(b) + ' ' + backWhen(b));
