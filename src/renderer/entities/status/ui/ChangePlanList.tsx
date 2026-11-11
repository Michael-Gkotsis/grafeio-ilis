// The «Επηρεάζει» list: which output files a status change touches.
// Purpose: `ChangePlanList` draws a change plan (file name, description, warning) in the declare dialog and in the
//   fix/leave dialogs.
// Does NOT: compute the plan (the main process / src/shared does) or know about statuses itself.
// Owner layer: renderer/entities/status. Why: the same list appears wherever a status is declared or fixed.
// Covering test: test/screens-dialogs-forms.test.ts (the declare dialog snapshot).

/** One affected file. `warn` marks a file that will not be updated (shown with «!» instead of «✓»). */
export interface PlanFile {
  fn: string;
  desc: string;
  warn?: boolean;
}
/** Props of `ChangePlanList`. */
export interface ChangePlanListProps {
  plan: { files: PlanFile[] };
}

/** A `<ul class="plan">` with one row per affected file. */
export function ChangePlanList({ plan }: ChangePlanListProps) {
  return (
    <ul className="plan">
      {plan.files.map((f, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: plan rows have no id and are rebuilt with the plan
        <li key={i} className={f.warn ? 'is-warn' : ''}>
          <span className="plan__ic">{f.warn ? '!' : '✓'}</span>
          <div>
            <span className="plan__fn">{f.fn}</span>
            <small>{f.desc}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}
