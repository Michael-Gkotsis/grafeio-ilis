// State of the «Κανόνες υπηρεσιών» dialog: the draft of the rules, the cycle start and the week table, and «Αποθήκευση».
// Purpose: `useRulesDialog`, the hooks of `RulesDialog` in the order the dialog always called them.
// Does NOT: draw anything (ui/RulesDialog.tsx and its tabs) or hold the pure rules (model/rulesView.ts).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); hook order is unchanged:
//   store, toast, tab, rules, cycle start, week, first snapshot, order editor, own services, counts.
//   @decision Michael 1/11: three tabs in one window (Κανόνες · Σειρά δικαιοσύνης · Ώρες), one draft, one «Αποθήκευση».
// Covering test: test/ux-names.test.ts, test/guard-page-view.test.ts.
import { useMemo, useState } from 'react';
import { dutyStartOf, DEFAULT_NUM_ROTS } from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { capCols, strictKeys } from '../../../../shared/rules';
import { RULE_TXT } from '../../../../shared/rulesText';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { draftOf, KEY_NAME, moveKey, orderToSave, rulesInfo, toggleRot, withRule, type RulesDraft } from './rulesView';
import { saveRules } from './saveRules';
import { weekDraft, weekIssue, type WeekDraft } from './weekRules';

/**
 * Everything the dialog reads and calls.
 * @param onClose closes the dialog (also after a successful save)
 * @returns the three tabs' state (`tab`, `r`, `ds`, `wk` with setters), what is wrong (`badT`, `badTxt`), `dirty`,
 *   `save`, the numbers (`rots`, `togRot`), the order editor (`order`, `spare`, `nameOf`, `move`, `setOrder`, `editOrd`)
 *   and `info`
 */
export function useRulesDialog(onClose: () => void) {
  const { state, run, today } = useStore();
  const toast = useToast();
  const st = state.settings;
  const [tab, setTab] = useState('rules');
  const [r, setR] = useState<RulesDraft>(() => draftOf(state.rules));
  const [ds, setDs] = useState(dutyStartOf(st));
  // Out/return hours and morning training per weekday (Michael, 24/10), saved with `setWeekRules`.
  const [wk, setWk] = useState<WeekDraft>(() => weekDraft(state.rules));
  const wkBad = weekIssue(wk);
  const badT = !normTime(r.hkTime) || !normTime(ds) || !!wkBad;
  const badTxt = wkBad || 'Μια ώρα δεν είναι σωστή (π.χ. 16:00): δες την καρτέλα Ώρες';
  const [r0] = useState(() => JSON.stringify([r, ds, wk]));
  const dirty = JSON.stringify([r, ds, wk]) !== r0;
  // `undefined` = the default: it is not saved.
  const set = (k: string, v: unknown) => setR((x) => withRule(x, k, v));
  const txt = (x: RulesDraft) => RULE_TXT({ ...x, armBefore: x.before, armAfter: x.after }, st);
  const save = saveRules({ run, toast, st, r, ds, wk, onClose });
  // A. Which numbers have «ξανά στο ίδιο νούμερο» (at least one).
  const rots: number[] = r.numRots ?? DEFAULT_NUM_ROTS;
  const togRot = (n: number) => {
    const v = toggleRot(rots, n);
    if (v !== null) set('numRots', v);
  };
  // B. The order of «Αυστηρά Άοπλοι»: your own unarmed services (not hidden, not Λ/Υ-Δ/Υ) join it if you want.
  const [editOrd, setEditOrd] = useState(false);
  const own = useMemo(
    () =>
      capCols(st)
        .filter((c) => c.block && !c.armed)
        .map((c) => ({ key: c.key as string, name: c.label })),
    [st],
  );
  const nameOf = (k: string) => KEY_NAME[k]?.[0] || own.find((o) => o.key === k)?.name || '';
  const order = [...strictKeys(r)].filter(nameOf); // keys of deleted services are ignored silently
  const setOrder = (v: string[]) => set('strictOrder', orderToSave(v));
  const move = (i: number, d: number) => setOrder(moveKey(order, i, d));
  const spare = [...Object.keys(KEY_NAME), ...own.map((o) => o.key)].filter((k) => !order.includes(k));
  // «Τι άλλο κρίνει ποιος μπαίνει»: cheap numbers, once when the dialog opens.
  const info = useMemo(() => rulesInfo(state, today), []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    state,
    st,
    tab,
    setTab,
    r,
    set,
    txt,
    ds,
    setDs,
    wk,
    setWk,
    badT,
    badTxt,
    dirty,
    save,
    rots,
    togRot,
    editOrd,
    setEditOrd,
    nameOf,
    order,
    setOrder,
    move,
    spare,
    info,
  };
}

/** What {@link useRulesDialog} returns. */
export type RulesModel = ReturnType<typeof useRulesDialog>;
