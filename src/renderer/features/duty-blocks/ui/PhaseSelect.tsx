// The ΦΡΟΥΡΑ select: pick a service form, or open «Νέο έντυπο υπηρεσιών…».
// Purpose: `PhaseSelect` lists the built-in forms (ΣΒΕΝ, ΣΠΕΝ) and the user's own, and the «+ Νέο…» option.
// Does NOT: change the phase (the caller's `onChange` does) or create the form (`PhaseDialog` does).
// Owner layer: renderer/features/duty-blocks. Why: «Υπηρεσίες» (the bar) and Ρυθμίσεις (the card) both show it.
// Covering test: test/screens-dialogs-forms.test.ts, test/ux-names.test.ts.
import { useState } from 'react';
import { PHASE_NAME, phaseList, type Phase } from '../../../../shared/domain';
import { useStore } from '../../../shared/model';
import { Select, type ValueEvent } from '../../../shared/ui';
import { NEW_PHASE, phaseTip } from '../model/view';
import { PhaseDialog } from './PhaseDialog';

/** Props of `PhaseSelect`. */
export interface PhaseSelectProps {
  value: Phase;
  onChange: (v: Phase) => void;
  /** Text before each name, e.g. «ΦΡΟΥΡΑ ». */
  prefix?: string;
  id?: string;
}

// Έντυπο υπηρεσιών (Michael, 22/10): the list has ΣΒΕΝ, ΣΠΕΝ, the user's own and «Νέο έντυπο υπηρεσιών…» last.
/** The ΦΡΟΥΡΑ select. «+ Νέο έντυπο υπηρεσιών…» opens `PhaseDialog` and switches to the new form. */
export function PhaseSelect({ value, onChange, prefix = '', id }: PhaseSelectProps) {
  const { state } = useStore();
  const [add, setAdd] = useState(false);
  const list = phaseList(state.settings);
  const cur = list.find((x) => x.id === value) || list[0];
  const tip = phaseTip(cur, PHASE_NAME);
  return (
    <>
      <Select
        id={id}
        className="ui-select"
        aria-label="Έντυπο υπηρεσιών"
        data-tip={tip}
        value={cur.id}
        onChange={(e: ValueEvent) => (e.target.value === NEW_PHASE ? setAdd(true) : onChange(e.target.value))}
      >
        {list.map((x) => (
          <option key={x.id} value={x.id}>
            {prefix + x.name}
          </option>
        ))}
        <option value={NEW_PHASE} data-keep>
          + Νέο έντυπο υπηρεσιών…
        </option>
      </Select>
      {add && (
        <PhaseDialog
          from={cur.id}
          onClose={(nid?: Phase) => {
            setAdd(false);
            if (nid) onChange(nid);
          }}
        />
      )}
    </>
  );
}
