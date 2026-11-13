// The dialog «Κανόνες υπηρεσιών»: who is placed on duty and in which order; three tabs, one draft, one «Αποθήκευση».
// Purpose: `RulesDialog`, tabs Κανόνες · Σειρά δικαιοσύνης · Ώρες. The tab ids `rules`, `order`, `hours` are kept.
// Does NOT: hold state (model/useRulesDialog.ts), draw a tab (the other files of ui/, plain functions) or place
//   anybody.
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); `onTab` and `onFixed` let the
//   links of the tabs act on the Υπηρεσίες screen after the dialog closes.
// Covering test: test/ux-names.test.ts, test/screens-main.test.ts, test/guard-page-view.test.ts.
import { Button, Dialog, Segmented, Why } from '../../../shared/ui';
import { useRulesDialog } from '../model/useRulesDialog';
import { hoursTab } from './HoursTab';
import { orderTab } from './OrderTab';
import { rulesTab } from './RulesTab';

/** Props of {@link RulesDialog}. */
export interface RulesDialogProps {
  onClose: () => void;
  /** Open this tab of the Υπηρεσίες screen (`who`, `skips`, `check`). */
  onTab: (tab: string) => void;
  /** Open the dialog of the permanent Λ/Υ-Δ/Υ. */
  onFixed: () => void;
}

/** The dialog. */
export function RulesDialog({ onClose, onTab, onFixed }: RulesDialogProps) {
  const d = useRulesDialog(onClose);
  const { tab, setTab, badT, badTxt, dirty, save } = d;
  return (
    <Dialog
      size="lg"
      title="Κανόνες υπηρεσιών"
      description="Ποιος μπαίνει σε υπηρεσία και με ποια σειρά. Ισχύουν στην επιλογή ατόμου και στην αυτόματη συμπλήρωση."
      onClose={onClose}
      dirty={dirty && 'Οι αλλαγές στους κανόνες δεν αποθηκεύτηκαν. Αν κλείσεις, μένουν οι παλιοί.'}
      footer={
        <>
          <Why text={badT && badTxt} />
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={badT} why={badTxt} onClick={save}>
            Αποθήκευση
          </Button>
        </>
      }
    >
      <Segmented
        value={tab}
        onChange={setTab}
        label="Καρτέλες των κανόνων"
        items={[
          { value: 'rules', label: 'Κανόνες' },
          { value: 'order', label: 'Σειρά δικαιοσύνης' },
          { value: 'hours', label: 'Ώρες' + (badT ? ' ⚠' : '') },
        ]}
      />
      {tab === 'rules' ? rulesTab(d, onTab, onFixed) : tab === 'order' ? orderTab(d, onTab) : hoursTab(d)}
    </Dialog>
  );
}
