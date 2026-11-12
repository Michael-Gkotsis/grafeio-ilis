// One row of the «Στελέχη» table: drag handle, rank, names, ΑΜ, phone, role, the status and the «Κατάσταση…» button.
// Purpose: `cadreRow`, a plain function called by `CadreScreen` while it renders (not a component: render counts and
//   memo boundaries stay as they were).
// Does NOT: hold state: the drag state and the handlers come from `useCadre`.
// Owner layer: renderer/pages/cadre. Why: moved verbatim from screens/cadre.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered.
// Covering test: test/screens-main.test.ts, test/cadre-page-view.test.ts.
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import type { Cadre } from '../../../../shared/domain';
import { rankTxt } from '../../../../shared/ranks';
import { HK } from '../../../../shared/unit';
import { NoteDot } from '../../../entities/note';
import { cadreStatusBadge } from '../../../entities/person';
import { cx } from '../../../shared/lib/cx';
import { Badge, Button } from '../../../shared/ui';
import { GRID } from '../model/view';
import type { useCadre } from '../model/useCadre';

type CadreModel = ReturnType<typeof useCadre>;

// Drop target: the row under the pointer and whether the dragged one lands in its lower half.
function dragOver(e: DragEvent<HTMLDivElement>, m: CadreModel, id: string) {
  const { drag, over, setOver } = m;
  if (!drag) return;
  e.preventDefault();
  const r = e.currentTarget.getBoundingClientRect();
  const after = e.clientY > r.top + r.height / 2;
  if (over?.id !== id || over.after !== after) setOver({ id, after });
}

// Enter opens the card; Alt+↑/↓ moves the row one place (to the neighbour in the shown rows).
function keyDown(e: KeyboardEvent<HTMLDivElement>, m: CadreModel, c: Cadre, i: number) {
  if (e.key === 'Enter') m.openCard(c.id);
  else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const nb = m.rows[i + (e.key === 'ArrowUp' ? -1 : 1)];
    if (nb) m.move(c.id, nb.id, e.key === 'ArrowDown');
  }
}

/** The table row of member `c` at position `i` of the shown rows. */
export function cadreRow(c: Cadre, i: number, m: CadreModel) {
  const { stOf, marks, card, drag, over, setDrag, setStFor, end } = m;
  const st = stOf.get(c.id);
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="row" as before
    <div
      key={c.id}
      className={cx(
        'ptable__row',
        i % 2 === 1 && 'is-odd',
        card === c.id && 'is-sel',
        drag === c.id && 'is-drag',
        over?.id === c.id && drag !== c.id && (over.after ? 'is-drop-after' : 'is-drop-before'),
      )}
      style={{ gridTemplateColumns: GRID }}
      role="row"
      tabIndex={0}
      draggable="true"
      onDragStart={(e: DragEvent<HTMLDivElement>) => {
        setDrag(c.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', c.id);
      }}
      onDragEnd={end}
      onDragOver={(e: DragEvent<HTMLDivElement>) => dragOver(e, m, c.id)}
      onDrop={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (drag && over) m.move(drag, over.id, over.after);
        end();
      }}
      onClick={() => m.openCard(c.id)}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => keyDown(e, m, c, i)}
    >
      <span className="drag-h" aria-hidden="true" data-tip="Σύρε για να αλλάξεις σειρά (ή Alt+↑/↓)">
        ⠿
      </span>
      <span className="num muted">{i + 1}</span>
      <span data-tip={rankTxt(c)}>{rankTxt(c)}</span>
      <span>{c.spec || ''}</span>
      <span data-tip={c.last}>
        <b>{c.last}</b>
        {marks.get('c' + c.id) && <NoteDot m={marks.get('c' + c.id)} />}
      </span>
      <span data-tip={c.first}>{c.first}</span>
      <span className="num">{c.am || ''}</span>
      <span className="num">{c.phone || ''}</span>
      <span data-tip={c.role || undefined}>{c.role || ''}</span>
      <span className="badges">{c.active ? cadreStatusBadge(st) : <Badge tone="outline">Εκτός δύναμης</Badge>}</span>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: frozen DOM, the span only stops the row click */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: frozen DOM, the span only stops the row click */}
      <span onClick={(e: MouseEvent<HTMLSpanElement>) => e.stopPropagation()}>
        {c.active && (
          <Button
            size="sm"
            variant="outline"
            aria-label={'Κατάσταση: ' + rankTxt(c) + ' ' + c.last}
            onClick={() => setStFor({ c })}
            data-tip={'Κατάσταση της ' + HK() + ': υπηρεσία, ΕΥ, άδεια, νοσοκομείο…'}
            data-tip-side="left"
          >
            Κατάσταση…
          </Button>
        )}
      </span>
    </div>
  );
}
