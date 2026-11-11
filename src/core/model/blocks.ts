// Duty blocks as numbers and groups, resizing a block, and building the resolved posts of a form.
//
// Purpose: `groupKey`/`shiftGroups`/`blockShape`/`blockGroups` (which posts share a number), `reshapeBlock` (new count
//   of numbers and people, keeping the post keys stable) and `buildPosts` (hours of every post from the blocks).
// Does NOT: read Settings (settingsAccess.ts picks the blocks of a form) or place people in posts (core/duty).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: post keys are stored in the history; resizing may hide posts but never delete or rename them.
// @decision Michael 4/11: the shape of a duty = how many numbers and how many people per number.
// Covering tests: test/shifts.test.ts, test/own-phases.test.ts, test/no-block.test.ts.
import { DEFAULT_DUTY_START, ROT, hasShift, shiftSlots, toMin } from './shifts';
import type { BlockDef, Post, PostDef } from './duty';

/**
 * Key of the number a post belongs to: posts with the same rot (a pair of sentries) or grp (a pair in the user's own
 * duty) are one number; the others one each.
 */
export const groupKey = (p: PostDef) => (p.rot != null ? 'r' + p.rot : p.grp != null ? 'g' + p.grp : p.k);
export const shiftGroups = (b: BlockDef) => {
  const keys: string[] = [];
  for (const p of b.posts) {
    if (p.hidden) continue;
    const k = groupKey(p);
    if (!keys.includes(k)) keys.push(k);
  }
  return keys;
};
/** Shape of a duty (Michael, 4/11): how many numbers and how many people in each number, from the visible posts. */
export function blockShape(b: BlockDef): { nums: number; per: number } {
  const g = new Map<string, number>();
  for (const p of b.posts) if (!p.hidden) g.set(groupKey(p), (g.get(groupKey(p)) || 0) + 1);
  return g.size ? { nums: g.size, per: Math.max(...g.values()) } : { nums: 1, per: 1 };
}
// Limits for editing a duty (Michael, 11/11: more than 10 people); letters α–κ for the people of one number.
export const MAX_NUMS = 30,
  MAX_PER = 10;
/** The posts per number, in order, hidden ones included (for resizing and for hours per number). */
export function blockGroups(posts: PostDef[]): PostDef[][] {
  const groups: PostDef[][] = [];
  const at = new Map<string, number>();
  for (const p of posts) {
    const k = groupKey(p);
    let i = at.get(k);
    if (i == null) {
      i = groups.length;
      at.set(k, i);
      groups.push([]);
    }
    groups[i].push(p);
  }
  return groups;
}
const GR = [...'αβγδεζηθικ'],
  LAT = [...'abcdefghij'];
/**
 * The posts of a duty with a new count of numbers and people per number (Michael, 4/11). Keys stay stable so the
 * history
 * stays: person α keeps the old key, β, γ… get «<key of α>_2», «_3»; a new number in a duty of the form gets
 * «<duty id>_<N>» (sentries: «sk5a», «sk5b»). Surplus posts are hidden (never deleted) and come back as the same posts.
 * used: every post key of every form (new keys are unique). name: the name of the duty after the change.
 */
