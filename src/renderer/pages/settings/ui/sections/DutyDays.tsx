// «Ανά μέρα» of the duty-check import: what passes from the Excel, what differs, what only the app has and what the
// sergeant deleted in the app; the days with an error, the future days and how many are the same.
// Purpose: `DutyDays`; one day is a plain function.
// Does NOT: build the plan (model/sheetPlan.ts); it only shows `DutiesPlan`.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); stays a component
//   (it reads the store).
// Covering test: test/screens-dialogs-forms.test.ts (snapshots sources-SheetImportDialog*).
import { dm, dow } from '../../../../../shared/dates';
import { shortName } from '../../../../../shared/domain';
import { seatMap } from '../../../../../shared/rules';
import type { DutiesPlan } from '../../../../../shared/sources';
import { useStore } from '../../../../shared/model';
import { Alert } from '../../../../shared/ui';

type Day = DutiesPlan['days'][number];

/** One day: the summary line and the list of what passes, differs, is extra or was deleted. */
function dayBlock(p: DutiesPlan, d: Day, nm: (pid: number | null | undefined) => string) {
  const n = d.adds.length + d.differ.length + d.extra.length + d.gone.length;
  return (
    <details key={d.date} className="note" open={p.days.length <= 3}>
      <summary>
        {dow(d.date)} {dm(d.date)} · {d.adds.length ? d.adds.length + ' από Excel' : 'τίποτα από Excel'}
        {d.extra.length + d.differ.length + d.gone.length
          ? ' · ' + (d.extra.length + d.differ.length + d.gone.length) + ' γράφονται στο Excel'
          : ''}
        {d.locked && d.adds.length ? ' · αλλάζει κλειδωμένη μέρα' : ''}
        {d.twice.length ? ' · ⚠ δύο υπηρεσίες την ίδια μέρα: ' + d.twice.map(nm).join(', ') : ''}
      </summary>
      <ul key={n}>
        {d.adds.map((a, i) => (
          <li key={'a' + i}>
            {a.label}: {nm(a.pid)}
            {a.by != null ? ' (η θέση είναι ήδη του ' + nm(a.by) + ' στην εφαρμογή)' : ''}
          </li>
        ))}
        {d.differ.map((x, i) => (
          <li key={'d' + i}>
            Διαφέρει, κρατιέται της εφαρμογής: {nm(x.pid)} {x.app} (Excel: {x.excel})
          </li>
        ))}
        {d.extra.map((x, i) => (
          <li key={'e' + i}>
            Η εφαρμογή έχει επιπλέον: {nm(x.pid)} {x.label}· θα γραφτεί στο Excel
          </li>
        ))}
        {d.gone.map((x, i) => (
          <li key={'g' + i}>
            Το έσβησες στην εφαρμογή: {nm(x.pid)} (Excel: {x.excel})· θα σβηστεί και από το Excel
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The whole block under the tiles of the duty-check dialog. */
export function DutyDays({ p }: { p: DutiesPlan }) {
  const { state } = useStore();
  const pm = seatMap(state);
  const nm = (pid: number | null | undefined) => (pid == null ? '—' : pm.get(pid) ? shortName(pm.get(pid)!) : '?');
  return (
    <div className="field">
      {(p.warn || []).map((t) => (
        <Alert key={t} tone="warn">
          <span>{t}</span>
        </Alert>
      ))}
      {p.errors.length > 0 && (
        <Alert tone="bad">
          <span>
            <b>
              Δεν περνούν {p.errors.length === 1 ? '1 μέρα' : p.errors.length + ' μέρες'}: ο ίδιος κωδικός θέσης σε δύο
              άτομα.
            </b>
            {' Διόρθωσέ το στο Excel και ξαναδιάβασε· ως τότε η εφαρμογή δεν γράφει εκεί.'}
            <ul className="srcalert__list">
              {p.errors.map((e) => (
                <li key={e.date}>
                  {dow(e.date)} {dm(e.date)}: {e.text}
                </li>
              ))}
            </ul>
          </span>
        </Alert>
      )}
      {p.days.length > 0 && (
        <>
          <span className="field__label">Ανά μέρα (κρατιέται της εφαρμογής)</span>
          {p.days.map((d) => dayBlock(p, d, nm))}
        </>
      )}
      {p.future.length > 0 && <p className="note">Μετά από σήμερα, δεν περνούν: {p.future.map(dm).join(', ')}.</p>}
      {p.same > 0 && (
        <p className="note">
          {p.same} {p.same === 1 ? 'μέρα ίδια' : 'μέρες ίδιες'} με την εφαρμογή.
        </p>
      )}
    </div>
  );
}
