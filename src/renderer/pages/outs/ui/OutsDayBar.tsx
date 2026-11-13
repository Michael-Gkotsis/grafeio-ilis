// The bar of the day on the «Εξοδούχοι» screen: start of going out, return of the outs, return of ΔΝ, training.
// Purpose: `OutsDayBar`, the form that changes those hours for day D (and the ΔΝ return and training of D+1).
// Does NOT: compute the hours (shared/returns.ts does) or touch the weekday table of the Κανόνες (that stays in
//   screens/outsPlan.ts for the Ρυθμίσεις screen).
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/outsPlan.ts (Phase 6); only this screen uses it.
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { useEffect, useState } from 'react';
import { useStore } from '../../../shared/model';
import { Button, Segmented, TimeField, useToast } from '../../../shared/ui';
import { addDays, dm, weekday, DOW_FULL } from '../../../../shared/dates';
import { mins, normTime } from '../../../../shared/hours';
import { baseOf, dayTimes } from '../../../../shared/returns';
import type { Command } from '../../../../shared/commands';

type DayPlans = Extract<Command, { t: 'setDayPlans' }>['plans'];

/**
 * The hours of day D. Going out and the return of the outs belong to D; the return of ΔΝ and the training belong to
 * the next day (D's ΔΝ come back on the morning of D+1). They change only for these days, above the weekday of the
 * Κανόνες.
 * @param date - ISODate of D
 */
export function OutsDayBar({ date }: { date: string }) {
  const { state, run, undoMark } = useStore();
  const toast = useToast();
  const nx = addDays(date, 1);
  const t = dayTimes(state, date);
  const n = dayTimes(state, nx);
  const bt = baseOf(state, date);
  const bn = baseOf(state, nx);
  const cur = { out: t.out, backOut: t.backOut, backDn: n.backDn, train: n.train };
  const [v, setV] = useState(cur);
  const key = JSON.stringify(cur);
  useEffect(() => setV(cur), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof cur, x: string | boolean) => setV((d) => ({ ...d, [k]: x }));
  const nv = { out: normTime(v.out), backOut: normTime(v.backOut), backDn: normTime(v.backDn) };
  const bad = !nv.out || !nv.backOut || !nv.backDn || mins(nv.backOut) <= mins(nv.out);
  const dirty =
    (nv.out || v.out) !== cur.out ||
    (nv.backOut || v.backOut) !== cur.backOut ||
    (nv.backDn || v.backDn) !== cur.backDn ||
    v.train !== cur.train;
  const changed = t.out !== bt.out || t.backOut !== bt.backOut || n.backDn !== bn.backDn || n.train !== bn.train;
  const go = async (plans: DayPlans, text: string) => {
    if (await run({ t: 'setDayPlans', plans }, false)) toast({ text, actions: [undoMark()] });
  };
  const save = () =>
    go(
      [
        { date, plan: { out: nv.out!, backOut: nv.backOut!, backDn: t.backDn, train: t.train } },
        { date: nx, plan: { out: n.out, backOut: n.backOut, backDn: nv.backDn!, train: v.train } },
      ],
      'Αποθηκεύτηκαν οι ώρες εξόδου ' + dm(date) + ' και η επιστροφή ΔΝ ' + dm(nx),
    );
  // Reset: only what the bar shows (the other hours of the two days stay as they are).
  const reset = [
    { date, plan: { out: bt.out, backOut: bt.backOut, backDn: t.backDn, train: t.train } },
    { date: nx, plan: { out: n.out, backOut: n.backOut, backDn: bn.backDn, train: bn.train } },
  ];
  const nxName = DOW_FULL[weekday(nx)] + (n.hol && n.hol !== 'ΣΚ' ? ' · αργία' : '');
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="group" as before
    <div className="daybar" role="group" aria-label="Ώρες της μέρας">
      <TimeField
        id="dbo"
        label="Αρχή εξόδου"
        value={v.out}
        onChange={(x: string) => set('out', x)}
        help={t.over?.out ? 'άλλαξε (προεπιλογή ' + bt.out + ')' : ''}
      />
      <TimeField
        id="dbb"
        label="Επιστροφή εξοδούχων"
        value={v.backOut}
        onChange={(x: string) => set('backOut', x)}
        help={t.over?.backOut ? 'άλλαξε (προεπιλογή ' + bt.backOut + ')' : 'το ίδιο βράδυ'}
      />
      <TimeField
        id="dbd"
        label={'Επιστροφή ΔΝ · ' + nxName}
        value={v.backDn}
        onChange={(x: string) => set('backDn', x)}
        help={n.over?.backDn ? 'άλλαξε (προεπιλογή ' + bn.backDn + ')' : 'το πρωί της επόμενης'}
      />
      <div className="field">
        <span className="field__label">Αύριο εκπαίδευση</span>
        <Segmented
          small={true}
          value={v.train ? 'y' : 'n'}
          onChange={(x: string) => set('train', x === 'y')}
          items={[
            { value: 'y', label: 'Ναι' },
            { value: 'n', label: 'Όχι' },
          ]}
        />
        <span className="field__help">
          {n.over?.train != null
            ? 'άλλαξε (προεπιλογή ' + (bn.train ? 'ναι' : 'όχι') + ')'
            : n.hol && n.hol !== 'ΣΚ'
              ? 'αργία: ' + n.hol
              : ' '}
        </span>
      </div>
      <div className="daybar__acts">
        {dirty ? (
          <>
            <Button
              size="sm"
              disabled={bad}
              why={bad ? 'Μια ώρα δεν είναι σωστή ή οι εξοδούχοι γυρνούν πριν ξεκινήσει η έξοδος' : undefined}
              onClick={save}
            >
              Αποθήκευση ωρών
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setV(cur)}>
              Ακύρωση
            </Button>
          </>
        ) : null}
        {changed && !dirty ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => go(reset, 'Οι ώρες ' + dm(date) + ' και ' + dm(nx) + ' γύρισαν στην προεπιλογή')}
            data-tip="Σβήνει τις αλλαγές αυτών των ωρών και ισχύουν οι ώρες της ημέρας εβδομάδας (Κανόνες)"
          >
            Επαναφορά στην προεπιλογή
          </Button>
        ) : null}
      </div>
    </div>
  );
}