export function reshapeBlock(
  b: BlockDef,
  nums: number,
  per: number,
  name: string,
  used: ReadonlySet<string> = new Set(),
): PostDef[] {
  if (b.kind === 'ly') return b.posts;
  nums = Math.min(MAX_NUMS, Math.max(1, Math.floor(nums) || 1));
  per = Math.min(MAX_PER, Math.max(1, Math.floor(per) || 1));
  const groups = blockGroups(b.posts);
  const taken = new Set(used);
  for (const p of b.posts) taken.add(p.k);
  const fresh = (k: string) => {
    while (taken.has(k)) k += '_';
    taken.add(k);
    return k;
  };
  const isRot = b.posts.some((p) => p.rot != null);
  const isSk = b.kind === 'sk' && !b.custom;
  let nextRot = Math.max(-1, ...b.posts.map((p) => (p.rot == null ? -1 : p.rot))) + 1;
  const firstNo = isSk ? +(/\d+/.exec(b.posts[0]?.short || b.posts[0]?.k || '')?.[0] || 3) : 0;
  // name and ending of the labels: as they are (Θαλαμοφύλακας 1ος (α΄)), unless the name of the form's duty changed
  const lab = /^(.*?)(?: \d+ος)?(?: [α-κ])?( \([^)]*\))?$/.exec(b.posts[0]?.label || '');
  const renamed = !b.custom && name !== b.name;
  const base = b.custom || renamed || !lab || !lab[1] ? name : lab[1];
  const suffix = b.custom || renamed || !lab ? '' : lab[2] || '';
  const one = nums === 1 && per === 1;
  const out: PostDef[] = [];
  for (let i = 0; i < Math.max(nums, groups.length); i++) {
    const g = groups[i];
    const no = firstNo + i;
    const baseKey = g ? g[0].k : fresh(isSk ? 'sk' + no + 'a' : b.id + '_' + (i + 1));
    const rot = g ? g[0].rot : isRot ? nextRot++ : undefined;
    const hrs = g ? g[0].hrs : b.posts[0]?.hrs || (isRot ? undefined : 'ημέρα');
    const list = g ? [...g] : [];
    for (let m = list.length; m < (g ? Math.max(per, 0) : per); m++) {
      const k = !g && m === 0 ? baseKey : isSk ? fresh('sk' + no + LAT[m]) : fresh(baseKey + '_' + (m + 1));
      list.push({
        k,
        label: '',
        short: '',
        ...(rot != null ? { rot } : {}),
        ...(hrs != null && rot == null ? { hrs } : {}),
        ...(isSk ? { code: 'Σ' + no + GR[m] } : {}),
      });
    }
    list.forEach((p, m) => {
      const q: PostDef = { ...p };
      if (isSk) {
        q.label = 'Σκοπός ' + no + 'ης σκοπιάς' + (per > 1 ? ' (' + GR[m] + ')' : '');
        q.short = no + 'η' + (per > 1 ? ' ' + GR[m] : '');
      } else {
        q.label = base + (one ? '' : ' ' + (i + 1) + 'ος' + (per > 1 ? ' ' + GR[m] : '')) + suffix;
        q.short = one ? base : i + 1 + 'ος' + (per > 1 ? ' ' + GR[m] : '');
      }
      if (!isRot && q.rot == null) {
        if (list.length > 1) q.grp = i;
        else delete q.grp;
        if (m > 0 && hrs != null) q.hrs = hrs;
      }
      if (i >= nums || m >= per) q.hidden = true;
      else delete q.hidden;
      out.push(q);
    });
  }
  return out;
}
/**
 * The posts of the blocks with their hours. start: HH:MM when the duty cycle starts. Without shifts the post gets the
 * default rotation slot of its rot; with own shifts a number without any shift gets slots = null (no hours).
 */
export function buildPosts(blocks: BlockDef[], start: string = DEFAULT_DUTY_START): Post[] {
  const def = start === DEFAULT_DUTY_START ? ROT : shiftSlots(start, { every: 120 }, 4);
  return blocks.flatMap((b) => {
    const sh = hasShift(b.shift) ? b.shift : null;
    const groups = sh ? shiftGroups(b) : [];
    const sl = sh ? shiftSlots(start, sh, groups.length) : null;
    return b.posts.map((p) => {
      // with own shifts, a number without any shift has no hours (null), not an empty list
      const mine = sl ? sl[groups.indexOf(groupKey(p))] : undefined;
      const slots = sl ? (sh!.list?.length && !mine?.length ? null : mine || null) : p.rot != null ? def[p.rot] : null;
      const hrs = p.hrs === '14:00 → 14:00' ? start + ' → ' + start : p.hrs; // Λ/Υ, Δ/Υ: the whole cycle
      return {
        ...p,
        ...(hrs !== p.hrs ? { hrs } : {}),
        block: b.id,
        kind: b.kind,
        armed: b.armed,
        slots,
        hours: slots ? slots.join(' · ') : hrs || '',
        cyc: toMin(start),
      };
    });
  });
}
/** «Label 14:00» for a post with slots, otherwise just the label. */
export const postTxt = (x: Post) => x.label + (x.slots ? ' ' + x.slots[0].slice(0, 5) : '');
