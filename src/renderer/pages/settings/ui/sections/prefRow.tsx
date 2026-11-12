// One «label, help, control» row of a settings card.
// Purpose: `prefRow(label, help, ctl)`, the `.pref` row that «Γράμματα Excel» and «Ώρα» build their cards from.
// Does NOT: hold state or know the control; it is a plain function, not a component, so no render boundary is added.
// Owner layer: renderer/pages/settings. Why: the two cards had the same local `row` in screens/settings.ts; moved here
//   (Phase 6, S4) once instead of twice, with the markup unchanged.
// Covering test: test/screens-settings-guide.test.ts.
import type { ReactNode } from 'react';

/**
 * @param label - bold label, Greek
 * @param help - small help under the label
 * @param ctl - the control on the right
 */
export function prefRow(label: string, help: string, ctl: ReactNode) {
  return (
    <div className="pref">
      <div>
        <b>{label}</b>
        <small>{help}</small>
      </div>
      {ctl}
    </div>
  );
}
