// Κωδικοί υπηρεσιών στον έλεγχο υπηρεσιών (δείγμα 03): κωδικός θέσης (Θ1α, Μ2, ΛΥ…) ή σκέτο γράμμα είδους (Θ, Μ, Σ).
// Ο κωδικός θέσης λέει ακριβώς ποια θέση· το σκέτο γράμμα μόνο το είδος (υπηρεσία χωρίς θέση).
import { normGreek } from './text';
import { KIND_CODE, KIND_NAME, codeKey, blocksOf, type DutyKind, type Settings } from './domain';

// σκέτο γράμμα ή λέξη → είδος υπηρεσίας (και θέση, για Λ/Υ και Δ/Υ που είναι πάντα μία)
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
// κωδικοί απουσίας του ημερολογίου κωλυομένων (Κ.Α, ΑΝ.ΑΔ, Ε.Υ, Α/Α, ΓΡ, ΕΣΤ…): δεν είναι υπηρεσία, δεν πειράζονται
export const isAbsCode = (raw: string) => /[./]|^[-–—]+$/.test(raw.trim()) || /^(ΓΡ|ΑΓ|ΕΣΤ|ΚΑ|ΑΝΑΔ|ΕΥ|ΕΑ|ΕΟ|ΕΑΡΒ|ΕΛΑΡΒ)$/.test(normGreek(raw).replace(/[^Α-ΩA-Z]/g, ''));
// σκέτο γράμμα είδους, χωρίς αριθμό ή άλλο γράμμα (Θ, ΜΑΓ, ΣΚ…): δεν λέει θέση
export const isBareCode = (raw: string) => !!dutyCode(raw) && /^[Α-ΩA-Z]+$/.test(codeKey(raw));

interface CodeIdx { map: Map<string, { k: string; kind: DutyKind }>; cur: Map<string, string>; other: Map<string, string> }
const idxCache = new WeakMap<Settings, CodeIdx>();
// κωδικοί όλων των θέσεων και των δύο εντύπων (και όσων αφαιρέθηκαν): η ίδια θέση μπορεί να έχει άλλον κωδικό σε κάθε έντυπο
function codeIdx(settings: Settings): CodeIdx {
  let x = idxCache.get(settings); if (x) return x;
  x = { map: new Map(), cur: new Map(), other: new Map() };
  const cur = blocksOf(settings) || settings.blocks || [];
  const other = settings.phase === 'spen' ? settings.blocks || [] : settings.blocksSpen || [];
  for (const [list, into] of [[cur, x.cur], [other, x.other]] as const) for (const b of list) for (const p of b.posts) {
    if (!p.code) continue;
    const key = codeKey(p.code); if (key && !x.map.has(key)) x.map.set(key, { k: p.k, kind: b.kind });
    if (!into.has(p.k)) into.set(p.k, p.code);
  }
  idxCache.set(settings, x);
  return x;
}
export type CellDuty = { k?: string; kind: DutyKind };
// Κελί του ελέγχου υπηρεσιών → υπηρεσία: πρώτα κωδικός θέσης, μετά σκέτο γράμμα. 'abs' = κωδικός απουσίας,
// 'unknown' = δεν αναγνωρίζεται, null = κενό ή αριθμός
export function readDuty(raw: string, settings: Settings): CellDuty | 'abs' | 'unknown' | null {
  const t = raw.trim(); if (!t || /^\d+$/.test(t)) return null;
  const hit = codeIdx(settings).map.get(codeKey(t)); if (hit) return { k: hit.k, kind: hit.kind };
  const b = dutyCode(t); if (b) return b.pref ? { k: b.pref, kind: 'ly' } : { kind: b.kind };
  return isAbsCode(t) ? 'abs' : 'unknown';
}
// Ο κωδικός που γράφεται για μια θέση: του εντύπου που ισχύει, αλλιώς του άλλου, αλλιώς το γράμμα του είδους
export function codeOf(settings: Settings, k: string, kind: DutyKind): string {
  const x = codeIdx(settings); return x.cur.get(k) || x.other.get(k) || bareOf(k, kind);
}
export const bareOf = (k: string | undefined, kind: DutyKind) => (k === 'dy' ? 'ΔΥ' : KIND_CODE[kind]);

// Λάθη στους κωδικούς (για τις Ρυθμίσεις): κενός, ίδιος σε δύο θέσεις, σκέτο γράμμα είδους, κωδικός απουσίας
export function codeErrors(settings: Settings): string[] {
  const out: string[] = []; const seen = new Map<string, { k: string; label: string; code: string }>();
  const all = [...(settings.blocks || []), ...(settings.blocksSpen || [])];
  const perKind = new Map<DutyKind, Set<string>>();
  for (const b of all) for (const p of b.posts) { if (!perKind.has(b.kind)) perKind.set(b.kind, new Set()); perKind.get(b.kind)!.add(p.k); }
  for (const b of all) for (const p of b.posts) {
    const code = (p.code || '').trim(); const lbl = p.label || b.name;
    if (!code) { if (!p.hidden && !b.hidden) out.push(lbl + ': χωρίς κωδικό'); continue; }
    if (isAbsCode(code)) { out.push(lbl + ': το «' + code + '» μοιάζει με κωδικό απουσίας (με τελεία ή κάθετο)'); continue; }
    const bare = dutyCode(code);
    if (isBareCode(code) && bare && bare.pref !== p.k && !(bare.kind === b.kind && perKind.get(b.kind)!.size === 1))
      out.push(lbl + ': το «' + code + '» είναι το σκέτο γράμμα για ' + KIND_NAME[bare.kind] + ' (βάλε και αριθμό, π.χ. ' + KIND_CODE[b.kind] + '1)');
    const key = codeKey(code); const o = seen.get(key);
    if (o && o.k !== p.k) out.push('Ο κωδικός «' + code + '» είναι και στο ' + o.label + ' και στο ' + lbl);
    else if (!o) seen.set(key, { k: p.k, label: lbl, code });
  }
  return [...new Set(out)];
}
// Ένας νέος κωδικός για θέση είδους kind που δεν τον έχει άλλη θέση (Υ1, Υ2…)
export function freeCode(settings: Settings, kind: DutyKind, from = 1): string {
  const used = new Set<string>(); for (const b of [...(settings.blocks || []), ...(settings.blocksSpen || [])]) for (const p of b.posts) if (p.code) used.add(codeKey(p.code));
  let n = from; let c = KIND_CODE[kind] + n; while (used.has(codeKey(c))) c = KIND_CODE[kind] + ++n;
  return c;
}

// Τύποι COUNTIF του φύλλου που μετρούν ένα σκέτο γράμμα (π.χ. COUNTIF(M3:AO3, "Θ")): με κωδικούς θέσεων (Θ1α)
// θα έβγαζαν 0, οπότε σε τέτοιο φύλλο γράφεται το σκέτο γράμμα μέχρι να γίνουν "Θ*"
export function exactCountif(formula: string): string | null {
  if (!/COUNTIFS?\s*\(/i.test(formula)) return null;
  for (const m of formula.replace(/&quot;/g, '"').matchAll(/"([^"]*)"/g)) {
    const v = m[1].replace(/^=/, '').trim();
    if (v && !/[*?]/.test(v) && isBareCode(v)) return v;
  }
  return null;
}
