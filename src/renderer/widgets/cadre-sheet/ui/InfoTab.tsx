// The «Στοιχεία» tab of the cadre sheet.
// Purpose: `InfoTab` lists the data of the member and the «Διαγραφή στελέχους…» button.
// Does NOT: delete anything (the sheet's dialog and model/actions.ts do).
// Owner layer: renderer/widgets/cadre-sheet. Why: moved verbatim from screens/cadre.ts (Phase 5.3c).
// Covering test: test/cadre.test.ts.
import type { Cadre } from '../../../../shared/domain';
import { HK, hkRowLabel } from '../../../../shared/unit';
import { Button } from '../../../shared/ui';

/** The tab. @param wtxt weapon text, from `cadreSheetView` */
export function infoTab(c: Cadre, wtxt: string, onDelete: () => void) {
  return (
    <>
      <dl className="kv">
        <dt>Βαθμός</dt>
        <dd>{c.rank || '—'}</dd>
        <dt>Προέλευση</dt>
        <dd>{c.origin || '—'}</dd>
        <dt>Ο/Σ</dt>
        <dd>{c.spec || '—'}</dd>
        <dt>Επίθετο</dt>
        <dd>{c.last || '—'}</dd>
        <dt>Όνομα</dt>
        <dd>{c.first || '—'}</dd>
        <dt>ΑΜ</dt>
        <dd className="num">{c.am || '—'}</dd>
        <dt>Τηλέφωνο</dt>
        <dd className="num">{c.phone || '—'}</dd>
        <dt>Θέση</dt>
        <dd>{c.role || '—'}</dd>
        <dt>Γραμμή {HK()}</dt>
        <dd>{hkRowLabel(c.hk)}</dd>
        {c.monthMax != null && <dt>Υπηρεσίες τον μήνα</dt>}
        {c.monthMax != null && <dd>το πολύ {c.monthMax}</dd>}
        <dt>Όπλο</dt>
        <dd>{wtxt || '—'}</dd>
        <dt>Σε δύναμη</dt>
        <dd>{c.active ? 'Ναι' : 'Όχι'}</dd>
      </dl>
      <div>
        <Button variant="ghost" onClick={() => onDelete()}>
          Διαγραφή στελέχους…
        </Button>
      </div>
    </>
  );
}
