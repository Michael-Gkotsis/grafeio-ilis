// How a cadre member's status is named and toned.
// Purpose: `absRange` gives «dd/mm» for one day or «dd/mm–dd/mm» for several; `CADRE_TONE` is the badge tone per group.
// Does NOT: add the weekday or the status name.
// Owner layer: renderer/entities/person. Why: the «Στελέχη» page, the cadre sheet and the status dialog all print them
//   (they were `range` and `TONE` in screens/cadre.ts, Phase 5.3c).
// Covering test: test/cadre.test.ts.
import { dm } from '../../../../shared/dates';
import type { CadreGroup } from '../../../../shared/cadre';
import type { CadreAbs } from '../../../../shared/domain';

/** «dd/mm» or «dd/mm–dd/mm». @param a status of a cadre member, `from`/`to` ISODate, local time */
export const absRange = (a: CadreAbs) => dm(a.from) + (a.to !== a.from ? '–' + dm(a.to) : '');

/** Badge tone of a cadre status group: «κωλυόμενοι», «απόντες», «μόνο στη λίστα». */
export const CADRE_TONE: Record<CadreGroup, string> = { kol: 'info', apo: 'warn', list: 'outline' };
