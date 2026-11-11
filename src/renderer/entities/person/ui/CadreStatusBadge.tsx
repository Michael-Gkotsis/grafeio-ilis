// The status chip of a cadre member in the «Στελέχη» list and on his card.
// Purpose: `cadreStatusBadge` shows «label · dates» with a tooltip that says how it counts in the ΗΚΑΙ, or «Παρών».
// Does NOT: find the status (shared/cadre does) or hold state: it is a plain function called while a parent renders.
// Owner layer: renderer/entities/person. Why: moved verbatim from screens/cadre.ts (`stBadge`, Phase 5.3c); the page and
//   the cadre sheet both draw it.
// Covering test: test/screens-main.test.ts (part of the screen snapshots).
import { GROUP_NAME, colShort, type CadreStatus } from '../../../../shared/cadre';
import { HK } from '../../../../shared/unit';
import { Badge } from '../../../shared/ui';
import { CADRE_TONE, absRange } from '../model/cadreAbs';

/** The chip of a cadre status (or «Παρών» when there is none). */
export const cadreStatusBadge = (st: CadreStatus | undefined) =>
  st ? (
    <Badge
      tone={CADRE_TONE[st.group]}
      data-tip={
        st.label +
        ' · ' +
        absRange(st.abs) +
        ' · ' +
        (st.group === 'list'
          ? 'Δεν μετρά στην ' + HK()
          : GROUP_NAME[st.group] + ' στην ' + HK() + ', στήλη «' + colShort(st.col) + '»')
      }
    >
      {st.label} · {absRange(st.abs)}
    </Badge>
  ) : (
    <Badge tone="ok">Παρών</Badge>
  );
