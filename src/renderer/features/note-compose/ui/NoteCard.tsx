// One note of a list: the check, the text, who it is about, the reminder and the star / edit / delete buttons.
// Purpose: `NoteCard` (with its `WhoChip`) draws a stored note and runs `doneNote`, `editNote` (star) and `deleteNote`.
// Does NOT: open the editor itself (the parent gets `onEdit`) or open a card (the parent gets `onOpen`).
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (Phase 5.3c); the Σημειώσεις page
//   and the «Σημειώσεις» tab of both sheets draw the same cards.
// Covering test: test/notes.test.ts.
import { cx } from '../../../shared/lib/cx';
import { useStore } from '../../../shared/model';
import { Badge, Icon, useToast } from '../../../shared/ui';
import { dm } from '../../../../shared/dates';
import type { Note } from '../../../../shared/domain';
import { noteWho, remLabel, type NoteWhoItem } from '../../../../shared/notes';

/** Props of `NoteCard`. */
export interface NoteCardProps {
  n: Note;
  /** `whoKey` of the card the note is shown in: that person is not written again. */
  self?: string;
  onEdit: (n: Note) => void;
  onOpen: (x: NoteWhoItem) => void;
}

const whoIcon = (k: string) => (k === 'cad' ? Icon.shield : k === 'sol' ? Icon.people : Icon.notes);
// self: στην κάρτα ενός ατόμου δεν ξαναγράφεται το ίδιο, μόνο όσοι άλλοι είναι δεμένοι με τη σημείωση
function WhoChip({ n, onOpen, self }: Pick<NoteCardProps, 'n' | 'onOpen' | 'self'>) {
  const { state } = useStore();
  const w = noteWho(state, n);
  if (!w.items.length) return <span className="who-chip is-gen">{Icon.notes}Γενική</span>;
  return (
    <>
      {w.items
        .filter((x: NoteWhoItem) => x.key !== self)
        .map((x: NoteWhoItem) => (
          <button
            key={x.key}
            type="button"
            className={cx('who-chip', !x.active && 'is-off')}
            data-tip={x.active ? 'Άνοιγμα καρτέλας' : 'Εκτός δύναμης · άνοιγμα καρτέλας'}
            onClick={() => onOpen(x)}
          >
            {whoIcon(x.kind)}
            {x.label}
            {!x.active && ' (εκτός δύναμης)'}
          </button>
        ))}
    </>
  );
}

// Μία σημείωση: τσεκάρεις όταν τελειώσει, επεξεργασία και διαγραφή (με Αναίρεση) στο hover/focus
export function NoteCard({ n, self, onEdit, onOpen }: NoteCardProps) {
  const { today, run, undoMark } = useStore();
  const toast = useToast();
  const due = !n.done && !!n.rem && n.rem <= today;
  const rl = n.rem ? remLabel(n.rem, today, !!n.done) : null;
  const done = async () => {
    await run({ t: 'doneNote', id: n.id, done: !n.done }, false);
  };
  const star = () => run({ t: 'editNote', id: n.id, patch: { star: !n.star } }, false);
  const del = async () => {
    if (await run({ t: 'deleteNote', id: n.id }, false)) toast({ text: 'Σβήστηκε η σημείωση.', actions: [undoMark()] });
  };
  return (
    <article className={cx('note-card', due && 'is-due', n.star && !n.done && 'is-star', n.done && 'is-done')}>
      <div className="note-card__top">
        {/* biome-ignore lint/a11y/useSemanticElements: markup kept as it was (Phase 5.3c moves, it does not redraw) */}
        <button
          type="button"
          className="note-ck"
          role="checkbox"
          aria-checked={!!n.done}
          aria-label={n.done ? 'Ξανάνοιξε τη σημείωση' : 'Ολοκληρώθηκε'}
          data-tip={n.done ? 'Ξανάνοιξε' : 'Ολοκληρώθηκε'}
          onClick={done}
        >
          {n.done ? Icon.check : null}
        </button>
        <div className="note-card__txt">{n.text}</div>
      </div>
      <div className="note-card__meta">
        <WhoChip n={n} onOpen={onOpen} self={self} />
        {rl && (
          <Badge tone={rl.tone === 'muted' ? undefined : rl.tone} className="note-rem-badge">
            {Icon.bell}
            {rl.text}
          </Badge>
        )}
        <span className="note-card__date">{n.done ? 'Ολοκληρώθηκε ' + dm(n.done) : dm(n.at)}</span>
        <span className="note-card__acts">
          <button
            type="button"
            className={cx('note-ib', n.star && 'is-on')}
            aria-label={n.star ? 'Βγάλε από τις σημαντικές' : 'Σημαντική'}
            aria-pressed={!!n.star}
            data-tip={n.star ? 'Σημαντική (πάτα για να φύγει)' : 'Σημείωσέ τη σημαντική'}
            onClick={star}
          >
            {Icon.star}
          </button>
          <button
            type="button"
            className="note-ib"
            aria-label="Επεξεργασία"
            data-tip="Επεξεργασία, υπενθύμιση"
            onClick={() => onEdit(n)}
          >
            {Icon.edit}
          </button>
          <button
            type="button"
            className="note-ib"
            aria-label="Διαγραφή"
            data-tip="Διαγραφή (με Αναίρεση)"
            onClick={del}
          >
            {Icon.trash}
          </button>
        </span>
      </div>
    </article>
  );
}
