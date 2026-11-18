// Δυναμολόγιο ΑΛΛΗΣ μονάδας (phase 4): ανάγνωση, αντιστοίχιση, εγγραφή. FUZZ_N=200 npx vitest run test/roster-unit.test.ts για περισσότερα seeds (προεπιλογή 30).
// Αλήθεια ανά άτομο από τον γεννήτορα (mockgen.genUnitRoster). Ελέγχονται: 0 λάθος «σίγουρα», με προφίλ η ανάγνωση = αλήθεια,
// 0 εγγραφές εκτός αντιστοιχισμένων στηλών/γραμμών, τύποι και σύνοψη άθικτα, κανένα σβήσιμο, κύκλος εγγραφής-ανάγνωσης.
// REAL_TEMPLATES_DIR: μόνο στο τοπικό· τυπώνει ΜΟΝΟ αριθμούς για το DYNAMOLOGIO.xlsx.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Workbook } from '../src/main/xlsx';
import { safeWrite } from '../src/main/safeWrite';
import { genUnitRoster, type UnitRoster } from './mockgen';
import { DEFAULT_SETTINGS, emptyState, type AppState } from '../src/shared/domain';
import { apply, rosterChanges } from '../src/shared/commands';
import { parseRoster, type RawSheet } from '../src/shared/roster';
import { buildRosterModel, emptyRos, ownBinding, rosterNeeds, rosterProfileFrom, rosterTrial, readOwnRoster } from '../src/shared/rosterUnit';
import { planOwnWrite, ownSnap } from '../src/shared/rosterUnitWrite';
import { sanitizeProfiles, type RosterProfile } from '../src/shared/tplStore';
import { phraseKey } from '../src/shared/lexicon';
import { personVals, cellText } from '../src/shared/sources';

const N = Number(process.env.FUZZ_N || 30); const TODAY = '2026-11-10';
const settings = { ...DEFAULT_SETTINGS, mode: 'unit' } as AppState['settings'];
const load = async (g: UnitRoster) => { const wb = await Workbook.open(g.buf); const sheets: RawSheet[] = []; for (const n of wb.sheetNames()) { const fx = new Set<string>(); sheets.push({ name: n, rows: await wb.values(n, 2000, 200, fx), fx }); } return { wb, sheets }; };
const ctx = () => { let n = 0; return { today: TODAY, newId: () => 'x' + ++n }; };
const stat = { fuzz: 0, people: 0, cadre: 0, soldier: 0, asks: 0, sureCols: 0, wrongSure: 0, words: 0, wordSure: 0, writes: 0, outside: 0, refused: 0, news: 0 };

// το προφίλ που θα έφτιαχνε ο χρήστης: σειρά ονόματος, απαντήσεις βαθμών, ΙΛΗ → Λόχοι/Ίλες, λέξεις
function userProfile(g: UnitRoster): RosterProfile {
  const ros = emptyRos(g.master); if (g.mode === 'one') ros.order = 'last-first';
  for (const p of g.people) if (/ΔΝΕΑΣ/.test(p.rank) || /ΛΧΙΑΣ/.test(p.rank)) ros.ranks[p.rank.replace(/\(.*\)/, '').replace(/[^Α-Ω ]/g, ' ').replace(/\s+/g, ' ').trim()] = p.kind;
  for (const c of g.codes) ros.subs[phraseKey(c)] = 'ΙΛΗ ' + c.replace(/[^Α-Ω0-9]/g, '');
  for (const w of g.unknownWords) ros.status[phraseKey(w)] = 'ignore';
  return ros;
}
const withSubs = (g: UnitRoster) => ({ ...settings, lists: { subUnits: { add: g.codes.map(c => ({ name: 'ΙΛΗ ' + c.replace(/[^Α-Ω0-9]/g, '') })) } } }) as AppState['settings'];

