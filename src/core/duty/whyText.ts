// «Γιατί αυτός;»: one line of reasons for the person in a post.
//
// Purpose: `whyText`, `whyAll`, `fairAvg`, `reservedFor`, `typeName`.
// Does NOT: choose the person.
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: The text repeats the same numbers the order uses, so the sergeant can check a choice.
// Covering tests: test/rules-text.test.ts, test/duty-fairness.test.ts.
import { daysBetween, dm, type ISODate } from '../lib/dates';
import { allBlocks, dutyType } from './capability';
import { ruleBlock } from './dutyCheck';
import { limited, monthDuties, seatlessOn } from './dutyIndex';
import { type Fair, fairCompare, fairKey, fairMap, fairOf } from './fairness';
import { dutyAhead } from './holdBack';
import { isHol } from './holidays';
import { dutyPool, isEpop, seatMap } from './indexes';
import { dutyBlock } from './leaveHours';
import { fixedIds, isFixed, postBy, postsOf } from './posts';
import { isUnarmed, strictKeys, strictKeyTxt, strictTier } from './strictUnarmed';
import { capBlock } from './whoDoes';
import type { DutyKind, Post } from '../model/duty';
import type { AppState } from '../model/state';
import { live } from '../people/kinds';

/**
 * «Γιατί αυτός;»: the averages of holidays and duties of everybody for a day, once for all the posts of the day, not
 * once per post (research §3.1).
 */
export function fairAvg(s: AppState, date: ISODate, fair?: Map<number, Fair>): { hol: number; total: number } {
  const v = fair ? [...fair.values()] : dutyPool(s).map((p) => fairOf(s, p.id, date));
  const n = v.length || 1;
  return { hol: v.reduce((a, x) => a + x.hol, 0) / n, total: v.reduce((a, x) => a + x.total, 0) / n };
}

/** «Γιατί αυτός;» for every occupied post of a day. */
export function whyAll(s: AppState, date: ISODate): Record<string, string> {
  const g = s.guards[date] || {};
  const keys = Object.keys(g);
  if (!keys.length) return {};
  const fair = fairMap(s, dutyPool(s), date);
  const a = { ...fairAvg(s, date, fair), fair };
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = whyText(s, date, k, a);
  return out;
}

// Was he chosen by the armed reserve (`candidates`: `armedNeeded`)? Yes, if he does no armed post and somebody before
// him in the order, who could go here, is in an armed post that nobody of the ones without a post today would take.
function reservedFor(s: AppState, date: ISODate, post: Post, pid: number, fair: Map<number, Fair>): boolean {
  const g = s.guards[date] || {};
  const lists = s.settings.lists;
  const all = postsOf(s.settings).filter((y) => y.armed && y.kind !== 'ly');
  const no = (q: number, y: Post) => !!(dutyBlock(live(s), date, q, y, lists) || capBlock(s, date, q, y));
  if (!all.length || !all.every((y) => no(pid, y))) return false;
  const can = (q: number, y: Post) => !no(q, y) && !ruleBlock(s, date, q, undefined, y.k);
  const cmp = fairCompare(isHol(s.settings, date), fairKey(s, post), date);
  const me = { ...(fair.get(pid) || fairOf(s, pid, date)), pid };
  const busy = new Set(Object.values(g));
  const fixed = fixedIds(s);
  const free = dutyPool(s).filter((p) => !busy.has(p.id) && !fixed.has(p.id) && !seatlessOn(s, date, p.id));
  return all.some((y) => {
    const q = g[y.k];
    return (
      q != null &&
      !fixed.has(q) &&
      cmp({ ...(fair.get(q) || fairOf(s, q, date)), pid: q }, me) < 0 &&
      can(q, post) &&
      !free.some((f) => can(f.id, y))
    );
  });
}

const TYPE_NAME: Partial<Record<DutyKind, string>> = {
  th: 'θαλαμοφύλακας',
  op: 'οπλοφύλακας',
  sk: 'σκοπιά',
  mg: 'μαγειρεία',
  tae: 'ΤΑΕ',
  other: 'άλλη υπηρεσία',
};

