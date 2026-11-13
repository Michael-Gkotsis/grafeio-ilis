// «Έλεγχος προηγούμενων υπηρεσιών»: the one-time review after the upgrade to post codes.
// Purpose: `BaselineReviewDialog` lists who has «προηγούμενες υπηρεσίες» and lets you keep, zero or edit them.
// Does NOT: decide when it opens (`needsBaselineReview` in screens/baselineReview.ts, asked by app/Overlays.tsx).
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/people.ts (Phase 6). Only the shell opens it, and
//   it is the «Δυναμολόγιο» data it edits, so it stays in this page (screens/people.ts re-exports it).
// Covering test: test/codes-followups.test.ts, test/dialog-*.test.ts (people-BaselineReviewDialog case).
import { useMemo, useState, type ChangeEvent } from 'react';
import { KIND_LBL, KIND_NAME, type DutyKind } from '../../../../shared/domain';
import { baseTotal, personMap } from '../../../../shared/rules';
import { collator } from '../../../../shared/text';
import { rkShort } from '../../../entities/person';
import { useStore } from '../../../shared/model';
import { Button, Dialog, useToast } from '../../../shared/ui';
import { BASE_KINDS } from '../model/view';

type Counts = Record<number, Record<string, number>>;

/** Props of {@link BaselineReviewDialog}. */
export interface BaselineReviewDialogProps {
  onClose: () => void;
}

/** The review dialog: one row per person with old services, one column per kind that anyone has. */
export function BaselineReviewDialog({ onClose }: BaselineReviewDialogProps) {
  const { state, run } = useStore();
  const toast = useToast();
  const pm = personMap(state.people);
  const ids = useMemo(
    () =>
      Object.keys(state.baseline)
        .map(Number)
        .filter((id) => {
          const b = state.baseline[id];
          return baseTotal(b) > 0 || (b?.hol || 0) > 0;
        })
        .sort((a, b) => collator.compare(pm.get(a)?.last || '', pm.get(b)?.last || '')),
    [],
  );
  const [rows, setRows] = useState<Counts>(() =>
    Object.fromEntries(ids.map((id) => [id, { ...(state.baseline[id] || {}) } as Record<string, number>])),
  );
  const cols = [...BASE_KINDS.filter((k) => ids.some((id) => state.baseline[id]?.[k])), 'hol'];
  const set = (id: number, k: string, v: number) =>
    setRows({ ...rows, [id]: { ...rows[id], [k]: Math.max(0, v || 0) } });
  const save = async (baselines: Counts, text: string) => {
    if (await run({ t: 'setBaselines', baselines }, false)) {
      onClose();
      toast({ text });
    }
  };
  return (
    <Dialog
      size="lg"
      title="Έλεγχος προηγούμενων υπηρεσιών"
      onClose={onClose}
      description="Μέχρι τώρα η ανάγνωση του ελέγχου υπηρεσιών πρόσθετε εδώ όσους δεν χωρούσαν σε θέση, και κάθε ξαναδιάβασμα τους ξαναπρόσθετε. Τώρα αυτές οι υπηρεσίες μπαίνουν με την ημερομηνία τους. Αν δεν τις έγραψες με το χέρι, μηδένισέ τες και ξαναδιάβασε τους μήνες από τα Αρχεία Excel."
      footer={
        <>
          <Button
            variant="outline"
            onClick={() =>
              save(
                Object.fromEntries(ids.map((id) => [id, state.baseline[id] as unknown as Record<string, number>])),
                'Οι προηγούμενες υπηρεσίες έμειναν όπως ήταν',
              )
            }
          >
            Κράτα όπως είναι
          </Button>
          <Button variant="outline" onClick={() => setRows(Object.fromEntries(ids.map((id) => [id, {}])))}>
            Μηδένισε όλες
          </Button>
          <Button onClick={() => save(rows, 'Αποθηκεύτηκαν οι προηγούμενες υπηρεσίες')}>Αποθήκευση</Button>
        </>
      }
    >
      <div className="xl__scroll" style={{ maxHeight: '52vh' }}>
        <table className="mapgrid basegrid">
          <thead>
            <tr>
              <th>Άτομο</th>
              {cols.map((k) => (
                <th key={k}>{k === 'hol' ? 'ΣΚ/αργ.' : KIND_LBL[k as DutyKind]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const p = pm.get(id);
              return (
                <tr key={id}>
                  <td>{p ? rkShort(p) : `Άτομο ${id}`}</td>
                  {cols.map((k) => (
                    <td key={k}>
                      <input
                        className="ui-input"
                        type="number"
                        min="0"
                        aria-label={`${p ? rkShort(p) : ''} ${k === 'hol' ? 'ΣΚ/αργία' : KIND_NAME[k as DutyKind]}`}
                        value={rows[id]?.[k] || ''}
                        placeholder="0"
                        onChange={(e: ChangeEvent<HTMLInputElement>) => set(id, k, +e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: '13px', marginTop: '8px' }}>
        Αν κλείσεις το παράθυρο, θα ξαναβγεί την επόμενη φορά.
      </p>
    </Dialog>
  );
}
