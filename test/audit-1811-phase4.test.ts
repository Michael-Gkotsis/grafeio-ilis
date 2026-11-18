// Έλεγχος 18/11, φάση 4: Απόσπαση μένει σε δύναμη ως απών (Σ12), δύο λίστες τύπων όπλων (Σ7), δεύτερα όπλα στην Κατάσταση οπλισμού (Σ8),
// προειδοποίηση όταν βγαίνει εκτός δύναμης κάποιος με χρεωμένα (Σ9). Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fillOuts } from '../src/main/exports';
import { weaponsBook } from '../src/main/excel';
import { Workbook } from '../src/main/xlsx';
import { ADIK_APS_TYPES, ADIK_GROUPS, ADIK_TYPES, TYPES, adikGroupOf, type AppState, type Asset, type Status, type TypeKey } from '../src/shared/domain';
import { DAY_GROUPS, dayBook } from '../src/shared/outsDay';
import { awayName } from '../src/shared/outsStay';
import { activePeople, hkMin, hkaiCounts, strengthOf } from '../src/shared/rules';
import { hkaiAdikLines, lineText } from '../src/shared/hkaiText';
import { autoCell } from '../src/shared/imer';
import { assetCfgOf, assetSheets, assetView, catOfType, heldWarn, registry, typeCatId } from '../src/shared/assets';
import { secondText, secondWeapons, weaponInfo, weaponSheets } from '../src/shared/weapons';
import { addDays } from '../src/shared/dates';
import { genState, DAYS } from './outs-gen';
import { fakeState } from './fixtures';

const TODAY = '2026-11-13';
let n = 0;
const ctx = (today = TODAY): Ctx => ({ today, newId: () => 'p4' + ++n });
const run = (s: AppState, c: Command, today = TODAY) => apply(s, c, ctx(today)).state;
const unit = (s: AppState): AppState => run(s, { t: 'setSettings', settings: { mode: 'unit' }, text: 'μονάδα' });
const mk = (k = 6) => unit(fakeState(k));
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 's4' + ++n, pid, type, from, to: extra.to || from, ...extra });
const setP = (s: AppState, i: number, o: Partial<AppState['people'][number]>) => { s.people = s.people.map((p, k) => (k === i ? { ...p, ...o } : p)); };   // νέος πίνακας ατόμων, όχι αλλαγή στη θέση του: η seatMap κρατά cache ανά πίνακα
const asset = (o: Partial<Asset> & { id: string }): Asset => ({ cat: 'tyfekia', type: 'G3A3', no: '1', state: 'ok', ...o });

