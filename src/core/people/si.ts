// Σ.Ι. (physical fitness): base value, sub-kind and condition category, and whether the person goes into a duty.
//
// Purpose: parse an Excel/form Σ.Ι. into base (Ι1-Ι4, plus the user's additions), for Ι3 the sub-kind «ΜΕ ΟΠΛΟ» /
//   «ΧΩΡΙΣ ΟΠΛΟ», and for Ι3/Ι4 a condition category (ΟΡΘΟΠΑΙΔΙΚΟ, ΠΑΘΟΛΟΓΙΚΟ…, as the sections of the Γενικός Πίνακας
//   Νοσημάτων of π.δ. 11/2014). For each Σ.Ι. the user sets, per duty, whether it goes in (Ρυθμίσεις › Σ.Ι.).
// Does NOT: store anything (only the user's changes live in lists.si) or place people on duties (core/duty does).
// Owner layer: core/people (no fs, no Electron, no React).
// Why: default rule kept as before: an unarmed Σ.Ι. (contains «ΑΟΠΛ»/«ΧΩΡΙΣ ΟΠΛ» or starts with «Ι4», see ranks.ts
//   siUnarmed) does not go into an armed duty; everyone else goes everywhere.
// @decision Michael 13/10: base Σ.Ι. with sub-kind and condition category.
// @decision Michael 17/10: the name is «ΧΩΡΙΣ ΟΠΛΟ», not «ΑΟΠΛΟ»; only Ι3 ΧΩΡΙΣ ΟΠΛΟ and Ι4 are unarmed, and Ι4 is
//   always unarmed.
// Covering tests: test/si.test.ts, test/layout-fit.test.ts.
import { normGreek } from '../lib/text';
import type { BlockDef } from '../model/duty';
import { siUnarmed } from './ranks';
import type { UserLists, SiConfig } from '../model/lists';
export type { SiConfig } from '../model/lists';

/** Base Σ.Ι. values; the user can add more (SiConfig.add). */
export const SI_BASES = ['Ι1', 'Ι2', 'Ι3', 'Ι4'];
/** Sub-kinds of a base Σ.Ι.: only Ι3 has «ΜΕ ΟΠΛΟ» and «ΧΩΡΙΣ ΟΠΛΟ». */
export const SI_SUBS: Record<string, string[]> = { Ι3: ['ΜΕ ΟΠΛΟ', 'ΧΩΡΙΣ ΟΠΛΟ'] };
/** Base Σ.Ι. that take a condition category. */
export const SI_CAT_BASES = ['Ι3', 'Ι4'];
/** Base condition categories of Ι3 and Ι4. */
export const SI_CATS = [
  'ΠΑΘΟΛΟΓΙΚΟ',
  'ΟΡΘΟΠΑΙΔΙΚΟ',
  'ΧΕΙΡΟΥΡΓΙΚΟ',
  'ΚΑΡΔΙΟΛΟΓΙΚΟ',
  'ΠΝΕΥΜΟΝΟΛΟΓΙΚΟ',
  'ΝΕΥΡΟΛΟΓΙΚΟ',
  'ΨΥΧΙΑΤΡΙΚΟ',
  'ΟΦΘΑΛΜΟΛΟΓΙΚΟ',
  'ΩΡΛ',
  'ΔΕΡΜΑΤΟΛΟΓΙΚΟ',
  'ΟΥΡΟΛΟΓΙΚΟ',
  'ΑΛΛΕΡΓΙΟΛΟΓΙΚΟ',
  'ΑΙΜΑΤΟΛΟΓΙΚΟ',
  'ΕΝΔΟΚΡΙΝΟΛΟΓΙΚΟ',
];
// Other spellings found in the Δυναμολόγιο: «ΑΟΠΛΟ», «ΑΟΠΛΟΣ», «ΕΝΟΠΛΟΣ» (without spaces and dots).
const SYN: [RegExp, string][] = [
  [/^(ΑΟΠΛ|ΧΩΡΙΣΟΠΛ)/, 'ΧΩΡΙΣ ΟΠΛΟ'],
  [/^(ΜΕΟΠΛ|ΕΝΟΠΛ)/, 'ΜΕ ΟΠΛΟ'],
];
// Without spaces, dots and slashes: «Ι/3», «Ι 3» and «I3» (Latin) are the same.
const key = (v: string) => normGreek(v).replace(/[^Α-ΩA-Z0-9]/g, '');
/** Normalised display form of a Σ.Ι. text: no accents, capitals, single spaces. */
export const siName = (v: string) => normGreek(v).replace(/\s+/g, ' ').trim();
/** Table row label of a base and its sub-kind, e.g. «Ι3 ΧΩΡΙΣ ΟΠΛΟ». */
export const siLabel = (base: string, sub: string) => base + (sub ? ' ' + sub : '');
/** Key of a table row in lists.si.cells: the label, plus the category when there is one. */
export const siRowKey = (label: string, cat?: string) => (cat ? label + ' · ' + cat : label);

