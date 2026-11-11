// The «Καταστάσεις» tab of the cadre sheet.
// Purpose: `AbsTab` shows today's state, the current and coming statuses (change / delete), the past ones and the month counter.
// Does NOT: write anything itself (model/actions.ts) or open the dialogs (it asks the sheet through `setStFor`).
// Owner layer: renderer/widgets/cadre-sheet. Why: moved verbatim from screens/cadre.ts (Phase 5.3c).
// Covering test: test/cadre.test.ts.
import { GROUP_NAME, cadreStatusOf, cadreStatusOn, colShort } from '../../../../shared/cadre';
import { dow } from '../../../../shared/dates';
import type { Cadre, CadreAbs } from '../../../../shared/domain';
import { HK } from '../../../../shared/unit';
import { CADRE_TONE, absRange, cadreStatusBadge } from '../../../entities/person';
import { Badge, Button } from '../../../shared/ui';
import { deleteAbs } from '../model/actions';
import type { CadreSheetModel } from '../model/useCadreSheet';
import type { CadreSheetView } from '../model/view';

/** One status line, with «Αλλαγή» (only for the current and coming ones) and «Διαγραφή». */
function absLine(m: CadreSheetModel, lists: CadreSheetView['lists'], a: CadreAbs, edit: boolean) {
  const st = cadreStatusOf(a, lists);
  return (
    <li key={a.id}>
      <div>
        <Badge tone={CADRE_TONE[st.group]}>{st.label}</Badge>{' '}
        <b>
          {dow(a.from)} {absRange(a)}
        </b>
        <small>
          {st.group === 'list' ? 'Δεν μετρά στην ' + HK() : GROUP_NAME[st.group] + ', στήλη «' + colShort(st.col) + '»'}
          {a.note ? ' · ' + a.note : ''}
        </small>
      </div>
      {edit && (
        <Button size="sm" variant="ghost" onClick={() => m.setStFor({ abs: a })}>
          Αλλαγή
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => deleteAbs(m, a)}>
        Διαγραφή
      </Button>
    </li>
  );
}

/** The tab: a plain function the sheet calls, not a component (so it adds no render of its own). */
export function absTab(m: CadreSheetModel, c: Cadre, view: CadreSheetView) {
  const { state, today } = m;
  const { lists, next, past, month } = view;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="field">
        <span className="field__label">Σήμερα</span>
        <div>
          {c.active ? (
            cadreStatusBadge(cadreStatusOn(state, c.id, today))
          ) : (
            <Badge tone="outline">Εκτός δύναμης: δεν μετρά στην {HK()}</Badge>
          )}
        </div>
      </div>
      <div className="field">
        <span className="field__label">Τωρινές και επόμενες καταστάσεις</span>
        {next.length ? (
          <ul className="rec">{next.map((a) => absLine(m, lists, a, true))}</ul>
        ) : (
          <p className="note" style={{ margin: 0 }}>
            Καμία. Χωρίς κατάσταση μετρά παρών στην {HK()}.
          </p>
        )}
      </div>
      {past.length > 0 && (
        <div className="field">
          <span className="field__label">Προηγούμενες</span>
          <ul className="rec">{past.map((a) => absLine(m, lists, a, false))}</ul>
        </div>
      )}
      {month && (
        <div className="field">
          <span className="field__label">Υπηρεσίες τον μήνα</span>
          <div data-cadre-month="">
            {month}{' '}
            <span className="muted" style={{ fontSize: '12px' }}>
              (μόνο με το χέρι, στις Υπηρεσίες)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
