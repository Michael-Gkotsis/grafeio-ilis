// ΗΚΑΙ, πίσω σελίδα: οι «Αποφάσεις Διοικητή» (3. ΑΔΕΙΕΣ, 4. ΠΟΙΝΕΣ, 5. ΑΙΤΗΣΕΙΣ) ως αριθμημένες προτάσεις, μία ανά γραμμή,
// «1. …» (Michael, 17/10). Ίδιες γραμμές για την προεπισκόπηση στην οθόνη και για το Excel (main/exports.ts).
import { hkDay, type ISODate } from './dates';
import { TYPES, type AppState, type Person, type PersonRequest, type Status } from './domain';
import { personMap } from './rules';
import { hkWho, punGroupKey, punText } from './punish';
import { collator, upper } from './text';

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

// Το είδος της άδειας σε φράση: «ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ», «ΑΔΕΙΑ ΑΜΔ», «ΤΙΜΗΤΙΚΗ ΑΔΕΙΑ»
export function leaveName(st: Pick<Status, 'type' | 'kind'>): string {
  const k = (st.type === 'LEAVE' ? st.kind : '') || TYPES[st.type].long;
  return upper(/άδεια/i.test(k) ? k : /[ήη]$/i.test(k) ? k + ' άδεια' : 'άδεια ' + k);
}
// «ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26» ή «ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 ΕΩΣ ΚΥΡ 18 ΟΚΤ 26», με τις ώρες αν γράφτηκαν
export function hkRange(x: Pick<Status, 'from' | 'to' | 'fromTime' | 'toTime' | 'open'>): string {
  const a = hkDay(x.from) + (x.fromTime ? ' ' + x.fromTime : ''), back = x.toTime && !x.open ? ' ' + x.toTime : '';
  if (x.open) return 'ΑΠΟ ' + a + ' (ΧΩΡΙΣ ΛΗΞΗ)';
  if (x.from === x.to && !x.fromTime && !back) return 'ΓΙΑ ΤΗΝ ' + a;
  return 'ΑΠΟ ' + a + ' ΕΩΣ ' + (x.from === x.to ? back.trim() : hkDay(x.to) + back);
}
// 3. ΑΔΕΙΕΣ: άδειες και αναρρωτικές που ξεκινούν τη μέρα, και οι αιτήσεις άδειας που εγκρίθηκαν τη μέρα (αυτές μόνο τη μέρα
// της έγκρισης). «1. ΣΤΡ (ΔΒ-ΗΠ) ΔΕΜΕΛΗΣ ΑΝΑΣΤΑΣΙΟΣ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΑΠΟ … ΕΩΣ ….»
export function hkaiLeaveLines(s: AppState, d: ISODate): Line[] {
  const pm = personMap(s.people);
  const okOn = new Set(s.requests.filter(r => r.decision === 'ok' && r.decided === d && r.sid).map(r => r.sid!));
  const leave = (x: Status) => x.type === 'LEAVE' || x.type === 'HON' || x.type === 'SICK';
  return numbered(s.statuses.filter(x => leave(x) && pm.has(x.pid) && (x.req ? okOn.has(x.id) : x.from === d))
    .map(x => ({ x, p: pm.get(x.pid)! })).sort((a, b) => byName(a.p, b.p) || a.x.id.localeCompare(b.x.id))
    .map(({ x, p }) => [{ t: upper(hkWho(p) + ': ' + leaveName(x) + ' ' + hkRange(x) + '.') }]));
}

export const lineText = (l: Line) => l.map(r => r.t).join('');
export const linesText = (ls: Line[]) => ls.map(lineText).join('\n');
// Γραμμές που πιάνει το κελί στο χαρτί: στο κελί του προτύπου (G11:K11) χωρούν περίπου 130 χαρακτήρες ανά γραμμή
export const HK_LINE_CHARS = 130;
export const paperLines = (ls: Line[], chars = HK_LINE_CHARS) => ls.reduce((a, l) => a + Math.max(1, Math.ceil(lineText(l).length / chars)), 0);
