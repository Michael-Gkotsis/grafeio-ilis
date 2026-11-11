// The update dialog: a new version exists, the update is running, or it is ready to restart.
// Purpose: `UpdateDialog` shows the step of the update that `u.phase` says; the buttons send the commands.
// Does NOT: keep the update state (the main process does) or change an IPC name or text.
// Owner layer: renderer/features/update. Why: moved verbatim from renderer/update.ts (Phase 5.3b).
// Covering test: test/auto-update.test.ts.
import { useState } from 'react';
import type { UpdInfo } from '../../../../shared/api';
import { dmy } from '../../../../shared/dates';
import { Alert, Button, Dialog } from '../../../shared/ui';
import { mb } from '../model/format';

/** Props of `UpdateDialog`. */
export interface UpdateDialogProps {
  u: UpdInfo;
  onClose: () => void;
}

/** Phase 'ready': restart now or at the next close. */
function updReady(u: UpdInfo, onClose: () => void) {
  return (
    <Dialog
      title="Η ενημέρωση είναι έτοιμη"
      description={'Κατέβηκε και ελέγχθηκε η ' + (u.readyVersion || u.target)}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Στο κλείσιμο
          </Button>
          <Button data-autofocus="" onClick={() => window.api.updRestart()}>
            Επανεκκίνηση τώρα
          </Button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Η εφαρμογή θα κλείσει και θα ανοίξει ξανά με τη νέα έκδοση. Ό,τι δεν έχεις αποθηκεύσει, αποθήκευσέ το πρώτα.
      </p>
      <p className="muted" style={{ marginBottom: 0 }}>
        Αν πατήσεις «Στο κλείσιμο», η αλλαγή γίνεται όταν κλείσεις την εφαρμογή.
      </p>
    </Dialog>
  );
}

/** Phase 'working': the three steps (backup, download, unpack) with the progress bar. */
function updWorking(u: UpdInfo, onClose: () => void) {
  const pct = u.total > 0 ? Math.min(100, Math.round((u.got * 100) / u.total)) : 0;
  const st = (n: number, text: string) => (
    <li key={n} className={u.step === n ? '' : u.step > n ? '' : 'muted'}>
      {u.step > n ? '✓ ' : u.step === n ? '… ' : ''}
      {text}
    </li>
  );
  return (
    <Dialog
      title={'Ενημέρωση σε ' + u.target}
      description="Μπορείς να συνεχίσεις να δουλεύεις όσο κατεβαίνει"
      onClose={onClose}
      footer={
        <Button variant="outline" disabled={u.step > 2} onClick={() => window.api.updCancel()}>
          Ακύρωση
        </Button>
      }
    >
      <p style={{ marginTop: 0 }}>
        {u.step === 2 && u.total > 0
          ? 'Κατέβασμα… ' + mb(u.got) + ' από ' + mb(u.total) + ' MB'
          : u.step === 1
            ? 'Αντίγραφο της βάσης…'
            : u.step === 3
              ? 'Αποσυμπίεση και έλεγχος…'
              : 'Κατέβασμα…'}
      </p>
      <div className="updbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <i style={{ width: pct + '%' }} />
      </div>
      <ol className="updsteps">
        {st(1, 'Αντίγραφο βάσης' + (u.backup ? ': ' + u.backup : ''))}
        {st(2, 'Κατέβασμα και έλεγχος (SHA-256)')}
        {st(3, 'Αποσυμπίεση και έτοιμη επανεκκίνηση')}
      </ol>
    </Dialog>
  );
}

/** No new version: the error of the last check, or «you have the latest». */
function updNone(u: UpdInfo, onClose: () => void) {
  return (
    <Dialog title="Ενημέρωση" onClose={onClose} footer={<Button onClick={onClose}>Εντάξει</Button>}>
      {u.error ? (
        <Alert tone="bad">
          <span>{u.error}</span>
        </Alert>
      ) : (
        <p style={{ margin: 0 }}>Έχεις την τελευταία έκδοση ({u.version}).</p>
      )}
    </Dialog>
  );
}

/** The note above the changes: what this update needs and what it leaves alone. */
function availNote(u: UpdInfo, setup: boolean | undefined) {
  if (setup)
    return (
      <Alert tone="warn">
        <span>
          Αυτή η έκδοση χρειάζεται νέο Setup.exe (αλλάζει το Electron). Κατέβασέ το από τα Releases και τρέξε το· τα
          δεδομένα σου μένουν.
        </span>
      </Alert>
    );
  if (!u.canApply)
    return (
      <Alert tone="info">
        <span>Σε αυτό το σύστημα η ενημέρωση γίνεται από τα Releases (κατέβασμα και εγκατάσταση).</span>
      </Alert>
    );
  return (
    <Alert tone="info">
      <span>
        Τα δεδομένα σου (data\, templates\, ρυθμίσεις) δεν πειράζονται. Πριν την αλλαγή κρατιέται αντίγραφο της βάσης
        στην Επαναφορά.
      </span>
    </Alert>
  );
}

/** A new version exists: what changed, «Ενημέρωση τώρα» (or «Άνοιξε τα Releases») and «Αργότερα». */
function updAvail(u: UpdInfo, later: () => void, skip: boolean, setSkip: (b: boolean) => void) {
  const a = u.avail!;
  const mayApply = u.canApply && !a.setup;
  return (
    <Dialog
      title="Υπάρχει νέα έκδοση"
      description={
        'Έχεις ' +
        u.version +
        ' · νέα ' +
        a.version +
        (a.date ? ' (' + dmy(a.date) + ')' : '') +
        ' · ' +
        mb(a.size) +
        ' MB'
      }
      onClose={later}
      footer={
        <>
          <Button variant="outline" onClick={later}>
            Αργότερα
          </Button>
          {mayApply ? (
            <Button data-autofocus="" onClick={() => window.api.updStart()}>
              Ενημέρωση τώρα
            </Button>
          ) : (
            <Button data-autofocus="" onClick={() => window.api.updOpenReleases()}>
              Άνοιξε τα Releases
            </Button>
          )}
        </>
      }
    >
      <div className="stack">
        {availNote(u, a.setup)}
        {u.error && (
          <Alert tone="bad">
            <span>{u.error}</span>
          </Alert>
        )}
        {a.notes.length > 0 && (
          <div>
            <b>Τι άλλαξε</b>
            <ul className="updnotes">
              {a.notes.map((n, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the notes are plain strings; the position is the identity (as before)
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <label className="rule">
          <input type="checkbox" className="ui-check" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
          <span>Να μη με ξαναρωτήσει για την {a.version}</span>
        </label>
      </div>
    </Dialog>
  );
}

/** The dialog of the step `u.phase` says. «Αργότερα» can ask the main process not to offer this version again. */
export function UpdateDialog({ u, onClose }: UpdateDialogProps) {
  const [skip, setSkip] = useState(false);
  const later = () => {
    if (skip) window.api.updSkip();
    onClose();
  };
  if (u.phase === 'ready') return updReady(u, onClose);
  if (u.phase === 'working') return updWorking(u, onClose);
  if (!u.avail) return updNone(u, onClose);
  return updAvail(u, later, skip, setSkip);
}
