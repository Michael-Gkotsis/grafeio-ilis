// Pure rules of the «Ποιος κάνει τι» tab: the filters, the symbol and tip of a cell, the day hint, the search.
// Purpose: `FILTERS`, `DAY2`, `colTip`, `cellView`, `dayHint`, `matchesQuery`, `kindsOf`, `ownOf` for `useWhoDoes` and
//   its test.
// Does NOT: render anything, read the store or send a command (model/useWhoDoes.ts does).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/whodoes.ts (Phase 6) so it is testable without a
//   render. «Ποιος κάνει τι» (Michael, 18/10): one row per soldier, one column per duty, and the weekdays.
// Covering test: test/guard-page-view.test.ts, test/screens-main.test.ts.
import { dm, DOW, type ISODate } from '../../../../shared/dates';
import { phaseList, phaseName, type BlockDef, type Person, type Settings } from '../../../../shared/domain';
import { live as liveSts, statusLbl } from '../../../../shared/ranks';
import { statusesOn, type CapCell, type CapCol } from '../../../../shared/rules';
import { statIsUnarmed, statNoDuty } from '../../../../shared/stat';
import { norm, normGreek, translit } from '../../../../shared/text';
import type { AppState } from '../../../../shared/domain';

/** The reason text of a cell the sergeant set by hand. */
export const SERGEANT = 'Από τον λοχία';

/** The filter chips. */
export type Filt = 'all' | 'limited' | 'manual' | 'auto';

/** Key, label and tip of each filter chip. */
export const FILTERS: [Filt, string, string][] = [
  ['all', 'Όλοι', 'Όλοι σε δύναμη'],
  ['limited', 'Με περιορισμό', 'Δεν κάνουν κάποια υπηρεσία ή κάποια μέρα, από οπουδήποτε'],
  ['manual', 'Από τον λοχία', 'Όσα όρισες εσύ (✕ και μέρες), όχι Σ.Ι. ή πόστο'],
  ['auto', 'Από Σ.Ι. ή πόστο', 'Όσοι δεν κάνουν κάτι λόγω Σ.Ι. ή πόστου (—), ή το κάνουν παρ’ όλα αυτά (✓!)'],
];

/** Monday first, two letters (Δε, Τρ, Τε…). */
export const DAY2 = (d: number) => DOW[d].slice(0, 2);

/** The tip of a column header: the label, which forms it is on, armed, own service. */
export const colTip = (c: CapCol, st: Settings) =>
  c.label +
  ' · ' +
  (c.phases.length === phaseList(st).length
    ? c.phases.length === 2
      ? 'ΣΒΕΝ και ΣΠΕΝ'
      : 'όλα τα έντυπα'
    : (c.phases.length === 1 ? 'μόνο ' : '') + c.phases.map((ph) => phaseName(st, ph)).join(', ')) +
  (c.armed ? ' · ένοπλη' : '') +
  (c.block ? ' · δική σου υπηρεσία' : '');

const untilTxt = (s: { open?: boolean; to: string }, date: ISODate) =>
  s.open ? ' χωρίς λήξη' : s.to === date ? '' : ' έως ' + dm(s.to);

/**
 * A cell: ✓ does it · ✕ does not (sergeant) · — not, from Σ.Ι./post · ✓! does it despite the Σ.Ι./post.
 * @returns the symbol, the CSS class and the tip
 */
export function cellView(c: CapCell, col: CapCol): { sym: string; cls: string; tip: string } {
  const what = col.label.toLowerCase();
  if (c.src === 'force')
    return {
      sym: '✓!',
      cls: 'is-force',
      tip: 'Κάνει ' + what + ' παρά το «' + c.why + '». Πάτα: πίσω σε ό,τι λέει η Σ.Ι./το πόστο',
    };
  if (c.on) return { sym: '✓', cls: 'is-on', tip: 'Κάνει ' + what + '. Πάτα: δεν κάνει' };
  if (c.src === 'auto')
    return {
      sym: '—',
      cls: 'is-auto',
      tip: 'Δεν κάνει ' + what + ' (' + c.why + '). Πάτα για να κάνει παρ’ όλα αυτά',
    };
  return {
    sym: '✕',
    cls: 'is-off',
    tip: 'Δεν κάνει ' + what + (c.why !== SERGEANT ? ' (' + c.why + ')' : '') + '. Πάτα: κάνει',
  };
}

/** The day status that keeps somebody out of the duties on the day on screen; information only. */
export interface DayHint {
  txt: string;
  tip: string;
  bad: boolean;
}

/**
 * The status of the day shown on the Υπηρεσίες screen: no duty at all, or only unarmed ones.
 * @param blocks the visible service blocks
 * @param when «Σήμερα» / «Αύριο» / the day name
 */
export function dayHint(state: AppState, p: Person, date: ISODate, when: string, blocks: BlockDef[]): DayHint | null {
  const lists = state.settings.lists;
  const ss = statusesOn(liveSts(state), p.id, date);
  const a = ss.find((x) => statNoDuty(x, blocks, lists));
  if (a)
    return {
      txt: when + ': ' + statusLbl(a, lists) + untilTxt(a, date),
      tip: 'Δεν μπαίνει σε καμία υπηρεσία λόγω κατάστασης· ξαναμπαίνει μόνος του όταν λήξει',
      bad: true,
    };
  const b = ss.find((x) =>
    statIsUnarmed(
      x,
      blocks.filter((y) => y.kind !== 'ly'),
      lists,
    ),
  );
  if (b)
    return {
      txt: when + ': μόνο άοπλες (' + statusLbl(b, lists) + untilTxt(b, date) + ')',
      tip: 'Λόγω κατάστασης, μέχρι να λήξει',
      bad: false,
    };
  return null;
}

/** Search: every word is in name, ASM, room, Σ.Ι. or post (accents ignored), or the Latin spelling matches. */
export function matchesQuery(p: Person, dq: string): boolean {
  const n = normGreek(dq.trim());
  if (!n) return true;
  const key = normGreek(
    [p.last, p.first, p.father, p.asm, p.room != null ? 'Θ' + p.room : '', p.si, p.post].filter(Boolean).join(' '),
  );
  return n.split(/\s+/).every((t) => key.includes(t)) || translit(p.last + ' ' + p.first).includes(norm(dq.trim()));
}

/** The sergeant set something by hand for this person (a ✕, a ✓! or days off). */
export const ownOf = (caps: AppState['caps'], p: Person) =>
  Object.keys(caps[p.id] || {}).length > 0 || !!p.offDays?.length;

/** Which filter chips a person belongs to. */
export function kindsOf(cs: CapCell[], p: Person, own: boolean): Record<Exclude<Filt, 'all'>, boolean> {
  return {
    limited: cs.some((c) => !c.on) || !!p.offDays?.length,
    manual: own,
    auto: cs.some((c) => (c.src === 'auto' && !c.on) || c.src === 'force'),
  };
}
