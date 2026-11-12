// The «Επαναφορά: <ΕΣΣΟ>» confirmation: the app goes back to an archived ΕΣΣΟ and restarts.
// Purpose: `RestoreDialog`.
// Does NOT: list the archives (EssoCards.tsx); it restores the one it is given.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/esso.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered.
// Covering test: test/screens-dialogs-shell.test.ts (snapshot esso-RestoreDialog).
import { useState } from 'react';
import { currentEsso, essoName } from '../../../../../shared/esso';
import type { EssoArchiveInfo } from '../../../../../shared/api';
import { HK } from '../../../../../shared/unit';
import { useStore } from '../../../../shared/model';
import { Button, Dialog, useToast } from '../../../../shared/ui';
import { atTxt } from '../../model/essoView';

export interface RestoreDialogProps {
  /** The archive to go back to. */
  a: EssoArchiveInfo;
  onClose: () => void;
}

/** The alert dialog that restores archive `a` (the current ΕΣΣΟ is archived first by the main process). */
export function RestoreDialog({ a, onClose }: RestoreDialogProps) {
  const { state } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const cur = currentEsso(state);
  const go = async () => {
    setBusy(true);
    const r = await window.api.essoRestore(a.dir);
    setBusy(false);
    if (!r.ok) toast({ text: r.error });
  };
  return (
    <Dialog
      role="alertdialog"
      title={'Επαναφορά: ' + a.name}
      description={atTxt(a.at) + ' · ' + a.people + ' σε δύναμη'}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="outline" data-autofocus="" disabled={busy} onClick={onClose}>
            Άκυρο
          </Button>
          <Button variant="destructive" disabled={busy} onClick={go}>
            {busy ? 'Γίνεται…' : 'Επαναφορά και επανεκκίνηση'}
          </Button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Η εφαρμογή θα γυρίσει όπως ήταν στην {a.name}: στρατιώτες, καταστάσεις, υπηρεσίες, {HK()}, ιστορικό και
        ρυθμίσεις. Τα Excel της ανοίγουν από εκεί που ήταν, ή από τα αντίγραφα του φακέλου αν δεν υπάρχουν πια.
      </p>
      <p>
        Πρώτα {cur ? 'η ' + essoName(cur) : 'η τωρινή ΕΣΣΟ'} μπαίνει κι αυτή στο αρχείο, για να γυρίσεις σε αυτήν με τον
        ίδιο τρόπο. Η εφαρμογή δεν γράφει μόνη της στα Excel μέχρι να πατήσεις «Ανανέωση από Excel» ή «Ενημέρωση Excel».
      </p>
    </Dialog>
  );
}