describe('το δικό μας αρχείο διαβάζεται όπως πριν', () => {
  it('Δυναμολόγιο της εφαρμογής: ίδια ανάγνωση και δεν ζητά αντιστοίχιση', () => {
    const head = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Κινητό', 'Θάλαμος', 'Σ.Ι', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'];
    const rows = [['ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ'], head, ...Array.from({ length: 20 }, (_, i) => [i + 1, i % 5 ? 'ΣΤΡ' : 'ΛΧΙΑΣ', 'ΠΖ', 'ΑΛΦΑ' + String.fromCharCode(65 + i), 'ΒΗΤΑ', 'ΓΑΜΜΑ', '2' + i + '/1', '', (i % 4) + 1, 'Ι1', ''])];
    const sh: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: rows as never };
    const r = parseRoster([sh]); expect(r.rows.length).toBe(20); expect(r.rows[0].rank).toBe('ΛΧΙΑΣ');
    expect(rosterNeeds([sh], settings)).toBe(0);
  });
});

describe('ανάγνωση χωρίς προφίλ: 0 λάθος «σίγουρα»', () => {
  it('στήλες, βαθμοί, λέξεις, ΙΛΗ', async () => {
    for (let seed = 1; seed <= N; seed++) {
      const g = await genUnitRoster(seed); const { sheets } = await load(g); stat.fuzz++;
      const m = buildRosterModel({ settings: withSubs(g), people: [], sheets, ros: emptyRos() });
      expect(m.master, 'seed ' + seed).toBe(g.master);
      expect(m.sheets.find(v => v.name === g.abs)!.role).toBe('abs'); expect(m.sheets.find(v => v.name === g.pres)!.role).toBe('pres'); expect(m.sheets.find(v => v.name === g.summary)!.role).toBe('summary');
      // στήλες: σίγουρο = σωστή στήλη
      for (const c of m.cols) if (c.state === 'sure') { stat.sureCols++; const t = Object.entries(g.cols).find(([, i]) => i === c.c); if (!t || (t[0] !== c.role && !(t[0] === 'name' && c.role === 'last'))) { stat.wrongSure++; } }
      expect(m.cols.find(c => c.role === 'remarks')!.state, 'οι παρατηρήσεις μόνο πρόταση').not.toBe('sure');
      // βαθμοί: ό,τι δεν ρωτιέται έχει την αλήθεια
      const rd = m.read!; stat.people += rd.counts.people;
      for (const x of rd.persons) { const t = g.people.find(p => p.r === x.r)!; expect(t, 'seed ' + seed + ' row ' + x.r).toBeTruthy(); if (x.kind !== 'ask') { if (x.kind !== t.kind) stat.wrongSure++; stat.cadre += x.kind === 'cadre' ? 1 : 0; stat.soldier += x.kind === 'soldier' ? 1 : 0; } else stat.asks++; }
      expect(rd.counts.vacant).toBe(g.vacant);
      // λέξεις: οι άγνωστες δεν είναι ποτέ σίγουρες· οι σίγουρες έχουν σωστό νόημα
      for (const w of m.statusWords) { stat.words++; if (g.unknownWords.some(u => u.replace(/\s+/g, ' ').toLowerCase() === w.text.toLowerCase())) { if (w.state === 'sure') stat.wrongSure++; } if (w.state === 'sure') { stat.wordSure++; if (w.text === 'ΠΑΡΩΝ' && w.value !== 'present') stat.wrongSure++; if (w.text === 'ΑΠΑΛΛΑΓΗ' && w.value !== 'status:ΑΠΑΛΛΑΓΗ') stat.wrongSure++; } }
      // ΙΛΗ: οι κωδικοί δεν ταιριάζουν με τη λίστα· τίποτα σίγουρο
      expect(m.subWords.filter(w => w.state === 'sure').length).toBe(0);
    }
    expect(stat.wrongSure).toBe(0);
  }, 600000);
});

