// Screen «Ιστορικό»: every action, where it came from and which forms it touches; undo of the newest one.
// Purpose: `HistoryScreen`, also opened from the top bar «Ιστορικό ενεργειών».
// Does NOT: hold state (model/useHistory.ts) or the filter rules (model/view.ts).
// Owner layer: renderer/pages/history. Why: moved from screens/other.ts (Phase 6); U9 turned the list into a ledger
//   table (rows in HistoryRow.tsx), only the four column labels are new texts.
// Covering test: test/screens-main.test.ts, test/history-view.test.ts.
import { SRC } from '../../../shared/lib/auditSource';
import { ActiveFilter, Button, PageHeader, Segmented } from '../../../shared/ui';
import { useHistory } from '../model/useHistory';
import { HistoryRow } from './HistoryRow';

/** The «Ιστορικό» page: search and source filter, the log (60 lines, then «Δείξε παλιότερες») and the undo button. */
export function HistoryScreen() {
  const { audit, today, undo, last, q, setQ, dq, src, setSrc, list, setMore, shown } = useHistory();
  return (
    <div>
      <PageHeader
        title="Ιστορικό"
        sub="Κάθε ενέργεια, από πού έγινε και ποια έντυπα αφορά. Η αναίρεση γίνεται από την πιο πρόσφατη προς τα πίσω."
      />
      {audit.length > 0 && (
        <div className="toolbar">
          <input
            type="search"
            className="ui-input"
            aria-label="Αναζήτηση στο ιστορικό"
            placeholder="Επώνυμο, ενέργεια ή αρχείο (χωρίς τόνους) · Ctrl+F"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Segmented
            small={true}
            value={src}
            onChange={setSrc}
            items={[
              { value: 'all', label: 'Όλα' },
              ...Object.keys(SRC)
                .filter((k) => audit.some((e) => e.source === k))
                .map((k) => ({ value: k, label: SRC[k][0] })),
            ]}
          />
          <ActiveFilter
            parts={[src !== 'all' && SRC[src][0], dq && `«${dq}»`]}
            onClear={() => {
              setQ('');
              setSrc('all');
            }}
          />
          <span className="toolbar__count">
            {list.length} από {audit.length}
          </span>
        </div>
      )}
      <div className="ui-card">
        {audit.length && !list.length ? (
          <div className="empty">Καμία ενέργεια δεν ταιριάζει.</div>
        ) : audit.length ? (
          <>
            <table className="history__table">
              <thead>
                <tr>
                  <th scope="col">Πότε</th>
                  <th scope="col">Τι έγινε</th>
                  <th scope="col">Χαρτιά που άλλαξαν</th>
                  <th scope="col">Από</th>
                  <th scope="col">
                    <span className="history__sr">Αναίρεση</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <HistoryRow key={e.id} entry={e} today={today} isLast={e === last} onUndo={undo} />
                ))}
              </tbody>
            </table>
            {shown.length < list.length && (
              <div className="toolbar history__more">
                <Button variant="outline" size="sm" onClick={() => setMore((m) => m + 1)}>
                  {'Δείξε παλιότερες ('}
                  {list.length - shown.length}
                  {')'}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="empty">Δεν έχει γίνει ακόμα καμία ενέργεια.</div>
        )}
      </div>
    </div>
  );
}