const typeName = (s: AppState, post: Post) => {
  const t = dutyType(s, post.k, post.kind);
  return t.startsWith('b:')
    ? allBlocks(s.settings).find((b) => 'b:' + b.id === t)?.name || post.label
    : TYPE_NAME[post.kind] || post.kind;
};

/**
 * «Γιατί αυτός;»: one line of reasons for whoever is in a post: the numbers of the fairness order (holidays, days
 * without duty, total and the ones due), the rotation, armed / unarmed. For cadre and ΕΠΟΠ/ΟΒΑ: by hand, the number of
 * the duty of the month.
 */
export function whyText(
  s: AppState,
  date: ISODate,
  k: string,
  avgs?: { hol: number; total: number; fair?: Map<number, Fair> },
): string {
  const pid = (s.guards[date] || {})[k];
  const post = postBy(s, k);
  if (!pid || !post) return '';
  const p = seatMap(s).get(pid);
  if (p && limited(p, s.settings.lists))
    return (
      (p.cid && !isEpop(p, s.settings.lists) ? 'Στέλεχος' : 'ΕΠΟΠ/ΟΒΑ') +
      ', μόνο με το χέρι · ' +
      (monthDuties(s, date, pid) + 1) +
      'η υπηρεσία του μήνα' +
      (p.monthMax ? ' (όριο ' + p.monthMax + ')' : '')
    );
  const fair = avgs?.fair || fairMap(s, dutyPool(s), date);
  const f: Fair = fair.get(pid) || fairOf(s, pid, date);
  const av = avgs || fairAvg(s, date, fair);
  const avg = (fn: (x: { hol: number; total: number }) => number) => fn(av);
  const r1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  const parts: string[] = [];
  const nn = (x: number) => (f.avg ? r1(x) : String(x)); // a newcomer from the average (newAvg): decimal
  if (isHol(s.settings, date)) {
    parts.push(nn(f.hol) + (f.hol === 1 ? ' αργία' : ' αργίες') + ' (μ.ό. ' + r1(avg((x) => x.hol)) + ')');
    parts.push(f.lastHolBefore ? 'τελευταία αργία ' + dm(f.lastHolBefore) : 'καμία αργία ως τώρα');
  } else {
    parts.push(f.lastBefore ? daysBetween(f.lastBefore, date) - 2 + ' μέρες χωρίς υπηρεσία' : 'καμία υπηρεσία ως τώρα');
    // «18 υπηρεσίες, αναλογούν 17,4»: how many are due to him up to today (days he could serve), so that whoever was
    // absent does not stay behind
    parts.push(
      nn(f.total) +
        (f.total === 1 ? ' υπηρεσία' : ' υπηρεσίες') +
        (f.share != null ? ', αναλογούν ' + r1(f.share) : ' (μ.ό. ' + r1(avg((x) => x.total)) + ')'),
    );
  }
  if (f.avg) parts.push('νέος: από μ.ό.');
  const ah = isFixed(s, pid, k) ? null : dutyAhead(s, date, pid);
  if (ah) parts.push('έχει ήδη υπηρεσία ' + dm(ah));
  if (s.rules.rotate !== false) {
    const n = f.byType[dutyType(s, k, post.kind)] || 0;
    const nm = typeName(s, post);
    parts.push(n ? nm + ' ' + n + (n === 1 ? ' φορά' : ' φορές') + ' πριν' : 'πρώτη φορά ' + nm);
  }
  if (post.armed) parts.push('ένοπλος');
  else if (!s.rules.strictUnarmed && reservedFor(s, date, post, pid, fair))
    parts.push('προτιμήθηκε γιατί δεν κάνει ένοπλη και οι ένοπλες θέσεις δεν έφταναν');
  if (s.rules.strictUnarmed && isUnarmed(s, date, pid)) {
    const ks = strictKeys(s.rules),
      t = strictTier(post, ks);
    if (t <= ks.length)
      parts.push('Αυστηρά Άοπλοι: άοπλος, προτεραιότητα σε ' + (strictKeyTxt(s.settings, ks[t - 1]) || post.label));
  }
  return parts.join(' · ');
}
