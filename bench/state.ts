// Ρεαλιστική κατάσταση για μετρήσεις: Ν στρατιώτες, μήνες υπηρεσιών, εξοδούχοι κάθε ΣΚ, άδειες, ιατρικά, ποινές,
// κινήσεις όπλων, αιτήσεις, στελέχη. Μόνο φανταστικά ονόματα. Χτίζεται με τις ίδιες εντολές που στέλνει το UI.
import { apply, type Command } from '../src/shared/commands';
import { addDays, isWeekend, type ISODate } from '../src/shared/dates';
import { blocksOf, emptyState, type AppState, type CadreDutyCfg, type Person } from '../src/shared/domain';
import { activePeople, outBlock, postsOf } from '../src/shared/rules';
import { autoFill } from '../src/shared/cadreDuty';

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
// full (έλεγχος 25/11, Π7): και ό,τι μπήκε 13/11–24/11, ώστε να μετριούνται και αυτά: 20 ακόμα υπηρεσίες ως 10 άτομα/νούμερο,
// μία «Μόνο στελέχη», μόνιμα άτομα, όριο υπηρεσιών, 60 στελέχη με πρόγραμμα υπηρεσιών (αυτόματη κάθε μήνα), 600 εγγραφές μητρώου,
// 20 οχήματα με καύσιμα. unit: λειτουργία μονάδας (2 υπηρεσίες/μέρα). Χωρίς full/unit η κατάσταση μένει ίδια με πριν.
export function benchState(o: { n?: number; days?: number; fut?: number; end: ISODate; full?: boolean; unit?: boolean; onCmd?: (c: Command, d: ISODate, ms: number, s: AppState) => void }): AppState {
  const N = o.n ?? 180, DAYS = o.days ?? 120, FUT = o.fut ?? 7;
  let id = 0;
  let s = emptyState(); s.people = benchPeople(N);
  if (o.unit) s = { ...s, settings: { ...s.settings, mode: 'unit' } };   // 2η υπηρεσία: rules.twoPerDay λείπει = 'last'
  s.cadreList = [['ΙΛΧΟΣ', 'Ίλαρχοι', 'ΥΠΟΘΕΤΙΚΟΣ', 'ΓΙΑΝΝΗΣ'], ['ΑΝΘΛΓΟΣ', 'Ανθυπίλαρχοι-Ανθλγοι', 'ΔΟΚΙΜΑΚΗΣ', 'ΝΙΚΟΣ'], ['ΑΛΧΙΑΣ', 'Αρχιλοχίες', 'ΠΑΡΑΔΕΙΓΜΑΤΑΣ', 'ΚΩΣΤΑΣ'],
    ['ΕΠΧΙΑΣ', 'Επιλοχίες', 'ΔΕΙΓΜΑΤΙΔΗΣ', 'ΠΕΤΡΟΣ'], ['ΛΧΙΑΣ', 'Λοχίες', 'ΤΥΧΑΙΟΥ', 'ΜΑΡΙΑ'], ['ΛΧΙΑΣ', 'Λοχίες', 'ΕΙΚΟΝΙΚΗΣ', 'ΕΛΕΝΗ']]
    .map(([rank, hk, last, first], i) => ({ id: 's' + i, rank, hk, last, first, spec: 'ΤΘ', am: String(20450 + i * 113), phone: '69000000' + (10 + i), active: true }));
  const start = addDays(o.end, -DAYS);
  const run = (c: Command, d: ISODate) => {
    const a = performance.now();
    const r = apply(s, c, { today: d, newId: () => 'b' + ++id });
    s = r.state; o.onCmd?.(c, d, performance.now() - a, s);
  };
  if (o.full) fullSetup(start, run, () => s);
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
    if (o.full && d.endsWith('-01')) cadreMonth(s, d.slice(0, 7), run, d);
    if (o.full && i % 3 === 0) { const v = (s.assets || []).filter(a => a.plate); if (v.length) { const x = v[i % v.length]; run({ t: 'assetFuel', id: x.id, date: d, litres: 40 + (i % 30), km: (x.km || 10000) + 120 }, d); } }
    if (isWeekend(d) || i % 7 === 4) {
      const outs = activePeople(s).filter(p => !outBlock(s, d, p.id)).slice(0, Math.round(N * (isWeekend(d) ? 0.4 : 0.15)));
      run({ t: 'outs', date: d, changes: outs.map(p => ({ pid: p.id, from: null, to: 'OUT' as const })) }, d);
    }
  }
  return s;
}

