// The tab «Εξαιρέσεις»: a one-time exception of a person from the duties, from–to, with an optional reason.
// Purpose: `SkipsView`, the form, the quick weekend buttons and the three groups (now, next, past).
// Does NOT: hold state (model/useSkips.ts), the rules (model/skipsView.ts) or decide who is placed (the autofill
//   skips these people on those days).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/skips.ts (Phase 6); only the Υπηρεσίες screen
//   shows it. @decision Michael 24/10: the fair order does not change; when it ends, his turn comes by the days since
//   his last duty.
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import type { ChangeEvent, KeyboardEvent } from 'react';
import { dayName, daysBetween, dm } from '../../../../shared/dates';
import { shortName } from '../../../../shared/domain';
import { statOf } from '../../../../shared/rules';
import { PersonPicker, RkName, rkShort } from '../../../entities/person';
import { cx } from '../../../shared/lib/cx';
import { Badge, Button, DateField, type ValueEvent } from '../../../shared/ui';
import { nDays, skipBadge, when, type SkipItem } from '../model/skipsView';
import { useSkips, type SkipsModel } from '../model/useSkips';

/** Props of {@link SkipsView}. */
export interface SkipsViewProps {
  /** A name clicked: open «Ποιος κάνει τι» for this person. */
  onPerson?: (pid: number) => void;
}

const LEAD =
  'Μία φορά εξαίρεση από τις υπηρεσίες, από–έως. Η αυτόματη συμπλήρωση και ο «Επόμενος» τον προσπερνούν εκείνες τις ' +
  'μέρες· με το χέρι μπαίνει μόνο με αιτία. Η σειρά δικαιοσύνης δεν αλλάζει: όταν τελειώσει, έρχεται η σειρά του με ' +
  'βάση τις μέρες από την τελευταία του υπηρεσία. Παραμένει παρών (ΗΚΑΙ, Δύναμη).';

// One exception: who and the last duty, the period, the reason, the badge and the two buttons.
function skipRow(m: SkipsModel, x: SkipItem, tone: string, onPerson: SkipsViewProps['onPerson']) {
  const last = statOf(m.state, x.p.id).last;
  return (
    <div key={x.k.id} className={cx('skips__row', m.edit === x.k.id && 'is-edit')}>
      <span className="skips__who">
        <button type="button" className="linkish" onClick={() => onPerson?.(x.p.id)} data-tip="Πάτα: «Ποιος κάνει τι»">
          <b>
            <RkName p={x.p} />
          </b>
        </button>
        <small>
          {x.p.room != null ? 'Θ' + x.p.room : ''}
          {last ? (x.p.room != null ? ' · ' : '') + 'τελευταία υπηρεσία ' + dm(last) : ''}
        </small>
      </span>
      <span className="skips__when num">
        {when(x.k)}
        <small>
          {nDays(x.k)} {nDays(x.k) === 1 ? 'μέρα' : 'μέρες'}
        </small>
      </span>
      <span className="skips__why">{x.k.why || <span className="muted">—</span>}</span>
      <span className="skips__act">
        <Badge tone={tone}>{skipBadge(tone, x.k.from, m.today)}</Badge>
        <Button variant="ghost" size="sm" onClick={() => m.change(x)}>
          Αλλαγή
        </Button>
        <Button variant="ghost" size="sm" aria-label={'Σβήσιμο εξαίρεσης ' + rkShort(x.p)} onClick={() => m.del(x)}>
          Σβήσιμο
        </Button>
      </span>
    </div>
  );
}

// A group of exceptions with its title and count; nothing when the group is empty.
function group(m: SkipsModel, title: string, list: SkipItem[], tone: string, onPerson: SkipsViewProps['onPerson']) {
  return (
    list.length > 0 && (
      <section className="skips__grp">
        <h3 className="minihd">
          {title} ({list.length})
        </h3>
        <div className="skips__list">{list.map((x) => skipRow(m, x, tone, onPerson))}</div>
      </section>
    )
  );
}

