// ΗΚΑΙ, πίσω σελίδα: οι «Αποφάσεις Διοικητή» (3. ΑΔΕΙΕΣ, 4. ΠΟΙΝΕΣ, 5. ΑΙΤΗΣΕΙΣ) ως αριθμημένες προτάσεις, μία ανά γραμμή,
// «1. …» (Michael, 17/10). Ίδιες γραμμές για την προεπισκόπηση στην οθόνη και για το Excel (main/exports.ts).
import { hkDay, type ISODate } from './dates';
import { OUT_NOTE, TYPES, hkOn, type AppState, type Person, type PersonRequest, type Status } from './domain';
import { dutyBlock, personMap, postBy } from './rules';
import { hkWho, punGroupKey, punText } from './punish';
import { collator, norm, upper } from './text';
import { genitive } from './greek';
import { rankTxt } from './ranks';

// Κομμάτι κειμένου· u = υπογραμμισμένο (η διάρκεια της ποινής)
export interface Run { t: string; u?: boolean }
export type Line = Run[];

export const byName = (a: Person, b: Person) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first);
// «1. », «2. » μπροστά από κάθε πρόταση
const numbered = (ls: Line[]): Line[] => ls.map((l, i) => [{ ...l[0], t: (i + 1) + '. ' + l[0].t }, ...l.slice(1)]);

// 4. ΠΟΙΝΕΣ: όσες επιβλήθηκαν αυτή τη μέρα (ημερομηνία τιμωρίας, αλλιώς η έναρξη). Ισχύουν αμέσως, χωρίς έγκριση.
// Ίδια ποινή σε πολλούς: μία πρόταση με όλους. «1. Ο ΣΤΡ (ΠΖ) … ΤΙΜΩΡΗΘΗΚΕ ΤΗΝ 12 ΟΚΤ 26 ΑΠΟ ΤΟΝ … ΜΕ <u>ΔΥΟ (02) ΗΜΕΡΕΣ ΚΡΑΤΗΣΗ</u>, ΔΙΟΤΙ ….»
export function hkaiPunLines(s: AppState, d: ISODate): Line[] {
  const pm = personMap(s.people); const groups = new Map<string, { st: Status; ps: Person[] }>();
  for (const x of s.statuses) {
    if (x.type !== 'PUN' || (x.on || x.from) !== d || !pm.has(x.pid)) continue;
    const k = punGroupKey(x, s.settings.lists); const g = groups.get(k);
    if (g) g.ps.push(pm.get(x.pid)!); else groups.set(k, { st: x, ps: [pm.get(x.pid)!] });
  }
  const list = [...groups.values()].map(g => ({ ...g, ps: g.ps.sort(byName) })).sort((a, b) => byName(a.ps[0], b.ps[0]));
  return numbered(list.map(({ st, ps }) => { const t = punText(ps, st, s.settings.lists); return [{ t: t.before }, { t: t.dur, u: true }, { t: t.after }]; }));
}

// Τι αιτείται: «ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26 <αιτιολόγηση>» ή το κείμενο της αίτησης
export const reqWhat = (x: PersonRequest) => (x.leave ? leaveName(x.leave) + ' ' + hkRange(x.leave) + (x.text ? ' ' + x.text : '') : x.text);
// 5. ΑΙΤΗΣΕΙΣ: «1. ΣΤΡ (ΔΒ-ΗΠ) ΔΕΜΕΛΗΣ ΑΝΑΣΤΑΣΙΟΣ: ΑΙΤΕΙΤΑΙ …», και στο τέλος ό,τι γράφτηκε ελεύθερα στην οθόνη της ΗΚΑΙ
export function hkaiReqLines(s: AppState, d: ISODate): Line[] {
  const pm = personMap(s.people);
  const out: Line[] = numbered(s.requests.filter(x => x.date === d && pm.has(x.pid))
    .map(x => ({ x, p: pm.get(x.pid)! })).sort((a, b) => byName(a.p, b.p) || a.x.id.localeCompare(b.x.id))
    .map(({ x, p }) => [{ t: upper(hkWho(p) + ': αιτείται ' + reqWhat(x) + '.') }]));
  const free = s.hkaiManual?.[d]?.text?.ait?.trim();
  if (free) out.push([{ t: free }]);
  return out;
}

