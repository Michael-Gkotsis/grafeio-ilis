// The signatures under a form preview.
// Purpose: `sigRows` gives the signature rows as the form prints them (`base`), or the user's own from the settings spread
//   over the width `W`.
// Does NOT: know which form it is for beyond the `form` key.
// Owner layer: renderer/shared/lib. Why: moved verbatim from renderer/sheets.ts (Phase 5.3c part 2b); the Υπηρεσίες and ΗΚΑΙ builders use it.
// Covering test: test/custom-excel.test.ts, test/unit.test.ts.
import type { AppState } from '../../../../shared/domain';
import { sigsCustom, sigsFor, sigsSaved, type SigForm } from '../../../../shared/sigs';
import { E, type Cell } from './model';

// Οι υπογραφές στην προεπισκόπηση: όπως το έντυπο (base), ή οι δικές σου των Ρυθμίσεων μοιρασμένες στο πλάτος W
export function sigRows(
  s: AppState,
  form: SigForm,
  W: number,
  dash: boolean,
  base: (Cell | null)[][],
): (Cell | null)[][] {
  if (!sigsCustom(s.settings, form)) return base;
  const list = sigsFor(s.settings, sigsSaved(s.settings, form));
  if (!list.length) return [];
  const n = list.length,
    k = Math.floor(W / n),
    extra = W - k * n;
  const cs = list.map((_, i) => Math.max(1, k + (i < extra ? 1 : 0)));
  const rows = [
    list.map((x, i) => E(x.art ? (dash ? '-' + x.art + '-' : x.art) : '', 'c', cs[i])),
    list.map((x, i) => E(x.title, 'ttl', cs[i])),
  ];
  if (list.some((x) => x.name))
    rows.push(
      [E('', '', W)],
      [E('', '', W)],
      [E('', '', W)],
      list.map((x, i) => E(x.name || '', 'c', cs[i])),
    );
  return rows;
}
