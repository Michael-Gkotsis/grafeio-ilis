// What «Άλλαξε στοιχεία…» hands to the declaration dialog.
// Purpose: `declareParamsOf` copies a record's fields into the `nav.declare` params (the `replace` id plus the data).
// Does NOT: open anything; the dialog calls `nav.declare` with the result.
// Owner layer: renderer/features/fix-status. Why: keeps the dialog function under the size limit, same fields as before.
// Covering test: test/status-fix.test.ts.
import { kolColOf, type Status } from '../../../../shared/domain';
import type { RouteParams } from '../../../shared/model';

/**
 * The start state of the declaration for correcting `st`: the old record goes when the new one is saved. A ΣΤΕΠ /
 * κωλυόμενος record also carries its «minus», ΗΚΑΙ column and «noOut» choices.
 */
export const declareParamsOf = (st: Status): RouteParams => ({
  replace: st.id,
  pids: [st.pid],
  type: st.type,
  kind: st.kind,
  from: st.from,
  to: st.to,
  open: st.open,
  note: st.note,
  by: st.by,
  reason: st.reason,
  on: st.on,
  fromTime: st.fromTime,
  toTime: st.toTime,
  dest: st.dest,
  ...(st.type === 'KOL' ? { minus: !!st.minus, hkCol: st.minus ? kolColOf(st) : undefined, noOut: !!st.noOut } : {}),
});