/** The base Σ.Ι. values: the built-in ones, then the user's additions without duplicates. */
export const siBases = (cfg?: SiConfig): string[] => {
  const out = [...SI_BASES];
  const have = new Set(out.map(key));
  for (const b of cfg?.add || []) {
    const k = key(b);
    if (k && !have.has(k)) {
      have.add(k);
      out.push(siName(b));
    }
  }
  return out;
};
/** Sub-kinds of a base (empty for all but Ι3). */
export const siSubs = (base: string): string[] => SI_SUBS[base] || [];
/** Condition categories: the base ones not hidden, plus the user's own (all: also the hidden ones). */
export function siCats(cfg?: SiConfig, all = false): string[] {
  const hide = new Set((cfg?.cats?.hide || []).map(key));
  const have = new Set(SI_CATS.map(key));
  const out = SI_CATS.filter((c) => all || !hide.has(key(c)));
  for (const c of cfg?.cats?.add || []) {
    const k = key(c);
    if (k && !have.has(k)) {
      have.add(k);
      if (all || !hide.has(k)) out.push(siName(c));
    }
  }
  return out;
}

/**
 * Excel or form value → base and sub-kind. ok = false: the sub-kind is not known for this base (e.g. «Ι2 ΑΟΠΛΟ»), so
 * the old rule applies. null: not even the base is recognised.
 */
export interface SiParts {
  base: string;
  sub: string;
  ok: boolean;
}
/**
 * Parses an Excel or form Σ.Ι. text into a base and sub-kind (see SiParts); null when the base is not recognised.
 */
export function parseSi(raw: string | undefined, cfg?: SiConfig): SiParts | null {
  const k = key(raw || '');
  if (!k) return null;
  const bases = siBases(cfg).sort((a, b) => key(b).length - key(a).length);
  let base = bases.find((b) => k.startsWith(key(b)));
  if (!base) {
    const m = /^Ι(\d)/.exec(k);
    if (!m) return null;
    base = 'Ι' + m[1];
  }
  const rest = k.slice(key(base).length);
  if (!rest) return { base, sub: '', ok: true };
  const syn = SYN.find(([re]) => re.test(rest))?.[1];
  // Ι4 is always unarmed: «Ι4 ΧΩΡΙΣ ΟΠΛΟ» (and «Ι4 ΜΕ ΟΠΛΟ», which always counted as unarmed) is just Ι4
  if (base === 'Ι4' && syn) return { base, sub: '', ok: true };
  const sub =
    siSubs(base).find((s) => rest.startsWith(key(s))) || (syn && siSubs(base).includes(syn) ? syn : undefined);
  return sub ? { base, sub, ok: true } : { base, sub: '', ok: false };
}

/** The Σ.Ι. of the table and of the Excel dropdown: each base followed by its sub-kinds (ΜΕ ΟΠΛΟ/ΧΩΡΙΣ ΟΠΛΟ). */
export const siCombos = (cfg?: SiConfig): string[] =>
  siBases(cfg).flatMap((b) => [b, ...siSubs(b).map((s) => siLabel(b, s))]);

