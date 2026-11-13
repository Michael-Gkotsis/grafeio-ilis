// The left column of the «Θέσεις» tab: notices, the bar, the weekend strip, the blocks with their seats and the
// seats without a post.
// Purpose: `guardLeft`, a plain function called as `{guardLeft(G)}`.
// Does NOT: hold state (model/useGuard.ts) or place anybody.
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); same markup and commands.
// Covering test: test/screens-main.test.ts, test/status-fix.test.ts.
import { dm } from '../../../../shared/dates';
import { KIND_NAME, type DutyKind } from '../../../../shared/domain';
import { rkShort } from '../../../entities/person';
import { Alert, Button } from '../../../shared/ui';
import { monLbl } from '../model/checkView';
import type { Guard } from '../model/useGuard';
import { guardBar, clearDialog, weekendStrip } from './GuardBar';
import { guardBlocks } from './GuardBlocks';

// «Υπηρεσίες χωρίς θέση (από Excel)»: duties that count in the totals but have no seat.
function seatlessCard(G: Guard) {
  const { run, toast, undoMark, date, pm, seatless } = G;
  if (!(seatless.length > 0)) return false;
  return (
    <section className="ui-card seatless" aria-label="Υπηρεσίες χωρίς θέση">
      <h2 className="minihd">Υπηρεσίες χωρίς θέση (από Excel) · {seatless.length}</h2>
      <p className="note" style={{ margin: '0 0 6px' }}>
        Σκέτο «Θ», «Μ», «Σ» στον έλεγχο υπηρεσιών: μετρούν στα σύνολα, στην ανάπαυση και στις αργίες, όχι στον κανόνα
        του ίδιου νούμερου. Όταν μπει ο ίδιος σε θέση του ίδιου είδους, φεύγει από εδώ.
      </p>
      <ul className="hist">
        {seatless.map((e) => (
          <li key={e.pid + e.kind}>
            <span>{pm.get(e.pid) ? rkShort(pm.get(e.pid)!) : '?'}</span>{' '}
            <span className="muted">{KIND_NAME[e.kind as DutyKind]}</span>{' '}
            <Button
              size="sm"
              variant="ghost"
              aria-label={'Βγάλε ' + (pm.get(e.pid) ? rkShort(pm.get(e.pid)!) : '') + ' από τις υπηρεσίες χωρίς θέση'}
              data-tip="Δεν έκανε αυτή την υπηρεσία"
              onClick={async () => {
                if (await run({ t: 'removeDutyLog', date, pid: e.pid, kind: e.kind }, false))
                  toast({ text: 'Βγήκε από τις υπηρεσίες ' + dm(date), actions: [undoMark()] });
              }}
            >
              ✕
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The table of the blocks with its header row.
function gtable(G: Guard) {
  const { mon } = G;
  return (
    <div className="gtable">
      <div className="gtable__head post" aria-hidden="true">
        <span>Θέση · ώρες</span>
        <span>Ποιος</span>
        <span
          data-tip={
            'Υπηρεσίες αυτού του είδους / σύνολο · ' +
            (mon.allM ? 'όλοι οι μήνες, μαζί με τις προηγούμενες' : monLbl(mon.ym)) +
            ' (αλλάζει από τον μήνα πάνω δεξιά)'
          }
        >
          Είδ./Σύν.
        </span>
        <span />
      </div>
      {guardBlocks(G)}
    </div>
  );
}

/** The column. */
export function guardLeft(G: Guard) {
  const { date, locked, printed, unlocked, setUnlocked, g, setClearAsk, sentinel } = G;
  return (
    <div className="guard__left">
      {locked && (
        <Alert tone="info">
          <span>Περασμένη μέρα: οι θέσεις είναι κλειδωμένες για να μην αλλάξει κατά λάθος ο έλεγχος υπηρεσιών.</span>
          <Button size="sm" variant="outline" onClick={() => setUnlocked({ ...unlocked, [date]: true })}>
            Ξεκλείδωσε για διόρθωση
          </Button>
        </Alert>
      )}
      {printed && (
        <Alert tone="info">
          <span>
            Βγήκε Excel για αυτή τη μέρα στις <b>{printed}</b>. Αν αλλάξεις κάτι, βγάλ' το ξανά.
          </span>
        </Alert>
      )}
      <div ref={sentinel} aria-hidden="true" />
      {guardBar(G)}
      {clearDialog(G)}
      {weekendStrip(G)}
      {gtable(G)}
      {!locked && Object.values(g).some(Boolean) && (
        <div className="gb-clear">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setClearAsk(true)}
            data-tip="Βγάζει όλους από τις θέσεις αυτής της μέρας (ρωτά πρώτα)"
          >
            Άδειασε τη μέρα…
          </Button>
        </div>
      )}
      {seatlessCard(G)}
    </div>
  );
}
