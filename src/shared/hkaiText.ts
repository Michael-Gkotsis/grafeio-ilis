// ΗΚΑΙ, πίσω σελίδα: «4. ΠΟΙΝΕΣ» και «5. ΑΙΤΗΣΕΙΣ» ως αριθμημένες προτάσεις, μία ανά γραμμή.
// Ίδιες γραμμές για την προεπισκόπηση στην οθόνη και για το Excel (main/exports.ts).
import type { ISODate } from './dates';
import type { AppState, Person } from './domain';
import { personMap } from './rules';
import { punText } from './punish';
import { collator } from './text';

// Κομμάτι κειμένου· u = υπογραμμισμένο (η διάρκεια της ποινής)
export interface Run { t: string; u?: boolean }
export type Line = Run[];

export const byName = (a: Person, b: Person) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first);

// 4. ΠΟΙΝΕΣ: όσες επιβλήθηκαν αυτή τη μέρα (ημερομηνία τιμωρίας, αλλιώς η έναρξη), είτε αιτούνται είτε εγκρίθηκαν
// «1) Ο ΣΤΡ (ΠΖ) … τιμωρήθηκε την 12/10/2026 από τον … με <u>δύο (02) ημέρες κράτηση</u>, διότι ….»
export function hkaiPunLines(s: AppState, d: ISODate): Line[] {
  const pm = personMap(s.people);
  return s.statuses.filter(x => x.type === 'PUN' && (x.on || x.from) === d && pm.has(x.pid))
    .map(x => ({ x, p: pm.get(x.pid)! })).sort((a, b) => byName(a.p, b.p))
    .map(({ x, p }, i) => { const t = punText(p, x, s.settings.lists); return [{ t: (i + 1) + ') ' + t.before }, { t: t.dur, u: true }, { t: t.after }]; });
}

// 5. ΑΙΤΗΣΕΙΣ: οι αιτήσεις της μέρας αριθμημένες, και στο τέλος ό,τι γράφτηκε ελεύθερα στην οθόνη της ΗΚΑΙ
export function hkaiReqLines(s: AppState, d: ISODate): Line[] {
  const pm = personMap(s.people);
  const out: Line[] = s.requests.filter(x => x.date === d && pm.has(x.pid))
    .map(x => ({ x, p: pm.get(x.pid)! })).sort((a, b) => byName(a.p, b.p) || a.x.id.localeCompare(b.x.id))
    .map(({ x, p }, i) => [{ t: (i + 1) + ') Ο ' + p.rank + (p.spec ? ' (' + p.spec + ')' : '') + ' ' + p.last + ' ' + p.first + ' αιτείται ' + x.text + '.' }]);
  const free = s.hkaiManual?.[d]?.text?.ait?.trim();
  if (free) out.push([{ t: free }]);
  return out;
}

export const lineText = (l: Line) => l.map(r => r.t).join('');
export const linesText = (ls: Line[]) => ls.map(lineText).join('\n');
// Γραμμές που πιάνει το κελί στο χαρτί: στο κελί του προτύπου (G11:K11) χωρούν περίπου 130 χαρακτήρες ανά γραμμή
export const HK_LINE_CHARS = 130;
export const paperLines = (ls: Line[], chars = HK_LINE_CHARS) => ls.reduce((a, l) => a + Math.max(1, Math.ceil(lineText(l).length / chars)), 0);
