// The remarks of an out.
//
// Purpose: `outsNote` (ΔΝ, duty of the next day, leave, remark of the day, return).
// Does NOT: place the outs into a sheet (outs.ts, outsAllSheet.ts).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: both formats of the Εξοδούχοι need it; its own file keeps outs.ts and outsAll.ts from importing each other
//   (Phase 4.9a, verbatim).
// Covering test: test/outs-fmt.test.ts, test/outs-consumers.test.ts and test/weekend.test.ts.
import { addDays, parseD, DOW_FULL, type ISODate } from '../../../shared/dates';
import { retFor, retNote } from '../../../shared/returns';
import { dutyAt, isWk, leaveStart, leaveText, outLbl, outNoteOf, withNote } from '../../../shared/weekend';
import { norm } from '../../../shared/text';
import type { AppState, Status } from '../../../shared/domain';

/**
 * The remarks of an out: ΔΝ / ΔΝ ΣΚ, the duty of the next day (he returns in the morning for it), the leave that starts
 * on the day of the ΔΝ or the next, and the remark of the day in parentheses, and at the end when he returns (and the
 * correction of the office): "ΔΝ ΣΚ, ΥΠΗΡΕΣΙΑ ΚΥΡΙΑΚΗ Λ/Υ 14:00, ΑΔΕΙΑ ΑΠΟ ΔΕΥΤΕΡΑ 19/10 (ΙΑΤΡΟΣ ΣΤΕΠ), ΓΥΡΝΑ ΚΥΡΙΑΚΗ
 * 18/10 06:00 (Λ/Υ ΑΠΟ 14:00)". `ret` false: in the "Όλη η δύναμη" format the return is in the ΓΥΡΝΑ column.
 */
export function outsNote(s: AppState, d: ISODate, pid: number, st: Status, ret = true): string {
  const duty = st.type === 'DN' ? dutyAt(s, addDays(d, 1), pid) : null;
  const lv = st.type === 'DN' ? leaveStart(s, d, pid) : undefined;
  const auto = [
    st.type === 'DN' ? outLbl(st) : isWk(st) ? 'ΔΝ ΣΚ' : '',
    duty &&
      'ΥΠΗΡΕΣΙΑ ' + DOW_FULL[parseD(addDays(d, 1)).getDay()] + ' ' + duty.label + (duty.time ? ' ' + duty.time : ''),
    lv && leaveText(lv),
  ]
    .filter(Boolean)
    .join(', ');
  // at the end when he returns (retFor, with the same words as the screen "Ποιοι γυρίζουν και πότε"; also when his
  // leave ends today); ret = false: in the "Όλη η δύναμη" format the return is in the ΓΥΡΝΑ column
  const r = ret ? retFor(s, pid, d) : null;
  return [norm(withNote(auto, outNoteOf(s, d, pid))), r && norm(retNote(r))].filter(Boolean).join(', ');
}
