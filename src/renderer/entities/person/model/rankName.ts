// «Rank (specialty) name» text for the screens: «ΣΤΡ (ΠΖ) ΠΑΠΑΔΟΠΟΥΛΟΣ Γ.» (@decision Michael 4/11).
// Purpose: the rank-names switch (`setRankNamesOn`/`rkOn`) and the plain-text helpers `rkPrefix`, `rkText`, `rkShort`,
//   `rkFull`, `rkPlain` used by toasts, aria-labels, data-tip texts, descriptions and list options.
// Does NOT: change the Excel files or the print-outs (src/shared and sheets.ts never read this switch).
// Owner layer: renderer/entities/person. Why: one module instance holds the switch, so every text function sees it.
// Covering test: test/ux-names.test.ts (names with the switch on and off).
// The prefix equals the `rankName` of froura.ts; the name comes from `fullName`/`shortName`/`plainName` (father's
// name is added for namesakes).
import { fullName, plainName, shortName, type Person } from '../../../../shared/domain';
import { rankTxt } from '../../../../shared/ranks';

// The PC's setting (prefs.rankNames); App sets it on every render, so the text functions work outside components too.
let on = true;
/** Turns the rank prefix on or off for the whole renderer. */
export const setRankNamesOn = (v: boolean) => {
  on = v;
};

/** Whether the rank prefix is on. */
export const rkOn = () => on;
/**
 * «ΒΑΘΜΟΣ (ΕΙΔΙΚΟΤΗΤΑ)», or `''` when the switch is off.
 * @param keep - for places that already printed the rank: with the switch off the rank stays as before
 */
export function rkPrefix(p: Person, keep = false): string {
  return on ? [rankTxt(p), p.spec ? '(' + p.spec + ')' : ''].filter(Boolean).join(' ') : keep ? rankTxt(p) : '';
}
/** Plain text «PREFIX NAME» (toasts, aria-label, data-tip, descriptions, list options). */
export function rkText(p: Person, nameFn: (p: Person) => string = shortName, keep = false): string {
  const pre = rkPrefix(p, keep);
  return pre ? pre + ' ' + nameFn(p) : nameFn(p);
}
export const rkShort = (p: Person) => rkText(p, shortName);
export const rkFull = (p: Person) => rkText(p, fullName);
export const rkPlain = (p: Person) => rkText(p, plainName);
