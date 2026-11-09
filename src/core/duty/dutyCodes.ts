// Duty codes of the duty-check sheet (sample 03): post codes (Θ1α, Μ2, ΛΥ…) and the bare kind letters (Θ, Μ, Σ).
//
// Purpose: reading a duty-check cell as a duty (`readDuty`, `dutyCode`, `isAbsCode`, `isBareCode`), the code a post is
//   written with (`codeOf`, `bareOf`), the mistakes in the codes for Ρυθμίσεις (`codeErrors`), new codes (`codePrefix`,
//   `freeCode`) and the exact COUNTIF letter (`exactCountif`).
// Does NOT: own the default codes or the key normal form (core/model/codes.ts) or read any Excel file.
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: a post code says exactly which post; a bare letter says only the kind (a duty without a post). Reader and
//   writer of the duty check both need the same rules. The old src/shared/codes.ts is a shim of this file.
// Covering tests: test/codes.test.ts, test/codes-followups.test.ts, test/duty-columns.test.ts, test/own-phases.test.ts.
import { normGreek } from '../lib/text';
import { KIND_CODE, KIND_NAME, type DutyKind, type Phase } from '../model/duty';
import { codeKey, defaultCode } from '../model/codes';
import { blocksOf, everyBlock, phaseBase, phaseBlocks } from '../model/settingsAccess';
import type { Settings } from '../model/settings';

/** A bare letter or word becomes a duty kind (and a post, for Λ/Υ and Δ/Υ, which are always one post). */
export function dutyCode(raw: string): { kind: DutyKind; pref?: string } | null {
  const t = normGreek(raw).replace(/[^Α-ΩA-Z]/g, '');
  if (!t) return null;
  if (/^(Θ|ΘΑΛ\w*)$/.test(t)) return { kind: 'th' };
  if (/^(Μ|ΜΑΓ\w*)$/.test(t)) return { kind: 'mg' };
  if (/^(Σ|ΣΚ|ΣΚΟΠ\w*)$/.test(t)) return { kind: 'sk' };
  if (/^(ΟΠ|Ο|ΟΠΛ\w*)$/.test(t)) return { kind: 'op' };
  if (/^(ΛΥ|Λ)$/.test(t)) return { kind: 'ly', pref: 'ly' };
  if (/^(ΔΥ|Δ)$/.test(t)) return { kind: 'ly', pref: 'dy' };
  if (/^(Τ|ΤΑΕ)$/.test(t)) return { kind: 'tae' };
  if (/^(Υ|Π|ΠΥΛΗ)$/.test(t)) return { kind: 'other' };
  return null;
}
/**
 * Absence codes of the calendar of the ones prevented (Κ.Α, ΑΝ.ΑΔ, Ε.Υ, Α/Α, ΓΡ, ΕΣΤ…): not a duty, never touched.
 */
export const isAbsCode = (raw: string) =>
  /[./]|^[-–—]+$/.test(raw.trim()) ||
  /^(ΓΡ|ΑΓ|ΕΣΤ|ΚΑ|ΑΝΑΔ|ΕΥ|ΕΑ|ΕΟ|ΕΑΡΒ|ΕΛΑΡΒ)$/.test(normGreek(raw).replace(/[^Α-ΩA-Z]/g, ''));
/** A bare kind letter, without a number or another letter (Θ, ΜΑΓ, ΣΚ…): it does not say which post. */
export const isBareCode = (raw: string) => !!dutyCode(raw) && /^[Α-ΩA-Z]+$/.test(codeKey(raw));

interface CodeIdx {
  map: Map<string, { k: string; kind: DutyKind }>;
  cur: Map<string, string>;
  other: Map<string, string>;
  kinds: Map<string, DutyKind>;
}
const idxCache = new WeakMap<Settings, CodeIdx>();
// The codes of all posts of all forms (also the removed ones): the same post can have another code on each form
function codeIdx(settings: Settings): CodeIdx {
  let x = idxCache.get(settings);
  if (x) return x;
  x = { map: new Map(), cur: new Map(), other: new Map(), kinds: new Map() };
  const cur = blocksOf(settings) || settings.blocks || [];
  const other = phaseBlocks(settings)
    .filter(([ph]) => ph !== (settings.phase || 'sven'))
    .flatMap(([, b]) => b);
  for (const [list, into] of [
    [cur, x.cur],
    [other, x.other],
  ] as const)
    for (const b of list)
      for (const p of b.posts) {
        if (!x.kinds.has(p.k)) x.kinds.set(p.k, b.kind);
        if (!p.code) continue;
        const key = codeKey(p.code);
        if (key && !x.map.has(key)) x.map.set(key, { k: p.k, kind: b.kind });
        if (!into.has(p.k)) into.set(p.k, p.code);
      }
  idxCache.set(settings, x);
  return x;
}
/** What a duty-check cell stands for: a kind, and the post when the cell had a post code. */
export type CellDuty = { k?: string; kind: DutyKind };
/**
 * A duty-check cell as a duty: first a post code, then a bare letter. 'abs' = an absence code, 'unknown' = not
 * recognised, null = empty or a number. What the user said about an unknown code while reading
 * (`settings.dutyCodeAliases`) comes before the bare letters: a post, a kind without a post, or «not a duty»
 * ('ignore').
 */