describe('με προφίλ: η ανάγνωση = αλήθεια', () => {
  it('στρατιώτες με όνομα, βαθμό, όπλο, ΙΛΗ· στελέχη εκτός· τίποτα δεν δημιουργείται μόνο του', async () => {
    for (let seed = 1; seed <= N; seed++) {
      const g = await genUnitRoster(seed); const { sheets } = await load(g); const st = withSubs(g);
      const rd = readOwnRoster(sheets.find(s => s.name === g.master)!, { settings: st, people: [], ros: userProfile(g) });
      const sold = g.people.filter(p => p.kind === 'soldier'); expect(rd.counts.cadre, 'seed ' + seed).toBe(g.people.length - sold.length); expect(rd.counts.ask).toBe(0);
      expect(rd.rows.length).toBe(sold.length);
      for (const t of sold) {
        const row = rd.persons.find(p => p.r === t.r)!.row!; expect(row.last).toBe(t.last); expect(row.first).toBe(t.first); expect(row.rank).toBe(t.app); expect(row.spec || '').toBe(t.arm);
        expect(row.sub).toBe('ΙΛΗ ' + t.code.replace(/[^Α-Ω0-9]/g, ''))
      }
    }
  }, 600000);
  it('οι άγνωστες λέξεις και ΙΛΗ δεν αλλάζουν τίποτα· η κατάσταση είναι πληροφορία', async () => {
    const g = await genUnitRoster(3); const { sheets } = await load(g);
    const ros = { ...userProfile(g), subs: {} };
    const rd = readOwnRoster(sheets.find(s => s.name === g.master)!, { settings: withSubs(g), people: [], ros });
    expect(rd.rows.every(r => r.sub === undefined)).toBe(true); expect(rd.unmappedSub).toBe(rd.rows.length);
    const s0 = emptyState(); const r = apply({ ...s0, settings: withSubs(g) }, { t: 'importPeople', rows: rd.rows, source: 'x', deactivateMissing: false }, ctx());
    expect(r.state.statuses.length).toBe(0);
  });
  it('προφίλ: αποθήκευση και φόρτωση', async () => {
    const g = await genUnitRoster(2); const { sheets } = await load(g); const ros = userProfile(g);
    const m = buildRosterModel({ settings: withSubs(g), people: [], sheets, ros }); const p = rosterProfileFrom(m, ros, null);
    expect(sanitizeProfiles([p])[0].ros).toEqual({ ...ros, sheet: g.master });
    expect(sanitizeProfiles([{ ...p, ros: 5 }])[0].ros).toBeUndefined();
  });
});

