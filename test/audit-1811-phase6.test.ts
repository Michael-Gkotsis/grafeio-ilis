// Έλεγχος 18/11, φάση 6: Σ11 στήλες/χωρισμός Έντυπων, Σ13 ΑΥΔΜ και Ιλχος της ΗΔ από το πρόγραμμα στελεχών, Σ14 υπενθυμίσεις του Σήμερα,
// Σ15 Ctrl+K και οδηγός, Σ16 Άγνοια/Λιποταξία/Αδικαιολόγητη απουσία στο Excel της μονάδας και άδειες στελεχών σε δικές σου στήλες της ΗΚΑΙ.
// Μόνο ψεύτικα ονόματα. Κάθε έλεγχος έχει και «ό,τι υπήρχε μένει ίδιο».
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { AppState, Asset, Cadre, CadreDutyCfg, Person, Status } from '../src/shared/domain';
import { FIELDS, SPLITS, SPLIT_NOUN, DATE_FIELDS, fieldValue, groupOf, groupsOf } from '../src/shared/reports';
import { hdAuto, hdDocOf, hdRosterOn, hdTags, cadreTxt } from '../src/shared/hd';
import { cadreDutyGaps, maintDueRows } from '../src/shared/reminders';
import { assetView } from '../src/shared/assets';
import { hkaiCadreLeaveLines, hkaiLeaveLines, lineText } from '../src/shared/hkaiText';
import { apply, type Command } from '../src/shared/commands';
import { quotaBalances, apalLeft } from '../src/shared/cadreBalance';
import { baseOf, diffStatuses, KIND, parseStatuses, planWrite, typeOfValue, fieldValue as srcValue, type SourceBinding } from '../src/shared/sources';
import type { RawSheet } from '../src/shared/roster';
import { GUIDE } from '../src/renderer/guideText';
import { GUIDE_TITLES } from '../src/renderer/guideTopic';
import { fakeState } from './fixtures';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'z' + ++n }).state;
const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', f), 'utf8');

