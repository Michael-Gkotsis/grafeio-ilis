// The filter groups of a report: which filters exist and how the groups are edited.
//
// Purpose: `REP_CONDS`, `condsOf` (also from the old fields), `condGroups` and the edits (`setCond`, `setGroupCond`,
//   `addGroup`, `removeGroup`, `condVal`), plus `passGroup` (one group for one soldier).
// Does NOT: test a filter against the state (condTest.ts) or pick the people (candidates.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model.
// Why: reports saved before the groups existed keep the `from` / `noDuty` fields, and `condsOf` is the only place
//   that turns them into filters, so old reports work as before.
// Covering tests: test/report-or-groups.test.ts, test/reports-flow.test.ts.
import type { Person } from '../model/person';
import type { RepPick, RepCond } from '../model/reportTypes';

/**
 * The soldier filters that combine, all for the day of the form: `label` is the filter, `yes` / `no` the names of its
 * two sides.
 * @decision Michael 20/10: filters can be combined, e.g. «όχι πόστα και με ιατρικά».
 */
export const REP_CONDS: { id: RepCond; label: string; yes: string; no: string }[] = [
  { id: 'present', label: 'Παρών τη μέρα', yes: 'Παρόντες', no: 'Απόντες' },
  { id: 'duty', label: 'Υπηρεσία τη μέρα ή την επόμενη', yes: 'Με υπηρεσία', no: 'Χωρίς υπηρεσία' },
  { id: 'post', label: 'Πόστο', yes: 'Με πόστο', no: 'Χωρίς πόστο' },
  { id: 'med', label: 'Ιατρικό τη μέρα', yes: 'Με ιατρικό', no: 'Χωρίς ιατρικό' },
  { id: 'pun', label: 'Ποινή τη μέρα', yes: 'Τιμωρημένοι', no: 'Χωρίς ποινή' },
  { id: 'leave', label: 'Άδεια τη μέρα', yes: 'Σε άδεια', no: 'Όχι σε άδεια' },
  { id: 'other', label: 'Εισαγωγή τη μέρα (ΣΤΕΠ, νοσοκομείο)', yes: 'Με εισαγωγή', no: 'Χωρίς εισαγωγή' },
  { id: 'dnright', label: 'Δικαίωμα ΔΝ', yes: 'Με δικαίωμα ΔΝ', no: 'Χωρίς δικαίωμα ΔΝ' },
  { id: 'weapon', label: 'Όπλο', yes: 'Με όπλο', no: 'Χωρίς όπλο' },
  { id: 'pdata', label: 'Προσωπικά στοιχεία (IBAN, ΑΜΚΑ, ΑΦΜ)', yes: 'Τα έχουν όλα', no: 'Λείπει κάποιο' },
];
const LEGACY_FROM: Partial<Record<string, RepCond>> = {
  present: 'present',
  leave: 'leave',
  pun: 'pun',
  post: 'post',
  dnright: 'dnright',
};
/**
 * The filters of a report, also from the old fields (`from`: present, leaves…, and `noDuty`), so saved reports work as
 * before.
 */
export function condsOf(pk: RepPick): { need: RepCond[]; not: RepCond[] } {
  const need = new Set(pk.need || []);
  const not = new Set(pk.not || []);
  const old = LEGACY_FROM[pk.from];
  if (old) need.add(old);
  if (pk.noDuty) not.add('duty');
  for (const c of need) not.delete(c);
  return { need: [...need], not: [...not] };
}
/**
 * Changes one filter (any: everyone, yes: only those who have it, no: without those who have it). Writes only the new
 * fields.
 */
export function setCond(pk: RepPick, c: RepCond, v: 'any' | 'yes' | 'no'): RepPick {
  const { need, not } = condsOf(pk);
  const n = need.filter((x) => x !== c);
  const o = not.filter((x) => x !== c);
  if (v === 'yes') n.push(c);
  if (v === 'no') o.push(c);
  const order = (l: RepCond[]) => REP_CONDS.map((x) => x.id).filter((x) => l.includes(x));
  return { ...pk, from: pk.from === 'inactive' ? 'inactive' : 'all', noDuty: undefined, need: order(n), not: order(o) };
}
// Filter groups: the first from need/not (and the old fields), the others from `or`; each group in `REP_CONDS` order,
// without duplicates
type CondGroup = { need: RepCond[]; not: RepCond[] };
const condOrder = (l: Iterable<RepCond>) => {
  const s = new Set(l);
  return REP_CONDS.map((x) => x.id).filter((x) => s.has(x));
};
const normGroup = (g: { need?: RepCond[]; not?: RepCond[] }): CondGroup => {
  const need = condOrder(g.need || []);
  return { need, not: condOrder((g.not || []).filter((c) => !need.includes(c))) };
};
/** The groups of filters of a report; the first is `condsOf`, the rest come from `or`. */
export function condGroups(pk: RepPick): CondGroup[] {
  return [condsOf(pk), ...(pk.or || []).map(normGroup)];
}
/** Changes one filter of group `gi` (0 is the first group, as `setCond`). */
export function setGroupCond(pk: RepPick, gi: number, c: RepCond, v: 'any' | 'yes' | 'no'): RepPick {
  if (gi <= 0 || !pk.or?.[gi - 1]) return setCond(pk, c, v);
  const g = normGroup(pk.or[gi - 1]);
  const need = g.need.filter((x) => x !== c);
  const not = g.not.filter((x) => x !== c);
  if (v === 'yes') need.push(c);
  if (v === 'no') not.push(c);
  return { ...pk, or: pk.or.map((x, i) => (i === gi - 1 ? normGroup({ need, not }) : x)) };
}
/** A new group: a copy of group `copyFrom`. */
export function addGroup(pk: RepPick, copyFrom: number): RepPick {
  const g = condGroups(pk)[copyFrom] || { need: [], not: [] };
  return { ...pk, or: [...(pk.or || []), { need: [...g.need], not: [...g.not] }] };
}
/** Deletes group `gi`; if the first one is deleted, the second takes its place. */
export function removeGroup(pk: RepPick, gi: number): RepPick {
  const or = pk.or || [];
  if (!or.length) return pk;
  if (gi > 0) {
    const left = or.filter((_, i) => i !== gi - 1);
    return { ...pk, or: left.length ? left : undefined };
  }
  const g = normGroup(or[0]);
  const rest = or.slice(1);
  return {
    ...pk,
    from: pk.from === 'inactive' ? 'inactive' : 'all',
    noDuty: undefined,
    need: g.need,
    not: g.not,
    or: rest.length ? rest : undefined,
  };
}
/** Whether a filter is set to 'yes', 'no' or 'any' in the first group. */
export const condVal = (pk: RepPick, c: RepCond): 'any' | 'yes' | 'no' => {
  const { need, not } = condsOf(pk);
  return need.includes(c) ? 'yes' : not.includes(c) ? 'no' : 'any';
};
/** Checks one group of filters for a soldier on day d (the sets are built once, only the ones needed). */
export const passGroup = (t: (c: RepCond, p: Person) => boolean, g: CondGroup, p: Person) =>
  g.need.every((c) => t(c, p)) && !g.not.some((c) => t(c, p));
