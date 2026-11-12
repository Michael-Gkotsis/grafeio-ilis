// The «Εγγραφές και διαγραφές» card: who joined or left on the day, with «Να μη γραφτεί» for each.
// Purpose: `HkaiMovesCard`; the lists (1. ΕΓΓΡΑΦΕΣ / 2. ΔΙΑΓΡΑΦΕΣ) are written by themselves from the personnel data.
// Does NOT: hold state (model/useHkaiMoves.ts). Renders nothing when nobody joined or left.
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// Covering test: test/screens-main.test.ts.
import { RkName } from '../../../entities/person';
import { Button, Card } from '../../../shared/ui';
import type { Person } from '../../../../shared/domain';
import { dm } from '../../../../shared/dates';
import { outReason, personLine } from '../../../../shared/hkaiText';
import { HK } from '../../../../shared/unit';
import { useHkaiMoves } from '../model/useHkaiMoves';

/** The card; `date` is an ISODate. */
export function HkaiMovesCard({ date }: { date: string }) {
  const { today, nav, ins, outs, drop } = useHkaiMoves(date);
  if (!ins.length && !outs.length) return null;
  const list = (ps: Person[], field: 'inOn' | 'outOn') => (
    <ol className="hk-req">
      {ps.map((p) => (
        <li key={p.id}>
          <div className="hk-req__row">
            <span>
              <button type="button" className="linkish" onClick={() => nav.openPerson(p.id)}>
                <RkName p={p} />
              </button>{' '}
              <span className="muted">
                {personLine(p)}
                {field === 'outOn' && outReason(p) ? ': ' + outReason(p) : ''}
              </span>
            </span>
            <span className="hk-req__acts">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => drop(p, field)}
                data-tip={'Μένει όπως είναι στο προσωπικό, απλώς δεν γράφεται στην ' + HK()}
              >
                Να μη γραφτεί
              </Button>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
  return (
    <Card title={'Εγγραφές και διαγραφές (' + (date === today ? 'σήμερα' : dm(date)) + ')'}>
      {ins.length > 0 && (
        <div className="field">
          <span className="field__label">1. Εγγραφές: μπήκαν στη δύναμη</span>
          {list(ins, 'inOn')}
        </div>
      )}
      {outs.length > 0 && (
        <div className="field">
          <span className="field__label">2. Διαγραφές: βγήκαν εκτός δύναμης</span>
          {list(outs, 'outOn')}
        </div>
      )}
      <p className="note" style={{ margin: 0 }}>
        Γράφονται μόνα τους με τα στοιχεία του Δυναμολογίου. Ο λόγος της διαγραφής βγαίνει από τις σημειώσεις του
        ατόμου.
      </p>
    </Card>
  );
}
