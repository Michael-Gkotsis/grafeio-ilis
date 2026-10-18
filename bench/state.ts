// Ρεαλιστική κατάσταση για μετρήσεις: Ν στρατιώτες, μήνες υπηρεσιών, εξοδούχοι κάθε ΣΚ, άδειες, ιατρικά, ποινές,
// κινήσεις όπλων, αιτήσεις, στελέχη. Μόνο φανταστικά ονόματα. Χτίζεται με τις ίδιες εντολές που στέλνει το UI.
import { apply, type Command } from '../src/shared/commands';
import { addDays, isWeekend, type ISODate } from '../src/shared/dates';
import { emptyState, type AppState, type Person } from '../src/shared/domain';
import { activePeople, outBlock } from '../src/shared/rules';

const SUR = ['ΔΟΚΙΜΙΟΣ', 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ', 'ΥΠΟΘΕΤΙΔΗΣ', 'ΦΑΝΤΑΣΙΟΣ', 'ΠΛΑΣΜΑΤΙΚΟΣ', 'ΤΥΧΑΙΟΣ', 'ΑΓΝΩΣΤΟΠΟΥΛΟΣ', 'ΔΕΙΓΜΑΤΑΣ', 'ΕΙΚΟΝΙΚΟΣ', 'ΠΡΟΣΩΡΙΝΟΣ', 'ΘΕΩΡΗΤΙΚΟΣ', 'ΠΙΘΑΝΟΣ'];
const FIRST = ['ΑΛΦΑΣ', 'ΒΗΤΑΣ', 'ΓΑΜΜΑΣ', 'ΔΕΛΤΑΣ', 'ΕΨΙΛΟΝ', 'ΖΗΤΑΣ', 'ΘΗΤΑΣ', 'ΚΑΠΠΑΣ', 'ΛΑΜΔΑΣ'];

export function benchPeople(n: number): Person[] {
  return Array.from({ length: n }, (_, i): Person => ({
    id: i + 1, rank: i % 23 === 4 ? 'ΕΠΟΠ ΛΧΙΑΣ' : i % 9 === 2 ? 'ΔΝΕΑΣ' : 'ΣΤΡ', spec: ['ΤΘ', 'ΤΧ', 'ΔΒ', 'ΠΖ'][i % 4],
    last: SUR[i % SUR.length] + (i >= SUR.length ? ' ' + String.fromCharCode(913 + Math.floor(i / SUR.length) % 24) + (i >= SUR.length * 24 ? i : '') : ''),
    first: FIRST[(i * 5) % FIRST.length], father: 'ΠΑΤΕΡΑΣ', asm: String(100000 + i * 37), phone: '6900' + String(100000 + i * 7919).slice(0, 6),
    room: (i % 10) + 1, si: i % 17 === 3 ? 'Ι3 ΧΩΡΙΣ ΟΠΛΟ' : i % 13 === 5 ? 'Ι4' : 'Ι1', post: i === 8 ? 'ΚΨΜ' : i === 50 ? 'ΙΑΤΡΟΣ ΣΤΕΠ' : null,
    role: i % 15 === 0 ? 'ΘΑΛΑΜΑΡΧΗΣ' : null, essos: '2026 Γ΄', attached: false, active: true, notes: '',
    weapon: i % 19 === 6 ? undefined : String(4810000 + i * 137), wtype: 'G3A3', rack: 'Ε' + (i % 40 + 1)
  } as Person));
}

// Ν άτομα, DAYS μέρες πίσω από το «end» και FUT μέρες μπροστά με υπηρεσίες
export function benchState(o: { n?: number; days?: number; fut?: number; end: ISODate; onCmd?: (c: Command, d: ISODate, ms: number, s: AppState) => void }): AppState {
  const N = o.n ?? 180, DAYS = o.days ?? 120, FUT = o.fut ?? 7;
  let id = 0;
  let s = emptyState(); s.people = benchPeople(N);
  s.cadreList = [['ΙΛΧΟΣ', 'Ίλαρχοι', 'ΥΠΟΘΕΤΙΚΟΣ', 'ΓΙΑΝΝΗΣ'], ['ΑΝΘΛΓΟΣ', 'Ανθυπίλαρχοι-Ανθλγοι', 'ΔΟΚΙΜΑΚΗΣ', 'ΝΙΚΟΣ'], ['ΑΛΧΙΑΣ', 'Αρχιλοχίες', 'ΠΑΡΑΔΕΙΓΜΑΤΑΣ', 'ΚΩΣΤΑΣ'],
    ['ΕΠΧΙΑΣ', 'Επιλοχίες', 'ΔΕΙΓΜΑΤΙΔΗΣ', 'ΠΕΤΡΟΣ'], ['ΛΧΙΑΣ', 'Λοχίες', 'ΤΥΧΑΙΟΥ', 'ΜΑΡΙΑ'], ['ΛΧΙΑΣ', 'Λοχίες', 'ΕΙΚΟΝΙΚΗΣ', 'ΕΛΕΝΗ']]
    .map(([rank, hk, last, first], i) => ({ id: 's' + i, rank, hk, last, first, spec: 'ΤΘ', am: String(20450 + i * 113), phone: '69000000' + (10 + i), active: true }));
  const start = addDays(o.end, -DAYS);
  const run = (c: Command, d: ISODate) => {
    const a = performance.now();
    const r = apply(s, c, { today: d, newId: () => 'b' + ++id });
    s = r.state; o.onCmd?.(c, d, performance.now() - a, s);
  };
  for (let i = 0; i <= DAYS + FUT; i++) {
    const d = addDays(start, i); const past = i <= DAYS;
    run({ t: 'autofill', date: d }, past ? d : o.end);
    if (!past) continue;
    const pid = (k: number) => 1 + ((i * 7 + k * 31) % N);
    if (i % 3 === 0) run({ t: 'declare', cmd: { type: 'LEAVE', kind: 'Κανονική', pids: [pid(0)], from: d, to: addDays(d, 4), fromTime: '14:00', toTime: '20:00' } }, d);
    if (i % 2 === 0) run({ t: 'declare', cmd: { type: ['EY', 'EA', 'EO', 'EARV'][i % 4] as any, pids: [pid(1)], from: d, to: addDays(d, 2 + (i % 5)) } }, d);
    if (i % 9 === 0) run({ t: 'declare', cmd: { type: 'PUN', kind: 'Περιορισμός', pids: [pid(2)], from: d, to: addDays(d, 3), by: 'ΛΧΙΑΣ ΔΟΚΙΜΙΟΣ', reason: 'ΑΡΓΗΣΕ', on: d } }, d);
    if (i % 11 === 0) run({ t: 'declare', cmd: { type: 'SICK', pids: [pid(3)], from: d, to: addDays(d, 6) } }, d);
    if (i % 5 === 0) run({ t: 'weaponOut', pids: [pid(4), pid(5), pid(6)], reason: 'ΕΚΠ', day: d, time: '07:30' }, d);
    if (i % 5 === 0) { const open = s.weaponLog.filter(m => !m.inDay).map(m => m.id); if (open.length) run({ t: 'weaponIn', ids: open, day: d, time: '13:00' }, d); }
    if (i % 4 === 0) run({ t: 'addRequest', req: { pid: pid(7), date: d, text: 'ΓΙΑ ΟΙΚΟΓΕΝΕΙΑΚΟΥΣ ΛΟΓΟΥΣ', leave: { type: 'LEAVE', kind: 'Κανονική', from: addDays(d, 2), to: addDays(d, 4) } } }, d);
    if (i % 4 === 1) { const r = s.requests.find(x => x.leave && !x.decision); if (r) run({ t: 'decideRequest', id: r.id, ok: true }, d); }
    if (i % 6 === 0) run({ t: 'addCadreAbs', abs: { cid: 's' + (i % 6), kind: 'ka', from: d, to: addDays(d, 2) } }, d);
    if (isWeekend(d) || i % 7 === 4) {
      const outs = activePeople(s).filter(p => !outBlock(s, d, p.id)).slice(0, Math.round(N * (isWeekend(d) ? 0.4 : 0.15)));
      run({ t: 'outs', date: d, changes: outs.map(p => ({ pid: p.id, from: null, to: 'OUT' as const })) }, d);
    }
  }
  return s;
}
