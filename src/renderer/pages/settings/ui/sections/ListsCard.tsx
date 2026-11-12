// «Ρυθμίσεις › Λίστες» card: the lists the forms and the Excel drop-downs offer (ranks, specialties, medicals…).
// Purpose: `ListsCard` (Michael, 13/10): the basic items are hidden, never deleted; the own ones are deleted only if
//   nobody has them. Each own item says explicitly how it counts (ΗΚΑΙ row or column, penalty text).
// Does NOT: hold state (model/useLists.ts) or the rules (model/listsView.ts, model/listsPlans.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/lists.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered.
// Covering test: test/screens-settings-guide.test.ts, test/lists.test.ts.
import { LIST_NAME } from '../../../../../shared/ranks';
import { Card, Select, type ValueEvent } from '../../../../shared/ui';
import { listHelp } from '../../model/listsView';
import { useLists } from '../../model/useLists';
import { addError, addRow } from './ListAddForm';
import { baseLeaveRows, listRow } from './ListRow';

/** The «Λίστες» card of «Ρυθμίσεις». */
export function ListsCard() {
  const m = useLists();
  const { id, ids, rows } = m;
  return (
    <Card
      title="Λίστες"
      actions={
        <Select
          className="ui-select"
          aria-label="Ποια λίστα"
          value={id}
          onChange={(e: ValueEvent) => m.select(e.target.value as typeof id)}
        >
          {ids.map((v) => (
            <option key={v} value={v}>
              {LIST_NAME[v]}
            </option>
          ))}
        </Select>
      }
    >
      <p className="note" style={{ marginTop: 0 }}>
        {listHelp()[id]}
        {id === 'siUnarmed'
          ? ' Όποιο βασικό απενεργοποιήσεις δεν ισχύει πια.'
          : ' Ό,τι κρύψεις δεν προτείνεται πια, αλλά όσοι το έχουν ήδη το κρατούν.'}
        {id === 'soldierRanks' || id === 'origins' || id === 'specs'
          ? ' Στο Excel η λίστα μπαίνει με την επόμενη εγγραφή ή με «Ενημέρωση Excel».'
          : ''}
      </p>
      <ul className="hist">
        {rows.map((r) => listRow(m, r))}
        {baseLeaveRows(m)}
      </ul>
      {addRow(m)}
      {addError(m)}
    </Card>
  );
}
