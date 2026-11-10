// Handlers: the duty rules and what a person may do: rules, capability, off days, skips, duty profile.
//
// Purpose: The handlers of `setRules`, `setCap`, `setOffDays`, `setSkip`, `delSkip`, `setDutyProfile`. Each one is
//   the old `case` body of `run`, unchanged.
// Does NOT: put people on posts (duties.ts).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/offdays.test.ts, test/skips.test.ts, test/duty-profile.test.ts, test/golden-outputs.test.ts,
//   test/rules.test.ts, test/duty-fuzz.test.ts.
import { DOW_FULL } from '../../lib/dates';
import { DEFAULT_NUM_ROTS, DEFAULT_STRICT_ORDER } from '../../model/dutyRules';
import { WEEK, shortName, type Person, type Skip } from '../../model/person';
import { CAP_ACC, type DutyKind } from '../../model/duty';
import type { AppState } from '../../model/state';
import { skipTxt, capCell, capCols } from '../../duty/whoDoes';
import { ARM_MAX } from '../../weapons/armed';
import type { CommandOf, Result, Ctx, SeatMap } from '../types';

/** Handler of the command `setRules`. */
export function handleSetRules(s: AppState, c: CommandOf<'setRules'>): Result {
  // armed duty margin (Michael, 24/10): minutes, from 0 to 240 (ARM_MAX)
  const rules = { ...c.rules };
  for (const k of ['armBefore', 'armAfter'] as const)
    if (rules[k] != null) {
      const n = Math.round(Number(rules[k]));
      if (!(n >= 0 && n <= ARM_MAX)) throw new Error('Το περιθώριο του όπλου είναι από 0 έως ' + ARM_MAX + ' λεπτά');
      rules[k] = n;
    }
  // which numbers have «again the same number» (Michael, 1/11): integers 0..3, unique, in order; [2, 3] (as always) is
  // not saved
  if (rules.numRots != null) {
    const v = [...new Set(rules.numRots)].sort((a, b) => a - b);
    if (!v.length || !v.every((n) => Number.isInteger(n) && n >= 0 && n <= 3))
      throw new Error('Τα νούμερα είναι από 1ο έως 4ο');
    if (v.join() === DEFAULT_NUM_ROTS.join()) delete rules.numRots;
    else rules.numRots = v;
  }
  // the order of «Αυστηρά Άοπλοι»: at least one key, no duplicates; the default is not saved (keys of deleted services
  // are ignored by the logic)
  if (rules.strictOrder != null) {
    const v = [...new Set(rules.strictOrder)];
    if (!v.length || !v.every((k) => typeof k === 'string' && k))
      throw new Error('Η σειρά των Αυστηρά Άοπλοι θέλει τουλάχιστον μία υπηρεσία');
    if (v.join() === DEFAULT_STRICT_ORDER.join()) delete rules.strictOrder;
    else rules.strictOrder = v;
  }
  if (rules.newAvg != null) {
    if (rules.newAvg) rules.newAvg = true;
    else delete rules.newAvg;
  }
  return { state: { ...s, rules }, text: 'Άλλαξαν οι κανόνες υπηρεσιών: ' + c.text, files: [] };
}
/** Handler of the command `setCap`. */
export function handleSetCap(s: AppState, c: CommandOf<'setCap'>, _ctx: Ctx, pm: SeatMap): Result {
  const p = pm.get(c.pid);
  if (!p) throw new Error('Δεν βρέθηκε το άτομο');
  const cur = { ...(s.caps[c.pid] || {}) };
  if (c.v === 'clear') delete cur[c.key];
  else cur[c.key] = c.v === 'on' ? null : 'Από τον λοχία';
  const caps = { ...s.caps };
  if (Object.keys(cur).length) caps[c.pid] = cur;
  else delete caps[c.pid];
  const col = capCols(s.settings).find((x) => x.key === c.key);
  const what = col?.block ? col.block.name : (CAP_ACC as Record<string, string>)[c.key] || c.key;
  const next = { ...s, caps };
  const after =
    c.v === 'off'
      ? ' δεν κάνει '
      : c.v === 'on' || !col || capCell(next, p, col).on
        ? ' κάνει '
        : ' δεν κάνει (' + capCell(next, p, col).why + ') ';
  return { state: next, text: 'Δυνατότητα υπηρεσιών: ' + shortName(p) + after + what, files: [] };
}
/** Handler of the command `setOffDays`. */
export function handleSetOffDays(s: AppState, c: CommandOf<'setOffDays'>, _ctx: Ctx, pm: SeatMap): Result {
  const p = pm.get(c.pid);
  if (!p) throw new Error('Δεν βρέθηκε το άτομο');
  const days = WEEK.filter((d) => c.days.includes(d));
  const next: Person = { ...p };
  if (days.length) next.offDays = days;
  else delete next.offDays;
  return {
    state: { ...s, people: s.people.map((x) => (x.id === p.id ? next : x)) },
    text:
      'Μέρες υπηρεσίας: ' +
      shortName(p) +
      (days.length ? ' όχι ' + days.map((d) => DOW_FULL[d]).join(', ') : ' όλες τις μέρες'),
    files: [],
  };
}
/** Handler of the command `setSkip`. */
export function handleSetSkip(s: AppState, c: CommandOf<'setSkip'>, ctx: Ctx, pm: SeatMap): Result {
  const p = pm.get(c.pid);
  if (!p) throw new Error('Δεν βρέθηκε το άτομο');
  if (!c.from || !c.to) throw new Error('Βάλε από ποια μέρα και έως ποια');
  if (c.to < c.from) throw new Error('Το «έως» είναι πριν από το «από»');
  const why = c.why?.trim();
  const old = c.id ? p.skips?.find((k) => k.id === c.id) : undefined;
  if (c.id && !old) throw new Error('Δεν βρέθηκε η εξαίρεση');
  const k: Skip = { id: old?.id || ctx.newId(), from: c.from, to: c.to, ...(why ? { why } : {}) };
  const skips = [...(p.skips || []).filter((x) => x.id !== k.id), k].sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0,
  );
  return {
    state: { ...s, people: s.people.map((x) => (x.id === p.id ? { ...p, skips } : x)) },
    text: (old ? 'Άλλαξε η εξαίρεση από υπηρεσίες: ' : 'Εξαίρεση από υπηρεσίες: ') + shortName(p) + ' ' + skipTxt(k),
    files: [],
  };
}
/** Handler of the command `delSkip`. */
export function handleDelSkip(s: AppState, c: CommandOf<'delSkip'>, _ctx: Ctx, pm: SeatMap): Result {
  const p = pm.get(c.pid);
  const old = p?.skips?.find((k) => k.id === c.id);
  if (!p || !old) throw new Error('Δεν βρέθηκε η εξαίρεση');
  const next: Person = { ...p, skips: p.skips!.filter((k) => k.id !== c.id) };
  if (!next.skips!.length) delete next.skips;
  return {
    state: { ...s, people: s.people.map((x) => (x.id === p.id ? next : x)) },
    text: 'Σβήστηκε η εξαίρεση από υπηρεσίες: ' + shortName(p) + ' ' + skipTxt(old),
    files: [],
  };
}
/** Handler of the command `setDutyProfile`. */
export function handleSetDutyProfile(s: AppState, c: CommandOf<'setDutyProfile'>, _ctx: Ctx, pm: SeatMap): Result {
  const p = pm.get(c.pid);
  if (!p) throw new Error('Δεν βρέθηκε το άτομο');
  const cur: Partial<Record<DutyKind, string | null>> = c.reset ? {} : { ...(s.caps[c.pid] || {}) };
  (c.on || []).forEach((k) => {
    if (cur[k]) delete cur[k];
  });
  (c.off || []).forEach((k) => {
    cur[k] = 'Από τον λοχία';
  });
  const caps = { ...s.caps };
  if (Object.keys(cur).length) caps[c.pid] = cur as any;
  else delete caps[c.pid];
  const dset = c.reset ? [] : c.days;
  let people = s.people;
  if (dset) {
    const days = WEEK.filter((d) => dset.includes(d));
    const next: Person = { ...p };
    if (days.length) next.offDays = days;
    else delete next.offDays;
    people = s.people.map((x) => (x.id === p.id ? next : x));
  }
  return {
    state: { ...s, caps, people },
    text: 'Δυνατότητα υπηρεσιών: ' + shortName(p) + ' · ' + c.text,
    files: [],
  };
}
