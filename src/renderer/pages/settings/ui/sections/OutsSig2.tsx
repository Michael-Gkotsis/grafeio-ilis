// «Ρυθμίσεις › Υπογραφές › Σελίδα 2 (ΔΥΝΑΜΗ)»: the signatures of page 2 of the Εξοδούχοι «Όλη η δύναμη» sheet.
// Purpose: `OutsSig2`, shown under the Εξοδούχοι signatures when the out list has the «Όλη η δύναμη» shape: the same
//   signatures as page 1, none, or an own list.
// Does NOT: hold state (model/useOutsSig2.ts) or the texts (model/sigsView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-settings-guide.test.ts, test/settings-sigs-view.test.ts.
import { OUTS_SIG2, type OutsSig2 as Page2Mode } from '../../../../../shared/sigs';
import { SigEditor } from '../../../../features/sigs-edit';
import { Button, Select, type ValueEvent } from '../../../../shared/ui';
import { page2Sentence } from '../../model/sigsView';
import { useOutsSig2 } from '../../model/useOutsSig2';

/** One text node: the start of the note, up to the space before the page-2 sentence. */
const PAGE2_NOTE =
  'Στη μορφή «Όλη η δύναμη» το Excel έχει δύο σελίδες: η 1 οι εξοδούχοι (Πίνακας Α), η 2 η υπόλοιπη δύναμη. ' +
  'Η σελίδα 1 έχει τις υπογραφές της λίστας πάνω. ';

/** «Σελίδα 2 (ΔΥΝΑΜΗ)». */
export function OutsSig2() {
  const { mode, list, changed, setEdit, pick, save } = useOutsSig2();
  return (
    <div
      className="sigs2"
      style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--line, #d0d4c4)' }}
    >
      <div className="toolbar" style={{ alignItems: 'center', marginBottom: '6px' }}>
        <b>Σελίδα 2 (ΔΥΝΑΜΗ)</b>
        <Select
          className="ui-select"
          aria-label="Υπογραφές στη σελίδα 2 των Εξοδούχων"
          value={mode}
          onChange={(e: ValueEvent) => pick(e.target.value as Page2Mode)}
        >
          {OUTS_SIG2.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      <p className="note" style={{ marginTop: 0 }}>
        {PAGE2_NOTE}
        {page2Sentence(mode)}
      </p>
      {mode === 'own' && (
        <>
          <SigEditor value={list} onChange={setEdit} id="sg-outs2" />
          <div className="toolbar" style={{ marginTop: '8px' }}>
            <Button disabled={!changed} why="Δεν άλλαξε κάτι" onClick={save}>
              Αποθήκευση
            </Button>
            {changed && (
              <Button variant="ghost" onClick={() => setEdit(undefined)}>
                Άκυρο
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