/** A person's Σ.Ι.: table row and condition category. known = false: the old rule applies. */
export interface SiOf {
  label: string;
  cat: string;
  known: boolean;
  text: string;
}
// Asked for every candidate on every seat of the auto-fill: cached per Λίστες settings, Σ.Ι. and category.
const ofIdx = new WeakMap<object, Map<string, SiOf>>();
const NO_LISTS = {};
/**
 * Short form for narrow columns: «Ι3 ΧΩΡΙΣ ΟΠΛΟ» → «Ι3 άοπλος», «Ι3 ΜΕ ΟΠΛΟ» → «Ι3 ένοπλος» (the full text goes in
 * the tooltip).
 */
export const siShort = (text: string) =>
  text.replace(/ ΧΩΡΙΣ ΟΠΛΟ(?=$|\s)/, ' άοπλος').replace(/ ΜΕ ΟΠΛΟ(?=$|\s)/, ' ένοπλος');
/** The person's Σ.Ι. as table row and category; cached per Λίστες, Σ.Ι. and category. */
export function siOf(p: { si?: string; siCat?: string }, lists?: UserLists): SiOf {
  let m = ofIdx.get(lists || NO_LISTS);
  if (!m) {
    m = new Map();
    ofIdx.set(lists || NO_LISTS, m);
  }
  const k = (p.si || '') + '\u0001' + (p.siCat || '');
  let r = m.get(k);
  if (!r) {
    r = siOfRaw(p, lists);
    m.set(k, r);
  }
  return r;
}
function siOfRaw(p: { si?: string; siCat?: string }, lists?: UserLists): SiOf {
  const x = parseSi(p.si, lists?.si);
  if (!x || !x.ok) return { label: p.si || '', cat: '', known: false, text: p.si || '' };
  const label = siLabel(x.base, x.sub);
  const cat = SI_CAT_BASES.includes(x.base) && p.siCat ? siName(p.siCat) : '';
  return { label, cat, known: true, text: label + (cat ? ' ' + cat : '') };
}
type Blk = Pick<BlockDef, 'id' | 'armed'>;
/**
 * Does this Σ.Ι. go into this duty? First the condition category (if the user changed it), then the Σ.Ι., then the
 * default (unarmed as before: ΑΟΠΛ or Ι4, plus what the user put in the «Σ.Ι. άοπλων» list; not into an armed duty).
 */
export function siCellOf(
  lists: UserLists | undefined,
  label: string,
  cat: string,
  b: Blk,
): { ok: boolean; from: 'cat' | 'row' | 'def' } {
  const c = lists?.si?.cells;
  const vc = cat ? c?.[siRowKey(label, cat)]?.[b.id] : undefined;
  if (vc != null) return { ok: vc, from: 'cat' };
  const vr = c?.[label]?.[b.id];
  if (vr != null) return { ok: vr, from: 'row' };
  return { ok: !(b.armed && siUnarmed(label, lists)), from: 'def' };
}
/** True when the person's Σ.Ι. lets them into the duty `b`. */
export function siAllows(p: { si?: string; siCat?: string }, b: Blk, lists?: UserLists): boolean {
  const s = siOf(p, lists);
  if (!s.known) return !(b.armed && siUnarmed(p.si, lists));
  return siCellOf(lists, s.label, s.cat, b).ok;
}
/**
 * Unarmed because of Σ.Ι. (for «Αυστηρά Άοπλοι»): goes into no armed duty of the form. A form without armed duties
 * (ΣΒΕΝ): as before, from the Σ.Ι.
 */
export function siIsUnarmed(p: { si?: string; siCat?: string }, blocks: Blk[], lists?: UserLists): boolean {
  const armed = blocks.filter((b) => b.armed);
  if (!armed.length) {
    const s = siOf(p, lists);
    return siUnarmed(s.known ? s.label : p.si, lists);
  }
  return armed.every((b) => !siAllows(p, b, lists));
}
