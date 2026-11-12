// The two inputs that choose a ΕΣΣΟ: the series (Α΄ Β΄ Γ΄ Δ΄) and the year.
// Purpose: `EssoFields`, used by the correction form of «ΕΣΣΟ» and by step 1 and the ΕΣΣΟ field of the wizard.
// Does NOT: save anything; the caller owns the value.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/esso.ts (Phase 6); stays a component.
// Covering test: test/screens-settings-guide.test.ts, test/screens-dialogs-shell.test.ts.
import type { ChangeEvent } from 'react';
import type { Esso, EssoSeries } from '../../../../../shared/esso';
import { Segmented } from '../../../../shared/ui';
import { SERIES_ITEMS } from '../../model/essoView';

export interface EssoFieldsProps {
  /** The ΕΣΣΟ shown. */
  v: Esso;
  /** Called with the whole new value on every change. */
  onChange: (v: Esso) => void;
  /** The `id` of the year input (its label points at it). */
  id: string;
}

/** The series switch and the year box of one ΕΣΣΟ. */
export function EssoFields({ v, onChange, id }: EssoFieldsProps) {
  return (
    <div className="field-row" style={{ alignItems: 'flex-end' }}>
      <div className="field" style={{ flex: 'none' }}>
        <span className="field__label">Σειρά</span>
        <Segmented value={v.s} onChange={(s: EssoSeries) => onChange({ ...v, s })} items={SERIES_ITEMS} />
      </div>
      <div className="field" style={{ flex: 'none', width: '120px' }}>
        <label className="field__label" htmlFor={id}>
          Έτος
        </label>
        <input
          id={id}
          className="ui-input"
          type="number"
          min="2000"
          max="2100"
          value={v.y}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...v, y: Math.floor(+e.target.value) || v.y })}
        />
      </div>
    </div>
  );
}
