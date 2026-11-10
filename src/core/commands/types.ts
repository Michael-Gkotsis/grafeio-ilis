// The types of the commands: the `Command` union, `Ctx`, `Result` and the handler types.
//
// Purpose: Every user action as a data type (`Command`), the context a command runs with (`Ctx`), what it returns
//   (`Result`: the new state, the history text and the Excel files to refresh), `NewPerson`, `WeaponChange`, and the
//   handler types (`SeatMap`, `CommandOf`, `Handler`).
// Does NOT: contain any logic or runtime code; it is types only.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: One place for the contract of the commands, so the handlers, `run`, `apply` and the IPC layer share one
//   definition. The union is frozen: the undo patches and the IPC messages use these shapes (`t` values are never
//   renamed).
// Covering tests: test/golden-outputs.test.ts, test/rules.test.ts (type-checked through `npm run typecheck`).
import type { ImportRow } from '../model/importRow';
import type { seatMap } from '../duty/indexes';
import type { HdDoc } from '../model/documents';
import type { ISODate } from '../lib/dates';
import type { Status, TypeKey } from '../model/status';
import type { CapKey, DayPlan, Rules } from '../model/dutyRules';
import type { Person } from '../model/person';
import type { BlockDef, DutyKind, Phase } from '../model/duty';
import type { ShiftDef } from '../model/shifts';
import type { AppState, Baseline } from '../model/state';
import type { Cadre, CadreAbs } from '../model/cadreRecord';
import type { PersonRequest, WeaponMove } from '../model/records';
import type { HkaiManual } from '../model/hkaiSettings';
import type { Settings } from '../model/settings';
import type { DutyCell } from '../excel-in/dutyCheckIn';
import type { AbsNew } from '../excel-in/cadreAbsRead';
import type { CadreNew } from '../excel-in/cadreRead';
import type { StatusCmd } from '../duty/planChange';
import type { HkRowDef } from '../model/lists';

/**
 * Every user action, as data. `t` is the type; the other fields are its arguments. Frozen: the IPC messages and the
 * undo history use these shapes, so a `t` is never renamed.
 * @see src/core/commands/handlers/index.ts (the function that runs each type)
 */
