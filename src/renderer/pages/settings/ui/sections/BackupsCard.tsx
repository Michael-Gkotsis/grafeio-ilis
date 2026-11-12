// «Ρυθμίσεις › Αντίγραφα ασφαλείας» card: the USB copy, the list of backups and the restore question.
// Purpose: `BackupsCard` (research §4.2): before a restore the current database is kept as a backup.
// Does NOT: hold state (model/useBackups.ts) or the texts (model/backupsView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered. The list and the dialog are plain functions.
// Covering test: test/screens-settings-guide.test.ts, test/settings-backups-view.test.ts.
import { USB_DAYS } from '../../../../../shared/reminders';
import { dmy, dow } from '../../../../../shared/dates';
import { Button, Card, Dialog } from '../../../../shared/ui';
import {
  AUTO_NOTE,
  USB_LEAD,
  lastUsbClass,
  lastUsbText,
  restoreSubtitle,
  shownBackups,
  sizeKb,
} from '../../model/backupsView';
import { useBackups } from '../../model/useBackups';

type BackupsModel = ReturnType<typeof useBackups>;

/** The backups, newest first, or the loading and empty texts. */
function backupList(m: BackupsModel) {
  const { list, setPick } = m;
  if (!list) return 'Φόρτωση…';
  if (!list.length) return <p className="note">Δεν υπάρχει ακόμα αντίγραφο. Το πρώτο κρατιέται αυτόματα σήμερα.</p>;
  return (
    <ul className="hist">
      {shownBackups(list).map((b) => (
        <li key={b.name}>
          <span className="nw">
            {dow(b.day)} {dmy(b.day)}
          </span>{' '}
          {b.label} <span className="muted">{sizeKb(b)} KB</span>{' '}
          <Button size="sm" variant="outline" onClick={() => setPick(b)}>
            Επαναφορά
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** The «Επαναφορά από αντίγραφο» question for the picked backup. */
function restoreDialog(m: BackupsModel) {
  const { pick, setPick, restore } = m;
  if (!pick) return null;
  return (
    <Dialog
      role="alertdialog"
      title="Επαναφορά από αντίγραφο"
      description={restoreSubtitle(pick)}
      onClose={() => setPick(null)}
      footer={
        <>
          <Button variant="outline" data-autofocus="" onClick={() => setPick(null)}>
            Άκυρο
          </Button>
          <Button variant="destructive" onClick={() => restore(pick)}>
            Επαναφορά και επανεκκίνηση
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        Τα δεδομένα θα γυρίσουν όπως ήταν στο αντίγραφο. Ό,τι έγινε μετά χάνεται, αλλά η τωρινή βάση κρατιέται πρώτα ως
        αντίγραφο «πριν-επαναφορά», οπότε μπορείς να γυρίσεις πίσω.
      </p>
    </Dialog>
  );
}

/** «Αντίγραφα ασφαλείας». */
export function BackupsCard() {
  const m = useBackups();
  const { boot, today, copyToUsb, importFromUsb } = m;
  return (
    <Card title="Αντίγραφα ασφαλείας">
      <p style={{ marginTop: 0 }}>
        {AUTO_NOTE}
        <b>αντίγραφο σε USB</b>
        {' κάθε '}
        {USB_DAYS}
        {USB_LEAD}
        <b className={lastUsbClass(boot.lastUsb, today)}>{lastUsbText(boot.lastUsb)}</b>.
      </p>
      <div className="toolbar">
        <Button onClick={copyToUsb}>Αντίγραφο σε USB…</Button>
        <Button
          variant="outline"
          onClick={importFromUsb}
          data-tip="Για καινούργιο PC ή αν χάλασε η βάση: διάλεξε ένα ilh_….db από το USB και μετά «Επαναφορά»"
        >
          Φέρε αντίγραφο από USB…
        </Button>
        <Button variant="ghost" onClick={() => window.api.openFolder('backups')}>
          Άνοιξε τον φάκελο
        </Button>
      </div>
      {backupList(m)}
      {restoreDialog(m)}
    </Card>
  );
}
