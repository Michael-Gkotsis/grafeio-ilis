// The bar and the question for cards with changes that were not saved.
// Purpose: `PendingBar` shows «Δεν αποθηκεύτηκαν οι αλλαγές» with save / discard, and the dialog asked before leaving.
// Does NOT: know which cards are dirty (pending.ts registers them) or decide when to ask (useRouter.ts does).
// Owner layer: renderer/app. Why: in Settings the «Αποθήκευση» button can be far below the fold, so the bar stays at
//   the bottom; the question protects the user when they click away from a dirty card.
// Covering test: test/status-fix.test.ts (bar and question), test/rep-page.test.ts (question when leaving a form page).
import { useState } from 'react';
import { closeLeaveAsk, discardAll, saveAll, useLeaveAsk, usePendingList } from '../pending';
import { Button, Dialog } from '../ui';

/** Bottom bar while a card has unsaved changes, and the question before leaving the page. */
export function PendingBar() {
  const list = usePendingList();
  const asking = useLeaveAsk();
  const [busy, setBusy] = useState(false);
  const names = [...new Set(list.map((p) => p.label))].join(', ');
  const shown = list.some((p) => p.bar !== false);
  const saveThen = async (go?: () => void) => {
    setBusy(true);
    const ok = await saveAll();
    setBusy(false);
    if (ok && go) {
      closeLeaveAsk();
      go();
    } else if (!ok) closeLeaveAsk();
  };
  return (
    <>
      {shown && (
        <div className="pendbar" role="status">
          <span>
            Δεν αποθηκεύτηκαν οι αλλαγές: <b>{names}</b>
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            data-tip="Γυρίζουν όπως ήταν πριν τις αλλάξεις"
            onClick={discardAll}
          >
            Άκυρο
          </Button>
          <Button size="sm" disabled={busy} onClick={() => saveThen()}>
            Αποθήκευση
          </Button>
        </div>
      )}
      {asking && list.length > 0 && (
        <Dialog
          role="alertdialog"
          title="Δεν αποθηκεύτηκαν οι αλλαγές"
          onClose={closeLeaveAsk}
          footer={
            <>
              <Button variant="ghost" onClick={closeLeaveAsk}>
                Μείνε εδώ
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  discardAll();
                  closeLeaveAsk();
                  asking();
                }}
              >
                Πέτα τις αλλαγές
              </Button>
              <Button data-autofocus="" disabled={busy} onClick={() => saveThen(asking)}>
                Αποθήκευση και συνέχεια
              </Button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Άλλαξες <b>{names}</b> και δεν το αποθήκευσες. Αν συνεχίσεις χωρίς αποθήκευση, οι αλλαγές χάνονται.
          </p>
        </Dialog>
      )}
    </>
  );
}
