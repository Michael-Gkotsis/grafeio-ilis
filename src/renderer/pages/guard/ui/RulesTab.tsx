// The tab «Κανόνες» of the rules dialog: rest, weekends and holidays, sharing, and what else decides who is placed.
// Purpose: `rulesTab`, a plain function called as `{rulesTab(d, onTab, onFixed)}` (not a component, so the render count
//   is the one the dialog always had).
// Does NOT: hold state (model/useRulesDialog.ts) or the numbers (model/rulesView.ts).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); same markup and text nodes.
// Covering test: test/ux-names.test.ts, test/guard-page-view.test.ts.
import type { ChangeEvent, ReactNode } from 'react';
import { cx } from '../../../shared/lib/cx';
import { GoLink } from '../../../shared/ui';
import { strictOrderTxt } from '../../../../shared/rulesText';
import { chg, KEY_NAME, opState, ppl } from '../model/rulesView';
import type { RulesModel } from '../model/useRulesDialog';
import { DaysSelect } from './DaysSelect';
import { TabLink } from './TabLink';

type Ev = ChangeEvent<HTMLInputElement>;

function restSection(d: RulesModel) {
  const { r, set, rots, togRot } = d;
  return (
    <section className="rl-grp">
      <h3>Ανάπαυση</h3>
      <div className="rl-two">
        <div className="field">
          <label className="field__label" htmlFor="rrest">
            Ανάπαυση πριν και μετά από υπηρεσία
          </label>
          <DaysSelect
            id="rrest"
            value={r.restDays}
            onChange={(v: number) => set('restDays', v)}
            opts={[
              [0, 'Χωρίς'],
              [1, '1 ημέρα (όχι δύο μέρες στη σειρά)'],
              [2, '2 ημέρες'],
            ]}
            txt={(n: number) => n + ' ημέρες'}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="rnum">
            Ξανά στο ίδιο νούμερο
          </label>
          <DaysSelect
            id="rnum"
            value={r.numRest || 0}
            onChange={(v: number) => set('numRest', v)}
            opts={[
              [0, 'Χωρίς περιορισμό'],
              [3, 'Μετά από 3 ημέρες'],
              [4, 'Μετά από 4 ημέρες'],
            ]}
            txt={(n: number) => 'Μετά από ' + n + ' ημέρες'}
          />
          {/* biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="group" as before */}
          <div className={cx('rl-chips', !r.numRest && 'is-off')} role="group" aria-label="Ποια νούμερα">
            <span className="note">Ποια νούμερα:</span>
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                className="rl-chip"
                aria-pressed={rots.includes(n)}
                disabled={!r.numRest}
                data-tip={rots.length === 1 && rots.includes(n) ? 'Τουλάχιστον ένα νούμερο' : undefined}
                onClick={() => togRot(n)}
              >
                {n + 1}ο
              </button>
            ))}
          </div>
        </div>
      </div>
      <span className="note">
        Ισχύουν μαζί: όποιος ήταν σε ένα από τα νούμερα (θαλαμοφύλακας, οπλοφύλακας, σκοπός) δεν ξαναμπαίνει σε αυτό
        νωρίτερα.
      </span>
    </section>
  );
}

