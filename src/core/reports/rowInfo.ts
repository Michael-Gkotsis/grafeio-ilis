// Small lookups the rows of a report need: weapon info, group names, dates and absence.
//
// Purpose: `wInfo` (the weapon info of a day, kept for the last state and day asked), `blockName`, `when`,
//   `absField` and `repDate`.
// Does NOT: decide which rows come in (candidates.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/statuses, core/lib, core/model,
//   core/weapons.
// Why: the weapon info is expensive and every row of a form asks for it, so it is built once per state and day; the
//   memo is module state with exactly one instance, here.
// Covering tests: test/reports-sheets.test.ts, test/personal-entypa.test.ts.
import { absenceOfPerson } from '../statuses/absence';
import { addDays, dmy, type ISODate } from '../lib/dates';
import { blocksOf, everyBlock } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import { weaponInfo, type WeaponInfo } from '../weapons/weaponInfo';
import type { Report } from '../model/reportTypes';

/** The day a form is for: today, tomorrow, or the day the user asked for. */
export const repDate = (r: Pick<Report, 'day'>, today: ISODate, asked?: ISODate) =>
  r.day === 'tomorrow' ? addDays(today, 1) : r.day === 'ask' && asked ? asked : today;
/** The name of a group of duty posts (block) of the settings; '' when it does not exist. */
export const blockName = (s: AppState, id: string) =>
  (
    (blocksOf(s.settings) || s.settings.blocks).find((b) => b.id === id) ||
    everyBlock(s.settings).find((b) => b.id === id)
  )?.name || '';
// in/out for everyone together: once per state and day (it is asked for every row)
let wiMemo: { s: AppState; d: ISODate; info: WeaponInfo } | null = null;
/** The weapon info of the state on day `d`, built once per state and day (every row asks for it). */
export const wInfo = (s: AppState, d: ISODate) => {
  if (!wiMemo || wiMemo.s !== s || wiMemo.d !== d) wiMemo = { s, d, info: weaponInfo(s, d) };
  return wiMemo.info;
};
/** A date and an optional time as text («dd/mm/yyyy hh:mm»); '' without a date. */
export const when = (day?: ISODate, t?: string) => (day ? dmy(day) + (t ? ' ' + t : '') : '');
/** The absence fields: ΑΠΩΝ ΝΑΙ, the reason and the return date. */
export const absField = (a: ReturnType<typeof absenceOfPerson>, f: string): string =>
  f === 'absent' ? (a.absent ? 'ΝΑΙ' : '') : f === 'areason' ? a.reason : a.ret ? dmy(a.ret) : '';
