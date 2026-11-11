// One row of the quick-add table.
// Purpose: `QuickAddRow` (memo): the cells with their inputs or combos, the row status and the delete button.
// Does NOT: hold state; the dialog owns the rows and passes stable handlers, so only a changed row re-renders.
// Owner layer: renderer/features/quick-add. Why: moved verbatim from screens/quickAdd.ts (`Row`).
// Covering test: test/screens-dialogs-forms.test.ts (quickAdd-QuickAddDialog).
import { memo, type ClipboardEvent, type KeyboardEvent } from 'react';
import { QA_COLS, isFilled, type QaKey, type QaRow } from '../../../../shared/quickAdd';
import { cx } from '../../../shared/lib/cx';
import { Combo, Icon, type ComboOpt } from '../../../shared/ui';
import { INPUT_MODE, LABEL } from '../model/draft';

/** The suggestion lists of the columns that have one. */
export type QaLists = Partial<Record<QaKey, (string | ComboOpt)[]>>;

/** Props of `QuickAddRow`. */
export interface QuickAddRowProps {
  r: QaRow;
  /** Row number from 0. */
  i: number;
  err: string | null;
  lists: QaLists;
  onCell: (i: number, k: QaKey, v: string) => void;
  onKey: (e: KeyboardEvent<HTMLInputElement>, i: number, c: number) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>, i: number, c: number) => void;
  onDel: (i: number) => void;
  /** The last, empty row: no delete button. */
  tail: boolean;
  /** Takes the focus when the dialog opens (the last row). */
  af: boolean;
}

/** lists: the suggestions for rank, Ο/Σ, room and Σ.Ι. */
export const QuickAddRow = memo(function QuickAddRow({
  r,
  i,
  err,
  lists,
  onCell,
  onKey,
  onPaste,
  onDel,
  tail,
  af,
}: QuickAddRowProps) {
  return (
    <tr className={cx(err && 'is-err', tail && 'is-tail')}>
      <td className="qa__n">{i + 1}</td>
      {QA_COLS.map((k, c) => {
        const common = {
          className: 'qa__in',
          'data-r': i,
          'data-c': c,
          'aria-label': LABEL[k] + ', γραμμή ' + (i + 1),
          'data-autofocus': af && k === 'last' ? '' : undefined,
          inputMode: INPUT_MODE[k],
          autoComplete: 'off',
          spellCheck: false,
          value: r[k],
          onChange: (e: { target: { value: string } }) => onCell(i, k, e.target.value),
          onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => onKey(e, i, c),
          onPaste: (e: ClipboardEvent<HTMLInputElement>) => onPaste(e, i, c),
        };
        const options = lists[k];
        return <td key={k}>{options ? <Combo {...common} options={options} /> : <input {...common} />}</td>;
      })}
      <td className="qa__st">
        {err ? (
          <span className="qa__err">{err}</span>
        ) : isFilled(r) ? (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: frozen DOM; the tick is read as «εντάξει»
          <span className="qa__ok" aria-label="εντάξει">
            ✓
          </span>
        ) : (
          ''
        )}
      </td>
      <td>
        {!tail && (
          <button
            type="button"
            className="qa__del"
            tabIndex={-1}
            aria-label={'Σβήσε τη γραμμή ' + (i + 1)}
            data-tip="Σβήσε τη γραμμή"
            onClick={() => onDel(i)}
          >
            {Icon.x}
          </button>
        )}
      </td>
    </tr>
  );
});
