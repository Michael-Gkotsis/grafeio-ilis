// What the engine remembers about one unit's template file (a «profile»), and how it is stored in settings.tplProfiles.
// Only types and the safe loader live here (no imports), so settings code can use them without pulling in the engine.
// The engine itself (fingerprint, matching, re-locating) is in tplProfile.ts.
export const PROFILE_VERSION = 1;
export type ProfileKind = 'hkai' | 'hkal' | 'services' | 'roster' | 'weapons' | 'duties';
export const PROFILE_KINDS: ProfileKind[] = ['hkai', 'hkal', 'services', 'roster', 'weapons', 'duties'];
export type RegionType = 'list' | 'matrix' | 'grid';
// how an element was found: sure by the engine, suggested and accepted by the user, or set by the user
export type Found = 'auto-sure' | 'auto-suggest' | 'user';
export type ElType = 'col' | 'row' | 'label';
// 0-based coordinates; r/c are where it was when the profile was made (it may have moved since)
export interface TplElement { concept: string; type: ElType; sheet: string; region: number; r?: number; c?: number; text: string; how: Found }
export interface RegionSig { sheet: string; index: number; type: RegionType; tokens: string[]; r1: number; c1: number }
export interface SheetPrint { name: string; roles: string[]; tokens: string[] }
export interface Fingerprint { sheets: SheetPrint[]; regions: RegionSig[] }
// «ignore this column/row» marks, found again by their header text
export interface IgnoreMark { type: 'col' | 'row'; sheet: string; region: number; text: string; r?: number; c?: number }
// The unit's own ΗΚΑΙ/ΗΚΑΛ rules (src/shared/hkRules.ts): a column or row the lexicon cannot know, mapped by the user. Keys are phraseKey(header text).
// Stored as plain JSON: cols → { t: 'state', keys } | { t: 'placed'|'attached'|'force'|'avail'|'prov' } | { t: 'sum', of: [...] }; rows → { keys, origins?, ranks?, who? }
export interface HkRulesStore { cols: Record<string, unknown>; rows: Record<string, unknown> }
// Έλεγχος υπηρεσιών (μηνιαίο πλέγμα) της μονάδας: τι σημαίνει κάθε κωδικός που γράφει η μονάδα στα κελιά των ημερών.
//   seat    θέση της εφαρμογής (Θ1 → θαλαμοφύλακας 1)         kind    υπηρεσία του είδους χωρίς θέση
//   status  κατάσταση, όχι υπηρεσία (ΕΞ, ΑΔΕΙΑ, ΕΥ, πόστο ΕΣΤ…)   ignore  δεν είναι υπηρεσία / κείμενο που μένει όπως είναι
// text: ο κωδικός όπως τον γράφει η μονάδα (η εφαρμογή τον ξαναγράφει έτσι). Το κλειδί είναι το codeKey του.
export type DutyMeaning =
  | { t: 'seat'; k: string; text: string }
  | { t: 'kind'; kind: string; text: string }
  | { t: 'status'; id: string; name: string; text: string }
  | { t: 'ignore'; text: string };
