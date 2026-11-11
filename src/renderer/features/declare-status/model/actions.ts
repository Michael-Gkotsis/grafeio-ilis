// What the buttons of the declaration dialog do.
// Purpose: `declareActions`: «Συνέχεια» checks (`next`), «Αποθήκευση» runs the command (`apply`), a click on a status
//   (`choose`), and the moves between steps (`toStatus`, `toDates`).
// Does NOT: hold state or draw; it gets the dialog's state and setters. The messages are Greek, as the user reads them.
// Owner layer: renderer/features/declare-status. Why: moved verbatim from DeclareStatusDialog's body; the
//   «Προσοχή» warning is data now (`DeclareError`), the UI writes it.
// Covering test: test/status-fix.test.ts, test/ux-names.test.ts.
import type { StatusPlan } from '../../../../core/duty/planChange';
import { planStatusChanges } from '../../../../shared/rules';
import { timeNames } from '../../../../shared/hours';
import { rkShort } from '../../../entities/person';
import type { DeclareDerived } from './derive';
import type { DeclareState } from './state';
import type { StatusPick } from './statusPicks';

/** The handlers the steps wire to their buttons. */
export interface DeclareActions {
  next: () => void;
  apply: () => Promise<void>;
  choose: (x: StatusPick) => void;
  toStatus: () => void;
  toDates: () => void;
}

const NO_PERSON = 'Διάλεξε ποιον αφορά η δήλωση. Γράψε τα πρώτα γράμματα του επωνύμου.';

/**
 * The first reason step 3 cannot go on, or null: no person, a ΣΤΕΠ/κωλυόμενος without a name, a time that cannot be
 * read, or a return before the departure on the same day.
 */
function whenError(s: DeclareState, v: DeclareDerived): string | null {
  const { cmd } = s;
  const tn = timeNames(cmd.type);
  if (!cmd.pids.length) return NO_PERSON;
  if (v.isKol && !cmd.note.trim()) {
    return 'Γράψε τι υπηρεσία είναι, π.χ. «Υπηρεσία ΣΤΕΠ». Φαίνεται στη Δύναμη και στο Σήμερα.';
  }
  if (v.tOut == null || v.tBack == null) {
    return 'Η ώρα ' + (v.tOut == null ? tn.fromG : tn.toG) + ' δεν διαβάζεται. Γράψε π.χ. 14:00 ή άφησέ την κενή.';
  }
  if (v.tOut && v.tBack && cmd.from === cmd.to && v.tBack <= v.tOut) {
    return 'Την ίδια μέρα η ' + tn.to + ' πρέπει να είναι μετά την ' + tn.from + '.';
  }
  return null;
}

/** «Αποθήκευση»: runs the command, closes, and tells what was done (with «Αναίρεση» and maybe «Βρες αντικαταστάτη»). */
const applyOf = (s: DeclareState, v: DeclareDerived, plan: StatusPlan | null, onClose: () => void) => async () => {
  const { store, toast, nav, fix, cmd, pm } = s;
  const { run, undoMark } = store;
  const { cmds, full, medPicks, med, t } = v;
  if (
    !(await run(
      fix
        ? { t: 'replaceStatus', id: fix.id, cmds }
        : cmds.length > 1
          ? { t: 'declareMany', cmds }
          : { t: 'declare', cmd: full },
      false,
    ))
  )
    return;
  onClose();
  const names = medPicks.length > 1 ? medPicks.map((x) => x.short).join(' + ') : med ? med.name : t.label;
  const w = cmd.pids.length === 1 ? rkShort(pm.get(cmd.pids[0])!) : cmd.pids.length + ' άτομα';
  const acts = [undoMark()];
  if (plan?.conflicts.length) {
    acts.unshift({ label: 'Βρες αντικαταστάτη', fn: () => nav.go('guard', { guardDate: plan.conflicts[0].date }) });
  }
  toast({
    text:
      (fix
        ? 'Διορθώθηκε ' + (cmd.type === 'PUN' ? 'η ποινή' : names) + ': '
        : cmd.type === 'PUN'
          ? 'Ποινή: '
          : 'Δηλώθηκε ' + names + ': ') + w,
    actions: acts,
  });
};

/** Builds the handlers over the current render's state (they are plain closures, as they were in the component). */
export function declareActions(
  s: DeclareState,
  v: DeclareDerived,
  plan: StatusPlan | null,
  onClose: () => void,
): DeclareActions {
  const { store, cmd, base, ack, picks, medSel, setErr, setAck, setStep, setPicked, setMedSel, setCmd } = s;
  const next = () => {
    const bad = whenError(s, v);
    if (bad) {
      setErr(bad);
      return;
    }
    // overlap or «no out»: a warning and a confirmation, not a ban (Michael, 17/10)
    const p = planStatusChanges(base, v.cmds, store.today);
    if (p.overlaps.length + p.blocked.length && !ack) {
      setAck(true);
      setErr({ overlaps: p.overlaps, blocked: p.blocked });
      return;
    }
    setStep(4);
  };
  // not medical: one choice and on to «Πότε»; medical: it enters or leaves the chosen ones
  const choose = (x: StatusPick) => {
    setErr(null);
    setAck(false);
    if (x.cat !== 'med') {
      setPicked(true);
      setMedSel([]);
      setCmd((c) => ({ ...c, type: x.type, kind: x.kind || '' }));
      setStep(cmd.pids.length ? 3 : 1);
      return;
    }
    const sel = medSel.includes(x.key)
      ? medSel.filter((k) => k !== x.key)
      : [...(v.t.cat === 'med' ? medSel : []), x.key];
    setMedSel(sel);
    setPicked(sel.length > 0);
    const first = picks.find((y) => sel.includes(y.key));
    if (first) setCmd((c) => ({ ...c, type: first.type, kind: first.kind || '' }));
  };
  const toStatus = () => {
    if (!cmd.pids.length) {
      setErr(NO_PERSON);
      return;
    }
    setErr(null);
    setStep(s.picked ? 3 : 2);
  };
  const toDates = () => {
    if (!v.medPicks.length) {
      setErr('Διάλεξε ένα ή περισσότερα ιατρικά.');
      return;
    }
    setErr(null);
    setStep(cmd.pids.length ? 3 : 1);
  };
  return { next, apply: applyOf(s, v, plan, onClose), choose, toStatus, toDates };
}
