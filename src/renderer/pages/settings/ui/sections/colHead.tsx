// The head cell of a duty column in the Σ.Ι. and Καταστάσεις tables.
// Purpose: `colHead`, passed to `cols.map`.
// Does NOT: know the rows (ui/sections/SiCard.tsx and StatCard.tsx).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/si.ts (Phase 6); a plain function, not a
//   component, so the table renders as before.
// Covering test: test/screens-settings-guide.test.ts.
import type { DutyCol } from '../../model/dutyCols';

/** `<th>` with the duty name and the «ένοπλη» / «μόνο …» tags. */
export const colHead = (b: DutyCol) => (
  <th key={b.id} data-tip={b.name}>
    {b.name}
    {b.armed && <span className="sigrid__tag">ένοπλη</span>}
    {b.only && <span className="sigrid__tag">μόνο {b.only}</span>}
  </th>
);
