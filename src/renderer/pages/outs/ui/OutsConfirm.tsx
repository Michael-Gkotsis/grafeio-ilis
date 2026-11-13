// «Τι θα αλλάξει»: the dialog that lists the changes before the outs of the day are saved.
// Purpose: `confirmDialog`, a plain function returning the dialog, called as `{o.confirm && confirmDialog(o)}`.
// Does NOT: save (model/outsActions.ts `makeSave` does) or hold state.
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { RkName, rkShort } from '../../../entities/person';
import { Alert, Badge, Button, Dialog } from '../../../shared/ui';
import { dayName, dm } from '../../../../shared/dates';
import type { Outs } from '../model/useOuts';
import { valLbl, valTone } from '../model/view';

/** Against the rules / ΔΝ without the right. */
const warnAlert = (o: Outs) =>
  o.warns.length > 0 && (
    <Alert tone="warn">
      <span>
        <b>Παρά τους κανόνες:</b>
        {o.warns.map((w) => (
          <span key={w.pid}>
            <br />
            {rkShort(o.pmO.get(w.pid)!)}: {w.why}
          </span>
        ))}
        <br />
        Με την αποθήκευση το επιβεβαιώνεις.
      </span>
    </Alert>
  );

/** «ΔΝ ΣΚ» people who come back on Sunday morning. */
const backAlert = (o: Outs) =>
  o.sunBackOnly.length > 0 && (
    <Alert tone="info">
      <span>
        <b>ΔΝ ΣΚ, γυρίζουν Κυριακή πρωί</b> (δεν μπαίνει ΔΝ την Κυριακή):
        {o.sunBackOnly.map((x) => (
          <span key={x.pid}>
            <br />
            {rkShort(o.pmO.get(x.pid)!)}: {x.why}
          </span>
        ))}
      </span>
    </Alert>
  );

/** «ΔΝ ΣΚ» people whose leave starts on Sunday. */
const leaveAlert = (o: Outs) =>
  o.sunLeave.length > 0 && (
    <Alert tone="info">
      <span>
        <b>ΔΝ ΣΚ, ξεκινά άδεια την Κυριακή</b> (μένει μόνο η ΔΝ του Σαββάτου· γράφεται στις Παρατηρήσεις):
        {o.sunLeave.map((x) => (
          <span key={x.pid}>
            <br />
            {rkShort(o.pmO.get(x.pid)!)}: {x.why}
          </span>
        ))}
      </span>
    </Alert>
  );

/** The list of changed choices and notes. */
const changeList = (o: Outs) => (
  <ul className="hist">
    {o.diffs.map((c) => (
      <li key={c.pid}>
        <b>
          <RkName p={o.pmO.get(c.pid)!} />
        </b>{' '}
        <span className="muted">{valLbl(c.from, o.aways.get(c.pid)?.st)} →</span>{' '}
        {c.to ? <Badge tone={valTone(c.to)}>{valLbl(c.to)}</Badge> : valLbl(null, o.aways.get(c.pid)?.st)}
        {c.to === 'DNSK' && !o.sunWhy(c.pid) ? (
          <>
            {' '}
            <span className="muted">και ΔΝ την Κυριακή</span>
          </>
        ) : null}
      </li>
    ))}
    {o.noteChanges.map((n) => (
      <li key={'n' + n.pid}>
        <b>
          <RkName p={o.pmO.get(n.pid)!} />
        </b>{' '}
        <span className="muted">παρατήρηση →</span> {n.note ? '«' + n.note + '»' : <span className="muted">καμία</span>}
      </li>
    ))}
  </ul>
);

/** The present count after the changes. */
const presentLine = (o: Outs) => (
  <p className="note" style={{ margin: 0 }}>
    Παρόντες απόψε: {o.c0.present} → {o.c0.present - o.awayDelta}. Οι Παραμένοντες βγαίνουν στο Excel με τον λόγο στις
    Παρατηρήσεις.
  </p>
);

/** The dialog: warnings (against the rules, «ΔΝ ΣΚ» consequences), the list of changes and the present count. */
export const confirmDialog = (o: Outs) => (
  <Dialog
    title="Τι θα αλλάξει"
    description={'Εξοδούχοι ' + dayName(o.date, o.today).toLowerCase() + ' ' + dm(o.date)}
    onClose={() => o.setConfirm(false)}
    footer={
      <>
        <Button variant="outline" onClick={() => o.setConfirm(false)}>
          Πίσω
        </Button>
        <Button onClick={o.save}>{o.warns.length ? 'Αποθήκευση παρά τους κανόνες' : 'Αποθήκευση'}</Button>
      </>
    }
  >
    {warnAlert(o)}
    {backAlert(o)}
    {leaveAlert(o)}
    {changeList(o)}
    {presentLine(o)}
  </Dialog>
);