const CADRE_RANKS = [['ΛΧΙΑΣ', 'Λοχίες'], ['ΕΠΧΙΑΣ', 'Επιλοχίες'], ['ΑΛΧΙΑΣ', 'Αρχιλοχίες'], ['ΑΝΘΛΓΟΣ', 'Ανθυπίλαρχοι-Ανθλγοι'], ['ΥΠΛΓΟΣ', 'Ανθυπίλαρχοι-Ανθλγοι'], ['ΙΛΧΟΣ', 'Ίλαρχοι']];
type Run = (c: Command, d: ISODate) => void;
function fullSetup(d: ISODate, run: Run, cur: () => AppState) {
  // 20 δικές μου υπηρεσίες: 1–2 νούμερα × 1–10 άτομα (ως 10, όπως επιτρέπει η επεξεργασία): ~100 θέσεις τη μέρα
  const ph = cur().settings.phase;
  for (let i = 0; i < 20; i++) run({ t: 'addBlock', phase: ph, name: 'ΥΠΗΡΕΣΙΑ ' + (i + 1), armed: i % 4 === 0, n: i % 3 === 2 ? 2 : 1, per: [1, 1, 2, 3, 10][i % 5], hrs: '' }, d);
  // στελέχη: 60, σε 2 ομάδες με 2 υπηρεσίες η καθεμία
  const cfg: Partial<CadreDutyCfg> = {
    groups: [{ id: 'gA', name: 'Αξιωματικοί', services: [{ id: 'aydm', name: 'ΑΥΔΜ', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }, { id: 'epop', name: 'ΕΠΟΠΤΗΣ', short: 'ΕΠ', perDay: 1, h24: true, hkCol: '' }] },
      { id: 'gB', name: 'Υπαξιωματικοί', services: [{ id: 'ypi', name: 'ΥΠΙ', short: 'ΥΠΙ', perDay: 2, h24: true, hkCol: '' }, { id: 'aym', name: 'ΑΥΜ', short: 'ΑΥΜ', perDay: 1, h24: false, hkCol: '', days: [0, 6] }] }],
    limits: { off: { base: 4, extra: 1 }, nco: { base: 5, extra: 1 } }, rest: 1, carry: true, fairHol: true
  };
  run({ t: 'setSettings', settings: { cadreDuty: cfg }, text: 'bench' }, d);
  for (let i = 0; i < 54; i++) { const [rank, hk] = CADRE_RANKS[i % CADRE_RANKS.length]; run({ t: 'saveCadre', cadre: { rank, hk, last: 'ΣΤΕΛΕΧΟΣ ' + String.fromCharCode(913 + (i % 24)) + i, first: 'ΟΝΟΜΑ', am: String(30000 + i * 17), active: true, weapon: i % 3 ? undefined : 'Π' + (7000 + i), wtype: i % 3 ? undefined : 'Μ1911 Α1' } as any }, d); }
  for (const c of cur().cadreList) run({ t: 'setCadreDutyOf', cid: c.id, person: { group: /ΛΓΟΣ|ΙΛΧΟΣ/.test(c.rank) ? 'gA' : 'gB', ...(c.id.endsWith('7') ? { noDow: [5] } : {}) } }, d);
  // μία υπηρεσία «Μόνο στελέχη», μόνιμα άτομα σε 3 θέσεις, όριο 10 υπηρεσίες τον μήνα
  run({ t: 'addBlock', phase: ph, name: 'ΑΞΚΟΣ ΥΠΗΡΕΣΙΑΣ', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'gA' }, d);
  const keys = postsOf(cur().settings).map(p => p.k).filter(k => !blocksOf(cur().settings).some(b => b.who === 'cadre' && b.posts.some(p => p.k === k)));
  run({ t: 'setSettings', settings: { fixed: { [keys[2]]: 11, [keys[5]]: 22, [keys[9]]: 33 } }, text: 'bench' }, d);
  run({ t: 'setRules', rules: { ...cur().rules, dutyMax: 10, dutyMaxPer: 'month' }, text: 'bench' }, d);
  // μητρώο: 600 εγγραφές (όπλα χωρίς κάτοχο, δεύτερα όπλα, υλικό με ποσότητα) και 20 οχήματα
  const people = cur().people;
  for (let i = 0; i < 600; i++) {
    const k = i % 6;
    const asset: any = k === 0 ? { cat: 'tyfekia', type: 'G3A3', no: String(5900000 + i), state: i % 50 === 0 ? 'repair' : 'ok', rack: 'Ε' + (i % 40 + 1) }
      : k === 1 ? { cat: 'pistolia', type: 'Μ1911 Α1', no: 'Π' + (9000 + i), holder: { k: 'person', pid: people[i % people.length].id }, state: 'ok' }
      : k === 2 ? { cat: 'polyvola', type: 'MG3A1', no: 'Π0' + (100 + i), state: 'ok', extra: { barrel: 'Κ' + i } }
      : k === 3 ? { cat: 'diopt', type: 'ΔΙΟΠΤΡΑ', no: 'Δ' + i, state: 'ok', holder: { k: 'unit', name: 'ΑΠΟΘΗΚΗ' } }
      : k === 4 ? { cat: 'asyrm', type: 'ΑΣΥΡΜΑΤΟΣ', no: 'Α' + i, state: 'ok', maint: { last: addDays(d, -(i % 200)), every: 6 } }
      : { cat: 'imatismos', type: 'ΧΛΑΙΝΗ', no: '', qty: 1 + (i % 40), state: 'ok' };
    run({ t: 'saveAsset', asset, date: d }, d);
  }
  for (let i = 0; i < 20; i++) run({ t: 'saveAsset', asset: { cat: i % 4 === 3 ? 'erpystr' : 'troxofora', type: i % 4 === 3 ? 'M113' : ['1/4 τόνου', 'ΜΑΝ 6t', 'HUMMER'][i % 3], no: 'ΟΧ' + (100 + i), plate: 'ΕΣ ' + (10000 + i * 7), km: 10000 + i * 900, state: i % 9 === 0 ? 'repair' : 'ok', maint: { last: addDays(d, -(i * 9)), every: 6 } } as any, date: d }, d);
}
// στην αρχή κάθε μήνα: αυτόματη συμπλήρωση του προγράμματος στελεχών (και των θέσεων «Μόνο στελέχη»), όπως το κουμπί της οθόνης
function cadreMonth(s: AppState, ym: string, run: Run, d: ISODate) {
  const f = autoFill(s, ym);
  if (f.add.length || f.seats?.length) run({ t: 'setCadreDuties', add: f.add, del: [], ...(f.seats?.length ? { seats: f.seats } : {}), text: 'αυτόματη ' + ym }, d);
}
