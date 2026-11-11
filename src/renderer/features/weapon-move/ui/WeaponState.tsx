// The ΕΝΤΟΣ | ΕΚΤΟΣ switch of one weapon row, with why and when under it.
// Purpose: `WeaponState` draws the switch and the line under it (reason and time of an exit, or what an armed duty does);
//   a click on the other side opens the exit or entry pop-up. Armed duties are out automatically, with the times of the
//   number, and are fixed with «Διόρθωση…» (Michael, 24/10). The facts come from `weaponStateFacts` (model/).
// Does NOT: hold the move log, or change a command; the pop-ups and dialogs do.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/weapons.test.ts.
import { armTxt, moveOutTxt } from '../../../../shared/weapons';
import { armWhen, calDay, hmOf } from '../../../../shared/armed';
import { dm } from '../../../../shared/dates';
import { shortName, type Person } from '../../../../shared/domain';
import { weaponBack } from '../../../../shared/ranks';
import { cx } from '../../../shared/lib/cx';
import { when } from '../model/text';
import {
  weaponStateFacts,
  useWeaponState,
  type WeaponStateFacts,
  type WeaponStateProps,
} from '../model/useWeaponState';
import { DutyFixDialog } from './DutyFixDialog';
import { EditMoveDialog } from './EditMoveDialog';
import { InPop } from './InPop';
import { OutPop } from './OutPop';

/** The line under the switch: what it was taken out for and when, or what the armed duty does. */
function weaponStateWhy(
  f: WeaponStateFacts,
  pm: Map<number, Person>,
  lists: Parameters<typeof weaponBack>[1],
  today: string,
) {
  const { m, duty, arm, cur, day, nxt, prv, hold, auto, first } = f;
  const pn = (id: number) => (pm.get(id) ? shortName(pm.get(id) as Person) : '—');
  const when2 = (r: (typeof day)[number], m: number) =>
    (calDay(r.day, m) === today ? '' : dm(calDay(r.day, m)) + ' ') + hmOf(m);
  const autoTip = first
    ? 'Αυτόματα από τις ένοπλες υπηρεσίες: ' +
      first.reason +
      ' ' +
      (arm.live ? armWhen(first) : armTxt(day)) +
      (first.mode === 'post' ? '. Όπλο της θέσης: περνά από χέρι σε χέρι στις αλλαγές' : '') +
      '. Για άλλες ώρες: Διόρθωση…'
    : '';
  const why = m ? (
    <span
      className="wstate__why"
      data-tip={
        'Βγήκε: ' +
        moveOutTxt(m) +
        (m.note ? ' · ' + m.note : '') +
        (duty ? ' · και ένοπλη υπηρεσία: ' + duty : '') +
        ' · μπαίνει με ' +
        weaponBack(m.reason, lists)
      }
    >
      <b>{m.reason}</b> <span>{when(m.outDay, m.outTime, today)}</span>
      {m.note ? (
        <>
          {' '}
          <i>· {m.note}</i>
        </>
      ) : (
        ''
      )}
    </span>
  ) : auto && first ? (
    <span className="wstate__why" data-tip={autoTip}>
      <b>{first.reason}</b>
      {cur && cur.who !== cur.owner ? (
        <>
          {' '}
          <i>· {pn(cur.who)}</i>
        </>
      ) : (
        ''
      )}
    </span>
  ) : hold ? (
    <span
      className="wstate__soon"
      data-tip={'Κρατά το όπλο της θέσης (' + hold.label + ') του ' + pn(hold.owner) + ' ως τις ' + hmOf(hold.in)}
    >
      κρατά το όπλο του {pn(hold.owner)} ως {hmOf(hold.in)}
    </span>
  ) : nxt || (prv && calDay(prv.day, prv.in) === today) ? (
    <span
      className="wstate__soon"
      data-tip={[
        nxt && 'Ένοπλη υπηρεσία: ' + nxt.reason + ' ' + armWhen(nxt),
        prv && 'Προηγούμενο νούμερο: ' + prv.reason + ' ' + armWhen(prv),
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {[nxt && 'βγαίνει ' + when2(nxt, nxt.out), prv && calDay(prv.day, prv.in) === today && 'γύρισε ' + hmOf(prv.in)]
        .filter(Boolean)
        .join(' · ')}
    </span>
  ) : null; // ΕΝΤΟΣ: το λέει ήδη ο διακόπτης
  return why;
}

/** Κατάσταση του όπλου στη γραμμή: ΕΝΤΟΣ | ΕΚΤΟΣ, και από κάτω γιατί και πότε (όλος ο λόγος). */
export function WeaponState(props: WeaponStateProps) {
  const { p, pm } = props;
  const { lists, today, ref, open, setOpen, edit, setEdit, fix, setFix } = useWeaponState();
  const f = weaponStateFacts(props);
  if (f.none) return <span className="muted wstate__none">{f.has ? '—' : 'χωρίς όπλο'}</span>;
  const { m, out, auto, first, cur, day, times } = f;
  const why = weaponStateWhy(f, pm, lists, today);
  const click = (want: boolean) => {
    if (auto || want === out) return;
    setOpen(true);
  };
  const canFix = auto && (cur || day.length === 1);
  return (
    <div className={cx('wstate', out && 'is-out', auto && 'is-auto')}>
      <div className="wstate__row">
        {/* biome-ignore lint/a11y/useSemanticElements: markup kept as it was (Phase 5.3b moves, it does not redraw) */}
        <div ref={ref} className="wstate__sw" role="group" aria-label={'Κατάσταση όπλου ' + p.weapon}>
          <button
            type="button"
            aria-pressed={!out}
            disabled={auto}
            onClick={() => click(false)}
            data-tip={out && !auto ? 'Μπαίνει στον οπλοβαστό: ώρα και λόγος εισαγωγής' : undefined}
          >
            ΕΝΤΟΣ
          </button>
          <button
            type="button"
            aria-pressed={out}
            disabled={auto}
            onClick={() => click(true)}
            data-tip={!out ? 'Βγαίνει από τον οπλοβαστό: ώρα και λόγος' : undefined}
          >
            ΕΚΤΟΣ
          </button>
        </div>
        {auto &&
          first &&
          (canFix ? (
            <button
              type="button"
              className="wstate__fix"
              onClick={() => setFix(cur || day[0])}
              aria-label={'Διόρθωση…: ' + first.reason}
              data-tip="Διόρθωση…: άλλαξε την ώρα εξόδου ή εισόδου αυτού του νούμερου, με λόγο"
            >
              {times} ✎
            </button>
          ) : (
            <span className="wstate__time" data-tip="Για να αλλάξει μία ώρα: Κινήσεις › Διόρθωση…">
              {times}
            </span>
          ))}
      </div>
      {why}
      {open &&
        (m ? (
          <InPop p={p} m={m} anchor={ref} onClose={() => setOpen(false)} onEdit={setEdit} />
        ) : (
          <OutPop p={p} anchor={ref} onClose={() => setOpen(false)} />
        ))}
      {edit && <EditMoveDialog m={edit} onClose={() => setEdit(null)} />}
      {fix && <DutyFixDialog row={fix} onClose={() => setFix(null)} />}
    </div>
  );
}
