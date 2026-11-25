// What the engine remembers about one unit's template file (a «profile»), and how it is stored in settings.tplProfiles.
// Only types and the safe loader live here (no imports), so settings code can use them without pulling in the engine.
// The engine itself (fingerprint, matching, re-locating) is in tplProfile.ts.
export const PROFILE_VERSION = 1;
export type ProfileKind = 'hkai' | 'hkal' | 'services' | 'roster' | 'weapons' | 'duties' | 'outs' | 'rooms';
export const PROFILE_KINDS: ProfileKind[] = ['hkai', 'hkal', 'services', 'roster', 'weapons', 'duties', 'outs', 'rooms'];
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
// Λίστες της μονάδας σε φύλλο που δεν μοιάζει με τα δικά μας έντυπα (phase 3b), kinds 'services' (κατάσταση υπηρεσιών σε λίστα), 'outs' (εξοδούχοι/αδειούχοι δίπλα δίπλα),
// 'rooms' (θαλαμιζόμενοι με VLOOKUP σε λίστα δεδομένων). Μόνο ό,τι διάλεξε ο χρήστης· ό,τι βρίσκεται μόνο του από το αρχείο ξαναβρίσκεται κάθε φορά.
//   sheet   το φύλλο όπου έγινε η αντιστοίχιση (ξαναβρίσκεται και με άλλο όνομα από τις λέξεις του)
//   posts   (services) «λέξη του αρχείου#Ν» → blk:<υπηρεσία> | post:<θέση> | st:<κατάσταση> (λίστα ατόμων: ΑΠΕΣΠΑΣΜΕΝΟΙ, ΝΟΣΟΚΟΜΕΙΟ, Ε.Υ…) | ignore   (Ν = η Νιοστή φορά που εμφανίζεται η λέξη)
//   cols    ρόλος στήλης → στήλη (0-based)· για outs με πρόθεμα «o.» (εξοδούχοι) ή «l.» (αδειούχοι)
//   who     (rooms) φύλλο → ποιοι μπαίνουν: '' όλοι με θάλαμο, αλλιώς το όνομα Ίλης/Λόχου
//   show    (services) «λέξη του αρχείου#Ν» → keep (το μπλοκ φαίνεται στο έντυπο αλλά δεν γεμίζει) | remove (το μπλοκ δεν υπάρχει στο έντυπο που βγαίνει)· όσα λείπουν γεμίζουν κανονικά
//   add     (services) υπηρεσίες της εφαρμογής που λείπουν από το αρχείο της μονάδας και μπαίνουν στο έντυπο που βγαίνει: value «blk:<υπηρεσία>» ή «st:<κατάσταση>» (λίστα ατόμων), after = λέξη#Ν του μπλοκ μετά το οποίο μπαίνουν ('' = στο τέλος), like = λέξη#Ν του μπλοκ που μιμείται η μορφή τους
//   name    (services / outs) μορφή ονόματος στο αρχείο: 'short' = «ΕΠΩΝΥΜΟ Α.» (χωρίς πατρώνυμο)· απούσα = πλήρες ονοματεπώνυμο όπως πάντα
//   heads   (services / outs) ίδια κλειδιά με το cols → κανονικοποιημένο κείμενο της επικεφαλίδας της στήλης τη στιγμή της αποθήκευσης· αν το αρχείο αλλάξει, η στήλη ξαναβρίσκεται από αυτό
export interface ListAdd { value: string; after: string; like: string }
export interface ListProfile { sheet: string; posts?: Record<string, string>; cols?: Record<string, number>; who?: Record<string, string>; sheets?: string[]; show?: Record<string, 'keep' | 'remove'>; add?: ListAdd[]; name?: 'short'; heads?: Record<string, string> }
// Δυναμολόγιο ΑΛΛΗΣ μονάδας (phase 4), kind 'roster'. Μόνο ό,τι διάλεξε ο χρήστης· ό,τι βρίσκεται μόνο του ξαναβρίσκεται κάθε φορά.
//   sheet   ο κύριος κατάλογος (ξαναβρίσκεται και με άλλο όνομα από τις επικεφαλίδες του)
//   cols    ρόλος στήλης (aa, rank, name, last, first, asm, sub, status, remarks…) → επικεφαλίδα που διάλεξε ο χρήστης· ignore: επικεφαλίδες που δεν διαβάζονται
//   order   «ονοματεπώνυμο» σε ένα κελί: ποιο είναι πρώτο
//   roles   φύλλο → abs (λίστα απόντων) | pres (λίστα παρόντων) | summary (σύνοψη) | skip· refill: ποιες λίστες ξαναγεμίζει η εφαρμογή (μόνο όσες τσέκαρε ο χρήστης)
//   status  λέξη της στήλης ΚΑΤΑΣΤΑΣΗ (phraseKey) → present | ignore | <id κατάστασης> | own:<όνομα>· subs: τιμή της ΙΛΗ (phraseKey) → όνομα Λόχου/Ίλης ('' = καμία)
//   ranks   βαθμός (phraseKey) που ρωτήθηκε → cadre | soldier
export type RosterRole = 'abs' | 'pres' | 'summary' | 'skip';
export interface RosterProfile {
  sheet: string; cols: Record<string, string>; ignore: string[]; order?: 'last-first' | 'first-last';
  roles: Record<string, RosterRole>; refill: string[];
  status: Record<string, string>; subs: Record<string, string>; ranks: Record<string, 'cadre' | 'soldier'>;
}
// Αρχείο οπλισμού ΑΛΛΗΣ μονάδας (phase 5), kind 'weapons'. Μόνο ό,τι διάλεξε ο χρήστης· ό,τι βρίσκεται μόνο του ξαναβρίσκεται κάθε φορά.
//   roles   φύλλο → items (λίστα οπλισμού) | derived (βγαίνει από άλλο φύλλο με τύπους, δεν πειράζεται) | skip
//   cats    φύλλο → κατηγορία του Μητρώου (AssetCat.id, ή «new:όνομα» μέχρι να δημιουργηθεί) για φύλλο χωρίς τύπους που να τη λένε
//   cols    ρόλος στήλης (no, type, name, place, barrel, spare, note, rank, aa) → επικεφαλίδα που διάλεξε ο χρήστης· ignore: επικεφαλίδες που δεν διαβάζονται
//   types   τύπος όπλου (phraseKey) → id κατηγορίας | ignore
//   places  λέξη θέσης (phraseKey) → PlaceWord.means | ignore
//   holders κείμενο στη στήλη ονόματος που δεν είναι άτομο (phraseKey) → free (αχρέωτο, το κείμενο μένει στη σημείωση) | place (είναι λέξη θέσης) | skip (δεν διαβάζεται η γραμμή)
export type WeaponSheetRole = 'items' | 'derived' | 'skip';
export interface WeaponProfile {
  roles: Record<string, WeaponSheetRole>; cats: Record<string, string>; cols: Record<string, string>; ignore: string[];
  types: Record<string, string>; places: Record<string, string>; holders: Record<string, string>;
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
  ros?: RosterProfile;                // kind 'roster': the unit's own roster file (rosterUnit.ts)
  wpn?: WeaponProfile;                // kind 'weapons': the unit's own weapons file (weaponUnit.ts)
  duty?: DutyProfile;                 // kind 'duties': the unit's code vocabulary and the columns the user chose
  lst?: ListProfile;                  // kinds services / outs / rooms: the unit's own list layouts (see ListProfile)
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

function cleanRos(x: Record<string, unknown>): RosterProfile {
  const strs = (o: unknown): Record<string, string> => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {});
  const roles = Object.fromEntries(Object.entries(strs(x.roles)).filter(([, v]) => ['abs', 'pres', 'summary', 'skip'].includes(v))) as Record<string, RosterRole>;
  const ranks = Object.fromEntries(Object.entries(strs(x.ranks)).filter(([, v]) => v === 'cadre' || v === 'soldier')) as Record<string, 'cadre' | 'soldier'>;
  return { sheet: x.sheet as string, cols: strs(x.cols), ignore: Array.isArray(x.ignore) ? x.ignore.filter(str) : [], ...(x.order === 'last-first' || x.order === 'first-last' ? { order: x.order } : {}),
    roles, refill: Array.isArray(x.refill) ? x.refill.filter(str) : [], status: strs(x.status), subs: strs(x.subs), ranks };
}

