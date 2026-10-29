// Οπλισμός: Κινήσεις ανά λόγο, αναζήτηση, ενδείξεις καταστάσεων και «μένει ΕΚΤΟΣ λόγω υπηρεσίας» (Michael, 24/10). Καθαρή λογική, χωρίς οθόνη.
import { dm, type ISODate } from './dates';
import { TYPES, type AppState, type Cadre, type Person, type Status, type WeaponMove } from './domain';
import { armedLive, calDay, hmOf, type ArmRow, type ArmState } from './armed';
import { statusLbl, type UserLists } from './ranks';
import { statusesOn } from './rules';
import { normGreek, norm, translit } from './text';
import { AUTO_KEY, armMap, dutyMove, isAuto, outPeople, posKey, rackKey, weaponInfo, weaponKey, type WeaponInfo } from './weapons';

// ---------- Κινήσεις: «Εκτός τώρα» ----------
// Ο λόγος κάθε γραμμής για τα chips: ο χειροκίνητος όπως γράφτηκε, ή AUTO_KEY για ένοπλη υπηρεσία
export const moveKey = (m: WeaponMove) => (isAuto(m) ? AUTO_KEY : m.reason);
// Οι γραμμές του «Εκτός τώρα»: όλες οι ανοιχτές κινήσεις (και όσων βγήκαν από τη δύναμη, για να μπει το όπλο) και οι ένοπλες υπηρεσίες
// (σήμερα όσες τρέχουν τώρα, αλλιώς όλα τα νούμερα της μέρας). Ένοπλη υπηρεσία δεν μπαίνει όταν το όπλο του ιδιοκτήτη είναι ήδη εκτός
// με κίνηση ή ο ιδιοκτήτης είναι εκτός δύναμης: έτσι κάθε όπλο μετράει μία φορά, όπως στην κεφαλίδα.
export function openMoveList(s: Pick<AppState, 'people' | 'settings' | 'weaponLog'> & { cadreList?: Cadre[] }, info: WeaponInfo): WeaponMove[] {
  const act = new Set([...armMap(s).values()].filter(p => p.active).map(p => p.id));   // και στελέχη σε ένοπλη υπηρεσία
  const open = (s.weaponLog || []).filter(m => !m.inDay);
  const by = new Set(open.map(m => m.pid));
  const rows: ArmRow[] = info.arm.live ? [...info.arm.cur.values()] : info.arm.rows;
  const auto = rows.filter(r => act.has(r.owner) && !by.has(r.owner)).map(r => dutyMove(s, r));
  return [...open, ...auto];
}
// Chips λόγων με μετρητή: οι χειροκίνητοι κατά πλήθος, η «υπηρεσία (αυτόματα)» τελευταία
export function moveReasons(list: WeaponMove[]): [string, number][] {
  const n = new Map<string, number>();
  for (const m of list) { const k = moveKey(m); n.set(k, (n.get(k) || 0) + 1); }
  return [...n].sort((a, b) => Number(a[0] === AUTO_KEY) - Number(b[0] === AUTO_KEY) || b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ---------- Αναζήτηση ----------
// Όνομα, ΑΣΜ, αριθμός όπλου, θάλαμος, τύπος, θέση (χωρίς τόνους, κάθε λέξη ξεχωριστά)
export function personMatch(p: Person, q: string): boolean {
  const n = normGreek(q.trim()); if (!n) return true;
  const key = normGreek([p.last, p.first, p.father, p.asm, p.rank, p.origin || '', p.spec, p.room != null ? 'Θ' + p.room : '', p.wtype || '', p.rack || '', p.wpos || ''].join(' '));
  const wk = weaponKey(q);
  return n.split(/\s+/).every(t => key.includes(t)) || translit(p.last + ' ' + p.first).includes(norm(q.trim())) || (!!wk && weaponKey(p.weapon).includes(wk));
}
// Θέση «Ε 23» ή «Ε23» (οπλοβαστός + θέση): ολόκληρη, ή μόνο ο οπλοβαστός («Ε»)
const SEAT_Q = /^[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ]{1,3}\s*\d+$/;
export const seatQuery = (q: string) => SEAT_Q.test(q.trim());
export const seatMatch = (p: Pick<Person, 'rack' | 'wpos'>, q: string) => { const k = rackKey(q); return !!k && !!rackKey(p.rack) && (rackKey(p.rack) + posKey(p.wpos) === k || rackKey(p.rack) === k); };
// Μία κίνηση ταιριάζει: ο κάτοχος ή ο ιδιοκτήτης του όπλου (όπλο της θέσης) με όνομα/ΑΣΜ, ο αριθμός όπλου της κίνησης, ή η θέση του ιδιοκτήτη
export function moveMatch(m: WeaponMove, pm: Map<number, Person>, q: string): boolean {
  if (!q.trim()) return true;
  const holder = pm.get(m.pid), owner = isAuto(m) ? pm.get(m.row.owner) : holder;
  const wk = weaponKey(q);
  if (seatQuery(q)) return (!!owner && seatMatch(owner, q)) || (!!holder && seatMatch(holder, q)) || (!!wk && weaponKey(m.weapon).includes(wk));
  return (!!holder && personMatch(holder, q)) || (!!owner && owner !== holder && personMatch(owner, q)) || (!!wk && weaponKey(m.weapon).includes(wk));
}
// Η λίστα όπως φαίνεται: λόγος (κενός = όλοι) και αναζήτηση
export const moveFilter = (list: WeaponMove[], pm: Map<number, Person>, reason: string, q: string) => list.filter(m => (!reason || moveKey(m) === reason) && moveMatch(m, pm, q));
// Ποιες από τις γραμμές μπορούν να μπουν μαζί (χειροκίνητες χωρίς είσοδο) και ποιες διορθώνονται μαζί (όλες οι χειροκίνητες)
export const inIds = (list: WeaponMove[]) => list.filter(m => !isAuto(m) && !m.inDay).map(m => m.id);
export const fixIds = (list: WeaponMove[]) => list.filter(m => !isAuto(m)).map(m => m.id);

// ---------- Ενδείξεις καταστάσεων (Παρατήρηση, δεν μπλοκάρει) ----------
export interface StatusHint { text: string; tip: string }
// «Άδεια», «ΔΝ», «Νοσοκομείο»… από τις καταστάσεις της μέρας που έχουν σχέση με το όπλο: απών, χωρίς υπηρεσίες ή χωρίς ένοπλες θέσεις
export function statusHint(statuses: Status[], pid: number, date: ISODate, lists?: UserLists): StatusHint | null {
  const l = statusesOn(statuses, pid, date).filter(x => { const t = TYPES[x.type]; return t.away || t.noDuty || t.noArmed; });
  if (!l.length) return null;
  const lbl = (x: Status) => (x.type === 'LEAVE' ? 'Άδεια' : statusLbl(x, lists));
  return { text: lbl(l[0]) + (l.length > 1 ? ' +' + (l.length - 1) : ''), tip: l.map(x => TYPES[x.type].long + (x.open ? ' χωρίς λήξη' : ' έως ' + dm(x.to))).join(' · ') };
}

// ---------- Μένει ΕΚΤΟΣ λόγω υπηρεσίας ----------
// Μπαίνει ΕΝΤΟΣ το όπλο του pid την ώρα day/hm, αλλά ένοπλο νούμερο το κρατά ακόμα εκτός (με το περιθώριο): η είσοδος γράφεται, το όπλο μένει ΕΚΤΟΣ.
// «Όπλο της θέσης»: το όπλο μένει εκτός ως το τέλος της αλυσίδας (όχι ως την επόμενη παράδοση), με τη θέση του 1ου νούμερου.
export function stayOutByDuty(s: ArmState, pid: number, day: ISODate, hm: string): { row: ArmRow; text: string } | null {
  const live = armedLive(s, day, hm); const r = live.cur.get(pid); if (!r) return null;
  let first = r, last = r;
  if (r.mode === 'post') {
    const chain = live.rows.filter(x => x.owner === pid && x.mode === 'post' && x.day === r.day).sort((x, y) => x.out - y.out);
    first = chain.find(x => !x.take) || r; last = chain[chain.length - 1] || r;
  }
  const end = calDay(last.day, last.in);
  return { row: first, text: 'Μένει ΕΚΤΟΣ λόγω υπηρεσίας ' + first.label + ' ως ' + (end === day ? '' : dm(end) + ' ') + hmOf(last.in) };
}

// ---------- Μετρητής για τη Σήμερα ----------
// Όσοι έχουν το όπλο εκτός (κινήσεις και ένοπλες υπηρεσίες, μία φορά ο καθένας): όσοι μετράει η κεφαλίδα του Οπλισμού
export const outCountOn = (s: Pick<AppState, 'people' | 'settings'> & Partial<Pick<AppState, 'guards' | 'dutyLog' | 'weaponLog' | 'rules' | 'dutyFix' | 'cadreList'>>, d: ISODate, hm?: string) => outPeople([...s.people, ...(s.cadreList ? [...armMap(s).values()].filter(p => p.cid) : [])], weaponInfo(s, d, hm)).length;