// Το είδος της άδειας σε φράση: «Κανονική άδεια», «Άδεια ΑΜΔ», «Τιμητική άδεια», και τα δικά σου είδη όπως τα έγραψες
// («Αιμοδοσίας» → «Άδεια Αιμοδοσίας», «ΑΔΕΙΑ ΓΑΜΟΥ» μένει ως έχει)
export function leavePhrase(st: Pick<Status, 'type' | 'kind'>): string {
  const k = ((st.type === 'LEAVE' ? st.kind : '') || TYPES[st.type].long).trim(); const n = norm(k);
  return /ΑΔΕΙΑ/.test(n) ? k : /Η$/.test(n) ? k + ' άδεια' : 'Άδεια ' + k;
}
export const leaveName = (st: Pick<Status, 'type' | 'kind'>): string => upper(leavePhrase(st));
// «ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26» ή «ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 ΕΩΣ ΚΥΡ 18 ΟΚΤ 26», με τις ώρες αν γράφτηκαν
export function hkRange(x: Pick<Status, 'from' | 'to' | 'fromTime' | 'toTime' | 'open'>): string {
  const a = hkDay(x.from) + (x.fromTime ? ' ' + x.fromTime : ''), back = x.toTime && !x.open ? ' ' + x.toTime : '';
  if (x.open) return 'ΑΠΟ ' + a + ' (ΧΩΡΙΣ ΛΗΞΗ)';
  if (x.from === x.to && !x.fromTime && !back) return 'ΓΙΑ ΤΗΝ ' + a;
  // μία μέρα με μόνο τη μία ώρα: «ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26 ΑΠΟ 14:00» / «… ΕΩΣ 22:00»
  if (x.from === x.to && !(x.fromTime && back)) return 'ΓΙΑ ΤΗΝ ' + hkDay(x.from) + (x.fromTime ? ' ΑΠΟ ' + x.fromTime : ' ΕΩΣ' + back);
  return 'ΑΠΟ ' + a + ' ΕΩΣ ' + (x.from === x.to ? back.trim() : hkDay(x.to) + back);
}
// 3. ΑΔΕΙΕΣ: άδειες και αναρρωτικές που ξεκινούν τη μέρα. Όσες ζητήθηκαν με αίτηση δεν ξαναγράφονται: στην πίσω σελίδα
// μένει μόνο η αίτηση, μία φορά, και απλά εγκρίνεται (Michael, 18/10). «1. ΣΤΡ (ΔΒ-ΗΠ) ΔΕΜΕΛΗΣ ΑΝΑΣΤΑΣΙΟΣ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΑΠΟ … ΕΩΣ ….»
// Γράφονται μόνο αν είναι ανοιχτή η ενότητα «Άδειες στο 3. Άδειες» (κλειστή από προεπιλογή, Michael 22/10).
export function hkaiLeaveLines(s: AppState, d: ISODate): Line[] {
  if (!hkOn(s.settings, 'lv')) return [];
  const pm = personMap(s.people);
  const leave = (x: Status) => x.type === 'LEAVE' || x.type === 'HON' || x.type === 'SICK';
  return numbered(s.statuses.filter(x => leave(x) && pm.has(x.pid) && !x.req && x.from === d)
    .map(x => ({ x, p: pm.get(x.pid)! })).sort((a, b) => byName(a.p, b.p) || a.x.id.localeCompare(b.x.id))
    .map(({ x, p }) => [{ t: upper(hkWho(p) + ': ' + leaveName(x) + ' ' + hkRange(x) + '.') }]));
}

