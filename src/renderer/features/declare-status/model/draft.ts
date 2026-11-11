// The form data of the declaration and the command it becomes.
// Purpose: `DeclareInitial` (what the dialog may open with), `DeclareDraft` (the fields while you type),
//   `initialDraft`, and `statusCmdOf` / `statusCmdsOf` (the `StatusCmd` that is planned and run).
// Does NOT: validate (`checkWhen` does), plan the change, or run the command.
// Owner layer: renderer/features/declare-status. Why: pure functions out of the dialog, so the field rules sit in one place.
// Covering test: test/status-fix.test.ts, test/screens-dialogs-forms.test.ts.
import type { StatusCmd } from '../../../../core/duty/planChange';
import { KOL_NO_COL, type TypeKey } from '../../../../shared/domain';
import type { ISODate } from '../../../../shared/dates';
import type { ListItem } from '../../../../core/model/lists';
import type { StatusPick } from './statusPicks';

/**
 * What the dialog can open with (`nav.declare(...)`): the status to correct (`replace`), a group of statuses to start
 * from (`cat`), people, a type, and the fields of an existing record.
 */
export interface DeclareInitial {
  /** Id of the medical record or penalty to correct: the old one goes when the new one is saved. */
  replace?: string;
  /** Opens at the status list limited to this group (`med`, `pun`...). */
  cat?: string;
  pids?: number[];
  type?: TypeKey;
  kind?: string;
  from?: ISODate;
  to?: ISODate;
  note?: string;
  by?: string;
  reason?: string;
  on?: ISODate;
  fromTime?: string;
  toTime?: string;
  open?: boolean;
  minus?: boolean;
  hkCol?: string;
  noOut?: boolean;
  dest?: string;
}

/** The fields of the declaration while they are typed (all present; empty string = not filled). */
export interface DeclareDraft {
  pids: number[];
  type: TypeKey;
  from: ISODate;
  to: ISODate;
  note: string;
  kind: string;
  by: string;
  reason: string;
  on: ISODate;
  fromTime: string;
  toTime: string;
  open: boolean;
  minus: boolean;
  hkCol: string;
  noOut: boolean;
  dest: string;
}

/**
 * The draft the dialog starts with.
 * @param today - ISODate, local app time
 * @param leaveKinds - the leave kinds of the lists (the first one is the default kind of a leave)
 * @param punKinds - the penalty kinds of the lists (the first one is the default kind of a penalty)
 */
export const initialDraft = (
  initial: DeclareInitial,
  today: ISODate,
  leaveKinds: string[],
  punKinds: string[],
): DeclareDraft => ({
  pids: initial.pids || [],
  type: initial.type || 'EY',
  from: initial.from || today,
  to: initial.to || initial.from || today,
  note: initial.note || '',
  kind: initial.kind || (initial.type === 'LEAVE' ? leaveKinds[0] : initial.type === 'PUN' ? punKinds[0] : ''),
  by: initial.by || '',
  reason: initial.reason || '',
  on: initial.on || today,
  fromTime: initial.fromTime || '',
  toTime: initial.toTime || '',
  open: !!initial.open,
  minus: initial.minus ?? true,
  hkCol: initial.hkCol || KOL_NO_COL,
  noOut: initial.noOut ?? true,
  dest: initial.dest || '',
});

/** Everything `statusCmdOf` needs besides the draft. */
export interface CmdParts {
  hasKind: boolean;
  /** The user's own medical kind that is chosen, if any. */
  med: ListItem | undefined;
  /** «Χωρίς λήξη» (only where `canOpen` allows it). */
  open: boolean;
  /** Normalised out time, `''` when the type has no times. */
  tOut: string | null;
  tBack: string | null;
  unlock: boolean;
  ack: boolean;
  /** The category of the type is `abs` (a leave: has a direction). */
  isAbs: boolean;
}

/** The command of the draft: only the fields that belong to the type, the rest `undefined`. */
export function statusCmdOf(cmd: DeclareDraft, x: CmdParts): StatusCmd {
  const isPun = cmd.type === 'PUN';
  const isKol = cmd.type === 'KOL';
  return {
    ...cmd,
    open: x.open || undefined,
    kind: x.hasKind ? cmd.kind : x.med ? x.med.name : undefined,
    note: cmd.note || undefined,
    by: isPun ? cmd.by : undefined,
    reason: isPun ? cmd.reason : undefined,
    on: isPun ? cmd.on : undefined,
    fromTime: x.tOut || undefined,
    toTime: x.tBack || undefined,
    unlockPast: x.unlock || undefined,
    force: x.ack || undefined,
    minus: (isKol && cmd.minus) || undefined,
    hkCol: isKol && cmd.minus ? cmd.hkCol : undefined,
    noOut: (isKol && cmd.noOut) || undefined,
    dest: x.isAbs && cmd.dest.trim() ? cmd.dest : undefined,
  };
}

/**
 * One command per chosen medical kind when there are several (each is written on its own line in the Excel), else just
 * the one command.
 * @decision Michael 18/10: several medicals together for the same reason.
 */
export const statusCmdsOf = (full: StatusCmd, medPicks: StatusPick[]): StatusCmd[] =>
  medPicks.length > 1
    ? medPicks.map((x) => ({ ...full, type: x.type, kind: x.key.startsWith('m:') ? x.kind : undefined }))
    : [full];