describe('Σ12: Απόσπαση μένει σε δύναμη ως απών', () => {
  it('η κατάσταση APS: απών, καμία υπηρεσία, όχι έξοδο, στήλη allh, δική της ομάδα Β6', () => {
    const t = TYPES.APS;
    expect(t.away && t.noDuty && t.noOut && t.hkai === 'allh').toBe(true);
    expect(awayName({ type: 'APS' })).toBe('Σε απόσπαση');
    expect(ADIK_TYPES).toEqual(['AGN', 'LIP', 'ADK']);   // οι τρεις της στήλης adik μένουν όπως ήταν
    expect(ADIK_APS_TYPES).toEqual(['AGN', 'LIP', 'ADK', 'APS']);
    expect(ADIK_GROUPS).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
    expect(adikGroupOf({}, 'APS')).toBe('B6'); expect(adikGroupOf({}, 'AGN')).toBe('B5');
    const i = DAY_GROUPS.findIndex(g => g[0] === 'B5');
    expect(DAY_GROUPS[i + 1]).toEqual(['B6', 'B', 'ΑΠΟΣΠΑΣΜΕΝΟΙ']);
  });
  it('νέα κίνηση Απόσπαση με επιστροφή: μένει σε δύναμη, κατάσταση APS ως την προηγούμενη της επιστροφής, καμία κίνηση εκτός δύναμης', () => {
    const r = apply(mk(), { t: 'addMove', pid: 1, dir: 'out', why: 'Απόσπαση', where: 'ΣΣΕ', on: TODAY, back: '2026-12-01' }, ctx());
    const p = r.state.people[0];
    expect(p.active).toBe(true); expect(p.moves).toBeUndefined(); expect(p.outOn).toBeUndefined();
    expect(r.state.statuses).toHaveLength(1);
    expect(r.state.statuses[0]).toMatchObject({ pid: 1, type: 'APS', from: TODAY, to: '2026-11-30', note: 'ΣΣΕ' });
    expect(r.state.statuses[0].open).toBeUndefined();
    expect(r.text).toMatch(/Απόσπαση: .*σε απόσπαση από 13\/11 \(ΣΣΕ\), επιστρέφει 01\/12 · μένει σε δύναμη, απών/);
    // την ημέρα της επιστροφής είναι παρών
    expect(strengthOf(r.state, TODAY, hkMin(r.state.rules)).away.APS).toBe(1);
    expect(strengthOf(r.state, '2026-12-01', hkMin(r.state.rules)).away.APS).toBe(0);
  });
  it('χωρίς επιστροφή: χωρίς λήξη· μελλοντική: παρών ως τότε', () => {
    const s = run(mk(), { t: 'addMove', pid: 2, dir: 'out', why: 'ΑΠΟΣΠΑΣΗ', on: '2026-11-20' });
    expect(s.statuses[0]).toMatchObject({ pid: 2, type: 'APS', from: '2026-11-20', open: true });
    expect(s.people[1].active).toBe(true);
    const at = hkMin(s.rules);
    expect(strengthOf(s, '2026-11-19', at).away.APS).toBe(0);
    expect(strengthOf(s, '2026-11-20', at).away.APS).toBe(1);
    expect(strengthOf(s, '2026-12-30', at).away.APS).toBe(1);
  });
  it('μετράει στη στήλη «Αποσπασμένοι σε άλλη μονάδα» (allh) της ΗΚΑΙ, απών, όχι διαθέσιμος', () => {
    const s0 = mk(); const base = hkaiCounts(s0, TODAY);
    const s = run(s0, { t: 'addMove', pid: 1, dir: 'out', why: 'Απόσπαση', on: TODAY, back: '2026-12-01' });
    const h = hkaiCounts(s, TODAY);
    expect(h.cols.allh.map(p => p.id)).toEqual([1]);
    expect(h.apo).toBe(base.apo + 1); expect(h.avail).toBe(base.avail - 1);
    expect(hkaiCounts(s, '2026-12-01').cols.allh).toEqual([]);
  });
  it('πίσω όψη (6. ΛΟΙΠΑ): έναρξη και επιστροφή απόσπασης', () => {
    const s = fakeState(6); s.statuses = [st(1, 'APS', '2026-11-13', { to: '2026-11-20' })];
    expect(hkaiAdikLines(s, '2026-11-13').map(lineText)[0]).toMatch(/^1\. .*ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ: ΣΕ ΑΠΟΣΠΑΣΗ ΤΗΝ 13 ΝΟΕ 26\.$/);
    expect(hkaiAdikLines(s, '2026-11-21').map(lineText)[0]).toMatch(/ΕΠΕΣΤΡΕΨΕ ΤΗΝ 21 ΝΟΕ 26 ΑΠΟ ΑΠΟΣΠΑΣΗ\.$/);
    expect(hkaiAdikLines(s, '2026-11-15')).toEqual([]);
  });
  it('ημερολόγιο κωλυομένων: κωδικός απόντος ΑΠΟΣ, μετριέται απών', () => {
    const s = fakeState(6); s.statuses = [st(1, 'APS', '2026-11-13', { to: '2026-11-20' })];
    const c = autoCell(s, s.people[0], '2026-11-15');
    expect(c).toMatchObject({ code: 'ΑΠΟΣ' }); expect(c!.count).toBe('A');
  });
  it('οι παλιές κινήσεις Απόσπασης (προγραμματισμένες ή που έγιναν) δουλεύουν όπως πριν και ακυρώνονται', () => {
    const s = mk();
    s.people = s.people.map(p => (p.id === 1 ? { ...p, moves: [{ id: 'old1', dir: 'out' as const, why: 'ΑΠΟΣΠΑΣΗ', on: '2026-11-20' }, { id: 'old2', dir: 'in' as const, why: 'ΕΠΙΣΤΡΟΦΗ', on: '2026-12-01', of: 'old1' }] } : p));
    const a = apply(s, { t: 'applyMoves' }, ctx('2026-11-20'));
    expect(a.state.people[0]).toMatchObject({ active: false, outOn: '2026-11-20', notes: 'Εκτός δύναμης: ΑΠΟΣΠΑΣΗ' });
    expect(a.state.statuses).toEqual([]);
    expect(run(a.state, { t: 'applyMoves' }, '2026-12-01').people[0]).toMatchObject({ active: true, inOn: '2026-12-01' });
    // προγραμματισμένη: ακύρωση
    const c = run(s, { t: 'cancelMove', pid: 1, id: 'old1' });
    expect(c.people[0].moves).toBeUndefined();
  });
  it('οι άλλοι λόγοι βγάζουν κανονικά εκτός δύναμης', () => {
    const s = run(mk(), { t: 'addMove', pid: 1, dir: 'out', why: 'Μετάθεση', on: TODAY });
    expect(s.people[0]).toMatchObject({ active: false, outOn: TODAY }); expect(s.statuses).toEqual([]);
  });
  it('ΔΥΝΑΜΗ εξοδούχων: Β6 από προεπιλογή, η επιλογή ανά κατάσταση, ο ίδιος κανόνας με Άγνοια', () => {
    const base = (extra: Status[], set: Partial<AppState['settings']> = {}): AppState => {
      const s = fakeState(40); s.statuses = [st(40, 'OUT', '2026-10-29'), st(40, 'OUT', '2026-10-30'), st(40, 'OUT', '2026-10-31'), ...extra];
      s.settings = { ...s.settings, outsFmt: 'all', ...set }; return s;
    };
    const grp = (s: AppState, d: string, pid = 1) => dayBook(s, d).find(r => r.p.id === pid)!.g;
    const s = base([st(1, 'APS', '2026-10-30', { to: '2026-11-05' }), st(2, 'AGN', '2026-10-30', { to: '2026-11-05' })]);
    for (const d of ['2026-10-30', '2026-10-31']) { expect(grp(s, d, 1)).toBe('B6'); expect(grp(s, d, 2)).toBe('B5'); }
    const c = base([st(1, 'APS', '2026-10-30', { to: '2026-11-05' })], { outsAdik: { APS: 'B3' } });
    expect(grp(c, '2026-10-30')).toBe('B3');
    // άδεια + έξοδος
    const l = base([st(1, 'APS', '2026-10-28', { to: '2026-11-05' }), st(1, 'OUT', '2026-10-30')]);
    expect(grp(l, '2026-10-30')).toBe('B6');
    // χωρίς τέτοιον: κανείς στο Β6
    expect(dayBook(base([]), '2026-10-30').some(r => r.g === 'B6')).toBe(false);
  });
  it('Excel ΔΥΝΑΜΗ: ο τίτλος Β6 «ΑΠΟΣΠΑΣΜΕΝΟΙ» με το άτομο· χωρίς απόσπαση δεν γράφεται (το αρχείο μένει ίδιο)', async () => {
    const T = fs.readFileSync(path.join(__dirname, '..', 'templates', 'exodouxoi.xlsx'));
    const mkS = (extra: Status[]): AppState => { const s = fakeState(40); s.statuses = [st(40, 'OUT', '2026-10-30'), st(40, 'OUT', '2026-10-31'), ...extra]; s.settings = { ...s.settings, outsFmt: 'all' }; return s; };
    const subs = async (s: AppState) => { const r = await fillOuts(T, s, '2026-10-31'); const wb = await Workbook.open(r.data); return (await wb.values(r.sheets![1], 600, 30)).map(row => String(row[0] ?? '')); };
    expect((await subs(mkS([st(1, 'APS', '2026-10-30', { to: '2026-11-05' })]))).some(x => /^Β6\. ΑΠΟΣΠΑΣΜΕΝΟΙ \(1\)$/.test(x))).toBe(true);
    expect((await subs(mkS([st(1, 'LEAVE', '2026-10-30', { to: '2026-11-05' })]))).some(x => x.startsWith('Β6.'))).toBe(false);
  });
  it('συνέπεια Δύναμης και ΔΥΝΑΜΗΣ (όπως outs-combos) με Απόσπαση ανάμεσα στις τυχαίες εβδομάδες', () => {
    const errs: string[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      const g = genState(seed, seed % 2 === 0, 14); const aps: Status[] = [];
      for (let k = 0; k < 4; k++) { const pid = 1 + ((seed * 7 + k * 5) % 14); const from = DAYS[(seed + k * 3) % 10]; aps.push(st(pid, 'APS', from, { to: addDays(from, 1 + ((seed + k) % 5)), ...(k === 3 ? { open: true } : {}) })); }
      const s: AppState = { ...g, statuses: [...g.statuses, ...aps] };
      for (const d of DAYS.slice(2, 12)) {
        const book = dayBook(s, d); const people = activePeople(s);
        if (book.length !== people.length || new Set(book.map(r => r.p.id)).size !== people.length) errs.push(seed + ' ' + d + ' P1');
        const out = strengthOf(s, d, 20 * 60);   // 20:00, μετά την ώρα εξόδου
        const pres = new Set(out.lists.present.map(p => p.id));
        for (const r of book) {
          if (!aps.some(a => a.pid === r.p.id)) continue;
          if (/^B6/.test(r.g) && pres.has(r.p.id)) errs.push(seed + ' ' + d + ' p' + r.p.id + ' B6 αλλά παρών');
          if (/^[AB]/.test(r.g) && pres.has(r.p.id) && !/^A3|^B1/.test(r.g)) errs.push(seed + ' ' + d + ' p' + r.p.id + ' ' + r.g + ' παρών');
        }
      }
    }
    expect(errs.slice(0, 10)).toEqual([]);
  });
});

