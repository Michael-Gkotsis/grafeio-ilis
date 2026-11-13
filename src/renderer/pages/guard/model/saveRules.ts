// «Αποθήκευση» of the rules dialog: the cycle start, the rules and the week table, one command after the other.
// Purpose: `saveRules`, the async action the dialog calls; it stops at the first command that does not go through.
// Does NOT: hold state (model/useRulesDialog.ts) or decide what is valid (the button is disabled when an hour is wrong).
// Owner layer: renderer/pages/guard. Why: split from useRulesDialog to keep it under 80 lines (Phase 6); the commands,
//   their order and their arguments are the old ones: setSettings (only if the start changed), setRules, setWeekRules.
// Covering test: test/ux-names.test.ts, test/guard-page-view.test.ts.
import { dutyStartOf, type Settings } from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { RULE_TXT } from '../../../../shared/rulesText';
import type { useStore } from '../../../shared/model';
import type { useToast } from '../../../shared/ui';
import { rulesToSave, weekToSave, type RulesDraft } from './rulesView';
import type { WeekDraft } from './weekRules';

/** What {@link saveRules} needs from the dialog. */
export interface SaveRulesArgs {
  run: ReturnType<typeof useStore>['run'];
  toast: ReturnType<typeof useToast>;
  /** The settings of the unit. */
  st: Settings;
  /** The draft of the rules. */
  r: RulesDraft;
  /** The typed start of the duty cycle (`HH:MM` after `normTime`). */
  ds: string;
  /** The typed week table. */
  wk: WeekDraft;
  /** Closes the dialog after a successful save. */
  onClose: () => void;
}

/**
 * Builds the «Αποθήκευση» action.
 * @returns an async function that saves all three parts, closes the dialog and toasts the rules text
 */
export const saveRules =
  ({ run, toast, st, r, ds, wk, onClose }: SaveRulesArgs) =>
  async () => {
    const nr = rulesToSave(r);
    const nds = normTime(ds)!;
    if (
      nds !== dutyStartOf(st) &&
      !(await run(
        { t: 'setSettings', settings: { dutyStart: nds }, text: 'ο κύκλος των υπηρεσιών ξεκινά στις ' + nds },
        false,
      ))
    )
      return;
    if (!(await run({ t: 'setRules', rules: nr, text: RULE_TXT(nr, st) }, false))) return;
    if (!(await run({ t: 'setWeekRules', week: weekToSave(wk) }, false))) return;
    onClose();
    toast({ text: 'Οι κανόνες άλλαξαν: ' + RULE_TXT(nr, st) });
  };
