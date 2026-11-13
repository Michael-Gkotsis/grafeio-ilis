// One row of the «Κινήσεις» table.
// Purpose: `MRow`, a `memo` component: who, which weapon, reason and time out, reason and time in, the note and the
//   buttons «Είσοδος» / «Διόρθωση». An armed duty (computed from the duties, not written in the log) is an «αυτόματα» row.
// Does NOT: write a move (the dialogs do) or decide which rows exist (model/useMoves.ts).
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weaponMoves.ts (Phase 6); redraws only when
//   something of its own changes.
// Covering test: test/screens-main.test.ts (weapons--moves), test/perf.test.ts.
import { memo, type ChangeEvent, type CSSProperties } from 'react';
import { RkName, rkShort, rkText } from '../../../entities/person';
import { cx } from '../../../shared/lib/cx';
import { Badge, Button } from '../../../shared/ui';
import type { ArmRow } from '../../../../shared/armed';
import { fullName, shortName, type Person, type Settings, type WeaponMove } from '../../../../shared/domain';
import { weaponBack } from '../../../../shared/ranks';
import { isAuto, moveInCell, moveOutCell, seatTxt } from '../../../../shared/weapons';
import { MV_GRID } from '../model/layout';
import { dtCell } from '../model/view';

/** Props of `MRow`. The callbacks are stable, so the `memo` can hold. */
export interface MRowProps {
  m: WeaponMove;
  i: number;
  /** The absolute-position style of the virtual list. */
  style: CSSProperties;
  selected: boolean;
  pm: Map<number, Person>;
  lists: Settings['lists'];
  /** ISODate, local time. */
  today: string;
  onToggle: (id: string, shift?: boolean) => void;
  onIn: (ids: string[]) => void;
  onEdit: (m: WeaponMove) => void;
  onFix: (row: ArmRow) => void;
  onOpen: (pid: number) => void;
}

/** One move. */
export const MRow = memo(function MRow({
  m,
  i,
  style,
  selected,
  pm,
  lists,
  today,
  onToggle,
  onIn,
  onEdit,
  onFix,
  onOpen,
}: MRowProps) {
  const p = pm.get(m.pid);
  const auto = isAuto(m);
  const own = isAuto(m) ? pm.get(m.row.owner) : p;
  const owner = isAuto(m) && m.row.owner !== m.pid ? own : null;
  const post = isAuto(m) && m.row.mode === 'post';
  const seat = own ? seatTxt(own.rack, own.wpos) : '';
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with an ARIA role as before
    // biome-ignore lint/a11y/useFocusableInteractive: frozen DOM, a div with role="row" as before
    <div
      className={cx('ptable__row', i % 2 === 1 && 'is-odd', auto && 'is-auto')}
      style={{ ...style, gridTemplateColumns: MV_GRID, cursor: 'default' }}
      role="row"
    >
      <span>
        {!auto && (
          <input
            type="checkbox"
            className="ui-check"
            aria-label={'Επιλογή ' + (p ? rkShort(p) : m.weapon)}
            checked={selected}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onToggle(m.id, !!(e.nativeEvent as MouseEvent).shiftKey)}
          />
        )}
      </span>
      <span className="wmv__who">
        {p ? (
          <>
            <button type="button" className="linkish" data-tip={rkText(p, fullName, true)} onClick={() => onOpen(p.id)}>
              <b>
                <RkName p={p} keep={true} />
              </b>
            </button>
            {p.cid && (
              <>
                {' '}
                <Badge tone="outline" data-tip="Στέλεχος σε ένοπλη υπηρεσία: το όπλο του είναι από την κάρτα στελέχους">
                  στέλεχος
                </Badge>
              </>
            )}
          </>
        ) : (
          '—'
        )}
        {owner && isAuto(m) && (
          <small
            data-tip={
              'Όπλο της θέσης (' +
              m.row.label +
              '): το έχει βγάλει ο ' +
              shortName(owner) +
              ' και περνά από χέρι σε χέρι'
            }
          >
            {'κρατά το όπλο του '}
            {shortName(owner)}
          </small>
        )}
      </span>
      <span className="wmv__w">
        {m.weapon ? (
          <span className="num">{m.weapon}</span>
        ) : auto ? (
          <Badge
            tone="bad"
            data-tip={'Ένοπλη υπηρεσία χωρίς αριθμό όπλου' + (own ? ': ο ' + rkShort(own) + ' δεν έχει' : '')}
          >
            Χωρίς όπλο
          </Badge>
        ) : (
          '—'
        )}
        {seat && <small>{seat}</small>}
      </span>
      <span className="wmv__reason" data-tip={m.reason}>
        <Badge tone="warn">{m.reason}</Badge>
      </span>
      <span className={cx('num', post && 'wmv__post')}>
        {post ? moveOutCell(m) : dtCell(m.outDay, m.outTime, today)}
      </span>
      <span className="wmv__reason" data-tip={m.inDay ? m.inReason || undefined : undefined}>
        {m.inDay ? (
          <Badge tone="ok">{m.inReason || weaponBack(m.reason, lists)}</Badge>
        ) : (
          <Badge tone="bad">Εκτός</Badge>
        )}
      </span>
      <span
        className={cx('num', post && 'wmv__post')}
        data-tip={auto ? 'Η ώρα που προβλέπεται από τις υπηρεσίες' : undefined}
      >
        {!m.inDay ? '—' : post ? moveInCell(m) : dtCell(m.inDay, m.inTime || '', today)}
      </span>
      <span
        className="muted wmv__note"
        data-tip={
          [
            auto && 'Βγαίνει από τις ένοπλες υπηρεσίες: οι ώρες μπαίνουν μόνες τους (Ρυθμίσεις › Υπηρεσίες, Κανόνες)',
            m.note,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
      >
        {auto && <i className="wmv__auto">αυτόματα</i>}
        {m.note ? (auto ? ' · ' : '') + m.note : ''}
      </span>
      <span className="weapon-acts">
        {!auto && !m.inDay && (
          <Button size="sm" variant="outline" onClick={() => onIn([m.id])}>
            Είσοδος
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => (isAuto(m) ? onFix(m.row) : onEdit(m))}
          data-tip={auto ? 'Άλλαξε την ώρα εξόδου ή εισόδου, με λόγο' : 'Ώρες, λόγοι, παρατήρηση, ή σβήσιμο'}
        >
          Διόρθωση{auto ? '…' : ''}
        </Button>
      </span>
    </div>
  );
});