describe('εγγραφή πίσω', () => {
  it('μόνο αντιστοιχισμένες στήλες/γραμμές, τύποι και σύνοψη άθικτα, κανένα σβήσιμο, κύκλος', async () => {
    let did = 0;
    for (let seed = 1; seed <= Math.min(N, 20); seed++) {
      const g = await genUnitRoster(seed); const { wb, sheets } = await load(g); const st0 = withSubs(g); const ros = userProfile(g);
      const master = sheets.find(s => s.name === g.master)!;
      const prof = rosterProfileFrom(buildRosterModel({ settings: st0, people: [], sheets, ros }), ros, null);
      let state: AppState = { ...emptyState(), settings: { ...st0, tplProfiles: [prof] } };
      const rd = readOwnRoster(master, { settings: state.settings, people: [], ros }); const b = ownBinding(rd, 'x.xlsx');
      state = apply(state, { t: 'importPeople', rows: rd.rows, source: 'x', deactivateMissing: false }, ctx()).state;
      const snap = ownSnap(master, b, state.people);
      expect(Object.keys(snap).length).toBe(state.people.length);
      // αλλαγές στην εφαρμογή: ΙΛΗ και βαθμός ενός, νέος στρατιώτης, και ένας που άλλαξε το κελί του ο ίδιος ο χρήστης
      const [a, c] = state.people; const present = [...new Set(g.people.map(p => p.code))]; const mine = g.people.find(p => p.last === a.last)!.code;
      const alt = present.find(x => x !== mine); if (!alt) continue; const other = 'ΙΛΗ ' + alt.replace(/[^Α-Ω0-9]/g, '');
      const edited = { ...a, sub: other, rank: a.rank === 'ΣΤΡ' ? 'ΔΝΕΑΣ' : 'ΣΤΡ' };
      const fresh = { id: 900, rank: 'ΣΤΡ', spec: 'ΠΖ', last: 'ΝΕΟΣΥΝΤΑΧΘΕΙΣ', first: 'ΚΩΣΤΑΣ', father: '', asm: '', phone: '', room: null, si: '', post: null, role: null, essos: '', attached: false, active: true, notes: '', added: '2026-11-10', sub: other } as never;
      const tr = master.rows[g.people.find(p => p.last === c.last)!.r]; // ο χρήστης έγραψε δικό του κείμενο στο κελί βαθμού του c
      void tr;
      const mod = master.rows.map(r => [...(r || [])]); const cr = g.people.find(p => p.last === c.last)!.r; mod[cr][b.cols.rank] = 'ΔΙΚΟ ΜΟΥ ΚΕΙΜΕΝΟ';
      const sheet2: RawSheet = { ...master, rows: mod };
      state = { ...state, people: [...state.people.map(p => (p.id === a.id ? edited : p.id === c.id ? { ...p, rank: p.rank === 'ΣΤΡ' ? 'ΔΝΕΑΣ' : 'ΣΤΡ' } : p)), fresh] };
      const plan = planOwnWrite(sheet2, b, state, { snap }, TODAY, sheets);
      const recRows = new Set(g.people.map(p => p.r)); const mapped = new Set(Object.values(b.cols));
      const rep = await safeWrite(wb, plan.sets.map(x => ({ sheet: g.master, r: x.r, c: x.c, value: x.v as never })), { dataBoxes: plan.sets.map(x => ({ sheet: g.master, r1: x.r, c1: x.c, r2: x.r, c2: x.c })), margin: 60 });
      for (const x of plan.sets) { stat.writes++; const isNew = x.r > Math.max(...g.people.map(p => p.r)); if (!mapped.has(x.c) || !(recRows.has(x.r) || isNew) || master.fx?.has(x.r + ':' + x.c)) stat.outside++; expect(x.r).not.toBe(cr + 0 * 0 && x.r === cr && x.c === b.cols.rank ? x.r : -5); }
      expect(plan.sets.some(x => x.r === cr && x.c === b.cols.rank), 'δικό σου κείμενο μένει').toBe(false);
      expect(plan.conflicts!.length).toBeGreaterThan(0);
      stat.refused += rep.refused.length;
      // νέος: στην πρώτη κενή αριθμημένη γραμμή μετά τους ανθρώπους
      const nr = plan.sets.filter(x => x.c === b.cols.last || x.c === b.cols.first || x.c === b.cols.name); expect(nr.length).toBeGreaterThan(0); stat.news++;
      const lastP = Math.max(...g.people.map(p => p.r)); expect(Math.min(...nr.map(x => x.r))).toBe(lastP + 1);
      const out = await Workbook.open(await wb.save()); const after = await out.values(g.master, 2000, 200);
      // τίποτα εκτός σχεδίου δεν άλλαξε· καμία γραμμή δεν χάθηκε
      const planned = new Set(plan.sets.map(x => x.r + ':' + x.c));
      for (let r = 0; r < master.rows.length; r++) for (let cc = 0; cc < (master.rows[r] || []).length; cc++) if (!planned.has(r + ':' + cc)) expect(cellText(after[r]?.[cc]), 'seed ' + seed + ' ' + r + ':' + cc).toBe(cellText(master.rows[r][cc]));
      expect(g.people.every(p => cellText(after[p.r]?.[b.cols.aa]) !== '' )).toBe(true);
      // σύνοψη: ο τύπος μένει
      const sm = out.sheetNames().includes(g.summary); expect(sm).toBe(true);
      for (const ref of g.formulaCells) expect((await out.sheet(g.summary)).hasFormula(ref), ref).toBe(true);
      expect(plan.other!.length).toBe(0);
      // κύκλος: διαβάζοντας ξανά βρίσκουμε τα ίδια πρόσωπα με τις αλλαγές
      const rd2 = readOwnRoster({ name: g.master, rows: after }, { settings: state.settings, people: state.people, ros });
      const back = rd2.rows.find(r => r.last === a.last)!; expect(back.sub).toBe(other); expect(rd2.rows.some(r => r.last === 'ΝΕΟΣΥΝΤΑΧΘΕΙΣ')).toBe(true);
      // ό,τι έγραψε η εφαρμογή είναι με κεφαλαία
      for (const w of rep.written) if (typeof w.value === 'string') expect(w.value).toBe(w.value.toUpperCase());
      void personVals; did++;
    }
    expect(did).toBeGreaterThan(0); expect(stat.outside).toBe(0);
  }, 600000);
  it('λίστες απόντων / παρόντων: μόνο αν τσεκαριστούν, μόνο κατάσταση και ΙΛΗ, χωρίς μετακίνηση γραμμών', async () => {
    const g = await genUnitRoster(4); const { sheets } = await load(g); const st0 = withSubs(g); const ros = { ...userProfile(g), roles: { [g.abs]: 'abs', [g.pres]: 'pres' } as RosterProfile['roles'] };
    const master = sheets.find(s => s.name === g.master)!;
    const prof = rosterProfileFrom(buildRosterModel({ settings: st0, people: [], sheets, ros }), ros, null);
    let state: AppState = { ...emptyState(), settings: { ...st0, tplProfiles: [prof] } };
    const rd = readOwnRoster(master, { settings: state.settings, people: [], ros }); const b = ownBinding(rd, 'x.xlsx');
    state = apply(state, { t: 'importPeople', rows: rd.rows, source: 'x', deactivateMissing: false }, ctx()).state;
    const snap = ownSnap(master, b, state.people);
    const off = planOwnWrite(master, b, state, { snap }, TODAY, sheets); expect(off.other!.length).toBe(0);
    const on = { ...state, settings: { ...state.settings, tplProfiles: [{ ...prof, ros: { ...prof.ros!, roles: ros.roles, refill: [g.abs, g.pres] } }] } };
    const p1 = planOwnWrite(master, b, on, { snap }, TODAY, sheets);
    for (const x of p1.other!) { const sh = sheets.find(s => s.name === x.sheet)!; expect([g.abs, g.pres]).toContain(x.sheet); expect(sh.fx?.has(x.r + ':' + x.c) ?? false).toBe(false); }
  });
});