// 1. ΕΓΓΡΑΦΕΣ / 2. ΔΙΑΓΡΑΦΕΣ: όσοι μπήκαν στη δύναμη ή βγήκαν εκτός δύναμης τη μέρα, με τα στοιχεία τους από το Δυναμολόγιο,
// και μετά ό,τι γράφτηκε ελεύθερα στην οθόνη της ΗΚΑΙ. «1. ΣΤΡ (ΠΖ) ΕΠΩΝΥΜΟ ΟΝΟΜΑ ΤΟΥ ΠΑΤΡΩΝΥΜΟΥ, ΑΣΜ …, ΕΣΣΟ …: <λόγος>.»
export function personLine(p: Person): string {
  return upper([rankTxt(p), p.spec ? '(' + p.spec + ')' : '', p.last, p.first, p.father ? 'του ' + genitive(p.father) : ''].filter(Boolean).join(' ')
    + (p.asm ? ', ΑΣΜ ' + p.asm : '') + (p.essos ? ', ΕΣΣΟ ' + p.essos : ''));
}
// Ο λόγος της διαγραφής: από το φύλλο «ΕΚΤΟΣ ΔΥΝΑΜΗΣ» («Εκτός δύναμης: μετάθεση») ή οι σημειώσεις του
export const outReason = (p: Person) => (p.notes.startsWith(OUT_NOTE) ? p.notes.slice(OUT_NOTE.length).replace(/^[:\s]+/, '') : p.notes).trim();
export const movesOn = (s: AppState, field: 'inOn' | 'outOn', d: ISODate) => s.people.filter(p => p[field] === d).sort(byName);
function moveLines(s: AppState, d: ISODate, field: 'inOn' | 'outOn', free: 'egr' | 'dia'): Line[] {
  const out = numbered(movesOn(s, field, d).map(p => { const why = field === 'outOn' ? outReason(p) : ''; return [{ t: personLine(p) + (why ? ': ' + upper(why.replace(/[.\s]+$/, '')) : '') + '.' }]; }));
  const t = s.hkaiManual?.[d]?.text?.[free]?.trim();
  if (t) out.push([{ t }]);
  return out;
}
export const hkaiEgrLines = (s: AppState, d: ISODate) => moveLines(s, d, 'inOn', 'egr');
export const hkaiDiaLines = (s: AppState, d: ISODate) => moveLines(s, d, 'outOn', 'dia');

export const lineText = (l: Line) => l.map(r => r.t).join('');
export const linesText = (ls: Line[]) => ls.map(lineText).join('\n');
// Γραμμές που πιάνει το κελί στο χαρτί: στο κελί του προτύπου (G11:K11) χωρούν περίπου 130 χαρακτήρες ανά γραμμή
export const HK_LINE_CHARS = 130;
export const paperLines = (ls: Line[], chars = HK_LINE_CHARS) => ls.reduce((a, l) => a + Math.max(1, Math.ceil(lineText(l).length / chars)), 0);

// Όργανα υπηρεσίας › Λ/Υ και Δ/Υ: όποιος είναι στη θέση τη μέρα (με το χέρι ή από τη συμπλήρωση)· αν η θέση είναι κενή,
// ο μόνιμος Λ/Υ ή Δ/Υ, όταν είναι σε δύναμη και δεν τον κρατά κάποια κατάσταση (Michael, 17/10)
export function hkOrgans(s: AppState, d: ISODate): { ly?: number; dy?: number } {
  const g = s.guards[d] || {}; const pm = personMap(s.people); const out: { ly?: number; dy?: number } = {};
  for (const k of ['ly', 'dy'] as const) {
    const f = s.settings.fixed?.[k]; const post = postBy(s, k);
    const id = g[k] ?? (f && pm.get(f)?.active && !dutyBlock(s.statuses, d, f, post, s.settings.lists) ? f : undefined);
    if (id != null) out[k] = id;
  }
  return out;
}
