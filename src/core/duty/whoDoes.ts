// «Ποιος κάνει τι» (Υπηρεσίες): the columns and cells of the capability table, and the days a person does no duty.
//
// Purpose: `capCols` / `capCell` / `capDefault` / `capLabel`, `skipOn` / `skipTxt` (weekdays off and one-off
//   exceptions), `offDayBlock`, `capBlock` (why a person is blocked for a post by their capability).
// Does NOT: decide the rest, order or statuses rules (dutyCheck.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: The same data feeds the screen «Ποιος κάνει τι» and the file «Δυνατότητα υπηρεσιών» (s.caps), so the columns are
//   built once here.
// Covering tests: test/who-does.test.ts, test/duty-columns.test.ts, test/excel-caps.test.ts.
import { dm, DOW_FULL, type ISODate, weekday } from '../lib/dates';
import { allBlocks, defaultCaps, manOf } from './capability';
import { personMap } from './indexes';
import { type BlockDef, CAP_ACC, CAP_KINDS, type DutyKind, type Phase, type Post } from '../model/duty';
import type { CapKey } from '../model/dutyRules';
import type { Person, Skip } from '../model/person';
import type { Settings } from '../model/settings';
import { phaseBlocks } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import { siAllows, siOf } from '../people/si';

/**
 * A column of the «Ποιος κάνει τι» table (Υπηρεσίες): the kinds of duty of the form (θαλαμοφύλακας, οπλοφύλακας,
 * σκοπιά, μαγειρεία, ΤΑΕ) and each own duty separately (πύλη…), from all the forms together (ΣΒΕΝ, ΣΠΕΝ, the user's
 * own). Not the hidden ones, not Λ/Υ-Δ/Υ (set by hand). A new duty becomes a column by itself. The data is the same as
 * the file «Δυνατότητα υπηρεσιών» (`s.caps`).
 * @decision Michael 18/10: «Ποιος κάνει τι».
 */
export interface CapCol {
  key: CapKey;
  kind: DutyKind;
  label: string;
  short: string;
  armed: boolean;
  phases: Phase[];
  block?: BlockDef;
}

const colsIdx = new WeakMap<Settings, CapCol[]>();

const CAP_SHORT: Partial<Record<DutyKind, string>> = { th: 'Θαλαμοφ.', op: 'Οπλοφ.', other: 'Άλλες' };

/** The columns of the «Ποιος κάνει τι» table for the settings (see `CapCol`), cached per settings object. */
export function capCols(st: Settings): CapCol[] {
  let out = colsIdx.get(st);
  if (out) return out;
  const kinds = new Map<DutyKind, CapCol>();
  const own = new Map<string, CapCol>();
  for (const [ph, bs] of phaseBlocks(st))
    for (const b of bs) {
      if (b.hidden || b.kind === 'ly') continue;
      const m = b.custom ? own : kinds;
      const id = b.custom ? b.id : b.kind;
      let c = (m as Map<string, CapCol>).get(id);
      if (!c) {
        c = b.custom
          ? {
              key: ('b:' + b.id) as CapKey,
              kind: b.kind,
              label: b.name,
              short: b.name,
              armed: b.armed,
              phases: [],
              block: b,
            }
          : {
              key: b.kind,
              kind: b.kind,
              label: capLabel(b.kind),
              short: CAP_SHORT[b.kind] || capLabel(b.kind),
              armed: false,
              phases: [],
            };
        (m as Map<string, CapCol>).set(id, c);
      }
      if (!b.custom && b.armed) c.armed = true;
      if (!c.phases.includes(ph)) c.phases.push(ph);
    }
  out = [...CAP_KINDS.filter(([k]) => kinds.has(k)).map(([k]) => kinds.get(k)!), ...own.values()];
  colsIdx.set(st, out);
  return out;
}

/**
 * One cell: does or does not, and from where. `auto` = from Σ.Ι. / post (or nothing), `man` = the sergeant, `force` =
 * does it despite the Σ.Ι. / the post (`why` = what it overrides).
 */
