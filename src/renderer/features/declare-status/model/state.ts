// The state of the declaration dialog: every `useState` it has, plus the lists it reads from the settings.
// Purpose: `useDeclareState`, the first part of `useDeclare` (state, the record being corrected, the status list).
// Does NOT: derive anything from the draft (derive.ts), validate or run commands (actions.ts), or draw.
// Owner layer: renderer/features/declare-status. Why: moved verbatim from DeclareStatusDialog; split so each piece
//   stays under the function-size limit. The hooks are still called by one component, in one fixed order.
// Covering test: test/status-fix.test.ts, test/screens-dialogs-forms.test.ts.
import { useMemo, useState } from 'react';
import type { ListItem } from '../../../../core/model/lists';
import { statSummary } from '../../../../shared/stat';
import {
  TYPES,
  blocksOf,
  type AppState,
  type BlockDef,
  type Person,
  type Status,
  type TypeKey,
} from '../../../../shared/domain';
import { personMap } from '../../../../shared/rules';
import { listOf, medKinds } from '../../../../shared/ranks';
import { useNav, useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { initialDraft, type DeclareDraft, type DeclareInitial } from './draft';
import { ORDER_STATUS_FIRST, statusPicks, type StatusPick } from './statusPicks';
import type { DeclareError } from './types';

/** The part of the dialog that React owns. */
export interface DeclareState {
  store: ReturnType<typeof useStore>;
  toast: ReturnType<typeof useToast>;
  nav: ReturnType<typeof useNav>;
  /** People by id, rebuilt on every render as before. */
  pm: Map<number, Person>;
  /** The record being corrected («Διόρθωση…»), if the dialog was opened with `replace`. */
  fix: Status | undefined;
  /** The state without the record being corrected: the plan is made on it. */
  base: AppState;
  /** True when the dialog starts at the status (opened from a status button, no people yet). */
  statusFirst: boolean;
  /** The step numbers in the order they are shown. */
  order: number[];
  step: number;
  setStep: (n: number) => void;
  unlock: boolean;
  setUnlock: (v: boolean) => void;
  ack: boolean;
  setAck: (v: boolean) => void;
  cmd: DeclareDraft;
  setCmd: (f: (c: DeclareDraft) => DeclareDraft) => void;
  err: DeclareError | null;
  setErr: (e: DeclareError | null) => void;
  /** Changes fields of the draft and clears the error and the warning confirmation. */
  set: (patch: Partial<DeclareDraft>) => void;
  meds: ListItem[];
  picks: StatusPick[];
  medSel: string[];
  setMedSel: (keys: string[]) => void;
  q: string;
  setQ: (s: string) => void;
  catF: string;
  setCatF: (c: string) => void;
  picked: boolean;
  setPicked: (v: boolean) => void;
}

/** All the dialog's state hooks, in the order they had in the component. */
export function useDeclareState(initial: DeclareInitial): DeclareState {
  const store = useStore();
  const { state, today } = store;
  const toast = useToast();
  const nav = useNav();
  const pm = personMap(state.people);
  const fix = initial.replace ? state.statuses.find((x) => x.id === initial.replace) : undefined;
  const base = useMemo(
    () => (fix ? { ...state, statuses: state.statuses.filter((x) => x !== fix) } : state),
    [state, fix],
  );
  // why: from a person's card the dialog starts at the status (Michael, 18/10)
  const statusFirst = !!initial.cat && !initial.pids?.length;
  const order = statusFirst ? ORDER_STATUS_FIRST : [1, 2, 3, 4];
  const [step, setStep] = useState(() => (initial.pids?.length ? (initial.type ? 3 : 2) : statusFirst ? 2 : 1));
  const [unlock, setUnlock] = useState(false);
  const [ack, setAck] = useState(false);
  const punKinds = listOf(state.settings.lists, 'punKinds');
  const leaveKinds = listOf(state.settings.lists, 'leaveKinds');
  const [cmd, setCmd] = useState(() => initialDraft(initial, today, leaveKinds, punKinds));
  const [err, setErr] = useState<DeclareError | null>(null);
  const set = (patch: Partial<DeclareDraft>) => {
    setCmd((c) => ({
      ...c,
      ...patch,
      ...(patch.type ? { kind: patch.type === 'LEAVE' ? leaveKinds[0] : punKinds[0] } : {}),
    }));
    setErr(null);
    setAck(false);
  };
  // the user's own medical kinds (Ρυθμίσεις › Λίστες): next to the built-in ones, with the built-in type and their name as the kind
  const meds = medKinds(state.settings.lists);
  const picks = useMemo(() => {
    const bl = (blocksOf(state.settings) || state.settings.blocks) as BlockDef[];
    return statusPicks(punKinds, leaveKinds, meds, (x) => statSummary(x, bl, state.settings.lists));
  }, [state.settings]);
  // medical: one or more together for the same reason, each written on its own line in the Excel (Michael, 18/10)
  const [medSel, setMedSel] = useState<string[]>(() =>
    initial.type && TYPES[initial.type as TypeKey]?.cat === 'med'
      ? [meds.some((m) => m.like === initial.type && m.name === initial.kind) ? 'm:' + initial.kind : initial.type]
      : [],
  );
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState<string>(initial.cat || '');
  const [picked, setPicked] = useState(!!initial.type);
  return {
    store,
    toast,
    nav,
    pm,
    fix,
    base,
    statusFirst,
    order,
    step,
    setStep,
    unlock,
    setUnlock,
    ack,
    setAck,
    cmd,
    setCmd,
    err,
    setErr,
    set,
    meds,
    picks,
    medSel,
    setMedSel,
    q,
    setQ,
    catF,
    setCatF,
    picked,
    setPicked,
  };
}
