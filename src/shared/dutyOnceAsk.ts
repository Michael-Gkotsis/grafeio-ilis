// «Μετρά για 1» (Michael, 26/11): ποιος έχει 2+ υπηρεσίες μια μέρα και δεν έχει απάντηση ακόμα, για να ρωτήσει η οθόνη μετά από ανάθεση ή συμπλήρωση.
// Ρωτά μόνο όταν η ενέργεια ΑΥΞΗΣΕ τις υπηρεσίες του ατόμου τη μέρα (όχι για διπλές που υπήρχαν ήδη). Καθαρή λογική, δοκιμάζεται χωρίς οθόνη.
import { dmy, type ISODate } from './dates';
import { shortName, type AppState } from './domain';
import { codeOf, bareOf } from './codes';
import { isOnce, onceKeyOfCadre, onceKeyOfPid } from './dutyOnce';
import { cadreOf, personMap, postBy } from './rules';
import { dayOf, dutyCfgOf, serviceOf } from './cadreDuty';
import { rankTxt } from './ranks';

export interface OnceItem { date: ISODate; who: string; name: string; codes: string[]; n: number }
interface DayCnt { name: string; codes: string[] }

// οι υπηρεσίες κάθε ατόμου τη μέρα: κλειδί → κωδικοί (θέσεις και υπηρεσίες χωρίς θέση για στρατιώτες· θέσεις και πρόγραμμα για στελέχη)
function dayCounts(s: AppState, d: ISODate): Map<string, DayCnt> {
  const out = new Map<string, DayCnt>(); const pm = personMap(s.people); const cfg = dutyCfgOf(s.settings);
  const add = (who: string, name: () => string, code: string) => { const x = out.get(who); if (x) x.codes.push(code); else out.set(who, { name: name(), codes: [code] }); };
  const g = s.guards[d] || {};
  for (const k in g) {
    const pid = g[k]; if (pid <= 0) continue; const post = postBy(s, k); if (!post) continue;
    add(onceKeyOfPid(pid), () => (pm.get(pid) ? shortName(pm.get(pid)!) : String(pid)), codeOf(s.settings, k, post.kind));
  }
  for (const e of s.dutyLog?.[d] || []) if (e.pid > 0) add(onceKeyOfPid(e.pid), () => (pm.get(e.pid) ? shortName(pm.get(e.pid)!) : String(e.pid)), bareOf(undefined, e.kind));
  for (const c of s.cadreList || []) {
    const x = dayOf(s, c.id, d); if (!x) continue;
    for (const r of x.roster) add(onceKeyOfCadre(c.id), () => rankTxt(c) + ' ' + c.last, serviceOf(cfg, r.svc)?.svc.short || '?');
    for (const y of x.seat) add(onceKeyOfCadre(c.id), () => rankTxt(c) + ' ' + c.last, y.svc ? y.svc.short : y.k ? codeOf(s.settings, y.k, postBy(s, y.k)?.kind || 'other') : 'Σ');
  }
  return out;
}
export function onceCandidates(prev: AppState, next: AppState, dates: ISODate[], whos?: string[]): OnceItem[] {
  const items: OnceItem[] = [];
  for (const d of [...new Set(dates)].sort()) {
    const was = dayCounts(prev, d);
    dayCounts(next, d).forEach((x, who) => {
      if (x.codes.length < 2 || (whos && !whos.includes(who)) || isOnce(next.dutyOnce, d, who) || x.codes.length <= (was.get(who)?.codes.length || 0)) return;
      items.push({ date: d, who, name: x.name, codes: x.codes, n: x.codes.length });
    });
  }
  return items;
}
// «Ο/Η ΛΧΙΑΣ Χ έχει 2 υπηρεσίες στις 12/12/2026 (Θ1α/Μ2). Πόσες μετρούν;»
export const onceText = (x: OnceItem): string => 'Ο/Η ' + x.name + ' έχει ' + x.n + ' υπηρεσίες στις ' + dmy(x.date) + ' (' + x.codes.join('/') + '). Πόσες μετρούν;';
export const onceStaff = (s: AppState, pid: number): string | null => { const c = pid < 0 ? cadreOf(s, pid) : undefined; return c ? onceKeyOfCadre(c.id) : pid > 0 ? onceKeyOfPid(pid) : null; };