export function readDuty(raw: string, settings: Settings): CellDuty | 'abs' | 'unknown' | null {
  const t = raw.trim();
  if (!t || /^\d+$/.test(t)) return null;
  const x = codeIdx(settings);
  const hit = x.map.get(codeKey(t));
  if (hit) return { k: hit.k, kind: hit.kind };
  const al = settings.dutyCodeAliases?.[codeKey(t)];
  if (al === 'ignore') return null;
  if (al && al.startsWith('kind:') && KIND_CODE[al.slice(5) as DutyKind]) return { kind: al.slice(5) as DutyKind };
  if (al && x.kinds.has(al)) return { k: al, kind: x.kinds.get(al)! };
  const b = dutyCode(t);
  if (b) return b.pref ? { k: b.pref, kind: 'ly' } : { kind: b.kind };
  return isAbsCode(t) ? 'abs' : 'unknown';
}
/** The code written for a post: the one of the form in force, else of the other forms, else the letter of the kind. */
export function codeOf(settings: Settings, k: string, kind: DutyKind): string {
  const x = codeIdx(settings);
  return x.cur.get(k) || x.other.get(k) || bareOf(k, kind);
}
/** The bare code of a post: «ΔΥ» for the post `dy`, otherwise the letter of the kind. */
export const bareOf = (k: string | undefined, kind: DutyKind) => (k === 'dy' ? 'ΔΥ' : KIND_CODE[kind]);

/**
 * Mistakes in the codes, for Ρυθμίσεις: empty, the same on two posts, a bare kind letter, an absence code.
 * @param only only what concerns one duty (the one being edited): an old mistake in another duty does not block it, it
 *   shows as a warning in Ρυθμίσεις. The code of the form (e.g. «ΤΑΕ») stays valid even with a second duty of the kind.
 */
export function codeErrors(settings: Settings, only?: { phase: Phase; id: string }): string[] {
  const out: string[] = [];
  const seen = new Map<string, { k: string; label: string; mine: boolean }>();
  const all = phaseBlocks(settings).flatMap(([ph, bs]) => bs.map((b) => [ph, b] as const));
  const perKind = new Map<DutyKind, Set<string>>();
  for (const [, b] of all)
    for (const p of b.posts) {
      if (!perKind.has(b.kind)) perKind.set(b.kind, new Set());
      perKind.get(b.kind)!.add(p.k);
    }
  for (const [ph, b] of all) {
    const mine = !only || (only.phase === ph && only.id === b.id);
    const err = (t: string) => {
      if (mine) out.push(t);
    };
    for (const p of b.posts) {
      const code = (p.code || '').trim();
      const lbl = p.label || b.name;
      if (!code) {
        if (!p.hidden && !b.hidden) err(lbl + ': χωρίς κωδικό');
        continue;
      }
      if (isAbsCode(code)) {
        err(lbl + ': το «' + code + '» μοιάζει με κωδικό απουσίας (με τελεία ή κάθετο)');
        continue;
      }
      const bare = dutyCode(code);
      const def = defaultCode(phaseBase(settings, ph), b.id, p.k);
      if (
        isBareCode(code) &&
        bare &&
        bare.pref !== p.k &&
        !(def && codeKey(def) === codeKey(code)) &&
        !(bare.kind === b.kind && perKind.get(b.kind)!.size === 1)
      )
        err(
          lbl +
            ': το «' +
            code +
            '» είναι το σκέτο γράμμα για ' +
            KIND_NAME[bare.kind] +
            ' (βάλε και αριθμό, π.χ. ' +
            codePrefix(b.kind) +
            '2)',
        );
      const key = codeKey(code);
      const o = seen.get(key);
      if (o && o.k !== p.k) {
        if (mine || o.mine) out.push('Ο κωδικός «' + code + '» είναι και στο ' + o.label + ' και στο ' + lbl);
      } else if (!o) seen.set(key, { k: p.k, label: lbl, mine });
    }
  }
  return [...new Set(out)];
}
// «ΤΑΕ» is written in full (ΤΑΕ2) because a lone «Τ» is already written for a ΤΑΕ without a post
const PREFIX: Partial<Record<DutyKind, string>> = { tae: 'ΤΑΕ' };
/** The start of the new codes of a kind: its letter (Υ1, Μ6…); the ΤΑΕ with the whole name (ΤΑΕ2). */
export const codePrefix = (kind: DutyKind) => PREFIX[kind] || KIND_CODE[kind];
/**
 * A new code for a post of kind `kind` that no other post has (Υ1, Υ2…, ΤΑΕ2). When the bare code (e.g. «ΤΑΕ») is
 * already used, the next one is the 2nd, not the 1st.
 * @param from the first number to try
 */
export function freeCode(settings: Settings, kind: DutyKind, from = 1): string {
  const used = new Set<string>();
  for (const b of everyBlock(settings)) for (const p of b.posts) if (p.code) used.add(codeKey(p.code));
  const pre = codePrefix(kind);
  let n = used.has(codeKey(pre)) ? Math.max(from, 2) : from;
  let c = pre + n;
  while (used.has(codeKey(c))) c = pre + ++n;
  return c;
}
/**
 * The letter of a sheet COUNTIF formula that counts a bare letter (e.g. COUNTIF(M3:AO3, "Θ")), or null. With post
 * codes (Θ1α) such a formula would give 0, so on such a sheet the bare letter is written until they become "Θ*".
 */
export function exactCountif(formula: string): string | null {
  if (!/COUNTIFS?\s*\(/i.test(formula)) return null;
  for (const m of formula.replace(/&quot;/g, '"').matchAll(/"([^"]*)"/g)) {
    const v = m[1].replace(/^=/, '').trim();
    if (v && !/[*?]/.test(v) && isBareCode(v)) return v;
  }
  return null;
}
