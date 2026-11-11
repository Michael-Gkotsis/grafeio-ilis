// Shared types of the declaration's model.
// Purpose: `DeclareError`, what the dialog shows in its red/amber box.
// Does NOT: hold any logic.
// Owner layer: renderer/features/declare-status. Why: state.ts, actions.ts and the UI all name it.
// Covering test: test/status-fix.test.ts.
import type { StatusPlan } from '../../../../core/duty/planChange';

/**
 * A text, or the warning that the plan found overlaps or days without out («Προσοχή: …»). The warning is data here and
 * the UI writes it, so the model has no markup.
 */
export type DeclareError = string | Pick<StatusPlan, 'overlaps' | 'blocked'>;