export interface CapCell {
  on: boolean;
  src: 'auto' | 'man' | 'force';
  why: string;
}

/** The reason a person does not do a column by default (post or Σ.Ι.), or null. */
export function capDefault(s: AppState, p: Person, col: CapCol): string | null {
  if (col.block)
    return p.post
      ? 'Πόστο: ' + p.post
      : siAllows(p, col.block, s.settings.lists)
        ? null
        : 'Σ.Ι. ' + siOf(p, s.settings.lists).text;
  return (
    defaultCaps(
      p,
      s.settings.lists,
      allBlocks(s.settings).filter((b) => !b.custom),
    )[col.kind] || null
  );
}

/** The cell of a person in a column: the sergeant's setting first, then the default. */
export function capCell(s: AppState, p: Person, col: CapCol): CapCell {
  const v = manOf(s.caps[p.id] || {}, col.block?.id, col.kind, !!col.block);
  if (typeof v === 'string') return { on: false, src: 'man', why: v };
  const def = capDefault(s, p, col);
  if (def) return v === null ? { on: true, src: 'force', why: def } : { on: false, src: 'auto', why: def };
  return { on: true, src: 'auto', why: '' };
}

/** Text of a one-off exception: «Εξαίρεση dd/mm-dd/mm: reason». */
export const skipTxt = (k: Skip) =>
  'Εξαίρεση ' + dm(k.from) + (k.to > k.from ? '-' + dm(k.to) : '') + (k.why ? ': ' + k.why : '');

/** The one-off exception (from-to) of a person that covers `date`. */
export function skipOn(p: Person | undefined, date: ISODate): Skip | undefined {
  return p?.skips?.find((k) => k.from <= date && date <= k.to);
}

/**
 * Why a person does no duty on a day: a one-off exception or a weekday off. The day that counts is the day of the duty
 * (a cycle e.g. 14:00 to 14:00). The auto-fill, «Επόμενος», the rotation and the weekend «owed» rule all pass through
 * here.
 * @decision λοχίας 12/10: weekdays without duty.
 * @decision Michael 24/10: one-off exceptions from-to.
 */
export function offDayBlock(s: AppState, date: ISODate, pid: number): string | null {
  const p = personMap(s.people).get(pid);
  if (!p) return null;
  const k = skipOn(p, date);
  if (k) return skipTxt(k);
  const w = p.offDays;
  if (!w || !w.length) return null;
  const d = weekday(date);
  return w.includes(d) ? 'Δεν κάνει υπηρεσία ' + DOW_FULL[d] : null;
}

/**
 * Like the capability of the duties: the auto-fill does not put him, by hand he enters only with a reason (null = may
 * enter).
 */
export function capBlock(s: AppState, date: ISODate, pid: number, post?: Post | null): string | null {
  const off = offDayBlock(s, date, pid);
  if (off) return off;
  if (!post || post.kind === 'ly') return null; // Λ/Υ-Δ/Υ: set by hand, as before
  const b = post.block ? allBlocks(s.settings).find((x) => x.id === post.block) : undefined;
  const custom = !!b?.custom;
  const no = (why: string) => 'Δεν κάνει ' + (custom ? b!.name : CAP_ACC[post.kind] || post.kind) + ' (' + why + ')';
  // the person's «Δυνατότητα υπηρεσιών»: «does not do» with a reason, or an explicit «does» (null) that wins over the
  // post and the Σ.Ι.
  const man = manOf(s.caps[pid] || {}, post.block, post.kind, custom);
  if (man) return no(man);
  if (man === null) return null;
  const p = personMap(s.people).get(pid);
  if (!p) return null;
  if (p.post) return no('Πόστο: ' + p.post);
  // Σ.Ι.: per duty (Ρυθμίσεις › Σ.Ι.)
  return siAllows(p, { id: post.block, armed: post.armed }, s.settings.lists)
    ? null
    : no('Σ.Ι. ' + siOf(p, s.settings.lists).text);
}

/** Greek name of a duty kind. */
export const capLabel = (k: DutyKind) => CAP_KINDS.find((x) => x[0] === k)?.[1] || k;
