// The tab «Ώρες» of the rules dialog: the start of the duty day, the ΗΚΑΙ time, the outs' hours and the weapon margin.
// Purpose: `hoursTab`, a plain function called as `{hoursTab(d)}`.
// Does NOT: hold state (model/useRulesDialog.ts) or check the hours (model/weekRules.ts).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); same markup and text nodes.
// Covering test: test/ux-names.test.ts, test/guard-page-view.test.ts.
import type { ChangeEvent } from 'react';
import { ARM_MAX } from '../../../../shared/armed';
import { normTime } from '../../../../shared/hours';
import { HK } from '../../../../shared/unit';
import { GoLink, TimeField } from '../../../shared/ui';
import type { RulesModel } from '../model/useRulesDialog';
import { WeekTable } from './WeekTable';
import { LINK_BLOCKS, LINK_BLOCKS_LONG } from '../model/hoursText';

type Ev = ChangeEvent<HTMLInputElement>;

// Texts that sit next to a link: one string each, so the text nodes are the ones the dialog always had.
const SHIFT_LEAD =
  'Βάρδιες: κάθε πόσες ώρες αλλάζει το νούμερο («Κάθε τόσες ώρες») ή τις βάρδιες που γράφεις εσύ ' +
  '(«Δικές μου βάρδιες») το ορίζεις σε κάθε υπηρεσία: ';
const SHIFT_TAIL =
  ' › Επεξεργασία. Στις υπηρεσίες μετρά η ώρα που ξεκινά κάθε θέση (π.χ. επιστροφή 12:00 → μπαίνει στις 14:00). ' +
  'Η μέρα της αναχώρησης μετρά πάντα ολόκληρη.';
const OUTS_LEAD = 'Ισχύουν στους ';
const OUTS_MID =
  ': «Επιστροφή ΔΝ» της Δευτέρας = πότε γυρνά το πρωί της Δευτέρας όποιος είχε ΔΝ την Κυριακή. Αν η Δευτέρα δεν έχει ' +
  'εκπαίδευση και δεν έχει δηλωθεί, δεν ξέρουμε πότε γυρνά και η οθόνη Εξοδούχοι ζητά να δηλωθεί. Οι αργίες της ' +
  'εβδομάδας δεν έχουν εκπαίδευση. Για μία μέρα αλλάζουν από την ίδια την οθόνη Εξοδούχοι. ';
const OUTS_TAIL =
  ' η «Αρχή εξόδου» της μέρας ισχύει και για όποιον γυρίζει από άδεια, νοσοκομείο ή ΣΤΕΠ· όποιος γυρίσει ως τότε ' +
  'βγαίνει κανονικά έξοδο εκείνη τη μέρα.';
const WEAPON_MID =
  '′ μετά το τέλος του (προεπιλογή 15′ και 15′). Ποιο όπλο βγαίνει, δικό του ή της θέσης, το ορίζεις σε κάθε ένοπλη ' +
  'υπηρεσία: ';

function cycleSection(d: RulesModel) {
  const { ds, setDs, r, set } = d;
  return (
    <section className="rl-grp">
      <h3>Μέρα υπηρεσίας και {HK()}</h3>
      <div className="rl-two">
        <TimeField
          id="rds"
          label="Ο κύκλος ξεκινά στις"
          value={ds}
          onChange={setDs}
          help={
            'Η μέρα της υπηρεσίας είναι ' +
            (normTime(ds) || '14:00') +
            ' → ' +
            (normTime(ds) || '14:00') +
            ' της επόμενης. Από εδώ ξεκινούν και οι βάρδιες.'
          }
        />
        <TimeField
          id="rhk"
          label={'Ώρα ' + HK()}
          value={r.hkTime as string}
          onChange={(v: string) => set('hkTime', v)}
          help={'Όποιος γυρίσει ως τότε μετρά παρών στην ' + HK() + ' της μέρας'}
        />
      </div>
      <span className="note">
        {SHIFT_LEAD}
        <GoLink view="templates" params={{ tab: 'duty', dsub: 'blocks' }}>
          {LINK_BLOCKS_LONG}
        </GoLink>
        {SHIFT_TAIL}
      </span>
    </section>
  );
}

function outsSection(d: RulesModel) {
  const { wk, setWk } = d;
  return (
    <section className="rl-grp">
      <h3>Εξοδούχοι: ώρες ανά ημέρα</h3>
      <WeekTable draft={wk} onChange={(w, k, v) => setWk((x) => ({ ...x, [w]: { ...x[w], [k]: v } }))} />
      <span className="note">
        {OUTS_LEAD}
        <GoLink view="outs">Εξοδούχους</GoLink>
        {OUTS_MID}
        <b>Μία ώρα εξόδου:</b>
        {OUTS_TAIL}
      </span>
    </section>
  );
}

// Minutes before/after which the weapon comes out/goes in: a number field, 0..ARM_MAX.
const minutesField = (id: string, label: string, value: number, onChange: (v: number) => void) => (
  <div className="field">
    <label className="field__label" htmlFor={id}>
      {label}
    </label>
    <input
      id={id}
      type="number"
      min="0"
      max={ARM_MAX}
      className="ui-input"
      style={{ maxWidth: '110px' }}
      value={value}
      onChange={(e: Ev) => onChange(Math.max(0, Math.min(ARM_MAX, Math.floor(+e.target.value) || 0)))}
    />
  </div>
);

function weaponSection(d: RulesModel) {
  const { r, set } = d;
  return (
    <section className="rl-grp">
      <h3>Ένοπλη υπηρεσία: πότε βγαίνει το όπλο</h3>
      <div className="rl-two">
        {minutesField('rab', 'Βγαίνει πριν (λεπτά)', r.before, (v) => set('before', v))}
        {minutesField('raa', 'Μπαίνει μετά (λεπτά)', r.after, (v) => set('after', v))}
      </div>
      <span className="note">
        Το όπλο βγαίνει {r.before}′ πριν ξεκινήσει το νούμερο και μπαίνει {r.after}
        {WEAPON_MID}
        <GoLink view="templates" params={{ tab: 'duty', dsub: 'blocks' }}>
          {LINK_BLOCKS}
        </GoLink>
        .
      </span>
    </section>
  );
}

/** The tab: cycle start and ΗΚΑΙ time, the outs' week table, the weapon margin. */
export function hoursTab(d: RulesModel) {
  return (
    <div className="rl-tab">
      {cycleSection(d)}
      {outsSection(d)}
      {weaponSection(d)}
    </div>
  );
}
