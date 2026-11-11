// The «Υπηρεσίες» tab of the soldier sheet.
// Purpose: `DutyTab` shows the number of duties, the holidays/weekends, and the log of the last 40 duties.
// Does NOT: derive the log (model/view.ts).
// Owner layer: renderer/widgets/person-sheet. Why: moved verbatim from screens/people.ts (Phase 5.3c).
// Covering test: test/people.test.ts.
import { dm, dow } from '../../../../shared/dates';
import { KIND_NAME } from '../../../../shared/domain';
import { holName } from '../../../../shared/rules';
import { Badge } from '../../../shared/ui';
import type { PersonSheetModel } from '../model/usePersonSheet';
import type { PersonSheetView } from '../model/view';

/** The tab: a plain function the sheet calls, not a component (so it adds no render of its own). */
export function dutyTab(m: PersonSheetModel, view: PersonSheetView) {
  const { state } = m;
  const { dd, duties } = view;
  return (
    <>
      <dl className="kv">
        <dt>Υπηρεσίες</dt>
        <dd className="num">{dd.total}</dd>
        <dt className="kv__sub">Αργίες / ΣΚ</dt>
        <dd>
          <span className="num">{dd.hol}</span>
          {dd.lastHol && (
            <>
              {' '}
              <span className="muted" style={{ fontSize: '12px' }}>
                τελευταία {holName(state.settings, dd.lastHol)} {dm(dd.lastHol)}
              </span>
            </>
          )}
        </dd>
      </dl>
      <section>
        <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>
          Ημερολόγιο υπηρεσιών{' '}
          <span className="muted" style={{ fontWeight: 400, fontSize: '13px' }}>
            (τελευταίες 40)
          </span>
        </h3>
        {duties.length ? (
          <ul className="hist">
            {duties.map(({ d, x, kind, h }) => (
              <li key={d + (x?.k || kind)}>
                <span className="num">
                  {dow(d)} {dm(d)}
                </span>
                {x ? x.label : KIND_NAME[kind] + ' χωρίς θέση (από Excel)'}
                {h && (
                  <>
                    {' '}
                    <Badge tone="warn">{holName(state.settings, d)}</Badge>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">Καμία υπηρεσία ακόμα.</span>
        )}
      </section>
    </>
  );
}