describe('Σ7: οι τύποι όπλων των Λιστών φτάνουν πάντα στις κατηγορίες του Μητρώου', () => {
  const DEF = ['G3A3', 'G3A4', 'M16A2', 'M4'];   // οι προεπιλεγμένοι τύποι των Λιστών μπαίνουν πάντα στη λίστα
  const saved = (types: string[]) => ({ assets: { cats: [{ id: 'k1', name: 'Δικά μου', kind: 'weapon' as const, types, fields: [] }, { id: 'k2', name: 'Υλικό', kind: 'material' as const, types: [], fields: [] }], places: [], warnDays: 30 } });
  it('αποθηκευμένες κατηγορίες + νέος τύπος στις Λίστες: δική του κατηγορία στο τέλος, οι αποθηκευμένες όπως ήταν, οι ρυθμίσεις δεν γράφονται', () => {
    const s = fakeState(3); s.settings = { ...s.settings, ...saved(DEF), lists: { weaponTypes: { add: [{ name: 'Μ4 ΝΕΟ' }] } } as any };
    const before = JSON.stringify(s.settings);
    const cfg = assetCfgOf(s.settings);
    expect(cfg.cats.map(c => c.id)).toEqual(['k1', 'k2', typeCatId('Μ4 ΝΕΟ')]);
    expect(cfg.cats[0]).toMatchObject({ name: 'Δικά μου', types: DEF });
    expect(cfg.cats[2]).toMatchObject({ name: 'Μ4 ΝΕΟ', kind: 'weapon', types: ['Μ4 ΝΕΟ'] });
    expect(JSON.stringify(s.settings)).toBe(before);
  });
  it('χωρίς νέο τύπο: ακριβώς οι αποθηκευμένες', () => {
    const s = fakeState(3); s.settings = { ...s.settings, ...saved(DEF) };
    expect(assetCfgOf(s.settings).cats.map(c => c.id)).toEqual(['k1', 'k2']);
  });
  it('εικονική γραμμή κύριου όπλου με τον νέο τύπο: στη δική του κατηγορία, όχι στα Τυφέκια· ο άγνωστος τύπος το ίδιο', () => {
    const s = fakeState(3); s.settings = { ...s.settings, ...saved(DEF), lists: { weaponTypes: { add: [{ name: 'ΝΕΟΣ' }] } } as any };
    setP(s, 0, { weapon: '111', wtype: 'ΝΕΟΣ' }); setP(s, 1, { weapon: '222', wtype: 'G3A3' }); setP(s, 2, { weapon: '333', wtype: 'Ξένος τύπος' });
    const rows = registry(s); const by = (no: string) => rows.find(r => r.a.no === no)!;
    expect(by('111').cat?.id).toBe(typeCatId('ΝΕΟΣ')); expect(by('222').cat?.id).toBe('k1'); expect(by('333').cat?.name).toBe('Ξένος τύπος');
    expect(assetView(s, { cat: typeCatId('ΝΕΟΣ') }, TODAY).map(r => r.a.no)).toEqual(['111']);
    expect(assetCfgOf(s.settings, s).cats.map(c => c.name)).toEqual(['Δικά μου', 'Υλικό', 'ΝΕΟΣ', 'Ξένος τύπος']);
  });
  it('προεπιλεγμένες κατηγορίες: ο τύπος των Λιστών μένει στα Τυφέκια, ο άγνωστος παίρνει δική του· χωρίς τύπο Τυφέκια', () => {
    const s = fakeState(3); setP(s, 0, { weapon: '1', wtype: 'M4' }); setP(s, 1, { weapon: '2', wtype: 'Μ1911' }); setP(s, 2, { weapon: '3' });
    const by = (no: string) => registry(s).find(r => r.a.no === no)!.cat!;
    expect(by('1').id).toBe('tyfekia'); expect(by('2').name).toBe('Μ1911'); expect(by('3').id).toBe('tyfekia');
    expect(catOfType(assetCfgOf(s.settings), 'Άλλο').name).toBe('Άλλο');
  });
  it('Μητρώο Excel: ΣΥΝΟΛΑ με την κατηγορία του νέου τύπου· χωρίς τέτοιον τύπο ίδιο με πριν', () => {
    const mkS = (wt: string): AppState => { const s = fakeState(3); s.settings = { ...s.settings, ...saved(DEF), lists: { weaponTypes: { add: [{ name: 'ΝΕΟΣ' }] } } as any }; setP(s, 0, { weapon: '111', wtype: wt }); return s; };
    const tot = (s: AppState) => assetSheets(s, registry(s), TODAY).find(x => x.kind === 'totals')!.rows.map(r => r.slice(0, 2).join('|'));
    expect(tot(mkS('ΝΕΟΣ'))).toContain('ΝΕΟΣ|ΝΕΟΣ');
    expect(tot(mkS('G3A3'))).toEqual(['ΔΙΚΑ ΜΟΥ|G3A3', 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ|']);
  });
});

describe('Σ8: δεύτερα όπλα στην Κατάσταση οπλισμού', () => {
  const D = '2026-11-13';
  const mkS = (extra: Asset[]): AppState => {
    const s = fakeState(4); setP(s, 0, { weapon: '1001', wtype: 'G3A3', rack: 'Ε1', wpos: '5' }); setP(s, 1, { weapon: '1002', wtype: 'G3A3' });
    s.assets = extra; return s;
  };
  const second = (o: Partial<Asset> = {}) => asset({ id: 'x1', type: 'Μ1911', no: '777', cat: 'pistolia', holder: { k: 'person', pid: 1 }, rack: 'Π1', wpos: '2', ...o });
  const sheet = (s: AppState, name: string) => weaponSheets(s, D).find(x => x.name === name)!;
  it('κανείς χωρίς δεύτερο όπλο: τα φύλλα ίδια με πριν', () => {
    const base = mkS([]); const withAssets = mkS([asset({ id: 'a1', no: '1001', holder: { k: 'person', pid: 1 } }), asset({ id: 'a2', no: '9', cat: 'pistolia', holder: { k: 'unit', name: 'ΑΛΛΗ' } }), asset({ id: 'a3', no: '55', cat: 'diopt', holder: { k: 'person', pid: 1 } }), second({ gone: D }), second({ id: 'x2', state: 'writeoff' })]);
    expect(weaponSheets(withAssets, D)).toEqual(weaponSheets(base, D));
    expect(secondWeapons(withAssets).size).toBe(0);
  });
  it('γραμμή κάτω από το άτομο, ίδιες στήλες, τα στοιχεία του επαναλαμβάνονται· ΕΝΤΟΣ', () => {
    const s = mkS([second()]); const rows = sheet(s, 'ΟΠΛΙΣΜΟΣ').rows;
    const i = rows.findIndex(r => r[10] === '1001');
    expect(rows[i + 1]).toEqual([i + 2, ...rows[i].slice(1, 9), 'Μ1911', '777', 'Π1', '2', 'ΕΝΤΟΣ', '']);
    expect(rows[i + 1][4]).toBe(rows[i][4]);
    expect(rows.map((r, j) => r[0] === j + 1).every(Boolean)).toBe(true);
    expect(sheet(s, 'ΜΕ ΟΠΛΟ').rows.filter(r => r[10] === '777')).toHaveLength(1);
    expect(sheet(s, 'ΧΩΡΙΣ ΟΠΛΟ').rows.filter(r => r[10] === '777')).toHaveLength(0);
  });
  it('προς επισκευή: ΕΚΤΟΣ «ΠΡΟΣ ΕΠΙΣΚΕΥΗ» και στο φύλλο εκτός οπλοβαστού, μόνο η γραμμή του', () => {
    const s = mkS([second({ state: 'repair', why: 'ΣΠΑΣΜΕΝΟ' })]);
    const all = sheet(s, 'ΟΠΛΙΣΜΟΣ').rows.find(r => r[10] === '777')!;
    expect(all[13]).toBe('ΕΚΤΟΣ: ΠΡΟΣ ΕΠΙΣΚΕΥΗ: ΣΠΑΣΜΕΝΟ');
    const out = sheet(s, 'ΕΚΤΟΣ ΟΠΛΟΒΑΣΤΟΥ').rows;
    expect(out.map(r => r[10])).toEqual(['777']);
  });
  it('υπηρεσία εκτός στρατοπέδου → ΑΠΩΝ, ένοπλη υπηρεσία → ΕΚΤΟΣ, εκτός δύναμης → κενό', () => {
    const info = { away: new Map([[1, 'ΥΠΗΡΕΣΙΑ ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ 14:00-14:00']]), out: new Map([[2, 'Σκοπός 3ης (α) 15:45-18:15']]) } as any;
    const a = second();
    expect(secondText({ id: 1, active: true }, a, info)).toBe('ΑΠΩΝ: ΥΠΗΡΕΣΙΑ ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ 14:00-14:00');
    expect(secondText({ id: 2, active: true }, a, info)).toBe('ΕΚΤΟΣ: Σκοπός 3ης (α) 15:45-18:15');
    expect(secondText({ id: 3, active: true }, a, info)).toBe('ΕΝΤΟΣ'); expect(secondText({ id: 3, active: false }, a, info)).toBe('');
    expect(secondText({ id: 1, active: true }, second({ state: 'immobile' }), info)).toBe('ΕΚΤΟΣ: ΠΡΟΣ ΕΠΙΣΚΕΥΗ');
  });
  it('εκτός δύναμης: στο «Να παραδώσουν»', () => {
    const s = mkS([second()]); setP(s, 0, { active: false });
    const rows = sheet(s, 'ΝΑ ΠΑΡΑΔΩΣΟΥΝ').rows;
    expect(rows.map(r => r[10])).toEqual(['1001', '777']);
    expect(sheet(s, 'ΟΠΛΙΣΜΟΣ').rows.some(r => r[10] === '777')).toBe(false);
  });
  it('Excel: ΔΥΝΑΜΗ μένει ο αριθμός των ατόμων, ΜΕ ΟΠΛΟ μετρά και τα δεύτερα', async () => {
    const head = async (s: AppState) => { const m = await weaponsBook(s, D); const wb = await Workbook.open(m.data); const v = await wb.values(m.marks[0].sheet, 12, 4); return v.flat().map(x => String(x ?? '')).find(x => x.startsWith('ΔΥΝΑΜΗ:')); };
    expect(await head(mkS([]))).toBe('ΔΥΝΑΜΗ: 4 · ΜΕ ΟΠΛΟ: 2');
    expect(await head(mkS([second(), second({ id: 'x3', no: '778' })]))).toBe('ΔΥΝΑΜΗ: 4 · ΜΕ ΟΠΛΟ: 4');
  });
  it('ο κατάλογος: info του ίδιου ατόμου δεν αλλάζει για το κύριο όπλο', () => {
    const s = mkS([second({ state: 'repair' })]); const info = weaponInfo(s, D);
    expect(info.repair.has(1)).toBe(false);
  });
});

describe('Σ9: εκτός δύναμης με χρεωμένα', () => {
  const held = (): AppState => {
    const s = mk(); setP(s, 0, { weapon: '1001', wtype: 'G3A3', essos: '2025 Δ΄' });
    s.assets = [asset({ id: 'm1', cat: 'diopt', type: 'Διόπτρα', no: 'D5', holder: { k: 'person', pid: 1 } }), asset({ id: 'v1', cat: 'troxofora', type: 'HUMMER', no: 'ΕΘ-1', holder: { k: 'person', pid: 1 } }), asset({ id: 'f1', cat: 'diopt', type: 'Διόπτρα', no: 'D6' })];
    return s;
  };
  it('heldWarn: κύριο όπλο, υλικό, όχημα· κανείς χωρίς χρεωμένα → κενό', () => {
    const w = heldWarn(held(), [1, 2]);
    expect(w).toMatch(/^ΠΡΟΣΟΧΗ: μένουν χρεωμένα σε άτομο εκτός δύναμης: /);
    for (const x of ['G3A3 1001', 'Διόπτρα D5', 'HUMMER ΕΘ-1']) expect(w).toContain(x);
    expect(w).not.toContain('D6');
    expect(heldWarn(held(), [2, 3])).toBe('');
  });
  it('κίνηση εκτός δύναμης σήμερα: προειδοποίηση στο κείμενο, τα χρεωμένα ΜΕΝΟΥΝ χρεωμένα', () => {
    const s = held();
    const r = apply(s, { t: 'addMove', pid: 1, dir: 'out', why: 'Μετάθεση', on: TODAY }, ctx());
    expect(r.state.people[0].active).toBe(false);
    expect(r.text).toMatch(/εκτός δύναμης \(ΜΕΤΑΘΕΣΗ\) από 13\/11 · ΠΡΟΣΟΧΗ: χρεωμένα .*G3A3 1001.*Διόπτρα D5.*HUMMER ΕΘ-1/);
    expect(r.state.assets).toBe(s.assets);   // τίποτα δεν ξεχρεώθηκε
    expect(r.state.people[0].weapon).toBe('1001');
    // το Μητρώο τα δείχνει στο φίλτρο «Σε εκτός δύναμης»
    expect(assetView(r.state, { filter: 'out', kinds: ['weapon', 'material', 'vehicle'] }, TODAY).map(x => x.a.no).sort()).toEqual(['1001', 'D5', 'ΕΘ-1']);
  });
  it('μελλοντική κίνηση: προειδοποίηση τώρα· και όταν έρθει η μέρα (applyMoves)', () => {
    const r = apply(held(), { t: 'addMove', pid: 1, dir: 'out', why: 'Μετάθεση', on: '2026-11-20' }, ctx());
    expect(r.text).toMatch(/φεύγει στις 20\/11.*ΠΡΟΣΟΧΗ: χρεωμένα/);
    const d = apply(r.state, { t: 'applyMoves' }, ctx('2026-11-20'));
    expect(d.text).toMatch(/ΠΡΟΣΟΧΗ: χρεωμένα .*Διόπτρα D5/);
  });
  it('χωρίς χρεωμένα, ή Απόσπαση (μένει σε δύναμη): καμία προειδοποίηση', () => {
    expect(apply(held(), { t: 'addMove', pid: 2, dir: 'out', why: 'Μετάθεση', on: TODAY }, ctx()).text).not.toMatch(/ΠΡΟΣΟΧΗ/);
    const a = apply(held(), { t: 'addMove', pid: 1, dir: 'out', why: 'Απόσπαση', on: TODAY }, ctx());
    expect(a.text).not.toMatch(/ΠΡΟΣΟΧΗ/); expect(a.state.people[0].active).toBe(true);
  });
  it('Απόλυση ΕΣΣΟ: προειδοποίηση με όσους έχουν χρεωμένα', () => {
    const s = held(); setP(s, 1, { essos: '2025 Δ΄' });
    const r = apply(s, { t: 'dischargeEsso', esso: '2025 Δ΄', on: TODAY, pids: [1, 2] }, ctx());
    expect(r.text).toMatch(/Απόλυση ΕΣΣΟ .*: 2 στρατιώτες εκτός δύναμης από 13\/11 · ΠΡΟΣΟΧΗ: μένουν χρεωμένα σε άτομο εκτός δύναμης: .*G3A3 1001/);
    const clean = apply(mk(), { t: 'dischargeEsso', esso: '2025 Δ΄', on: TODAY, pids: [2] }, ctx());
    expect(clean.text).not.toMatch(/ΠΡΟΣΟΧΗ/);
  });
});