// Save and, while editing, cancel.
function formButtons(m: SkipsModel) {
  const { edit, missing } = m;
  return (
    <div className="skips__f-btn">
      <Button onClick={m.save} disabled={!!missing} why={missing ?? undefined}>
        {edit ? 'Αποθήκευση' : '+ Πρόσθεσε'}
      </Button>
      {edit && (
        <Button variant="ghost" onClick={m.reset}>
          Άκυρο
        </Button>
      )}
    </div>
  );
}

// The form: who (chip or picker), from, to, reason and the buttons.
function form(m: SkipsModel) {
  const { p, pid, setPid, from, setFrom, to, setTo, touched, setTouched, why, setWhy, edit, today } = m;
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="group" as before
    <div className="skips__form" role="group" aria-label={edit ? 'Αλλαγή εξαίρεσης' : 'Νέα εξαίρεση'}>
      <div className="field skips__f-who">
        <label className="field__label" htmlFor="sk-who">
          Ποιος
        </label>
        {p ? (
          <span className="picker__chip skips__chosen">
            {shortName(p)}
            <button type="button" aria-label="Άλλαξε άτομο" onClick={() => setPid(null)}>
              ✕
            </button>
          </span>
        ) : (
          <PersonPicker id="sk-who" value={pid} onChange={(id: number) => setPid(id)} date={from} />
        )}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="sk-from">
          Από
        </label>
        <DateField
          id="sk-from"
          className="ui-input"
          value={from}
          onChange={(e: ValueEvent) => {
            const f = e.target.value;
            if (!f) return;
            setFrom(f);
            if (!touched || to < f) setTo(f);
          }}
        />
        <span className="field__help">{dayName(from, today)}</span>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="sk-to">
          Έως (μετρά κι αυτή)
        </label>
        <DateField
          id="sk-to"
          className="ui-input"
          min={from}
          value={to}
          onChange={(e: ValueEvent) => {
            const t = e.target.value;
            if (t) {
              // biome-ignore lint/complexity/useMathMinMax: kept as it was
              setTo(t < from ? from : t);
              setTouched(true);
            }
          }}
        />
        <span className="field__help">
          {dayName(to, today)} · {daysBetween(from, to)} {daysBetween(from, to) === 1 ? 'μέρα' : 'μέρες'}
        </span>
      </div>
      <div className="field skips__f-why">
        <label className="field__label" htmlFor="sk-why">
          Αιτιολογία (προαιρετική)
        </label>
        <input
          id="sk-why"
          className="ui-input"
          placeholder="π.χ. γάμος αδελφού"
          value={why}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setWhy(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' && p) m.save();
          }}
        />
      </div>
      {formButtons(m)}
    </div>
  );
}

/** The tab. */
export function SkipsView({ onPerson }: SkipsViewProps) {
  const m = useSkips();
  const { items, now, next, past, quick } = m;
  return (
    <div className="skips">
      <p className="skips__lead">{LEAD}</p>
      {form(m)}
      <div className="skips__quick">
        <span>Γρήγορα:</span>
        <button type="button" className="ui-chip" onClick={() => quick(false)}>
          Αυτό το ΣΚ
        </button>
        <button type="button" className="ui-chip" onClick={() => quick(true)}>
          Επόμενο ΣΚ
        </button>
      </div>
      {items.length === 0 && (
        <p className="skips__empty">Καμία εξαίρεση ακόμη. Διάλεξε ποιος, από ποια μέρα ως ποια, και πάτα «Πρόσθεσε».</p>
      )}
      {group(m, 'Ισχύουν τώρα', now, 'warn', onPerson)}
      {group(m, 'Επόμενες', next, 'info', onPerson)}
      {group(m, 'Παλιότερες', past, '', onPerson)}
    </div>
  );
}
