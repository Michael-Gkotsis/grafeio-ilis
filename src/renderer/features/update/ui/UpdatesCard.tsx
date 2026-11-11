// The «Ενημερώσεις» card of Ρυθμίσεις.
// Purpose: `UpdatesCard` shows the version and the last check, and sends the commands: check now, update from a file
// (USB), roll back, and the once-a-day automatic check.
// Does NOT: keep the update state (the main process does) or change an IPC name, payload or text.
// Owner layer: renderer/features/update. Why: moved verbatim from renderer/update.ts (Phase 5.3b).
// Covering test: test/auto-update.test.ts.
import { useState } from 'react';
import type { UpdInfo } from '../../../../shared/api';
import { dmy, today as todayISO } from '../../../../shared/dates';
import { Alert, Button, Card, Dialog, useToast } from '../../../shared/ui';
import { dayOf, hmOf } from '../model/format';
import { useUpd } from '../model/updState';

/** The «Επιστροφή στην …» confirmation. */
function rollbackAsk(u: UpdInfo, setAsk: (b: boolean) => void, back: () => void) {
  return (
    <Dialog
      role="alertdialog"
      title={'Επιστροφή στην ' + u.prev}
      onClose={() => setAsk(false)}
      footer={
        <>
          <Button variant="outline" data-autofocus="" onClick={() => setAsk(false)}>
            Άκυρο
          </Button>
          <Button variant="destructive" onClick={back}>
            Επιστροφή και επανεκκίνηση
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>Η εφαρμογή θα ξανανοίξει με την προηγούμενη έκδοση. Τα δεδομένα σου δεν αλλάζουν.</p>
    </Dialog>
  );
}

/** The version line and the notes about the last check. */
function checkInfo(u: UpdInfo, when: string) {
  return (
    <>
      <p style={{ marginTop: 0 }}>
        Έκδοση <b>{u.version}</b> · τελευταίος έλεγχος {when}
        {u.lastCheck && !u.lastOk ? (
          <>
            {' '}
            <span className="txt-bad">(απέτυχε)</span>
          </>
        ) : (
          ''
        )}
      </p>
      {u.lastCheck > 0 && !u.lastOk && (
        <p className="note">
          Δεν έγινε ο έλεγχος: {u.lastError}. Δεν χρειάζεται να κάνεις κάτι· η εφαρμογή δουλεύει κανονικά.
        </p>
      )}
      {u.lastOk && u.lastCheck > 0 && !u.avail && <p className="note">Έχεις την τελευταία έκδοση.</p>}
      {u.avail && (
        <Alert tone="info">
          <span>
            Υπάρχει νέα έκδοση: <b>{u.avail.version}</b>. Πάτα «Νέα έκδοση» πάνω δεξιά.
          </span>
        </Alert>
      )}
    </>
  );
}

/** The card. Shows only a note when the main process has no update support. */
export function UpdatesCard() {
  const u = useUpd();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  if (!u)
    return (
      <Card title="Ενημερώσεις">
        <p className="note" style={{ margin: 0 }}>
          Η ενημέρωση δεν είναι διαθέσιμη σε αυτή την έκδοση.
        </p>
      </Card>
    );
  const when = !u.lastCheck
    ? 'ποτέ'
    : (dayOf(u.lastCheck) === todayISO() ? 'σήμερα' : dmy(dayOf(u.lastCheck))) + ' ' + hmOf(u.lastCheck);
  const file = async () => {
    const r = await window.api.updFile();
    if (r && !r.ok) toast({ text: r.error });
  };
  const back = async () => {
    setAsk(false);
    const r = await window.api.updRollback();
    if (!r.ok) toast({ text: r.error });
  };
  return (
    <Card title="Ενημερώσεις">
      {checkInfo(u, when)}
      <label className="rule" style={{ margin: '10px 0' }}>
        <input
          type="checkbox"
          className="ui-check"
          checked={u.auto}
          onChange={(e) => window.api.updAuto(e.target.checked)}
        />
        <span>Έλεγχος για νέα έκδοση όταν ανοίγει η εφαρμογή (μία φορά τη μέρα)</span>
      </label>
      <div className="toolbar">
        <Button variant="outline" disabled={u.checking || u.phase !== 'idle'} onClick={() => window.api.updCheck()}>
          {u.checking ? 'Έλεγχος…' : 'Έλεγχος τώρα'}
        </Button>
        <Button variant="outline" disabled={u.phase !== 'idle'} onClick={file}>
          Ενημέρωση από αρχείο (USB)…
        </Button>
        {u.prev && (
          <Button variant="outline" disabled={u.phase !== 'idle'} onClick={() => setAsk(true)}>
            Επιστροφή στην {u.prev}
          </Button>
        )}
      </div>
      <p className="note">
        Χωρίς internet: κατέβασε από άλλο PC το GrafeioIlis-app-{'<έκδοση>'}.zip από τα Releases, βάλ' το σε USB και
        διάλεξέ το εδώ.
      </p>
      {!u.canApply && (
        <p className="note">
          Σε αυτό το σύστημα η εφαρμογή μόνο ελέγχει· την εγκατάσταση τη νέας έκδοσης την κάνεις από τα Releases.{' '}
          <Button variant="link" onClick={() => window.api.updOpenReleases()}>
            Άνοιξε τα Releases
          </Button>
        </p>
      )}
      <Alert>
        <span>Χωρίς internet ή αν αποτύχει ο έλεγχος, η εφαρμογή ανοίγει κανονικά· απλώς δεν βρίσκει νέα έκδοση.</span>
      </Alert>
      {ask && rollbackAsk(u, setAsk, back)}
    </Card>
  );
}
