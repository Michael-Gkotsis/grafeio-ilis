// What the cadre sheet shows, derived from the store.
// Purpose: `cadreSheetView` gives the current and past statuses, the notes groups, the month counter and the weapon text.
// Does NOT: use hooks or change anything; it is a pure function of the state, called once per render.
// Owner layer: renderer/widgets/cadre-sheet. Why: moved verbatim from screens/cadre.ts (Phase 5.3c).
// Covering test: test/cadre.test.ts.
import { cadreAbsFrom } from '../../../../shared/cadre';
import { dm, dow, type ISODate } from '../../../../shared/dates';
import type { AppState, Cadre } from '../../../../shared/domain';
import { personGroups, remLine } from '../../../../shared/notes';
import { cadreSeat, dutyStats, monthTxt } from '../../../../shared/rules';
import { seatTxt } from '../../../../shared/weapons';

const lastDuty = (s: AppState, pid: number) => dutyStats(s).get(pid)?.last || null;

/** The derived values of the sheet. @param today ISODate, local time */
export function cadreSheetView(state: AppState, c: Cadre, today: ISODate) {
  const cid = c.id;
  const lists = state.settings.lists;
  const next = cadreAbsFrom(state, c.id, today);
  const past = state.cadreAbs
    .filter((a) => a.cid === c.id && a.to < today)
    .sort((a, b) => b.from.localeCompare(a.from))
    .slice(0, 8);
  const ng = personGroups(state.notes, { cid }, today);
  const rem = remLine(state.notes, { cid }, today);
  // μετρητής υπηρεσιών του μήνα: κάθε ενεργό στέλεχος (και το «0» όσο δεν έχει μπει ποτέ σε θέση)· ΕΠΟΠ/ΟΒΑ «2 από 4 τον μήνα»
  const month = c.active
    ? c.pid != null
      ? monthTxt(state, today, cadreSeat(c), true) +
        (lastDuty(state, c.pid)
          ? ' · τελευταία ' + dow(lastDuty(state, c.pid)!) + ' ' + dm(lastDuty(state, c.pid)!)
          : '')
      : '0 τον μήνα'
    : '';
  const wtxt = [c.wtype, c.weapon && 'αριθμός ' + c.weapon, (c.rack || c.wpos) && 'θέση ' + seatTxt(c.rack, c.wpos)]
    .filter(Boolean)
    .join(' · ');
  return { lists, next, past, ng, rem, month, wtxt };
}

/** What `cadreSheetView` returns. */
export type CadreSheetView = ReturnType<typeof cadreSheetView>;
