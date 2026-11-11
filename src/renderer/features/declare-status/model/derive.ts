// What the declaration dialog works out from its state on every render.
// Purpose: `deriveDeclare`: the chosen type and kind, the medical picks, the times, the command(s) to plan and run, the
//   penalty checks, the shown status list. Pure: same state in, same values out.
// Does NOT: use hooks, change state, plan the change (the dialog memoises `planStatusChanges`) or draw anything.
// Owner layer: renderer/features/declare-status. Why: moved verbatim from DeclareStatusDialog's body.
// Covering test: test/status-fix.test.ts, test/screens-dialogs-forms.test.ts.
import type { StatusCmd } from '../../../../core/duty/planChange';
import type { ISODate } from '../../../../shared/dates';
import { daysBetween } from '../../../../shared/dates';
import { TYPES, type TypeKey } from '../../../../shared/domain';
import { hasTimes, normTime } from '../../../../shared/hours';
import { medNote } from '../../../../shared/ranks';
import { deprivationEnd, isDeprivation, overMax } from '../../../../shared/punish';
import { canOpen } from '../../../../shared/rules';
import { normGreek } from '../../../../shared/text';
import { statusCmdOf, statusCmdsOf } from './draft';
import { CAT_NAME, type StatusPick } from './statusPicks';
import type { DeclareState } from './state';

/** The values worked out from the state. */
export interface DeclareDerived {
  t: (typeof TYPES)[TypeKey];
  hasKind: boolean;
  isPun: boolean;
  isKol: boolean;
  med: DeclareState['meds'][number] | undefined;
  medPicks: StatusPick[];
  /** A chosen medical kind is «note only» (Michael, 4/11). */
  noteInfo: boolean;
  timed: boolean;
  open: boolean;
  tOut: string | null;
  tBack: string | null;
  full: StatusCmd;
  cmds: StatusCmd[];
  /** Penalty longer than its kind's maximum days, else 0. */
  max: number;
  dep: boolean;
  /** For a deprivation of outs: when it ends for each person, where that differs from `cmd.to`. */
  depEnds: { pid: number; to: ISODate }[];
  curKey: string;
  cur: StatusPick | undefined;
  /** The picks that match the group filter and the search text. */
  shown: StatusPick[];
}

/** Works the derived values out. */
export function deriveDeclare(s: DeclareState): DeclareDerived {
  const { cmd, picks, medSel, meds, base, unlock, ack, q, catF } = s;
  const lists = s.store.state.settings.lists;
  const t = TYPES[cmd.type];
  const hasKind = cmd.type === 'PUN' || cmd.type === 'LEAVE';
  const isPun = cmd.type === 'PUN';
  const isKol = cmd.type === 'KOL';
  const med = !hasKind ? meds.find((m) => m.like === cmd.type && m.name === cmd.kind) : undefined;
  const medPicks = t.cat === 'med' ? picks.filter((x) => medSel.includes(x.key)) : [];
  const noteInfo =
    medPicks.some((x) => x.type && medNote({ type: x.type, kind: x.kind }, lists)) || (!!med && !!med.note);
  // times: leaves, hospital and ΣΤΕΠ (hours.ts), optional
  const timed = hasTimes(cmd.type);
  // no end: medical, ΣΤΕΠ and hospital only (canOpen); no «until» and no return time
  const open = cmd.open && canOpen(cmd.type);
  const tOut = timed ? normTime(cmd.fromTime) : '';
  const tBack = timed && !open ? normTime(cmd.toTime) : '';
  const full = statusCmdOf(cmd, { hasKind, med, open, tOut, tBack, unlock, ack, isAbs: t.cat === 'abs' });
  const cmds = statusCmdsOf(full, medPicks);
  const max = isPun ? overMax(cmd.kind, daysBetween(cmd.from, cmd.to), lists) : 0;
  // deprivation of outs: when it ends for each one, since days with a duty or night training do not count
  const dep = isPun && isDeprivation({ type: 'PUN', kind: cmd.kind });
  const depEnds = dep
    ? cmd.pids
        .map((pid) => ({ pid, to: deprivationEnd(base, pid, cmd.from, daysBetween(cmd.from, cmd.to)) }))
        .filter((x) => x.to !== cmd.to)
    : [];
  const curKey = hasKind ? cmd.type + ':' + cmd.kind : med ? 'm:' + med.name : cmd.type;
  const cur = picks.find((x) => x.key === curKey);
  const shown = picks.filter(
    (x) =>
      (!catF || x.cat === catF || (catF === 'med' && x.cat === 'other')) &&
      (!q.trim() || normGreek(x.short + ' ' + x.long + ' ' + CAT_NAME[x.cat]).includes(normGreek(q))),
  );
  return {
    t,
    hasKind,
    isPun,
    isKol,
    med,
    medPicks,
    noteInfo,
    timed,
    open,
    tOut,
    tBack,
    full,
    cmds,
    max,
    dep,
    depEnds,
    curKey,
    cur,
    shown,
  };
}
