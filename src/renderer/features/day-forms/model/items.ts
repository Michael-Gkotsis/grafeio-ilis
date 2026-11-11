// The forms listed in «Έντυπα ημέρας» and their pre-flight checks.
// Purpose: `dayItems` lists tomorrow's ΦΡΟΥΡΑ, today's ΗΚΑΙ and Εξοδούχοι, and the user's own daily forms;
// `repCheck` is the check of one of the user's own forms.
// Does NOT: run the export (see exportAll.ts) or draw anything.
// Owner layer: renderer/features/day-forms. Why: moved verbatim from screens/dayForms.ts (Phase 5.3b).
// Covering test: test/reports-flow.test.ts, test/reports-phase3.test.ts.
import type { ExportKind } from '../../../../shared/api';
import type { ISODate } from '../../../../shared/dates';
import type { AppState } from '../../../../shared/domain';
import type { Check } from '../../../../shared/preflight';
import { dailyOk, repDate, rowNoun, rowsOf, type Report } from '../../../../shared/reports';
import { HK } from '../../../../shared/unit';
import { hasVals } from '../../../../shared/values';

/** One line of the dialog. `rep` is set for the user's own forms. */
export type Item = { kind: ExportKind | 'rep'; date: ISODate; name: string; label: string; rep?: Report };

/** What happened to one line: 'run' while it is being made, else the result and the file. */
export type Done = { ok: boolean; text: string; file?: string };

/** The lines, in the order they are shown. `today` and `tomorrow` are ISODates (local time). */
export function dayItems(state: AppState, today: ISODate, tomorrow: ISODate): Item[] {
  return [
    { kind: 'froura', date: tomorrow, name: 'ΦΡΟΥΡΑ', label: 'η κατάσταση υπηρεσιών' },
    { kind: 'hkai', date: today, name: HK(), label: 'η ' + HK() },
    { kind: 'outs', date: today, name: 'Εξοδούχοι και παραμένοντες', label: 'οι εξοδούχοι' },
    ...(state.settings.reports || [])
      .filter((r) => r.daily && dailyOk(r))
      .map((r) => ({ kind: 'rep' as const, date: repDate(r, today), name: r.name, label: 'το έντυπο', rep: r })),
  ];
}

/** δικά σου έντυπα: χωρίς πρότυπο δεν βγαίνει· χωρίς κανέναν βγαίνει άδειο, με προειδοποίηση (εκτός αν έχει πίνακες τιμών: βγαίνει πάντα) */
export function repCheck(state: AppState, r: Report, d: ISODate): Check[] {
  if (!(state.settings.reportTpls || []).some((t) => t.id === r.tpl))
    return [{ level: 'err', text: 'Το πρότυπό του δεν υπάρχει πια. Άνοιξέ το στα Έντυπα με «Αλλαγή».' } as Check];
  return rowsOf(state, r, d).length || hasVals(r)
    ? []
    : [{ level: 'warn', text: 'Κανείς δεν περνά τα φίλτρα του (0 ' + rowNoun(r.kind) + ').' } as Check];
}