const dir = process.env.REAL_TEMPLATES_DIR;
describe.skipIf(!dir || !fs.existsSync(path.join(dir || '', 'DYNAMOLOGIO.xlsx')))('αρχείο μονάδας (τοπικό, μόνο αριθμοί)', () => {
  it('DYNAMOLOGIO.xlsx', async () => {
    const buf = fs.readFileSync(path.join(dir!, 'DYNAMOLOGIO.xlsx')); const wb = await Workbook.open(buf); const sheets: RawSheet[] = [];
    const t0 = Date.now(); for (const n of wb.sheetNames()) { const fx = new Set<string>(); sheets.push({ name: n, rows: await wb.values(n, 2000, 200, fx), fx }); }
    const t1 = Date.now(); const m = buildRosterModel({ settings, people: [], sheets, ros: emptyRos() }); const t2 = Date.now();
    const cnt = (k: string) => m.cols.filter(c => c.state === k).length; const rd = m.read!;
    console.log('REAL φύλλα: ' + m.sheets.map((v, i) => 'φύλλο' + (i + 1) + '=' + v.role + '/' + v.people).join(' ') + ' | στήλες σίγουρες=' + cnt('sure') + ' προτάσεις=' + cnt('suggest') + ' άγνωστες=' + cnt('unknown')
      + ' | άτομα=' + rd.counts.people + ' στελέχη=' + rd.counts.cadre + ' στρατιώτες=' + rd.counts.soldier + ' ρωτάω=' + rd.counts.ask + ' θέσεις=' + rd.counts.vacant
      + ' | λέξεις κατάστασης=' + m.statusWords.length + ' (σίγουρες ' + m.statusWords.filter(w => w.state === 'sure').length + ', άγνωστες ' + m.statusWords.filter(w => w.state === 'unknown').length + ') ΙΛΗ τιμές=' + m.subWords.length
      + ' | ms ανάγνωση=' + (t1 - t0) + ' μοντέλο=' + (t2 - t1));
    const tr = rosterTrial({ settings, sheets, ros: emptyRos(), state: emptyState(), rosterChanges }); console.log('REAL δοκιμή: προς εισαγωγή=' + tr.add + ' παράγωγες λίστες=' + tr.derived.length);
    expect(rd.counts.people).toBeGreaterThan(0);
  }, 120000);
});

describe('αναφορά', () => { it('πίνακας', () => { console.log('ROSTER-UNIT ' + JSON.stringify(stat)); expect(stat.wrongSure).toBe(0); }); });
