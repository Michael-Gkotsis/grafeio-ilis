// One row of the «Ιστορικό» ledger: when, what, which forms, where from, and the undo button of the newest action.
// Purpose: `HistoryRow`, a `<tr>` of the table drawn by HistoryScreen.
// Does NOT: decide which row is the newest (`last`, from model/useHistory.ts) or hold state.
// Owner layer: renderer/pages/history. Why: split from HistoryScreen.tsx in U9 to keep that file under 150 lines.
// Covering test: test/screens-main.test.ts, test/history-view.test.ts, bench:styles (group «Ιστορικό»).
import { dm } from '../../../../shared/dates';
import type { AuditEntry } from '../../../../shared/domain';
import { SRC } from '../../../shared/lib/auditSource';
import { Badge, Button } from '../../../shared/ui';

/** Props of {@link HistoryRow}. */
export interface HistoryRowProps {
  entry: AuditEntry;
  /** ISODate (local time) of today: shown as «Σήμερα» instead of dd/mm. */
  today: string;
  /** True only for the newest action: it is the only one with an undo button. */
  isLast: boolean;
  onUndo: (id: number) => void;
}

/** A ledger row. Undone rows get `is-undone` (muted, text struck through); files are joined with « · » or «—». */
export function HistoryRow({ entry: e, today, isLast, onUndo }: HistoryRowProps) {
  return (
    <tr className={e.undone ? 'history__row is-undone' : 'history__row'}>
      <td className="history__time">
        {e.day === today ? 'Σήμερα' : dm(e.day)} {e.at}
      </td>
      <td className="history__what">
        <b>{e.text}</b>
        {e.undone && (
          <>
            {' '}
            <Badge>Αναιρέθηκε</Badge>
          </>
        )}
      </td>
      <td className="history__files">{e.files.length ? e.files.join(' · ') : '—'}</td>
      <td className="history__src">
        <Badge tone={SRC[e.source][1]}>{SRC[e.source][0]}</Badge>
      </td>
      <td className="history__undo">
        {isLast ? (
          <Button size="sm" variant="outline" onClick={() => onUndo(e.id)}>
            Αναίρεση
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