const CFG: Partial<CadreDutyCfg> = {
  groups: [
    { id: 'g1', name: 'ΑΥΔΜ', services: [{ id: 's1', name: 'ΑΥΔΜ', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: 'yp' }] },
    { id: 'g2', name: 'Ίλαρχος', services: [{ id: 's2', name: 'Ίλαρχος εβδομάδας', short: 'ΙΛΧ', perDay: 1, h24: true, hkCol: '' }, { id: 's3', name: 'Πύλη', short: 'Π', perDay: 1, h24: true, hkCol: 'yp' }] }
  ],
  limits: { off: { base: 3, extra: 1 }, nco: { base: 4, extra: 1 } }, rest: 1, carry: true, fairHol: true
};
const cad = (id: string, last: string): Cadre => ({ id, rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last, first: 'ΟΝΟΜΑ', active: true } as Cadre);
function withRoster(): AppState {
  let s = fakeState(10);
  s = run(s, { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
  s = { ...s, cadreList: [cad('c1', 'ΑΛΦΑ'), cad('c2', 'ΒΗΤΑ'), cad('c3', 'ΓΑΜΜΑ')] };
  s.cadreDuties = [{ id: 'd1', date: D, svc: 's1', cid: 'c1' }, { id: 'd2', date: D, svc: 's2', cid: 'c2' }, { id: 'd3', date: D, svc: 's3', cid: 'c3' }];
  return s;
}

describe('Σ11: στήλες και χωρισμός στα Έντυπα', () => {
  it('οι νέες στήλες υπάρχουν στο είδος των ατόμων, των καταστάσεων και του κενού πίνακα· των στελεχών οι δικές τους', () => {
    for (const k of ['people', 'status', 'duty', 'weapon', 'wmove', 'blank'] as const) for (const f of ['sub', 'inOn', 'disch']) expect(FIELDS[k].some(x => x.k === f), k + '.' + f).toBe(true);
    for (const f of ['cduty', 'cleave', 'capal']) { expect(FIELDS.cadre.some(x => x.k === f), f).toBe(true); expect(FIELDS.blank.some(x => x.k === f), 'blank.' + f).toBe(true); }
    expect(DATE_FIELDS.has('inOn')).toBe(true); expect(DATE_FIELDS.has('aret')).toBe(true);
  });
  it('οι παλιές στήλες μένουν όλες, με την ίδια σειρά', () => {
    const old = ['aa', 'rank', 'rank1', 'origin', 'spec', 'name', 'who', 'last', 'first', 'father', 'asm', 'phone', 'room', 'unit', 'si', 'dcode', 'absent', 'areason', 'aret', 'email', 'relEmail', 'blood', 'iban', 'amka', 'afm', 'religion', 'post', 'role', 'essos', 'dn', 'weapon', 'wtype', 'rack', 'wpos', 'status', 'duty', 'notes', 'combo', 'blank', 'text'];
    const now = FIELDS.people.map(x => x.k).filter(k => !['sub', 'inOn', 'disch'].includes(k));
    expect(now.filter(k => old.includes(k))).toEqual(old.filter(k => now.includes(k)));
    expect(old.every(k => now.includes(k))).toBe(true);
  });
  it('Λόχος/Ίλη, ημερομηνία εισαγωγής dd/mm/yyyy και απόλυση περίπου, με κεφαλαία· κενά όταν δεν υπάρχουν', () => {
    const s = fakeState(6); const p = s.people[0] as Person;
    p.sub = '4η Ίλη'; p.inOn = '2026-03-09'; p.essos = '2026 Γ΄';
    expect(fieldValue(s, 'people', p, 'sub', 0, D)).toBe('4Η ΙΛΗ');
    expect(fieldValue(s, 'people', p, 'inOn', 0, D)).toBe('09/03/2026');
    expect(fieldValue(s, 'people', p, 'disch', 0, D)).toBe('ΑΥΓΟΥΣΤΟΣ 2027');
    p.serve = 9; expect(fieldValue(s, 'people', p, 'disch', 0, D)).toBe('ΜΑΙΟΣ 2027');
    const q = s.people[1] as Person; q.sub = undefined; q.inOn = undefined; q.essos = '';
    expect([fieldValue(s, 'people', q, 'sub', 0, D), fieldValue(s, 'people', q, 'inOn', 0, D), fieldValue(s, 'people', q, 'disch', 0, D)]).toEqual(['', '', '']);
    // και σε είδος με μία γραμμή ανά κατάσταση
    const st: Status = { id: 'x', pid: p.id, type: 'EA', from: D, to: D };
    expect(fieldValue(s, 'status', { p, st } as never, 'sub', 0, D)).toBe('4Η ΙΛΗ');
  });
  it('στελέχη: υπηρεσία της μέρας από το πρόγραμμα, υπόλοιπο άδειας και απαλλαγές', () => {
    const s = withRoster(); const c = s.cadreList[0];
    expect(fieldValue(s, 'cadre', c, 'cduty', 0, D)).toBe('ΑΥΔΜ');
    expect(fieldValue(s, 'cadre', c, 'cduty', 0, '2026-11-18')).toBe('');
    const left = quotaBalances(s, c.id, 2026).reduce((a, b) => a + b.left, 0);
    expect(left).toBe(40); expect(fieldValue(s, 'cadre', c, 'cleave', 0, D)).toBe(40);
    const s2 = { ...s, cadreAbs: [{ id: 'a1', cid: 'c1', kind: 'ka', from: '2026-11-02', to: '2026-11-06' }] };
    expect(fieldValue(s2, 'cadre', c, 'cleave', 0, D)).toBe(35);
    expect(fieldValue(s, 'cadre', c, 'capal', 0, D)).toBe(apalLeft(s, c, 2026, D));
    expect(fieldValue(s, 'cadre', c, 'capal', 0, D)).toBe(1);
  });
  it('χωρισμός ανά λόχο: ομάδες με σειρά, «χωρίς λόχο» στο τέλος· οι παλιοί χωρισμοί ίδιοι', () => {
    expect(SPLITS.map(x => x.value)).toEqual(['none', 'room', 'unit', 'si', 'sub']);
    expect(SPLITS.find(x => x.value === 'sub')!.label).toBe('Ανά λόχο'); expect(SPLIT_NOUN.sub).toEqual(['λόχο', 'λόχους']);
    const s = fakeState(8); const ps = s.people as Person[];
    ps[0].sub = '2ος Λόχος'; ps[1].sub = '1ος Λόχος'; ps[2].sub = '2ος Λόχος'; ps[3].sub = undefined;
    const g = groupsOf(s, 'people', ps.slice(0, 4), 'sub');
    expect(g.map(x => [x.label, x.rows.length])).toEqual([['1ΟΣ ΛΟΧΟΣ', 1], ['2ΟΣ ΛΟΧΟΣ', 2], ['ΧΩΡΙΣ ΛΟΧΟ', 1]]);
    expect(groupOf(s, ps[0], 'sub').short).toBe('2ΟΣ ΛΟΧΟΣ');
    ps[4].si = 'Ι1'; expect(groupOf(s, ps[4], 'si')).toMatchObject({ key: 'Ι1', label: 'Ι1' });
    expect(groupOf(s, ps[4], 'room').label).toBe(ps[4].room == null ? 'ΧΩΡΙΣ ΘΑΛΑΜΟ' : 'ΘΑΛΑΜΟΣ ' + ps[4].room);
  });
});

describe('Σ13: ΑΥΔΜ και Ιλχος της ΗΔ από το πρόγραμμα στελεχών', () => {
  it('κενά πεδία παίρνουν τον ΑΥΔΜ και τον Ίλαρχο της μέρας, με όνομα υπηρεσίας (όχι άλλες υπηρεσίες)', () => {
    const s = withRoster(); const doc = hdAuto(s, D);
    expect(doc.aydm).toBe(cadreTxt(s.cadreList[0])); expect(doc.ilxos).toBe(cadreTxt(s.cadreList[1]));
    expect(hdRosterOn(s, D)).toEqual({ aydm: cadreTxt(s.cadreList[0]), ilxos: cadreTxt(s.cadreList[1]) });
    const t = hdTags(s.settings, D, doc, []);
    expect(t['ΑΥΔΜ']).toBe('ΛΧΙΑΣ ΑΛΦΑ ΟΝΟΜΑ'); expect(t['ΙΛΧΟΣ']).toBe('ΛΧΙΑΣ ΒΗΤΑ ΟΝΟΜΑ');
  });
  it('ό,τι γράφτηκε με το χέρι στη ΗΔ της μέρας νικά', () => {
    let s = withRoster(); const doc = hdAuto(s, D); doc.aydm = 'ΧΕΙΡΟΚΙΝΗΤΟΣ ΑΥΔΜ'; doc.ilxos = 'ΧΕΙΡΟΚΙΝΗΤΟΣ ΙΛΧΟΣ';
    s = run(s, { t: 'setHd', date: D, doc });
    expect(hdDocOf(s, D).aydm).toBe('ΧΕΙΡΟΚΙΝΗΤΟΣ ΑΥΔΜ'); expect(hdDocOf(s, D).ilxos).toBe('ΧΕΙΡΟΚΙΝΗΤΟΣ ΙΛΧΟΣ');
    // και η μέρα μετά δεν έχει πρόγραμμα: αντιγράφεται η προηγούμενη ΗΔ όπως πάντα
    expect(hdAuto(s, '2026-11-18').aydm).toBe('ΧΕΙΡΟΚΙΝΗΤΟΣ ΑΥΔΜ');
  });
  it('χωρίς πρόγραμμα (ή μέρα χωρίς αυτές τις υπηρεσίες) η ΗΔ βγαίνει όπως πριν', () => {
    const s0 = fakeState(10); const a = hdAuto(s0, D);
    expect([a.aydm, a.ilxos]).toEqual(['', '']);
    const s = withRoster(); const b = hdAuto(s, '2026-11-18');
    expect([b.aydm, b.ilxos]).toEqual(['', '']);
    // υπηρεσίες χωρίς αυτά τα ονόματα (μόνο Πύλη): τίποτα
    const s2 = { ...s, cadreDuties: [{ id: 'd3', date: D, svc: 's3', cid: 'c3' }] };
    expect([hdAuto(s2, D).aydm, hdAuto(s2, D).ilxos]).toEqual(['', '']);
    expect(hdRosterOn(s2, D)).toEqual({ aydm: '', ilxos: '' });
  });
  it('όταν υπάρχει πρόγραμμα, νικά το αντίγραφο της προηγούμενης ΗΔ', () => {
    let s = withRoster(); const prev = hdAuto(s, '2026-11-16'); prev.aydm = 'ΠΑΛΙΟΣ ΑΥΔΜ'; s = run(s, { t: 'setHd', date: '2026-11-16', doc: prev });
    expect(hdAuto(s, D).aydm).toBe(cadreTxt(s.cadreList[0]));
  });
});

describe('Σ14: υπενθυμίσεις του Σήμερα', () => {
  const asset = (id: string, cat: string, next: string | undefined, extra: Partial<Asset> = {}): Asset => ({ id, cat, type: 'ΤΥΠΟΣ', no: 'ΑΡ' + id, state: 'ok', ...(next ? { maint: { next } } : {}), ...extra });
  it('συντήρηση που έληξε ή λήγει: ίδια λογική με το φίλτρο «Συντήρηση σε N μέρες» του Μητρώου', () => {
    const s = fakeState(6);
    const s1: AppState = { ...s, assets: [asset('v1', 'troxofora', '2026-11-10'), asset('v2', 'troxofora', '2026-11-30'), asset('v3', 'troxofora', '2027-06-01'), asset('v4', 'troxofora', undefined)] };
    const rows = maintDueRows(s1, D);
    expect(rows.map(x => [x.row.a.id, x.overdue])).toEqual([['v1', true], ['v2', false]]);
    // όποια είδη μετρά το φίλτρο 'due' του Μητρώου (όπλα/υλικό), τα ίδια μετρά και το Σήμερα
    const matCat = (s1.settings.assets?.cats || []).find(c => c.kind === 'material')?.id;
    const catId = matCat || 'ylika';
    const s2: AppState = { ...s, assets: [asset('m1', catId, '2026-11-01'), asset('m2', catId, '2026-12-05'), asset('m3', catId, '2026-12-30')] };
    const due = assetView(s2, { filter: 'due', q: '' }, D).map(r => r.a.id);
    expect(maintDueRows(s2, D).filter(x => x.row.cat?.kind !== 'vehicle').map(x => x.row.a.id)).toEqual(due);
    expect(maintDueRows(fakeState(6), D)).toEqual([]);
  });
  it('οχήματα: και τα χιλιόμετρα μετρούν, όπως στην οθόνη Οχήματα', () => {
    const s = fakeState(6);
    const s1: AppState = { ...s, assets: [asset('k1', 'troxofora', '2027-06-01', { km: 10000, maint: { next: '2027-06-01', nextKm: 10100 } })] };
    expect(maintDueRows(s1, D).map(x => x.row.a.id)).toEqual(['k1']);
  });
  it('υπηρεσίες στελεχών χωρίς κανέναν αύριο: μόνο αν έχουν οριστεί υπηρεσίες', () => {
    const s = withRoster();
    expect(cadreDutyGaps(s, D)).toEqual([]);
    expect(cadreDutyGaps(s, '2026-11-18').map(v => v.id)).toEqual(['s1', 's2', 's3']);
    expect(cadreDutyGaps({ ...s, cadreDuties: [s.cadreDuties![0]] }, D).map(v => v.id)).toEqual(['s2', 's3']);
    expect(cadreDutyGaps(fakeState(6), D)).toEqual([]);   // πρόγραμμα που δεν χρησιμοποιείται
  });
  it('η οθόνη έχει τις εργασίες με πλοήγηση', () => {
    const t = src('screens/other.ts');
    expect(t).toMatch(/key: 'cduty'[^\n]*nav\.go\('cadre', \{ cview: 'duty'/);
    expect(t).toMatch(/nav\.go\('vehicles'\)/); expect(t).toMatch(/nav\.go\('weapons', \{ wtab: 'mitroo' \}\)/);
  });
});

describe('Σ15: Ctrl+K και οδηγός', () => {
  const tabs = [...src('screens/settings.ts').match(/const SET_SECTIONS[^;]+;/)![0].matchAll(/\['(\w+)', '/g)].map(m => m[1]);
  const other = src('screens/other.ts');
  const palette = other.slice(other.indexOf('export function CommandPalette'));
  it('κάθε νέα εντολή υπάρχει και πάει σε ενότητα που υπάρχει', () => {
    const want: [string, RegExp][] = [
      ['Μητρώο', /Μητρώο οπλισμού και υλικού'[^\n]*wtab: 'mitroo'/], ['Υπηρεσίες στελεχών', /Υπηρεσίες στελεχών \(πρόγραμμα μήνα\)'[^\n]*cview: 'duty'/], ['Πρόγραμμα', /Πρόγραμμα αδειών'[^\n]*cview: 'plan'/],
      ['Άδειες στελεχών', /Άδειες και απαλλαγές στελεχών'[^\n]*tab: 'unit'/], ['Επικεφαλίδες', /Επικεφαλίδες εγγράφων'[^\n]*tab: 'heads'/], ['Ονόματα αρχείων', /Ονόματα αρχείων'[^\n]*tab: 'names'/],
      ['Δικές μου στήλες', /Δικές μου στήλες '[^\n]*tab: 'unit'/], ['Αντιστοίχιση', /Αντιστοίχιση προτύπου'[^\n]*tab: 'files'/], ['Κινήσεις δύναμης', /Κινήσεις δύναμης[^\n]*tab: 'esso'/]
    ];
    for (const [n, re] of want) expect(palette, n).toMatch(re);
    for (const t of ['unit', 'heads', 'names', 'files', 'esso', 'cadreDuty', 'assets']) expect(tabs).toContain(t);
  });
  it('οι τίτλοι των εντολών είναι μοναδικοί', () => {
    const titles = [...palette.matchAll(/\{ t: '([^']+)'/g)].map(m => m[1]);
    expect(new Set(titles).size).toBe(titles.length);
  });
  it('οδηγός: τρία νέα θέματα, ίδια με τους τίτλους του Ctrl+K, με σύνδεσμους που υπάρχουν', () => {
    for (const id of ['adik', 'tplmap', 'moves']) { expect(GUIDE.some(t => t.id === id), id).toBe(true); expect(GUIDE_TITLES.some(([i]) => i === id)).toBe(true); }
    const adik = GUIDE.find(t => t.id === 'adik')!.body;
    expect(adik).toMatch(/Άγνοια/); expect(adik).toMatch(/Λιποταξία/); expect(adik).toMatch(/Αδικαιολόγητη απουσία/);
  });
});

describe('Σ16α: Άγνοια, Λιποταξία, Αδικαιολόγητη απουσία στο Excel της μονάδας', () => {
  const s0 = fakeState(6); const [a, b2, c] = s0.people as Person[];
  const bind: SourceBinding = { file: 'x.xlsx', sheet: 'Ν', header: 0, cols: { last: 0, first: 1, where: 2, from: 3, to: 4, note: 5 }, write: true };
  const head: RawSheet = { name: 'Ν', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΣΑΓΩΓΗ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ']] };
  const mk = (): AppState => ({ ...s0, statuses: [
    { id: 't1', pid: a.id, type: 'AGN', from: '2026-11-10', to: '2026-11-20' }, { id: 't2', pid: b2.id, type: 'LIP', from: '2026-11-11', to: '2026-11-25', note: 'ΕΝΗΜΕΡΩΘΗΚΕ Ο ΔΚΤΗΣ' },
    { id: 't3', pid: c.id, type: 'ADK', from: '2026-11-12', to: '2026-11-12' }
  ] });
  // εφαρμόζει το σχέδιο εγγραφής σε φύλλο (τιμές ημερομηνίας → Date, όπως τις διαβάζει η εφαρμογή)
  function applyPlan(sheet: RawSheet, plan: ReturnType<typeof planWrite>): RawSheet {
    const rows = sheet.rows.map(r => [...r]);
    for (const x of plan.sets) { while (rows.length <= x.r) rows.push([]); const v: unknown = x.v; rows[x.r][x.c] = v && typeof v === 'object' && 'date' in v ? new Date((v as { date: string }).date + 'T00:00:00Z') : (v as never); }
    return { name: sheet.name, rows };
  }
  it('είναι στα είδη του φύλλου νοσοκομείου και αναγνωρίζονται από τη λέξη τους', () => {
    expect(KIND.hospital.types).toEqual(['NOS', 'SICK', 'AGN', 'LIP', 'ADK']);
    expect(typeOfValue('hospital', 'ΑΓΝΟΙΑ')).toBe('AGN'); expect(typeOfValue('hospital', 'Σε λιποταξία')).toBe('LIP'); expect(typeOfValue('hospital', 'ΑΔΙΚΑΙΟΛΟΓΗΤΗ ΑΠΟΥΣΙΑ')).toBe('ADK');
    // ό,τι ήταν ίδιο μένει ίδιο
    expect(typeOfValue('hospital', '401 ΓΣΝΑ')).toBe('NOS'); expect(typeOfValue('hospital', 'ΑΝ.ΑΔ')).toBe('SICK'); expect(typeOfValue('hospital', 'ΝΟΣΟΚΟΜΕΙΟ')).toBe('NOS');
    const nos = { id: 'n', pid: a.id, type: 'NOS', from: D, to: D } as Status;
    expect(srcValue('where', 'hospital', nos, a, bind)).toBe('ΝΟΣΟΚΟΜΕΙΟ'); expect(srcValue('where', 'hospital', { ...nos, type: 'SICK' } as Status, a, bind)).toBe('ΑΝ.ΑΔ');
    expect(srcValue('where', 'hospital', { ...nos, type: 'LIP' } as Status, a, bind)).toBe('ΛΙΠΟΤΑΞΙΑ');
  });
  it('γράφονται στο φύλλο και διαβάζονται πίσω ως οι ίδιοι τύποι, χωρίς διπλές ή χαμένες εγγραφές', () => {
    const s = mk(); const plan = planWrite('hospital', head, bind, s, [], D);
    expect(plan.added).toBe(3);
    const sheet = applyPlan(head, plan);
    expect(sheet.rows.slice(1).map(r => r[2]).sort()).toEqual(['ΑΓΝΟΙΑ', 'ΑΔΙΚΑΙΟΛΟΓΗΤΗ ΑΠΟΥΣΙΑ', 'ΛΙΠΟΤΑΞΙΑ']);
    const parsed = parseStatuses('hospital', sheet, bind, s.people, D);
    expect(parsed.cands.map(x => x.type).sort()).toEqual(['ADK', 'AGN', 'LIP']);
    // ίδια εφαρμογή: τίποτα νέο, τίποτα αλλαγμένο
    const d = diffStatuses('hospital', s, parsed, bind, {}, plan.keys, baseOf('hospital', s, plan.keys));
    expect(d.add).toEqual([]); expect(d.update).toEqual([]); expect(d.same).toBe(3); expect(d.appOnly).toEqual([]); expect(d.dup).toEqual([]);
    // δεύτερη εγγραφή στο ίδιο φύλλο: δεν προστίθεται τίποτα
    const plan2 = planWrite('hospital', sheet, bind, s, plan.keys, D);
    expect(plan2.added).toBe(0); expect(plan2.sets).toEqual([]);
  });
  it('άδεια εφαρμογή: το Excel τις φέρνει με τους σωστούς τύπους και χωρίς αποθηκευμένη λέξη', () => {
    const s = mk(); const sheet = applyPlan(head, planWrite('hospital', head, bind, s, [], D));
    const empty: AppState = { ...s, statuses: [] };
    const d = diffStatuses('hospital', empty, parseStatuses('hospital', sheet, bind, empty.people, D), bind);
    expect(d.add.map(x => [x.pid, x.type, x.from, x.kind])).toEqual(expect.arrayContaining([[a.id, 'AGN', '2026-11-10', undefined], [b2.id, 'LIP', '2026-11-11', undefined], [c.id, 'ADK', '2026-11-12', undefined]]));
    expect(d.add).toHaveLength(3); expect(d.add.find(x => x.type === 'LIP')!.note).toBe('ΕΝΗΜΕΡΩΘΗΚΕ Ο ΔΚΤΗΣ');
    // ο γύρος: εφαρμογή → Excel → εφαρμογή δίνει τις ίδιες καταστάσεις
    const back = apply(empty, { t: 'importRecords', adds: d.add, updates: [], source: 'x', what: 'νοσοκομείο' }, { today: D, newId: () => 'r' + ++n }).state;
    expect(back.statuses.map(x => [x.pid, x.type, x.from, x.to]).sort()).toEqual(mk().statuses.map(x => [x.pid, x.type, x.from, x.to]).sort());
  });
  it('ο Νοσοκομείο/ΑΝ.ΑΔ δεν αλλάζει: γράφεται και διαβάζεται όπως πριν', () => {
    const s: AppState = { ...s0, statuses: [{ id: 'n1', pid: a.id, type: 'NOS', from: '2026-11-10', to: '2026-11-12' }, { id: 'n2', pid: b2.id, type: 'SICK', from: '2026-11-11', to: '2026-11-13' }] };
    const plan = planWrite('hospital', head, bind, s, [], D); const sheet = applyPlan(head, plan);
    expect(sheet.rows.slice(1).map(r => r[2]).sort()).toEqual(['ΑΝ.ΑΔ', 'ΝΟΣΟΚΟΜΕΙΟ']);
    const d = diffStatuses('hospital', s, parseStatuses('hospital', sheet, bind, s.people, D), bind, {}, plan.keys, baseOf('hospital', s, plan.keys));
    // όπως πριν: το κείμενο «ΝΟΣΟΚΟΜΕΙΟ» / «ΑΝ.ΑΔ» που γράφει η εφαρμογή γίνεται το είδος της εγγραφής στην πρώτη ανάγνωση (δεν αλλάζει τίποτα άλλο)
    expect(d.add).toEqual([]); expect(d.update.map(u => Object.keys(u.patch))).toEqual([['kind'], ['kind']]);
  });
});

describe('Σ16β: άδεια στελέχους σε δική σου στήλη «Απόντες» στο 3. ΑΔΕΙΕΣ', () => {
  const mkS = (col: string, group: 'abs' | 'kol' = 'abs'): AppState => {
    let s = fakeState(6);
    s = run(s, { t: 'setHkCols', cols: [{ name: 'Δική στήλη', grp: group }] });
    const lists = { ...(s.settings.lists || {}), cadreAbs: { add: [{ name: 'Δική απουσία', col }] } };
    s = { ...s, settings: { ...s.settings, lists }, hkaiManual: { [D]: { cells: {}, text: {}, lv: true } } as never };
    s.cadreList = [{ id: 'c1', rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΑΛΦΑ', first: 'ΟΝΟΜΑ', active: true } as Cadre, { id: 'c2', rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΒΗΤΑ', first: 'ΟΝΟΜΑ', active: true } as Cadre];
    s.cadreAbs = [{ id: 'a1', cid: 'c1', kind: 'Δική απουσία', from: D, to: '2026-11-19' }, { id: 'a2', cid: 'c2', kind: 'ka', from: D, to: '2026-11-19' }];
    return s;
  };
  it('στήλη της ομάδας Απόντες: μπαίνει όπως η Κ.Άδ.', () => {
    const s = mkS('u1'); const t = hkaiLeaveLines(s, D).map(lineText);
    expect(t).toHaveLength(2); expect(t.some(x => x.includes('ΑΛΦΑ'))).toBe(true); expect(t.some(x => x.includes('ΒΗΤΑ'))).toBe(true);
    expect(hkaiCadreLeaveLines(s, D)).toHaveLength(2);
  });
  it('στήλη της ομάδας Κωλυόμενοι, βασική στήλη εκτός Κ.Άδ./Ειδ./Αναρ. ή χωρίς στήλη: όπως πριν (δεν μπαίνει)', () => {
    for (const [col, g] of [['u1', 'kol'], ['nos', 'abs'], ['yp', 'abs'], ['', 'abs']] as const) {
      const s = mkS(col, g); const t = hkaiLeaveLines(s, D).map(lineText);
      expect(t, col + g).toHaveLength(1); expect(t[0]).toContain('ΒΗΤΑ');
    }
  });
});