export interface DutyProfile {
  codes: Record<string, DutyMeaning>;
  cols?: Record<string, string>;       // ρόλος στήλης (name, last, first, aa, asm, essos, post, sub) → επικεφαλίδα που διάλεξε ο χρήστης
}
export interface TplProfile {
  v: number;
  id: string;
  kind: ProfileKind;
  name?: string;
  fp: Fingerprint;
  elements: TplElement[];
  words: Record<string, string>;      // word the unit uses -> concept id (feeds the lexicon «learned» names)
  ignore: IgnoreMark[];
  rules?: HkRulesStore;               // the unit's own columns/rows mapped to counting rules (hkRules.ts); until mapped they are warnings and never written
  back?: { num?: 'arabic' | 'greek'; date?: 'hk' | 'slash' | 'slash4'; line?: 'app' | 'person'; accepted?: string[] };   // the back side: format of a line, and the section words the user accepted as a proposal
  ignoreWords?: string[];             // words of the data sheet the user chose to ignore (phraseKey), kept between sessions
  duty?: DutyProfile;                 // kind 'duties': the unit's code vocabulary and the columns the user chose
  ours?: Record<string, string>;      // cells the safe writer filled: 'sheet|r:c' -> the text written (a cell that still holds it may be overwritten)
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = <T>(x: unknown, ok: (y: unknown) => y is T): T[] => (Array.isArray(x) ? x.filter(ok) : []);
const isEl = (x: unknown): x is TplElement => isObj(x) && typeof x.concept === 'string' && typeof x.sheet === 'string' && typeof x.text === 'string' && (x.type === 'col' || x.type === 'row' || x.type === 'label') && typeof x.region === 'number';
const isMark = (x: unknown): x is IgnoreMark => isObj(x) && (x.type === 'col' || x.type === 'row') && typeof x.sheet === 'string' && typeof x.text === 'string' && typeof x.region === 'number';
const isRegion = (x: unknown): x is RegionSig => isObj(x) && typeof x.sheet === 'string' && typeof x.index === 'number' && Array.isArray(x.tokens);
const isSheet = (x: unknown): x is SheetPrint => isObj(x) && typeof x.name === 'string' && Array.isArray(x.tokens) && Array.isArray(x.roles);

const isDuty = (x: unknown): x is { codes: Record<string, unknown>; cols?: unknown } => isObj(x) && isObj(x.codes);
const str = (x: unknown): x is string => typeof x === 'string';
function cleanDuty(d: { codes: Record<string, unknown>; cols?: unknown }): DutyProfile {
  const codes: Record<string, DutyMeaning> = {};
  for (const [k, m] of Object.entries(d.codes)) {
    if (!isObj(m) || !str(m.text)) continue;
    if (m.t === 'seat' && str(m.k)) codes[k] = { t: 'seat', k: m.k, text: m.text };
    else if (m.t === 'kind' && str(m.kind)) codes[k] = { t: 'kind', kind: m.kind, text: m.text };
    else if (m.t === 'status' && str(m.id) && str(m.name)) codes[k] = { t: 'status', id: m.id, name: m.name, text: m.text };
    else if (m.t === 'ignore') codes[k] = { t: 'ignore', text: m.text };
  }
  const cols: Record<string, string> = {};
  if (isObj(d.cols)) for (const [k, v] of Object.entries(d.cols)) if (str(v)) cols[k] = v;
  return { codes, ...(Object.keys(cols).length ? { cols } : {}) };
}

// Anything that may be in an old or damaged state file → valid profiles (absent = []). Profiles of a newer version are dropped
// (this build cannot read them), broken parts are cut away instead of crashing.
export function sanitizeProfiles(x: unknown): TplProfile[] {
  if (!Array.isArray(x)) return [];
  const out: TplProfile[] = [];
  for (const p of x) {
    if (!isObj(p) || typeof p.id !== 'string' || !PROFILE_KINDS.includes(p.kind as ProfileKind) || typeof p.v !== 'number' || p.v > PROFILE_VERSION || !isObj(p.fp)) continue;
    const words: Record<string, string> = {};
    if (isObj(p.words)) for (const [k, v] of Object.entries(p.words)) if (typeof v === 'string') words[k] = v;
    out.push({
      v: p.v, id: p.id, kind: p.kind as ProfileKind, ...(typeof p.name === 'string' ? { name: p.name } : {}),
      fp: { sheets: arr(p.fp.sheets, isSheet), regions: arr(p.fp.regions, isRegion) },
      elements: arr(p.elements, isEl), words, ignore: arr(p.ignore, isMark),
      ...(isObj(p.rules) ? { rules: { cols: isObj(p.rules.cols) ? p.rules.cols : {}, rows: isObj(p.rules.rows) ? p.rules.rows : {} } } : {}),
      ...(isObj(p.back) ? { back: { ...(p.back.num === 'greek' || p.back.num === 'arabic' ? { num: p.back.num } : {}), ...(p.back.date === 'hk' || p.back.date === 'slash' || p.back.date === 'slash4' ? { date: p.back.date } : {}), ...(p.back.line === 'app' || p.back.line === 'person' ? { line: p.back.line } : {}), ...(Array.isArray(p.back.accepted) ? { accepted: p.back.accepted.filter((x): x is string => typeof x === 'string') } : {}) } } : {}),
      ...(Array.isArray(p.ignoreWords) ? { ignoreWords: p.ignoreWords.filter((x): x is string => typeof x === 'string') } : {}),
      ...(isDuty(p.duty) ? { duty: cleanDuty(p.duty) } : {}),
      ...(isObj(p.ours) ? { ours: Object.fromEntries(Object.entries(p.ours).filter(([, v]) => typeof v === 'string')) as Record<string, string> } : {})
    });
  }
  return out;
}
export const profilesOf = (st: { tplProfiles?: unknown } | undefined): TplProfile[] => sanitizeProfiles(st?.tplProfiles);
