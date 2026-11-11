// The lines of one section of the Ημερήσια Διαταγή.
// Purpose: `Lines`, each line a textarea with a × that removes it from this order only, and «+ γραμμή».
// Does NOT: know the document (the tab passes `onChange` with the new lines).
// Owner layer: renderer/widgets/hd. Why: moved verbatim from screens/hd.ts (Phase 6.0).
// Covering test: test/screens-main.test.ts, test/hd.test.ts.
import type { ChangeEvent } from 'react';
import { hdUpper } from '../model/view';

/** Props of `Lines`. */
export interface LinesProps {
  lines: string[];
  onChange: (lines: string[]) => void;
  /** Where the lines come from, shown after the label («από Στελέχη»). */
  from?: string;
  label: string;
}

export function Lines({ lines, onChange, from, label }: LinesProps) {
  return (
    <div className="hd__sec">
      <span className="hd__lab">
        {label}
        {from && <small> · {from}</small>}
      </span>
      <div className="hd__lines">
        {lines.length === 0 && <span className="muted hd__zero">Ø</span>}
        {lines.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the lines are plain strings without an id
          <div key={i} className="hd__line">
            <textarea
              className="ui-input"
              rows={l.length > 70 ? 2 : 1}
              aria-label={label + ' γραμμή ' + (i + 1)}
              value={l}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                onChange(lines.map((x, j) => (j === i ? hdUpper(e.target.value) : x)))
              }
            />
            <button
              type="button"
              className="hd__x"
              aria-label="Σβήσιμο γραμμής"
              data-tip="Φεύγει μόνο από αυτή την Ημερήσια Διαταγή"
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="hd__add" onClick={() => onChange([...lines, ''])}>
          + γραμμή
        </button>
      </div>
    </div>
  );
}
