// The bar above the seats, the weekend (ΠΣΚ) strip and the «Άδειασε τη μέρα» question of the «Θέσεις» tab.
// Purpose: `guardBar`, `weekendStrip`, `clearDialog`, plain functions called as `{guardBar(G)}` (not components, so the
//   render count is the one the screen always had).
// Does NOT: hold state (model/useGuard.ts) or place anybody (the commands are the old ones).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); same markup, text nodes and
//   commands.
// Covering test: test/screens-main.test.ts.
import { dm, dow } from '../../../../shared/dates';
import { isOutsAll, type Phase } from '../../../../shared/domain';
import { holName, isHol } from '../../../../shared/rules';
import { cx } from '../../../shared/lib/cx';
import { Badge, Button, Dialog } from '../../../shared/ui';
import { PhaseSelect } from '../../../features/duty-blocks';
import { emptyOn } from '../model/guardView';
import type { Guard } from '../model/useGuard';
import { MonthSelect } from './MonthSelect';

/** The bar: day, form, empty count, next empty, autofill, Excel, holiday, month and «+ Νέα υπηρεσία». */
export function guardBar(G: Guard) {
  const {
    state,
    run,
    date,
    phase,
    empty,
    posts,
    locked,
    stuck,
    nextEmpty,
    afWhy,
    autofill,
    xb,
    exportX,
    mon,
    setAddOpen,
  } = G;
  return (
    <div className={cx('guard__bar', stuck && 'is-stuck')}>
      <span className="gb-stuck">
        <b>
          {dow(date)} {dm(date)}
        </b>
      </span>
      <PhaseSelect value={phase} onChange={(v: Phase) => run({ t: 'setPhase', phase: v })} prefix="ΦΡΟΥΡΑ " />
      {empty.length ? (
        <Badge tone="bad">
          {empty.length} κενές από {posts.length}
        </Badge>
      ) : (
        <Badge tone="ok">Πλήρης</Badge>
      )}
      {!locked && empty.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="gb-keep"
          onClick={nextEmpty}
          data-tip="Πάει στην επόμενη κενή θέση και ανοίγει την επιλογή ατόμου (πλήκτρο Ν)"
        >
          Επόμενη κενή
        </Button>
      )}
      <span className="gb-stuck">
        <Button size="sm" disabled={!!afWhy} why={afWhy} onClick={autofill}>
          Αυτόματη συμπλήρωση
        </Button>
        <Button size="sm" variant="outline" disabled={!!xb} onClick={exportX}>
          {xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}
        </Button>
      </span>
      <span className="guard__rules">
        {isHol(state.settings, date) && (
          <Badge tone="warn" data-tip="Μετρά ως αργία στον έλεγχο υπηρεσιών">
            Αργία: {holName(state.settings, date)}
          </Badge>
        )}
      </span>
      <span className="gb-mon">
        <span className="gb-mon__lbl" data-tip="Από ποιον μήνα μετρά τις υπηρεσίες (στήλη Είδ./Σύν. και σειρά)">
          Μετρά:
        </span>
        <MonthSelect m={mon} width="150px" small={true} />
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAddOpen(true)}
        data-tip="Π.χ. σκοπιά, πύλη, ΤΑΕ. Μπαίνει στο έντυπο σε δική της γραμμή."
      >
        + Νέα υπηρεσία
      </Button>
    </div>
  );
}

/** «Να αδειάσει η …;» question; nothing while it is not asked. */
export function clearDialog(G: Guard) {
  const { run, toast, undoMark, date, g, clearAsk, setClearAsk } = G;
  if (!clearAsk) return null;
  return (
    <Dialog
      role="alertdialog"
      title={'Να αδειάσει η ' + dow(date) + ' ' + dm(date) + ';'}
      onClose={() => setClearAsk(false)}
      footer={
        <>
          <Button variant="outline" data-autofocus="" onClick={() => setClearAsk(false)}>
            Όχι
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              setClearAsk(false);
              if (await run({ t: 'clearDay', date }, false))
                toast({ text: 'Άδειασαν οι θέσεις ' + dow(date) + ' ' + dm(date), actions: [undoMark()] });
            }}
          >
            Ναι, άδειασέ τη
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        Βγαίνουν και οι <b>{Object.values(g).filter(Boolean).length}</b> από τις θέσεις αυτής της μέρας (μένουν κενές).
        Μπορείς να το αναιρέσεις αμέσως μετά.
      </p>
    </Dialog>
  );
}

/** The Friday–Sunday strip: empty seats per day and the buttons that fill and export the three days. */
export function weekendStrip(G: Guard) {
  const { state, run, toast, undoMark, today, psk, people, unlocked, xb, ex } = G;
  if (!psk) return null;
  const pskEmpty = (d: string) => emptyOn(state, G.posts, d);
  const outsAll = isOutsAll(state.settings);
  const noneEmpty = psk.every((d) => !pskEmpty(d));
  return (
    <div className="psk">
      <div>
        <b>Φρουρά ΠΣΚ</b>
        <small>
          {psk.map((d) => dow(d) + ' ' + dm(d) + ': ' + (pskEmpty(d) ? pskEmpty(d) + ' κενές' : 'πλήρης')).join(' · ')}
        </small>
      </div>
      <span className="psk__acts">
        <Button
          size="sm"
          variant="outline"
          disabled={!people.length || noneEmpty || psk.some((d) => d < today && !unlocked[d])}
          why={
            !people.length
              ? 'Δεν υπάρχουν στρατιώτες στο Δυναμολόγιο'
              : noneEmpty
                ? 'Δεν υπάρχουν κενές θέσεις στο ΠΣΚ'
                : 'Μια μέρα του ΠΣΚ πέρασε: ξεκλείδωσέ τη πρώτα'
          }
          onClick={async () => {
            if (await run({ t: 'autofillRange', dates: psk.filter((d) => pskEmpty(d)) }, false))
              toast({
                text:
                  'Συμπληρώθηκε το ΠΣΚ ' +
                  dm(psk[0]) +
                  '–' +
                  dm(psk[2]) +
                  ', μία μέρα μετά την άλλη, με τους κανόνες και ανάμεσά τους.',
                actions: [undoMark()],
              });
          }}
          data-tip="Γεμίζει Παρασκευή, Σάββατο και Κυριακή μαζί. Οι κανόνες (ανάπαυση, νούμερα, ΣΚ) ισχύουν και ανάμεσα στις τρεις μέρες."
        >
          Συμπλήρωση ΠΣΚ
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!xb}
          onClick={() => ex('frouraPsk', psk[0], 'η ΦΡΟΥΡΑ του ΠΣΚ')}
          data-tip="Ένα Excel με τρία φύλλα: Παρ, Σαβ, Κυρ"
        >
          {xb === 'frouraPsk' ? 'Δημιουργία…' : 'Excel ΠΣΚ'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!!xb}
          onClick={() => ex('outsPsk', psk[0], 'οι εξοδούχοι του ΠΣΚ')}
          data-tip={
            'Εξοδούχοι' +
            (outsAll ? ' (όλη η δύναμη)' : '-παραμένοντες') +
            ' για τις τρεις μέρες, ένα φύλλο ανά μέρα' +
            (outsAll ? ' (στην «Όλη η δύναμη» δύο: σελίδα 1 οι εξοδούχοι, σελίδα 2 η υπόλοιπη δύναμη)' : '') +
            '. Η μορφή αλλάζει από τους Εξοδούχους.'
          }
        >
          {xb === 'outsPsk' ? 'Δημιουργία…' : 'Εξοδούχοι ΠΣΚ'}
        </Button>
      </span>
    </div>
  );
}