function holidaySection(d: RulesModel) {
  const { r, set } = d;
  return (
    <section className="rl-grp">
      <h3>ΣΚ και αργίες</h3>
      <label className="rule">
        <input
          type="checkbox"
          className="ui-check"
          checked={r.noConsecHol}
          onChange={(e: Ev) => set('noConsecHol', e.target.checked)}
        />
        <span>
          <b>Όχι ΣΚ ή αργία δύο συνεχόμενες εβδομάδες</b>
          <small>
            Όποιος έκανε ΣΚ ή αργία δεν μπαίνει στο επόμενο, ούτε σε αργία δύο μέρες μετά. Αν σε αργία δεν φτάνουν οι
            υπόλοιποι, μπαίνουν και όσοι έκαναν πρόσφατα αργία (πρώτα όποιος την έκανε πιο παλιά), με ειδοποίηση.
          </small>
        </span>
      </label>
      <label className="rule">
        <input
          type="checkbox"
          className="ui-check"
          checked={!!r.newAvg}
          onChange={(e: Ev) => set('newAvg', e.target.checked ? true : undefined)}
        />
        <span>
          <b>Οι νέοι στη δύναμη ξεκινούν από τον μέσο όρο</b>
          <small>
            Όποιος μπαίνει στη δύναμη (νέα ΕΣΣΟ, μετάθεση) μετρά σαν να έχει κάνει όσες αργίες και υπηρεσίες ο μέσος
            όρος τη μέρα που ήρθε. Κλειστό: ξεκινά από το 0 και παίρνει σχεδόν κάθε δεύτερο ΣΚ ώσπου να φτάσει τους
            άλλους.
          </small>
        </span>
      </label>
    </section>
  );
}

// The list of the order of «Αυστηρά Άοπλοι»: the chosen groups with arrows, then the spare ones to add.
function orderList(d: RulesModel) {
  const { order, spare, nameOf, move, setOrder } = d;
  return (
    <ol className="rl-ord" aria-label="Σειρά των Αυστηρά Άοπλοι">
      {order.map((k, i) => (
        <li key={k}>
          <span className="rl-ord__mv">
            <button type="button" aria-label={'Πάνω: ' + nameOf(k)} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button
              type="button"
              aria-label={'Κάτω: ' + nameOf(k)}
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
          </span>
          <label>
            <input
              type="checkbox"
              className="ui-check"
              checked={true}
              disabled={order.length < 2}
              data-tip={order.length < 2 ? 'Τουλάχιστον μία υπηρεσία' : undefined}
              onChange={() => setOrder(order.filter((x) => x !== k))}
            />{' '}
            <b>{nameOf(k)}</b>
            {KEY_NAME[k]?.[1] ? <small className="muted">{KEY_NAME[k][1]}</small> : null}
          </label>
        </li>
      ))}
      {spare.map((k) => (
        <li key={k} className="is-spare">
          <span className="rl-ord__mv" />
          <label>
            <input type="checkbox" className="ui-check" checked={false} onChange={() => setOrder([...order, k])} />{' '}
            <span>{nameOf(k)}</span>{' '}
            <small className="muted">{KEY_NAME[k] ? KEY_NAME[k][1] : 'δική σου άοπλη υπηρεσία'}</small>
          </label>
        </li>
      ))}
    </ol>
  );
}

function shareSection(d: RulesModel) {
  const { r, set, state, st, editOrd, setEditOrd } = d;
  return (
    <section className="rl-grp">
      <h3>Μοίρασμα</h3>
      <label className="rule">
        <input
          type="checkbox"
          className="ui-check"
          checked={r.rotate !== false}
          onChange={(e: Ev) => set('rotate', e.target.checked)}
        />
        <span>
          <b>Εναλλαγή υπηρεσιών</b>
          <small>
            Από όσους είναι η σειρά τους σήμερα, η θέση πάει σε όποιον έχει κάνει λιγότερο αυτή την υπηρεσία.
          </small>
        </span>
      </label>
      <div className="rule rl-strict">
        <input
          id="rstrict"
          type="checkbox"
          className="ui-check"
          checked={!!r.strictUnarmed}
          onChange={(e: Ev) => set('strictUnarmed', e.target.checked)}
        />
        <span>
          <label htmlFor="rstrict">
            <b>Αυστηρά Άοπλοι</b>
          </label>
          <small>
            Οι άοπλοι μπαίνουν πρώτα με αυτή τη σειρά: <b>{strictOrderTxt(r, st)}</b>{' '}
            <button
              type="button"
              className="linkish rl-lnk"
              aria-expanded={editOrd}
              onClick={() => setEditOrd(!editOrd)}
            >
              {editOrd ? 'Κλείσιμο' : 'Αλλαγή σειράς'}
            </button>
            . Σκοποί μόνο ένοπλοι.{opState(state) ? ' Τώρα: ' + opState(state) + '.' : ''}
          </small>
          {editOrd && orderList(d)}
        </span>
      </div>
    </section>
  );
}

