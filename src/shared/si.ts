// Σ.Ι. (σωματική ικανότητα), Michael 13/10: βασική κατηγορία (Ι1–Ι4 και όσες προσθέσεις) και, για Ι3 και Ι4,
// κατηγορία «ΜΕ ΟΠΛΟ» ή «ΑΟΠΛΟ». Για κάθε συνδυασμό ορίζεις ποιες υπηρεσίες κάνει (Ρυθμίσεις › Σ.Ι.).
// Στις ρυθμίσεις μένουν μόνο οι αλλαγές σου (στις Λίστες, lists.si): χωρίς αλλαγές ισχύει ό,τι και πριν
// (άοπλος = περιέχει «ΑΟΠΛ» ή αρχίζει από «Ι4», ranks.ts siUnarmed: όχι οπλοφύλακας, όχι σκοπιά).
import { normGreek } from './text';
import type { DutyKind } from './domain';
import { siUnarmed, type UserLists } from './ranks';

// add: δικές σου βασικές (π.χ. Ι5) · subs: δικές σου κατηγορίες ανά βασική · deny: ανά συνδυασμό, ποιες υπηρεσίες ΔΕΝ κάνει
export interface SiConfig { add?: string[]; subs?: Record<string, string[]>; deny?: Record<string, DutyKind[]> }
export const SI_BASES = ['Ι1', 'Ι2', 'Ι3', 'Ι4'];
export const SI_SUBS: Record<string, string[]> = { 'Ι3': ['ΜΕ ΟΠΛΟ', 'ΑΟΠΛΟ'], 'Ι4': ['ΜΕ ΟΠΛΟ', 'ΑΟΠΛΟ'] };
// ό,τι γράφεται αλλιώς στο Δυναμολόγιο: «ΑΟΠΛΟΣ», «ΧΩΡΙΣ ΟΠΛΟ», «ΕΝΟΠΛΟΣ» (χωρίς κενά και σημεία)
const SYN: [RegExp, string][] = [[/^(ΑΟΠΛ|ΧΩΡΙΣΟΠΛ)/, 'ΑΟΠΛΟ'], [/^(ΜΕΟΠΛ|ΕΝΟΠΛ)/, 'ΜΕ ΟΠΛΟ']];
// χωρίς κενά, τελείες, κάθετους: «Ι/3», «Ι 3», «I3» (λατινικό) είναι το ίδιο
const key = (v: string) => normGreek(v).replace(/[^Α-ΩA-Z0-9]/g, '');
export const siName = (v: string) => normGreek(v).replace(/\s+/g, ' ').trim();
export const siLabel = (base: string, sub: string) => base + (sub ? ' ' + sub : '');

export const siBases = (cfg?: SiConfig): string[] => {
  const out = [...SI_BASES]; const have = new Set(out.map(key));
  for (const b of cfg?.add || []) { const k = key(b); if (k && !have.has(k)) { have.add(k); out.push(siName(b)); } }
  return out;
};
export const siSubs = (base: string, cfg?: SiConfig): string[] => {
  const out = [...(SI_SUBS[base] || [])]; const have = new Set(out.map(key));
  for (const s of cfg?.subs?.[base] || []) { const k = key(s); if (k && !have.has(k)) { have.add(k); out.push(siName(s)); } }
  return out;
};

// Τιμή του Excel ή της φόρμας → βασική και κατηγορία. ok = false: η κατηγορία δεν είναι γνωστή για αυτή τη βασική
// (π.χ. «Ι2 ΑΟΠΛΟ» ή «Ι3 ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ» πριν την προσθέσεις). null: δεν αναγνωρίζεται καν η βασική.
export interface SiParts { base: string; sub: string; ok: boolean }
export function parseSi(raw: string | undefined, cfg?: SiConfig): SiParts | null {
  const k = key(raw || ''); if (!k) return null;
  const bases = siBases(cfg).sort((a, b) => key(b).length - key(a).length);
  let base = bases.find(b => k.startsWith(key(b)));
  if (!base) { const m = /^Ι(\d)/.exec(k); if (!m) return null; base = 'Ι' + m[1]; }
  const rest = k.slice(key(base).length);
  if (!rest) return { base, sub: '', ok: true };
  const subs = siSubs(base, cfg);
  const own = subs.filter(s => rest.startsWith(key(s))).sort((a, b) => key(b).length - key(a).length)[0];
  if (own) return { base, sub: own, ok: true };
  const syn = SYN.find(([re]) => re.test(rest))?.[1];
  if (syn && subs.includes(syn)) return { base, sub: syn, ok: true };
  return { base, sub: '', ok: false };
}

// Όλοι οι συνδυασμοί για τον πίνακα και τα dropdown: κάθε βασική και από κάτω οι κατηγορίες της
export const siCombos = (cfg?: SiConfig): string[] => siBases(cfg).flatMap(b => [b, ...siSubs(b, cfg).map(s => siLabel(b, s))]);

// Προεπιλογή ενός συνδυασμού, όπως πριν από τον πίνακα. Εξαίρεση: «Ι4 ΜΕ ΟΠΛΟ» κάνει ό,τι και το «Ι3 ΜΕ ΟΠΛΟ»
// (πριν μετρούσε άοπλος, γιατί άοπλος ήταν κάθε Ι4).
const UNARMED: DutyKind[] = ['op', 'sk'];
export function siDefaultDeny(label: string, lists?: UserLists): DutyKind[] {
  if (label === 'Ι4 ΜΕ ΟΠΛΟ') return [];
  return siUnarmed(label, lists) ? [...UNARMED] : [];
}
export const siCustom = (label: string, lists?: UserLists): boolean => !!lists?.si?.deny && Object.prototype.hasOwnProperty.call(lists.si.deny, label);
export const siDenyOf = (label: string, lists?: UserLists): DutyKind[] => (siCustom(label, lists) ? lists!.si!.deny![label] : siDefaultDeny(label, lists));

// Τι δεν κάνει κάποιος λόγω Σ.Ι.: από τον πίνακα, αν η Σ.Ι. αναγνωρίζεται· αλλιώς όπως πριν (ΑΟΠΛ ή Ι4 → άοπλος)
// Ρωτιέται για κάθε υποψήφιο σε κάθε θέση της αυτόματης συμπλήρωσης: κρατιέται ανά ρυθμίσεις Λιστών και τιμή Σ.Ι.
const denyIdx = new WeakMap<object, Map<string, DutyKind[]>>();
const NO_LISTS = {};
export function siDeny(si: string | undefined, lists?: UserLists): DutyKind[] {
  let m = denyIdx.get(lists || NO_LISTS); if (!m) { m = new Map(); denyIdx.set(lists || NO_LISTS, m); }
  const v = si || ''; let d = m.get(v);
  if (!d) {
    const p = parseSi(v, lists?.si);
    d = p && p.ok ? siDenyOf(siLabel(p.base, p.sub), lists) : siUnarmed(v, lists) ? [...UNARMED] : [];
    m.set(v, d);
  }
  return d;
}
// Άοπλος λόγω Σ.Ι. (για τα «Αυστηρά Άοπλοι»): δεν κάνει ούτε οπλοφύλακα ούτε σκοπιά
export const siIsUnarmed = (si: string | undefined, lists?: UserLists): boolean => { const d = siDeny(si, lists); return UNARMED.every(k => d.includes(k)); };
