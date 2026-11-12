// Three small components of the sheet dialogs: the rows without a person, the number tiles and a short list.
// Purpose: `Unmatched`, `Tiles` and `List`, used by `SheetImportDialog` (components, as before: `Unmatched` has a hook).
// Does NOT: hold the choices; the dialog owns them.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-dialogs-forms.test.ts (snapshots sources-SheetImportDialog*).
import type { SheetPerson } from '../../../../../shared/sources';
import { PersonPicker, rkFull } from '../../../../entities/person';
import { useStore } from '../../../../shared/model';
import { cx } from '../../../../shared/lib/cx';
import { Button } from '../../../../shared/ui';

export interface UnmatchedProps {
  /** The sheet rows that matched nobody. */
  rows: SheetPerson[];
  /** Row number → person id (null: skip the row). */
  choices: Record<number, number | null>;
  setChoices: (c: Record<number, number | null>) => void;
  /** Extra text after «γραμμή n» for a row. */
  detail?: (r: SheetPerson) => string;
}

/** «Δεν βρέθηκαν στην εφαρμογή»: for each row, the candidates, a picker and «Παράλειψη». */
export function Unmatched({ rows, choices, setChoices, detail }: UnmatchedProps) {
  const { state } = useStore();
  const pm = new Map(state.people.map((p) => [p.id, p]));
  if (!rows.length) return null;
  return (
    <div className="field">
      <span className="field__label">Δεν βρέθηκαν στην εφαρμογή: ποιος είναι;</span>
      {rows.map((c) => (
        <div key={c.r} className="unm">
          <span>
            <b>{c.who}</b>
            <small>
              γραμμή {c.r + 1}
              {detail ? ' · ' + detail(c) : ''}
            </small>
          </span>
          {choices[c.r] != null ? (
            <span>
              {pm.get(choices[c.r]!) ? rkFull(pm.get(choices[c.r]!)!) : ''}{' '}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const x = { ...choices };
                  delete x[c.r];
                  setChoices(x);
                }}
              >
                Αλλαγή
              </Button>
            </span>
          ) : (
            <div className="unm__pick">
              {c.cands.map((p) => (
                <Button key={p.id} size="sm" variant="outline" onClick={() => setChoices({ ...choices, [c.r]: p.id })}>
                  {p.last} {p.first}
                  {p.father ? ' του ' + p.father : ''}
                </Button>
              ))}
              <div style={{ minWidth: '200px' }}>
                <PersonPicker placeholder="Άλλος…" onChange={(pid: number) => setChoices({ ...choices, [c.r]: pid })} />
              </div>
              <Button size="sm" variant="ghost" onClick={() => setChoices({ ...choices, [c.r]: null })}>
                Παράλειψη
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** The row of number tiles on top of the dialog; the first one is the main one. */
export const Tiles = ({ items }: { items: [number, string][] }) => (
  <div className="tiles">
    {items.map(([n, l], i) => (
      <div key={l} className={cx('tile', i === 0 && 'tile--main')}>
        <span className="tile__n">{n}</span>
        <span className="tile__l">{l}</span>
      </div>
    ))}
  </div>
);

/** A titled `<details>` list (first 150 items); nothing when the list is empty. */
export const List = ({ title, items, open }: { title: string; items: string[]; open?: boolean }) =>
  items.length ? (
    <details className="note" open={open ?? items.length <= 10}>
      <summary>
        {title} ({items.length})
      </summary>
      <ul>
        {items.slice(0, 150).map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: frozen DOM, the list is positional and keyed by index as before
          <li key={i}>{t}</li>
        ))}
      </ul>
      {items.length > 150 && <p>… και {items.length - 150} ακόμα</p>}
    </details>
  ) : null;
