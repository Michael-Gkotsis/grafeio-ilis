// Texts of a return: the day, the time and the reason.
//
// Purpose: `retDay`, `retWhen`, `retTxt`, `retNote` (Excel remarks), `retLine` (Δύναμη page), `retWhy`.
// Does NOT: compute the return.
// Owner layer: core/outs (no fs, no Electron, no React); imports only from src/core.
// Why: The screen and the Excel remarks use the same words.
// Covering tests: test/returns.test.ts, test/outs-fmt.test.ts.
import { dm, DOW_FULL, weekday } from '../lib/dates';
import type { Ret } from './returns';

/** «Δευτέρα 26/10», or «Χωρίς λήξη» when there is no end. */
export const retDay = (r: Ret) => (r.open ? 'Χωρίς λήξη' : DOW_FULL[weekday(r.day)] + ' ' + dm(r.day));

export const OBVIOUS = /^(πρωινή εκπαίδευση|μένει |μετά τη ΔΝ$|εξοδούχος |ΔΝ ως )/;

/**
 * Why somebody returns (`why`) and what he does after (`leave`): the same words on the screen and in the Remarks of the
 * Excel.
 */
export function retWhy(r: Ret) {
  const w = r.duty ? r.duty + (r.dutyTime && r.dutyTime !== r.time ? ' από ' + r.dutyTime : '') : r.why;
  const why = r.base ? [r.base, r.duty ? 'υπηρεσία ' + w : OBVIOUS.test(w) ? '' : w].filter(Boolean).join(', ') : w;
  return { why, leave: !r.duty && r.leaveAt ? 'φεύγει για άδεια ' + r.leaveAt : '' };
}

/**
 * Time and reason of a return as one text: «06:00 · ΔΝ ως την Κυριακή», «06:00 · μετά τη ΔΝ, φεύγει για άδεια 14:00»,
 * «δεν έχει δηλωθεί η Κυριακή».
 */
export const retWhen = (r: Ret) => {
  if (r.pending) return r.why;
  if (r.open) return 'δεν γυρνά, συνεχίζει' + (r.fix ? ' · ' + r.why : '');
  const { why, leave } = retWhy(r);
  return (r.time || 'πρωί') + ' · ' + why + (leave ? ', ' + leave : '');
};

/** Day, time and reason of a return in one text (`retDay` + `retWhen`). */
export const retTxt = (r: Ret) =>
  r.pending ? r.why : r.open ? 'χωρίς λήξη' + (r.fix ? ' · ' + r.why : '') : retDay(r) + ' ' + retWhen(r);

/**
 * For the Remarks of the Excel (lower case, the capitals are made by the writer): «γυρνά Δευτέρα 27/10 06:00 (ΔΝ ως την
 * Κυριακή)», «γυρνά Τρίτη 28/10 06:00, φεύγει για άδεια 14:00», «δεν έχει δηλωθεί η Δευτέρα 27/10». The out who returns
 * in the evening and the ΔΝ before a leave do not say the obvious «why» (the line already says out / ΔΝ).
 */
export function retNote(r: Ret): string {
  if (r.pending) return r.why + ' ' + dm(r.day);
  if (r.open) return 'δεν γυρνά (' + r.why + ')';
  const { why, leave } = retWhy(r);
  const obvious = !r.duty && (/^εξοδούχος /.test(why) || (!!leave && why === 'μετά τη ΔΝ'));
  return (
    'γυρνά ' + retDay(r) + ' ' + (r.time || 'πρωί') + (obvious ? '' : ' (' + why + ')') + (leave ? ', ' + leave : '')
  );
}

/**
 * For the Δύναμη page (one line per person): «Γυρνά Δευτέρα 27/10 06:00 (ΔΝ ως την Κυριακή)», «Γυρνά Τρίτη 28/10 πρωί
 * (τέλος ΚΑ)», «Γυρνά Τρίτη 28/10 06:00 (υπηρεσία Θ1 από 05:00), φεύγει για άδεια 14:00». Always with the reason.
 */
export function retLine(r: Ret): string {
  if (r.pending) return 'Δεν ξέρουμε πότε γυρνά (' + r.why + ')';
  if (r.open) return 'Δεν γυρνά, συνεχίζει (' + r.why + ')';
  const { why, leave } = retWhy(r);
  return 'Γυρνά ' + retDay(r) + ' ' + (r.time || 'πρωί') + (why ? ' (' + why + ')' : '') + (leave ? ', ' + leave : '');
}
