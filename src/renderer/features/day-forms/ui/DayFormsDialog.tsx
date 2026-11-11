// «Έντυπα ημέρας» (Σήμερα): η αυριανή ΦΡΟΥΡΑ, η σημερινή ΗΚΑΙ και οι σημερινοί Εξοδούχοι με έναν προέλεγχο για όλα,
// μετά «Βγάλε όλα» (ανοίγουν στο Excel) ή «Τύπωσε όλα» (μία προεπισκόπηση εκτύπωσης μετά την άλλη).
// Μαζί και τα δικά σου έντυπα (Έντυπα) που έχουν «Βγαίνει και από τα Έντυπα ημέρας».
// Purpose: `DayFormsDialog` draws the dialog; the lines, checks and export come from `useDayForms` (model/).
// Does NOT: hold logic or make files itself.
// Owner layer: renderer/features/day-forms. Why: moved verbatim from screens/dayForms.ts (Phase 5.3b); opened from Σήμερα and Έντυπα.
// Covering test: test/reports-flow.test.ts, test/reports-phase3.test.ts.
import { dayName, dmy } from '../../../../shared/dates';
import { cx } from '../../../shared/lib/cx';
import { Button, Dialog, Icon, Why } from '../../../shared/ui';
import type { Item } from '../model/items';
import { useDayForms } from '../model/useDayForms';

/** Props of `DayFormsDialog`. */
export interface DayFormsDialogProps {
  onClose: () => void;
}
type Day = ReturnType<typeof useDayForms>;

/** The footer: after a run only «Φάκελος» and «Κλείσιμο»; before it the choice and the two run buttons. */
function dayFormsFoot(d: Day, onClose: () => void) {
  const { items, busy, pick, go, finished } = d;
  if (finished) {
    return (
      <>
        <Button variant="outline" onClick={() => window.api.openFolder('output')}>
          Φάκελος
        </Button>
        <Button data-autofocus="" onClick={onClose}>
          Κλείσιμο
        </Button>
      </>
    );
  }
  return (
    <>
      <Why text={!busy && !pick.length && 'Διάλεξε τουλάχιστον ένα έντυπο'} />
      <Button variant="outline" disabled={!!busy} onClick={onClose}>
        Άκυρο
      </Button>
      <Button
        variant="outline"
        disabled={!!busy || !pick.length}
        why={!busy ? 'Διάλεξε τουλάχιστον ένα έντυπο' : undefined}
        onClick={() => go(true)}
        data-tip="Βγαίνουν τα Excel και ανοίγει η προεπισκόπηση εκτύπωσης του καθενός, το ένα μετά το άλλο. Δεν χρειάζεται Excel."
      >
        {Icon.print}
        {busy === 'print' ? 'Τυπώνονται…' : 'Τύπωσε όλα'}
      </Button>
      <Button
        data-autofocus=""
        disabled={!!busy || !pick.length}
        why={!busy ? 'Διάλεξε τουλάχιστον ένα έντυπο' : undefined}
        onClick={() => go(false)}
      >
        {busy === 'xl' ? 'Βγαίνουν…' : pick.length === items.length ? 'Βγάλε όλα' : 'Βγάλε τα ' + pick.length}
      </Button>
    </>
  );
}

/** One form: its tick, its status, its warnings (each with «Δείξε μου») and what happened when it ran. */
function dayFormsItem(d: Day, it: Item, i: number) {
  const { today, checks, bad, on, setOn, busy, done, show } = d;
  const cs = checks[i];
  const dn = done[i];
  return (
    <section key={it.rep ? it.rep.id : it.kind} className={cx('dayforms__item', !on[i] && 'is-off')}>
      <label className="dayforms__head">
        <input
          type="checkbox"
          className="ui-check"
          checked={on[i] && !bad[i]}
          disabled={bad[i] || !!busy}
          onChange={(e) => setOn((o) => o.map((x, j) => (j === i ? e.target.checked : x)))}
        />
        <b>{it.name}</b>
        <span className="muted">
          {dayName(it.date, today)} {dmy(it.date)}
        </span>
        <span className={cx('dayforms__st', bad[i] ? 'txt-bad' : cs.length ? 'txt-warn' : 'txt-ok')}>
          {bad[i]
            ? '✕ δεν μπορεί να βγει'
            : cs.length
              ? '⚠ ' + cs.length + (cs.length === 1 ? ' προειδοποίηση' : ' προειδοποιήσεις')
              : '✓ έτοιμο'}
        </span>
      </label>
      {cs.length > 0 && (
        <ul className="preflight">
          {cs.map((c, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the checks have no id; the position is the identity (as before)
            <li key={k} className={c.level === 'err' ? 'is-err' : 'is-warn'}>
              <span className="preflight__ic">{c.level === 'err' ? '✕' : '⚠'}</span>
              <span>{c.text}</span>
              {c.go && (
                <Button size="sm" variant="link" disabled={!!busy} onClick={() => show(it, c)}>
                  Δείξε μου
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {dn && (
        <p className={cx('dayforms__done', dn !== 'run' && !dn.ok && 'txt-bad')}>
          {dn === 'run' ? 'Βγαίνει…' : (dn.ok ? '✓ ' : '✕ ') + dn.text}
        </p>
      )}
    </section>
  );
}

/** The dialog. While a run is going the close button does nothing. */
export function DayFormsDialog({ onClose }: DayFormsDialogProps) {
  const d = useDayForms(onClose);
  const { items, busy, nWarn } = d;
  return (
    <Dialog
      title="Έντυπα ημέρας"
      description={'Έλεγχος πριν βγουν. ' + (nWarn ? 'Αν συνεχίσεις, οι προειδοποιήσεις γράφονται στο Ιστορικό.' : '')}
      onClose={busy ? () => {} : onClose}
      size="lg"
      footer={dayFormsFoot(d, onClose)}
    >
      <div className="dayforms">{items.map((it, i) => dayFormsItem(d, it, i))}</div>
    </Dialog>
  );
}
