// Readers and small writers of Settings: duty start, rooms and platoons, «ΗΚΑΙ» sections, duty forms (phases).
//
// Purpose: `dutyStartOf`, `roomCfg`/`platoonsOf`/`unitOf`, `hkOn`, and the phase (duty form) selectors `blocksOf`,
//   `phaseBase`, `phaseName`, `phaseList`, `frouraFile`, `phaseBlocks`, `everyBlock`, `withBlocks`.
// Does NOT: define Settings (settings.ts), migrate it (migrate.ts) or compute post codes (codes.ts).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: every function here takes a Settings, so it must sit above settings.ts; the types they need sit below it.
// Covering tests: test/own-phases.test.ts, test/units.test.ts, test/shifts.test.ts, test/hkai.test.ts.
import { DEFAULT_DUTY_START, okT } from './shifts';
import type { BasePhase, BlockDef, Phase } from './duty';
import { PHASE_NAME } from './duty';
import type { HkSection } from './hkaiSettings';
import { HK_DEFAULT_OFF } from './hkaiSettings';
import type { Person } from './person';
import type { RoomSettings } from './rooms';
import { DEFAULT_ROOMS, makePlatoons, platoonShort } from './rooms';
import type { Platoon } from './rooms';
import type { Settings } from './settings';

/** When the duty cycle starts (HH:MM): Settings.dutyStart if valid, otherwise 14:00. */
export const dutyStartOf = (st?: Pick<Settings, 'dutyStart'> | null) =>
  okT(st?.dutyStart) ? st!.dutyStart! : DEFAULT_DUTY_START;
/** Room settings, or the default 8 rooms / 4 per platoon. */
export const roomCfg = (st?: Pick<Settings, 'rooms'> | null): RoomSettings => st?.rooms || DEFAULT_ROOMS;
/** The platoons: the user's own list, otherwise built from the two numbers. */
export const platoonsOf = (st?: Pick<Settings, 'rooms'> | null): Platoon[] => {
  const c = roomCfg(st);
  return c.platoons || makePlatoons(c.n, c.per);
};
/** Short platoon name of a person's room; a room that belongs to no platoon → «—». */
export const unitOf = (p: Pick<Person, 'room'>, st?: Pick<Settings, 'rooms'> | null) => {
  if (p.room == null) return '—';
  const u = platoonsOf(st).find((x) => x.rooms.includes(p.room!));
  return u ? platoonShort(u.name) : '—';
};
// The user's own duty form with this id (none for the built-in ΣΒΕΝ and ΣΠΕΝ)
const ownPhase = (st: Settings, ph: Phase) =>
  ph === 'sven' || ph === 'spen' ? undefined : (st.phases || []).find((x) => x.id === ph);
/** The duty blocks of a form (default: the form in force). */
export const blocksOf = (settings: Settings, phase: Phase = settings.phase): BlockDef[] =>
  phase === 'spen' ? settings.blocksSpen : ownPhase(settings, phase)?.blocks || settings.blocks;
/** Which built-in form it is written with (ΣΒΕΝ or ΣΠΕΝ): for the template, the cells, the signatures. */
export const phaseBase = (st: Settings, ph: Phase = st.phase): BasePhase =>
  ph === 'spen' ? 'spen' : ownPhase(st, ph)?.base || 'sven';
/** Screen and file name of a duty form. */
export const phaseName = (st: Settings, ph: Phase = st.phase): string =>
  ph === 'sven' || ph === 'spen' ? PHASE_NAME[ph] : ownPhase(st, ph)?.name || PHASE_NAME.sven;
/** All duty forms in order: ΣΒΕΝ, ΣΠΕΝ, the user's own. */
export const phaseList = (st: Settings): { id: Phase; name: string; base: BasePhase; custom: boolean }[] => [
  { id: 'sven', name: PHASE_NAME.sven, base: 'sven' as BasePhase, custom: false },
  { id: 'spen', name: PHASE_NAME.spen, base: 'spen' as BasePhase, custom: false },
  ...(st.phases || []).map((x) => ({ id: x.id, name: x.name, base: x.base, custom: true })),
];
/** Start of the Excel file name: «ΦΡΟΥΡΑ », «ΦΡΟΥΡΑ ΣΠΕΝ », «ΦΡΟΥΡΑ ΑΣΚΗΣΗ ». */
export const frouraFile = (st: Settings, ph: Phase = st.phase || 'sven') =>
  'ΦΡΟΥΡΑ ' + (ph === 'sven' ? '' : phaseName(st, ph) + ' ');
/** The duties of every form (ΣΒΕΝ, ΣΠΕΝ, own), for whatever looks at all forms together (codes, history, columns). */
export const phaseBlocks = (st: Settings): [Phase, BlockDef[]][] => [
  ['sven', st.blocks || []],
  ['spen', st.blocksSpen || []],
  ...(st.phases || []).map((x) => [x.id, x.blocks || []] as [Phase, BlockDef[]]),
];
/** Every block of every form, flat. */
export const everyBlock = (st: Settings): BlockDef[] => phaseBlocks(st).flatMap(([, b]) => b);
/** The settings with new duties in one form. */
export function withBlocks(st: Settings, ph: Phase, list: BlockDef[]): Settings {
  if (ph === 'spen') return { ...st, blocksSpen: list };
  if (ph === 'sven' || !ownPhase(st, ph)) return { ...st, blocks: list };
  return { ...st, phases: (st.phases || []).map((x) => (x.id === ph ? { ...x, blocks: list } : x)) };
}
/** Is a «ΗΚΑΙ» section on? Sections off by default need hkai.on, the others are on unless in hkai.off. */
export const hkOn = (st: Settings, k: HkSection) =>
  HK_DEFAULT_OFF.includes(k) ? (st.hkai?.on || []).includes(k) : !(st.hkai?.off || []).includes(k);