export type Command =
  | { t: 'declare'; cmd: StatusCmd }
  // many medicals together for the same people, with the same dates (Michael, 18/10): each on its own line, one undo
  | { t: 'declareMany'; cmds: StatusCmd[] }
  // wk: «ΔΝ ΣΚ» on Saturday (ΔΝ and out on Sunday); notes: remarks of the day («ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)»), empty = removes
  | {
      t: 'outs';
      date: ISODate;
      changes: { pid: number; from: TypeKey | null; to: TypeKey | null; wk?: boolean }[];
      notes?: { pid: number; note: string }[];
      force?: boolean;
    }
  | { t: 'endStatus'; id: string }
  | { t: 'saveCadre'; cadre: Omit<Cadre, 'id' | 'active'> & { id?: string; active?: boolean } }
  | { t: 'deleteCadre'; id: string }
  | { t: 'orderCadre'; ids: string[] } // the order of the cadre, all ids in the new order
  // id: change · replace: cuts those that fall on the same days
  | { t: 'addCadreAbs'; abs: Omit<CadreAbs, 'id'> & { id?: string }; replace?: boolean }
  | { t: 'deleteCadreAbs'; id: string }
  // From their own Excel (3/11): new cadre and changes of data (with the same rules as the card), and statuses
  | { t: 'importCadres'; adds: CadreNew[]; updates: { id: string; patch: Partial<Cadre> }[]; source: string }
  | { t: 'importCadreAbs'; adds: AbsNew[]; updates: { id: string; note: string }[]; deletes: string[]; source: string }
  | { t: 'setPunInfo'; id: string; by: string; reason: string; on: ISODate }
  // dest: leaves only; missing = unchanged, empty = removed
  | { t: 'setTimes'; id: string; fromTime: string; toTime: string; dest?: string }
  | { t: 'addRequest'; req: Omit<PersonRequest, 'id'> }
  | { t: 'updateRequest'; req: PersonRequest }
  | { t: 'deleteRequest'; id: string }
  // leave request: ok = approved (becomes a leave), false = rejected, null = undo of the decision
  | { t: 'decideRequest'; id: string; ok: boolean | null }
  | { t: 'deleteStatus'; id: string }
  // notes of the office (shared/notes.ts): who without pids/cids = general; one note is tied to many people; rem '' =
  // no reminder
  | { t: 'addNote'; note: { text: string; pids?: number[]; cids?: string[]; rem?: ISODate; star?: boolean } }
  | {
      t: 'editNote';
      id: string;
      patch: { text?: string; who?: { pids?: number[]; cids?: string[] } | null; rem?: ISODate | ''; star?: boolean };
    }
  | { t: 'doneNote'; id: string; done: boolean }
  | { t: 'deleteNote'; id: string }
  // correction of a medical/penalty entered wrongly: the old one goes and the declaration is made again (same checks),
  // one undo
  | { t: 'replaceStatus'; id: string; cmds: StatusCmd[] }
  // Leave (regular, honorary, sick): cancel = all of it goes (he did not leave, or it was entered wrongly); end = he
  // came back earlier, on the day and time you say
  | { t: 'cancelLeave'; id: string }
  | { t: 'endLeave'; id: string; date: ISODate; time: string }
  | { t: 'approvePun'; id: string }
  // cid: cadre member (gets a pid when he first enters a post)
  | { t: 'assign'; date: ISODate; k: string; pid: number | null; force?: string; move?: string; cid?: string }
  | { t: 'autofill'; date: ISODate }
  | { t: 'clearDay'; date: ISODate }
  | { t: 'setRules'; rules: Rules; text: string }
  // v: off = does not do it (sergeant), on = explicitly does it (even against Σ.Ι./post), clear = whatever Σ.Ι. and
  // post say
  | { t: 'setCap'; pid: number; key: CapKey; v: 'off' | 'on' | 'clear' }
  | { t: 'setOffDays'; pid: number; days: number[] }
  // one-off exemption from duties from–to (id: change an existing one); delSkip: delete
  | { t: 'setSkip'; pid: number; id?: string; from: ISODate; to: ISODate; why?: string }
  | { t: 'delSkip'; pid: number; id: string }
  // shortcuts of the card (e.g. «Όχι ΣΚ», «Μόνο μαγειρεία»): same data as the checkboxes, one undo. off: kinds he does
  // not do (from the sergeant); on: kinds he does again (the sergeant's exception goes); reset: without any exception
  // of the sergeant
  | {
      t: 'setDutyProfile';
      pid: number;
      off?: DutyKind[];
      on?: DutyKind[];
      days?: number[];
      reset?: boolean;
      text: string;
    }
  | { t: 'setSettings'; settings: Partial<Settings>; text: string }
  // ΗΚΑΙ rows you added: the cadre with a rank that a row collects go to it (and leave when it is deleted)
  | { t: 'setHkRows'; rows: HkRowDef[]; names?: Record<string, string>; text: string }
  | { t: 'printed'; date: ISODate; at: string; files: string[] }
  | { t: 'importPeople'; rows: ImportRow[]; source: string; deactivateMissing: boolean }
  | { t: 'updatePerson'; person: Person }
  | { t: 'addPerson'; person: NewPerson }
  | { t: 'addPeople'; people: NewPerson[] }
  | { t: 'setBaseline'; pid: number; baseline: Baseline }
  | { t: 'setBaselines'; baselines: Record<number, Baseline> }
  | { t: 'removeDutyLog'; date: ISODate; pid: number; kind: DutyKind }
  | { t: 'setHkaiManual'; date: ISODate; manual: HkaiManual }
  | { t: 'setHkaiLv'; date: ISODate; on: boolean }
  | { t: 'freezeHkaiLv'; date: ISODate; on: boolean }
  | { t: 'setPhase'; phase: Phase }
  | { t: 'addPhase'; name: string; from: Phase }
  | { t: 'renamePhase'; id: Phase; name: string }
  | { t: 'delPhase'; id: Phase }
  | {
      t: 'addBlock';
      phase: Phase;
      name: string;
      kind?: DutyKind;
      armed: boolean;
      n: number;
      per?: number;
      hrs: string;
      off?: boolean;
      shift?: ShiftDef | null;
      armWeapon?: 'own' | 'post';
    }
  // nums/per (Michael, 4/11): numbers and people per number; the old n = nums. armed/hidden/armWeapon change from here
  // too (not in Λ/Υ-Δ/Υ)
  | {
      t: 'editBlock';
      phase: Phase;
      id: string;
      name: string;
      n?: number;
      nums?: number;
      per?: number;
      hrs: Record<string, string>;
      hrsNum?: string[];
      move?: number;
      codes?: Record<string, string>;
      shift?: ShiftDef | null;
      armed?: boolean;
      hidden?: boolean;
      armWeapon?: 'own' | 'post';
    }
  | { t: 'setBlock'; phase: Phase; id: string; patch: Partial<Pick<BlockDef, 'armed' | 'hidden' | 'armWeapon'>> }
  | { t: 'autofillRange'; dates: ISODate[] }
  | { t: 'swapPosts'; date: ISODate; a: string; b: string; force?: string }
  | {
      t: 'importRecords';
      adds: Omit<Status, 'id'>[];
      updates: { id: string; patch: Partial<Status> }[];
      deletes?: string[];
      source: string;
      what: string;
    }
  | {
      t: 'setPeopleFields';
      changes: { pid: number; patch: Partial<Pick<Person, 'post' | 'active' | 'notes'>> }[];
      source: string;
      what: string;
    }
  | { t: 'importCaps'; changes: { pid: number; kind: CapKey; reason: string | null }[]; source: string }
  | { t: 'importDuties'; days: Record<ISODate, DutyCell[]>; source: string }
  | { t: 'expire' }
  | { t: 'extendOpen' }
  | { t: 'setNightTraining'; date: ISODate; on: boolean }
  // Outing/return hours and morning training per weekday (Michael, 24/10): week[getDay] = what changes
  | { t: 'setWeekRules'; week: Partial<Record<number, DayPlan>> }
  // Change of hours/training for one day; empty plan = back to the weekday
  | { t: 'setDayPlan'; date: ISODate; plan: DayPlan }
  // Calendar of the impeded (κωλυόμενοι): a cell by hand (free text, capitals); empty text = back to automatic. Changes
  // only the calendar. Ημερήσια Διαταγή: the ΗΔ of the day as it came out (lines and fields); doc null = again from the
  // data. Does not touch the ΗΚΑΙ
  | { t: 'setHd'; date: ISODate; doc: HdDoc | null }
  | { t: 'setImer'; date: ISODate; cells: { pid: number; text: string }[] }
  // ... two days together (Εξοδούχοι screen: the outing of the day and the ΔΝ return of the next), one undo
  | { t: 'setDayPlans'; plans: { date: ISODate; plan: DayPlan }[] }
  // Correction of the return of one person (ΔΝ/out of the day `day`): stay = does not return, continues; at = returns
  // then; why is required
  | { t: 'setBackFix'; pid: number; day: ISODate; stay?: boolean; at?: { day: ISODate; time: string }; why: string }
  | { t: 'delBackFix'; id: string }
  // ΗΚΑΙ 1. ΕΓΓΡΑΦΕΣ / 2. ΔΙΑΓΡΑΦΕΣ: another day, or null = not to be written
  | { t: 'setPersonMove'; pid: number; field: 'inOn' | 'outOn'; date: ISODate | null }
  // Weapons: weapon numbers, many together with one undo (column paste, transfer from another). '' = no weapon / handed
  // in
  | { t: 'setWeapons'; changes: WeaponChange[]; what?: string }
  | {
      t: 'setPersonal';
      pid?: number;
      cid?: string;
      iban?: string;
      amka?: string;
      afm?: string;
      email?: string;
      relEmail?: string;
      blood?: string;
    } // IBAN/ΑΜΚΑ/ΑΦΜ from the card (soldier or cadre); e-mail, relative's e-mail, blood group for soldiers only
  // Weapons out and in from the armory (Michael, 18/10). Time ΩΩ:ΛΛ (the form puts the current one). Entry without
  // reason: the entry reason of each exit from the list (ΕΚΠ → ΛΗΞ ΕΚΠ)
  | { t: 'weaponOut'; pids: number[]; reason: string; day: ISODate; time: string; note?: string }
  | { t: 'weaponIn'; ids: string[]; day: ISODate; time: string; reason?: string }
  | {
      t: 'editWeaponMove';
      id: string;
      patch: Partial<Pick<WeaponMove, 'reason' | 'outDay' | 'outTime' | 'inDay' | 'inTime' | 'inReason' | 'note'>>;
    }
  // group correction of reason/exit time: one command, one undo
  | { t: 'editWeaponMoves'; ids: string[]; patch: Partial<Pick<WeaponMove, 'reason' | 'outDay' | 'outTime'>> }
  | { t: 'deleteWeaponMove'; id: string }
  // Correction of the time of an armed number (Michael, 24/10): row = cycle day + post + first number (n). out/in
  // «ΕΕΕΕ-ΜΜ-ΗΗ ΩΩ:ΛΛ», the one that is missing stays automatic; why is required; reset: back to automatic
  | {
      t: 'fixDutyWeapon';
      day: ISODate;
      post: string;
      n: number;
      out?: string;
      in?: string;
      why: string;
      reset?: boolean;
    };
