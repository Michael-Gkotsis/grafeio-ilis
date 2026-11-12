// Screen «Ιστορικό»: every action, where it came from and which forms it touches; undo of the newest one.
// Purpose: `HistoryScreen`, also opened from the top bar «Ιστορικό ενεργειών».
// Does NOT: hold state (model/useHistory.ts) or the filter rules (model/view.ts).
// Owner layer: renderer/pages/history. Why: moved verbatim from screens/other.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered.
// Covering test: test/screens-main.test.ts, test/history-view.test.ts.
import { dm } from '../../../../shared/dates';
import { SRC } from '../../../shared/lib/auditSource';
import { ActiveFilter, Badge, Button, PageHeader, Segmented } from '../../../shared/ui';
import { useHistory } from '../model/useHistory';

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
            <ul className="log">
              {shown.map((e) => (
                <li key={e.id} className={e.undone ? 'is-undone' : ''}>
                  <span className="log__time">
                    {e.day === today ? 'Σήμερα' : dm(e.day)}
                    <br />
                    {e.at}
                  </span>
                  <div>
                    <b>{e.text}</b> <Badge tone={SRC[e.source][1]}>{SRC[e.source][0]}</Badge>
                    {e.undone && (
                      <>
                        {' '}
                        <Badge>Αναιρέθηκε</Badge>
                      </>
                    )}
                    <div className="log__files">{e.files.join(' · ')}</div>
                  </div>
                  {e === last ? (
                    <Button size="sm" variant="outline" onClick={() => undo(e.id)}>
                      Αναίρεση
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {shown.length < list.length && (
              <div className="toolbar" style={{ justifyContent: 'center', margin: '8px 0' }}>
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
