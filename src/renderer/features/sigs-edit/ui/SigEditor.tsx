// The signature list of one form: a word above, the position, the name, ← → for the order and ✕ to remove.
// Purpose: `SigEditor` edits a `Sig[]` (Michael, 20/10): from left to right, the same in Ρυθμίσεις and when a form is made.
// Does NOT: save anything (the caller owns the list) or know which form it is for.
// Owner layer: renderer/features/sigs-edit. Why: moved verbatim from renderer/sigs.ts (Phase 5.3b).
// Covering test: test/sigs.test.ts, test/sigs-all-forms.test.ts.
import { ARTS, artOf, sigTitles, type Sig } from '../../../../shared/sigs';
import { unitKindOf, unitText } from '../../../../shared/unit';
import { useStore } from '../../../shared/model';
import { Button, Combo, Icon, Select } from '../../../shared/ui';

/** Props of `SigEditor`. `onChange` gets the whole new list. */
export interface SigEditorProps {
  value: Sig[];
  onChange: (v: Sig[]) => void;
  id?: string;
}

type Titles = ReturnType<typeof sigTitles>;

/** The ←, → and ✕ buttons of row `i`. */
function sigActs(i: number, value: Sig[], onChange: (v: Sig[]) => void, move: (i: number, d: number) => void) {
  return (
    <span className="sigs__acts">
      <Button
        size="icon"
        variant="ghost"
        aria-label="Μία θέση αριστερά"
        data-tip="Πιο αριστερά"
        disabled={i === 0}
        onClick={() => move(i, -1)}
      >
        ←
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Μία θέση δεξιά"
        data-tip="Πιο δεξιά"
        disabled={i === value.length - 1}
        onClick={() => move(i, 1)}
      >
        →
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={'Αφαίρεση υπογραφής ' + (i + 1)}
        data-tip="Αφαίρεση"
        onClick={() => onChange(value.filter((_, j) => j !== i))}
      >
        {Icon.x}
      </Button>
    </span>
  );
}

/** One row of the list (a plain function: it is drawn inside `SigEditor`'s render, keyed by its position). */
function sigRow(
  x: Sig,
  i: number,
  c: {
    value: Sig[];
    onChange: (v: Sig[]) => void;
    set: (i: number, patch: Partial<Sig>) => void;
    move: (i: number, d: number) => void;
    titles: Titles;
    kind: ReturnType<typeof unitKindOf>;
  },
) {
  const { value, onChange, set, move, titles, kind } = c;
  return (
    <li key={i} className="sigs__row">
      <span className="sigs__n" data-tip="Σειρά από αριστερά προς τα δεξιά">
        {i + 1}
      </span>
      <Select
        className="ui-select"
        aria-label={'Λέξη από πάνω, υπογραφή ' + (i + 1)}
        value={x.art}
        onChange={(e) => set(i, { art: e.target.value })}
      >
        {ARTS.map((a) => (
          <option key={a} value={a}>
            {a || '(χωρίς)'}
          </option>
        ))}
      </Select>
      <Combo
        className="ui-input sigs__title"
        options={titles}
        aria-label={'Θέση, υπογραφή ' + (i + 1)}
        placeholder="π.χ. ΔΚΤΗΣ ΙΛΗΣ"
        value={unitText(x.title, kind)}
        onChange={(e) =>
          set(i, { title: e.target.value, ...(!x.title && !x.name ? { art: artOf(e.target.value) } : {}) })
        }
      />
      <input
        className="ui-input sigs__name"
        aria-label={'Όνομα κάτω από την υπογραφή ' + (i + 1)}
        placeholder="Όνομα (προαιρετικό)"
        value={x.name || ''}
        onChange={(e) => set(i, { name: e.target.value })}
      />
      {sigActs(i, value, onChange, move)}
    </li>
  );
}

/** Η λίστα με αλλαγές: λέξη από πάνω, θέση, όνομα, ← → για τη σειρά, ✕ για αφαίρεση. */
export function SigEditor({ value, onChange }: SigEditorProps) {
  const { state } = useStore();
  const kind = unitKindOf(state.settings);
  const set = (i: number, patch: Partial<Sig>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => {
    const v = [...value];
    const [x] = v.splice(i, 1);
    v.splice(i + d, 0, x);
    onChange(v);
  };
  const titles = sigTitles(state.settings);
  const ctx = { value, onChange, set, move, titles, kind };
  return (
    <div className="sigs">
      {value.length ? (
        <ol className="sigs__list">{value.map((x, i) => sigRow(x, i, ctx))}</ol>
      ) : (
        <p className="note" style={{ margin: 0 }}>
          Χωρίς υπογραφές.
        </p>
      )}
      <div>
        <Button size="sm" variant="outline" onClick={() => onChange([...value, { art: 'Ο', title: '' }])}>
          + Υπογραφή
        </Button>
      </div>
      {value.length > 1 && (
        <div className="sigs__strip" aria-hidden="true">
          {value.map((x, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no id; the position is the identity (as before)
            <span key={i}>
              <small>{x.art}</small>
              {unitText(x.title, kind) || '…'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