/** Weapons: only the fields given change (number, type, rack position); empty = removed. */
export interface WeaponChange {
  pid: number;
  weapon?: string;
  wtype?: string;
  rack?: string;
  wpos?: string;
}
export type { ImportRow };
/** New soldier from the app: whatever the form writes (the id, «in strength» and «new» are set by the command). */
export type NewPerson = Omit<Person, 'id' | 'active' | 'added'>;
/** What a command runs with: `today` (ISODate, local time) and `newId` (a new unique id for records). */
export interface Ctx {
  today: ISODate;
  newId: () => string;
}
/**
 * What a command returns: the new state, the text for the History (empty = no history line), the Excel files to
 * refresh, and the optional `source`, `undoable` (false = no undo) and `extra` (more history lines).
 */
export interface Result {
  state: AppState;
  text: string;
  files: string[];
  source?: 'app' | 'auto' | 'import' | 'excel';
  undoable?: boolean;
  extra?: string[];
}

/** What `seatMap` builds once per command: soldiers and cadre with duties (ΕΠΟΠ/ΟΒΑ), by id. */
export type SeatMap = ReturnType<typeof seatMap>;
/** The command whose `t` is `T` (one or several). */
export type CommandOf<T extends Command['t']> = Extract<Command, { t: T }>;
/**
 * One handler per command type: `(state, command, ctx, pm)` -> `Result`. `pm` is the seat map of `state`, built once
 * by `run` before the dispatch; a handler never builds it again.
 */
export type Handler<T extends Command['t']> = (s: AppState, c: CommandOf<T>, ctx: Ctx, pm: SeatMap) => Result;
