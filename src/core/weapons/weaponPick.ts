// Weapons: picking people for a group exit (Michael, 24/10).
//
// Purpose: who can go out and why the others cannot (`canOut`, `outSplit`, `skipTxt`), the shift-click range
//   (`idRange`), the scan box (`ScanBy`, `scanFind`), «Ξανά οι ίδιοι» (`RedoGroup`, `redoGroups`) and «Από υπηρεσία»
//   (`DutyPick`, `dutyPicks`).
// Does NOT: write the exit (the command in core/commands does), or ask anything of the user.
// Owner layer: core/weapons (no fs, no Electron, no React); imports weaponInfo.ts, weaponKeys.ts and core/duty.
// Why: the screen «Έξοδος όπλων» selects many people at once, and the same rules say who is taken and who is left out
//   (no number, already out, out of force), with a message for the ones that were skipped.
// Covering tests: test/weapons.test.ts, test/weaponView.test.ts.
import type { ISODate } from '../lib/dates';
import { blocksOf } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import type { Person } from '../model/person';
import type { WeaponMove } from '../model/records';
import { postBy, postsOf } from '../duty/posts';
import { posKey, rackKey, weaponKey } from './weaponKeys';
import { isOut, type WeaponInfo } from './weaponInfo';

// ---------- Selection for a group exit (Michael, 24/10) ----------
/** The weapon can go out: in force, has a number and is not already out (a move or an armed duty). */
export const canOut = (p: Person, info: WeaponInfo) => !!p.active && !!weaponKey(p.weapon) && !isOut(info, p.id);
/** Of those chosen: who goes out and why the others do not. */
export function outSplit(ps: Person[], info: WeaponInfo) {
  const go: Person[] = [];
  const noW: Person[] = [];
  const already: Person[] = [];
  const gone: Person[] = [];
  for (const p of ps) (!p.active ? gone : !weaponKey(p.weapon) ? noW : isOut(info, p.id) ? already : go).push(p);
  return { go, noW, already, gone };
}
/** «2 χωρίς αριθμό, 1 ήδη εκτός»: for the message of those who were skipped; empty if nobody was skipped. */
export function skipTxt(x: ReturnType<typeof outSplit>) {
  const t = [
    x.noW.length && x.noW.length + ' χωρίς αριθμό',
    x.already.length && x.already.length + ' ήδη εκτός',
    x.gone.length && x.gone.length + ' εκτός δύναμης',
  ]
    .filter(Boolean)
    .join(', ');
  const n = x.noW.length + x.already.length + x.gone.length;
  return n ? n + (n === 1 ? ' παραλείφθηκε' : ' παραλείφθηκαν') + ' (' + t + ')' : '';
}
/** Shift-click: the ids between the two (both included), in the order they are shown; empty if one is not shown. */
export function idRange<T extends string | number>(ids: T[], a: T, b: T): T[] {
  const i = ids.indexOf(a),
    j = ids.indexOf(b);
  if (i < 0 || j < 0) return [];
  return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
}
/** By what the scan box found the people. */
export type ScanBy = 'asm' | 'weapon' | 'seat' | '';
/**
 * The scan box: ΑΣΜ, or weapon number, or seat («Ε 23» = «Ε23»). Among all those in force, in this order of priority.
 * The seat matches only as a whole (rack + seat); a plain «Ε» finds those who have Ε without a seat.
 */
export function scanFind(q: string, people: Person[]): { by: ScanBy; hits: Person[] } {
  const t = q.trim().toUpperCase();
  if (!t) return { by: '', hits: [] };
  const act = people.filter((p) => p.active);
  const asm = act.filter(
    (p) =>
      String(p.asm ?? '')
        .trim()
        .toUpperCase() === t,
  );
  if (asm.length) return { by: 'asm', hits: asm };
  const wk = weaponKey(q);
  const w = wk ? act.filter((p) => weaponKey(p.weapon) === wk) : [];
  if (w.length) return { by: 'weapon', hits: w };
  const sk = rackKey(q);
  const seat = sk ? act.filter((p) => rackKey(p.rack) && rackKey(p.rack) + posKey(p.wpos) === sk) : [];
  return seat.length ? { by: 'seat', hits: seat } : { by: '', hits: [] };
}
/** A group exit from the log: same reason, day and time, two or more people. */
export interface RedoGroup {
  reason: string;
  day: ISODate;
  time: string;
  pids: number[];
}
/** «Ξανά οι ίδιοι»: the last group exits of the log (same reason, day and time, 2 or more people), newest first. */
export function redoGroups(log: WeaponMove[] | undefined, n = 5): RedoGroup[] {
  const by = new Map<string, RedoGroup>();
  for (const m of log || []) {
    const k = m.reason + '|' + m.outDay + '|' + m.outTime;
    let g = by.get(k);
    if (!g) by.set(k, (g = { reason: m.reason, day: m.outDay, time: m.outTime, pids: [] }));
    if (!g.pids.includes(m.pid)) g.pids.push(m.pid);
  }
  return [...by.values()]
    .filter((g) => g.pids.length >= 2)
    .sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time))
    .slice(0, n);
}
/** The people of one block of duties of the day. */
export interface DutyPick {
  block: string;
  name: string;
  armed: boolean;
  pids: number[];
}
/** «Από υπηρεσία»: the people of each block of duties of the day (posts and duties without a post), armed first. */
export function dutyPicks(s: Pick<AppState, 'guards' | 'dutyLog' | 'settings'>, d: ISODate): DutyPick[] {
  const blocks = blocksOf(s.settings) || s.settings.blocks;
  const by = new Map<string, DutyPick>();
  const add = (block: string, armed: boolean, pid: number) => {
    let x = by.get(block);
    if (!x) by.set(block, (x = { block, name: blocks.find((b) => b.id === block)?.name || block, armed, pids: [] }));
    if (!x.pids.includes(pid)) x.pids.push(pid);
  };
  const g = s.guards?.[d] || {};
  for (const k in g) {
    const x = postBy(s as AppState, k);
    if (x && g[k] != null) add(x.block, x.armed, g[k]);
  }
  const posts = postsOf(s.settings);
  for (const e of s.dutyLog?.[d] || []) {
    const x = posts.find((y) => y.kind === e.kind);
    if (x) add(x.block, x.armed, e.pid);
  }
  return [...by.values()].sort((a, b) => Number(b.armed) - Number(a.armed));
}
