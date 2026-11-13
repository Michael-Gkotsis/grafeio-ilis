// The header of the «Υπηρεσίες» screen: title, the cycle, «Κανόνες», «Αυστηρά Άοπλοι», autofill and Excel.
// Purpose: `guardHeader`, a plain function called as `{guardHeader(G)}`.
// Does NOT: hold state (model/useGuard.ts) or change the rules by itself (the switch sends `setRules`).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); same markup, commands and
//   texts.
// Covering test: test/screens-main.test.ts, test/ux-names.test.ts.
import type { ChangeEvent } from 'react';
import { addDays, DOW_GEN, dm, dow, parseD } from '../../../../shared/dates';
import { dutyStartOf } from '../../../../shared/domain';
import { RULE_TXT, strictTxt } from '../../../../shared/rulesText';
import { Button, PageHeader } from '../../../shared/ui';
import { opState } from '../model/rulesView';
import type { Guard } from '../model/useGuard';

const AUTOFILL_TIP =
  'Γεμίζει τις κενές θέσεις μόνο με όσους επιτρέπουν οι κανόνες. Σειρά: αργίες (Πέμπτη-Παρασκευή κρατά στην άκρη ' +
  'όσους χρωστάνε ΣΚ), μέρες χωρίς υπηρεσία, λιγότερες υπηρεσίες· από όσους είναι η σειρά τους, η υπηρεσία πάει σε ' +
  'όποιον δεν την έχει κάνει (εναλλαγή υπηρεσιών), μετά κλήρωση. Λεπτομέρειες στο «Κανόνες».';

// The switch «Αυστηρά Άοπλοι» of the header: saves the rules at once and says what it does.
function strictSwitch(G: Guard) {
  const { state, run, toast } = G;
  return (
    <label
      className="strict-sw"
      data-tip={strictTxt(state.rules, state.settings) + (opState(state) ? ' Τώρα: ' + opState(state) + '.' : '')}
      data-tip-side="bottom"
    >
      <input
        type="checkbox"
        className="ui-check"
        checked={!!state.rules.strictUnarmed}
        onChange={async (e: ChangeEvent<HTMLInputElement>) => {
          const on = e.target.checked;
          const nr = { ...state.rules, strictUnarmed: on };
          if (await run({ t: 'setRules', rules: nr, text: RULE_TXT(nr, state.settings) }, false))
            toast({
              text:
                'Αυστηρά Άοπλοι: ' +
                (on ? 'ανοιχτό. Ισχύει στην αυτόματη συμπλήρωση και στο «Επόμενος».' : 'κλειστό, κανονική σειρά.'),
            });
        }}
      />
      Αυστηρά Άοπλοι
    </label>
  );
}

/** The header with its buttons. */
export function guardHeader(G: Guard) {
  const { state, date, setRules, afWhy, autofill, mobile, xb, exportX } = G;
  return (
    <PageHeader
      title={'Υπηρεσίες ' + DOW_GEN[parseD(date).getDay()] + ' ' + dm(date)}
      sub={
        <>
          {'Κύκλος '}
          <b className="mono-lg">
            {dow(date)} {dm(date)} {dutyStartOf(state.settings)} → {dow(addDays(date, 1))} {dm(addDays(date, 1))}{' '}
            {dutyStartOf(state.settings)}
          </b>
        </>
      }
    >
      <div className="page-head__acts">
        <Button
          variant="outline"
          onClick={() => setRules(true)}
          data-tip={'Ισχύουν: ' + RULE_TXT(state.rules, state.settings)}
        >
          Κανόνες
        </Button>
        {strictSwitch(G)}
        <Button disabled={!!afWhy} why={afWhy} onClick={autofill} data-tip={AUTOFILL_TIP} data-tip-side="left">
          Αυτόματη συμπλήρωση
        </Button>
        {!mobile && (
          <Button variant="outline" disabled={!!xb} onClick={exportX}>
            {xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}
          </Button>
        )}
      </div>
    </PageHeader>
  );
}