// One line of «Τι άλλο κρίνει ποιος μπαίνει»: the name, what is set now and an optional small explanation.
const item = (k: string, body: ReactNode, more?: string) => (
  <div className="rl-i">
    <b>{k}</b> · {body}
    {more && <small className="muted">{more}</small>}
  </div>
);

function elseSection(d: RulesModel, onTab: (tab: string) => void, onFixed: () => void) {
  const { info } = d;
  return (
    <section className="rl-grp">
      <h3>
        Τι άλλο κρίνει ποιος μπαίνει <small className="muted">(αλλάζουν εκεί, εδώ βλέπεις τι ισχύει)</small>
      </h3>
      <div className="rl-box">
        {item(
          'Καταστάσεις',
          <span>
            {chg(info.stat)}{' '}
            <GoLink view="templates" params={{ tab: 'duty', dsub: 'stat' }}>
              Ρυθμίσεις › Καταστάσεις
            </GoLink>
          </span>,
          'Προεπιλογή: ΕΥ, ΣΤΕΠ, κωλυόμενος: καμία υπηρεσία · ΕΑ/ΕΟ: όχι ένοπλη, όχι μαγειρεία, σκοπιά μόνο αν δεν υπάρχει άλλος',
        )}
        {item(
          'Σ.Ι.',
          <span>
            {chg(info.si)}{' '}
            <GoLink view="templates" params={{ tab: 'duty', dsub: 'si' }}>
              Ρυθμίσεις › Σ.Ι.
            </GoLink>
          </span>,
        )}
        {item(
          'Ποιος κάνει τι',
          <span>
            {ppl(info.caps)} με «δεν κάνει» <TabLink onGo={() => onTab('who')}>Άνοιγμα</TabLink>
          </span>,
        )}
        {item(
          'Εξαιρέσεις',
          <span>
            {info.skips} τις επόμενες 7 μέρες <TabLink onGo={() => onTab('skips')}>Άνοιγμα</TabLink>
          </span>,
        )}
        {item(
          'Μέρες χωρίς υπηρεσία',
          <span>
            {ppl(info.off)} <GoLink view="people">Δυναμολόγιο</GoLink>
          </span>,
        )}
        {item(
          'Πόστα',
          <span>
            {ppl(info.post)}, μόνο με το χέρι (ούτε Λ/Υ-Δ/Υ) <GoLink view="people">Δυναμολόγιο</GoLink>
          </span>,
        )}
        {item(
          'Μόνιμοι Λ/Υ-Δ/Υ',
          <span>
            {info.fixed.length ? info.fixed.join(', ') + ' · μπαίνουν μόνοι τους' : 'κανένας'}{' '}
            <TabLink onGo={onFixed}>Όρισε</TabLink>
          </span>,
        )}
        {item(
          'ΕΠΟΠ/ΟΒΑ',
          <span>
            μόνο με το χέρι, {info.cadre} με όριο τον μήνα <GoLink view="cadre">Στελέχη</GoLink>
          </span>,
        )}
      </div>
      <span className="note">
        Πάντα: ένας άνθρωπος σε μία θέση τη μέρα · όχι όποιος έχει άδεια ή λείπει. Οι αναθέσεις που υπάρχουν δεν
        αλλάζουν· όσες παραβαίνουν τους νέους κανόνες φαίνονται με ⚠.
      </span>
    </section>
  );
}

/** The tab: «Ισχύουν τώρα», then the four groups. */
export function rulesTab(d: RulesModel, onTab: (tab: string) => void, onFixed: () => void) {
  return (
    <div className="rl-tab">
      <p className="note rl-now">Ισχύουν τώρα: {d.txt(d.r)}</p>
      {restSection(d)}
      {holidaySection(d)}
      {shareSection(d)}
      {elseSection(d, onTab, onFixed)}
    </div>
  );
}