function cleanWpn(x: Record<string, unknown>): WeaponProfile {
  const strs = (o: unknown): Record<string, string> => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {});
  const roles = Object.fromEntries(Object.entries(strs(x.roles)).filter(([, v]) => ['items', 'derived', 'skip'].includes(v))) as Record<string, WeaponSheetRole>;
  const holders = Object.fromEntries(Object.entries(strs(x.holders)).filter(([, v]) => ['free', 'place', 'skip'].includes(v)));
  return { roles, cats: strs(x.cats), cols: strs(x.cols), ignore: Array.isArray(x.ignore) ? x.ignore.filter(str) : [], types: strs(x.types), places: strs(x.places), holders };
}

function cleanLst(x: Record<string, unknown>): ListProfile {
  const strs = (o: unknown): Record<string, string> => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {});
  const posts = strs(x.posts), who = strs(x.who), heads = strs(x.heads);
  const cols = isObj(x.cols) ? Object.fromEntries(Object.entries(x.cols).filter(([, v]) => typeof v === 'number' && Number.isInteger(v) && v >= 0)) as Record<string, number> : {};
  const show = isObj(x.show) ? Object.fromEntries(Object.entries(x.show).filter(([, v]) => v === 'keep' || v === 'remove')) as Record<string, 'keep' | 'remove'> : {};
  const add: ListAdd[] = Array.isArray(x.add) ? x.add.filter((a): a is Record<string, unknown> => isObj(a) && typeof a.value === 'string' && /^(blk|st):./.test(a.value) && typeof a.after === 'string' && typeof a.like === 'string' && a.like !== '').map(a => ({ value: a.value as string, after: a.after as string, like: a.like as string })) : [];
  return { sheet: x.sheet as string, ...(Object.keys(posts).length ? { posts } : {}), ...(Object.keys(cols).length ? { cols } : {}), ...(Object.keys(who).length ? { who } : {}), ...(Array.isArray(x.sheets) ? { sheets: x.sheets.filter(str) } : {}),
    ...(Object.keys(show).length ? { show } : {}), ...(add.length ? { add } : {}),
    ...(x.name === 'short' ? { name: 'short' as const } : {}), ...(Object.keys(heads).length ? { heads } : {}) };
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
      ...(isObj(p.ros) && typeof p.ros.sheet === 'string' ? { ros: cleanRos(p.ros) } : {}),
      ...(isObj(p.wpn) ? { wpn: cleanWpn(p.wpn) } : {}),
      ...(isObj(p.lst) && typeof p.lst.sheet === 'string' ? { lst: cleanLst(p.lst) } : {}),
      ...(isObj(p.ours) ? { ours: Object.fromEntries(Object.entries(p.ours).filter(([, v]) => typeof v === 'string')) as Record<string, string> } : {})
    });
  }
  return out;
}
export const profilesOf = (st: { tplProfiles?: unknown } | undefined): TplProfile[] => sanitizeProfiles(st?.tplProfiles);
