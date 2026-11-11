// The «Δήλωση κατάστασης» dialog: one or more people, four steps.
// Purpose: `DeclareStatusDialog` picks the step and returns that step's Dialog. All state and logic come from
//   `useDeclare` (model/), the markup of each step from personStep / statusStep / whenStep / reviewStep.
// Does NOT: hold logic of its own; run commands (`declareActions` does) or decide where it opens (Ctrl+N, the people
//   card, «Διόρθωση…» and the medical lists open it through `nav.declare`).
// Owner layer: renderer/features/declare-status. Why: it was one 155-line function in screens/people.ts.
// Covering test: test/status-fix.test.ts, test/screens-dialogs-forms.test.ts, test/ux-names.test.ts.
import { useDeclare } from '../model/useDeclare';
import type { DeclareInitial } from '../model/draft';
import { stepChrome } from './chrome';
import { personStep } from './personStep';
import { reviewStep } from './reviewStep';
import { statusStep } from './statusStep';
import { whenStep } from './whenStep';

/** Props of `DeclareStatusDialog`. */
export interface DeclareStatusDialogProps {
  /** What the dialog opens with (people, a group of statuses, a record to correct). */
  initial: DeclareInitial;
  onClose: () => void;
}

/**
 * Declaration of a status for one or more people, in steps: the soldier, the status (for medical ones one or more),
 * from when to when with a remark, and at the end what will change. «Διόρθωση…» opens it with the data of an existing
 * record; saving replaces the old one (`replaceStatus`).
 * @decision Michael, 17/10 and 18/10: steps, soldier first (from a card: status first).
 * @see test/status-fix.test.ts
 */
export function DeclareStatusDialog({ initial, onClose }: DeclareStatusDialogProps) {
  const d = useDeclare(initial, onClose);
  const chrome = stepChrome(d);
  if (d.step === 1) return personStep(d, chrome);
  if (d.step === 2) return statusStep(d, chrome);
  if (d.step === 3) return whenStep(d, chrome);
  return reviewStep(d, chrome);
}
