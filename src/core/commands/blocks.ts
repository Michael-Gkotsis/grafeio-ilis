// Helpers of the duty blocks (services): keys, shape text, shifts and codes.
//
// Purpose: `usedKeys` (all post keys of all forms), `shapeTxt`, `blockShift` and `fillCodes` (the next free code for
//   a post without one).
// Does NOT: save a block; the phase and block handlers do that.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: New post keys are unique across all forms (Michael 4/11).
// Covering tests: test/own-phases.test.ts, test/codes.test.ts, test/shifts.test.ts.
import type { Phase } from '../model/duty';
import { blocksOf, everyBlock, withBlocks } from '../model/settingsAccess';
import { cleanShift, type ShiftDef } from '../model/shifts';
import type { Settings } from '../model/settings';
import { freeCode } from '../duty/dutyCodes';

/** All post keys of all forms (new keys are unique, Michael 4/11). */
export const usedKeys = (st: Settings) => new Set(everyBlock(st).flatMap((b) => b.posts.map((p) => p.k)));
/** The shape of a service as text: «N νούμερα × M άτομα» (the «× M» only when more than one person per number). */
export const shapeTxt = (n: number, per: number) =>
  n + (n === 1 ? ' νούμερο' : ' νούμερα') + (per > 1 ? ' × ' + per + ' άτομα' : n === 1 ? ' άτομο' : ' άτομα');
/**
 * The shifts of a service as they are stored (cleanShift). A list with not one valid shift does not silently become
 * «every so many hours».
 */
export function blockShift(sh: ShiftDef | null | undefined, count: number): ShiftDef | null {
  const r = cleanShift(sh, count);
  if (sh?.list?.length && !r?.list)
    throw new Error('Οι δικές μου βάρδιες δεν είναι σωστές: κάθε βάρδια θέλει Από και Ως, διαφορετικές ώρες');
  return r;
}
/** Posts of a service without a code (new ones, or a deleted code): the next free one (Υ1, Υ2…). */
export function fillCodes(settings: Settings, phase: Phase, id: string): Settings {
  let st = settings;
  for (;;) {
    const list = blocksOf(st, phase);
    const i = list.findIndex((x) => x.id === id);
    const b = list[i];
    const j = b ? b.posts.findIndex((p) => !p.code) : -1;
    if (j < 0) return st;
    const posts = b.posts.map((p, q) => (q === j ? { ...p, code: freeCode(st, b.kind, j + 1) } : p));
    st = withBlocks(
      st,
      phase,
      list.map((x, q) => (q === i ? { ...b, posts } : x)),
    );
  }
}
