// The «Μορφή:» choice of the Excel of the outs: Τωρινή or Όλη η δύναμη.
// Purpose: `OutsFmtSelect`, one select that stores the choice in the settings (with an undo entry).
// Does NOT: make the Excel (the export button does) or know the formats' layout (shared/domain `OUTS_FMT`).
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6); other screens (Σήμερα) use it
//   through this page's public API.
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { useStore } from '../../../shared/model';
import { Select } from '../../../shared/ui';
import { OUTS_FMT, isOutsAll, type OutsFmt } from '../../../../shared/domain';

// Excel format (Michael, 26/10, 30/10): Τωρινή or Όλη η δύναμη. The last choice stays in the settings and also applies
// to ΠΣΚ and to the automatic rewrite of the outs that already left.
const OUTS_FMT_TIP =
  'Τωρινή: Εξοδούχοι και Παραμένοντες σε δύο φύλλα. Όλη η δύναμη: κάθε άτομο μία φορά, σε δύο σελίδες: σελίδα 1 οι εξοδούχοι (Πίνακας Α), σελίδα 2 η υπόλοιπη δύναμη (είναι ήδη έξω, μένουν μέσα) με το άθροισμα της δύναμης και πότε γυρίζουν οι απόντες. Η επιλογή σου μένει και για τις επόμενες φορές.';

/** The format select; a change is stored as the setting `outsFmt` and stays for the next times (ΠΣΚ included). */
export function OutsFmtSelect() {
  const { state, run } = useStore();
  const fmt: OutsFmt = isOutsAll(state.settings) ? 'all' : 'cur';
  return (
    <div className="gb-mon">
      <small className="gb-mon__lbl" data-tip={OUTS_FMT_TIP}>
        Μορφή:
      </small>
      <Select
        className="ui-input"
        style={{ flex: '0 0 150px', width: '150px', height: '32px', fontSize: '13px' }}
        aria-label="Μορφή Excel εξοδούχων"
        data-tip={OUTS_FMT_TIP}
        value={fmt}
        onChange={(e) => {
          const v = e.target.value as OutsFmt;
          if (v !== fmt)
            run(
              {
                t: 'setSettings',
                settings: { outsFmt: v },
                text: 'μορφή Excel εξοδούχων: ' + OUTS_FMT.find((x) => x[0] === v)![1],
              },
              'Μορφή Excel εξοδούχων: ' + OUTS_FMT.find((x) => x[0] === v)![1] + '. Μένει και για τις επόμενες φορές.',
            );
        }}
      >
        {OUTS_FMT.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </Select>
    </div>
  );
}
