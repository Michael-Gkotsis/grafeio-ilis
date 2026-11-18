// Αρχείο οπλισμού ΑΛΛΗΣ μονάδας (phase 5): ανάγνωση, αντιστοίχιση, σχέδιο εισαγωγής στο Μητρώο. FUZZ_N=200 npx vitest run test/weapon-unit.test.ts για περισσότερα seeds (προεπιλογή 30).
// Αλήθεια ανά όπλο από τον γεννήτορα (mockgen.genUnitWeapons). Ελέγχονται: 0 λάθος «σίγουρα», με προφίλ η ανάγνωση = αλήθεια, κύριο / δεύτερο όπλο,
// συγκρούσεις χωρίς αλλαγή, τίποτα δεν σβήνεται, τύποι και λίστες που βγαίνουν από άλλο φύλλο άθικτα, επανάληψη χωρίς αλλαγές, .xls με ψεύτικο μετατροπέα.
// REAL_TEMPLATES_DIR: μόνο στο τοπικό· τυπώνει ΜΟΝΟ αριθμούς για το OPLISMOS.xlsx.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Workbook } from '../src/main/xlsx';
import { readBook } from '../src/main/sources';
import type { XlsConverter } from '../src/main/xlsConvert';
import { genUnitWeapons, type UnitWeapons, type WpnHolder } from './mockgen';
import { emptyState, type AppState, type Cadre, type Person } from '../src/shared/domain';
import { apply } from '../src/shared/commands';
import { registry } from '../src/shared/assets';
import { weaponKey } from '../src/shared/weapons';
import { emptyWpn, planWeapons, resolveWeapons, placeParts } from '../src/shared/weaponUnit';
import type { WeaponProfile } from '../src/shared/tplStore';
import { phraseKey } from '../src/shared/lexicon';
import { sanitizeProfiles } from '../src/shared/tplStore';
import type { RawSheet } from '../src/shared/roster';

const N = Number(process.env.FUZZ_N || 30); const TODAY = '2026-11-18';
const ctx = () => { let n = 0; return { today: TODAY, newId: () => 'x' + ++n }; };
const L = (i: number) => String.fromCharCode(913 + (i % 24)) + String.fromCharCode(913 + ((i / 24) | 0) % 24);
const FIRST = ['ΓΕΩΡΓΙΟΣ', 'ΝΙΚΟΛΑΟΣ', 'ΙΩΑΝΝΗΣ', 'ΔΗΜΗΤΡΙΟΣ', 'ΚΩΝΣΤΑΝΤΙΝΟΣ'];
const stat = { fuzz: 0, items: 0, wrongSure: 0, primary: 0, second: 0, assets: 0, waits: 0, dups: 0 };

function world(): { holders: WpnHolder[]; state: AppState } {
  const holders: WpnHolder[] = []; const people: Person[] = []; const cadreList: Cadre[] = [];
  for (let i = 0; i < 24; i++) {
    const last = 'ΧΡΥΣ' + L(i) + 'ΟΣ', first = FIRST[i % 5], rank = i % 3 === 0 ? 'ΣΤΡ' : i % 3 === 1 ? 'ΥΔΝΕΑΣ' : 'ΣΤΡ';
    if (i % 6 === 5) { cadreList.push({ id: 'c' + i, rank: 'ΑΝΘΥΠΑΣΠΙΣΤΗΣ', hk: 'ΑΝΘΣΤΗΣ', last, first, active: true } as Cadre); holders.push({ k: 'cadre', id: 'c' + i, last, first, rank: 'ΑΝΘΥΠΑΣΠΙΣΤΗΣ' }); }
    else { people.push({ id: i + 1, rank, last, first, father: 'ΠΑΤΗΡ', active: true, notes: '', post: null, attached: false } as Person); holders.push({ k: 'person', id: i + 1, last, first, rank }); }
  }
  return { holders, state: { ...emptyState(), people, cadreList } };
}
const load = async (g: UnitWeapons): Promise<RawSheet[]> => { const wb = await Workbook.open(g.buf); const out: RawSheet[] = []; for (const n of wb.sheetNames()) { const fx = new Set<string>(); out.push({ name: n, rows: await wb.values(n, 2000, 200, fx), fx }); } return out; };
const userProf = (g: UnitWeapons): WeaponProfile => ({ ...emptyWpn(), cats: { [g.blankSheet]: 'pistolia' }, types: { [phraseKey(g.unkType)]: 'antiarm' }, holders: { [phraseKey(g.waitWord)]: 'free' } });
const ELIG = ['tyfekia', 'pistolia'];

describe('ανάγνωση χωρίς προφίλ: 0 λάθος «σίγουρα»', () => {
  it('φύλλα, κάτοχοι, κατηγορίες, θέσεις', async () => {
    for (let seed = 1; seed <= N; seed++) {
      const { holders, state } = world(); const g = await genUnitWeapons(seed, holders); const sheets = await load(g); stat.fuzz++;
      const rz = resolveWeapons({ settings: state.settings, people: state.people, cadreList: state.cadreList, sheets, prof: emptyWpn() });
      expect(rz.sheets.find(s => s.name === g.derived)!.role, 'seed ' + seed).toBe('derived'); expect(rz.sheets.find(s => s.name === g.master)!.role).toBe('items');
      expect(rz.items.every(x => x.it.sheet !== g.derived)).toBe(true);
      expect(rz.items.length, 'seed ' + seed).toBe(g.truth.length);
      for (const t of g.truth) {
        const x = rz.items.find(y => y.it.sheet === t.sheet && y.it.r === t.r); expect(x, 'seed ' + seed + ' ' + t.sheet + ':' + t.r).toBeTruthy(); stat.items++;
        expect(x!.it.no).toBe(t.no); const h = x!.res.holder;
        if (t.holder === 'person') { if (h.t !== 'person' || h.id !== t.id || h.k !== t.hk) stat.wrongSure++; } else if (t.holder === 'free') { if (h.t !== 'free') stat.wrongSure++; }
        else if (t.holder === 'absent') { if (h.t !== 'absent') stat.wrongSure++; } else if (h.t !== 'wait') stat.wrongSure++;
        if (x!.res.cat) { if (x!.res.cat.id !== t.cat) stat.wrongSure++; } else stat.waits++;
        if (t.sheet === g.blankSheet || t.sheet === g.unkSheet) expect(x!.res.cat, 'χωρίς απάντηση δεν μαντεύεται').toBeNull();
        if (t.seat) expect(x!.res.seat).toEqual(t.seat); else expect(x!.res.seat).toBeNull();
        if (t.word) expect(x!.res.word).toBe(t.word);
      }
      const bl = rz.sheets.find(s => s.name === g.blankSheet)!; expect(bl.catState, 'ο τίτλος ΠΙΣΤΟΛΙΩΝ είναι μόνο πρόταση').toBe('suggest'); expect(bl.cat).toBe('pistolia');
      const un = rz.typeWords.find(w => w.text === g.unkType)!; expect(un.state).toBe('suggest'); expect(un.suggest).toBe('antiarm');
    }
    expect(stat.wrongSure).toBe(0);
  }, 600000);
});

describe('με προφίλ: σχέδιο = αλήθεια', () => {
  it('κύριο όπλο μόνο για το πρώτο όπλο κατηγορίας κύριου όπλου, τα άλλα εγγραφές Μητρώου', async () => {
    for (let seed = 1; seed <= N; seed++) {
      const { holders, state } = world(); const g = await genUnitWeapons(seed, holders); const sheets = await load(g);
      const pl = planWeapons({ settings: state.settings, people: state.people, cadreList: state.cadreList, sheets, prof: userProf(g), state });
      const c = pl.counts; expect(c.wait, 'seed ' + seed).toBe(0);
      const keep = g.truth.filter(t => !t.dup);
      expect(c.read).toBe(g.truth.length); expect(c.dups, 'διπλοί').toBe(g.truth.length - keep.length);
      expect(pl.apply.primary.length + pl.apply.assets.length).toBe(keep.length);
      // αναμενόμενο κύριο όπλο ανά κάτοχο: πρώτο της πρώτης κατηγορίας (tyfekia, pistolia) με τη σειρά του αρχείου
      const exp = new Map<string, WpnTruthLite>();
      for (const cat of ELIG) for (const t of keep) if (t.holder === 'person' && t.cat === cat) { const k = t.hk + ':' + t.id; if (!exp.has(k)) exp.set(k, t); }
      expect(pl.apply.primary.length).toBe(exp.size); stat.primary += exp.size;
      for (const p of pl.apply.primary) { const k = (p.owner.k === 'person' ? 'person:' + p.owner.pid : 'cadre:' + p.owner.cid); expect(p.weapon, 'seed ' + seed).toBe(exp.get(k)!.no.toUpperCase()); }
      const held = pl.apply.assets.filter(a => a.holder);
      for (const a of held) { stat.second++; if (a.cat === 'polyvola' || a.cat === 'antiarm') expect(pl.apply.primary.some(p => p.weapon === a.no)).toBe(false); }
      expect(pl.apply.assets.filter(a => !a.holder).length).toBe(c.unassigned);
      stat.assets += pl.apply.assets.length; stat.dups += c.dups;
      // κάνες των πολυβόλων στα πεδία της κατηγορίας
      for (const t of keep) if (t.barrel) { const a = pl.apply.assets.find(x => x.no === t.no.toUpperCase()); expect(a?.extra?.barrel).toBe(t.barrel); if (t.spare) expect(a?.extra?.spare).toBe(t.spare); }
      // «_» = αχρέωτο: κανένας κάτοχος που δεν είναι στο αρχείο
      for (const t of keep) if (t.holder !== 'person') { const a = pl.apply.assets.find(x => x.no === t.no.toUpperCase()); expect(a, t.no).toBeTruthy(); expect(a!.holder).toBeUndefined(); }
    }
  }, 600000);

  it('η εντολή εισαγωγής: κύριο όπλο στο Δυναμολόγιο, εγγραφές Μητρώου, επανάληψη χωρίς αλλαγές, τίποτα δεν σβήνεται', async () => {
    for (let seed = 1; seed <= Math.min(N, 15); seed++) {
      const { holders, state } = world(); const g = await genUnitWeapons(seed, holders); const sheets = await load(g); const prof = userProf(g);
      const pl = planWeapons({ settings: state.settings, people: state.people, cadreList: state.cadreList, sheets, prof, state });
      const r = apply(state, { t: 'importWeapons', apply: pl.apply, source: 'x.xlsx', date: TODAY }, ctx()).state;
      expect(r.people.length).toBe(state.people.length); expect(r.cadreList.length).toBe(state.cadreList.length);
      for (const p of pl.apply.primary) { const o = p.owner.k === 'person' ? r.people.find(x => x.id === (p.owner as { pid: number }).pid)! : r.cadreList.find(x => x.id === (p.owner as { cid: string }).cid)!; expect(weaponKey(o.weapon)).toBe(weaponKey(p.weapon)); }
      expect((r.assets || []).length).toBe(pl.apply.assets.length); expect((r.assetLog || []).length).toBe(pl.apply.assets.length);
      const rows = registry(r).filter(x => !x.a.gone); expect(rows.length).toBe(pl.apply.assets.length + pl.apply.primary.length);
      // δεύτερη φορά: όλα υπάρχουν ήδη
      const pl2 = planWeapons({ settings: r.settings, people: r.people, cadreList: r.cadreList, sheets, prof, state: r });
      expect(pl2.apply.primary.length + pl2.apply.assets.length, 'seed ' + seed).toBe(0); expect(pl2.counts.conflicts).toBe(0);
      const r2 = apply(r, { t: 'importWeapons', apply: pl.apply, source: 'x.xlsx', date: TODAY }, ctx()).state; expect(r2.assets).toEqual(r.assets); expect(r2.people).toEqual(r.people);
    }
  }, 600000);

  it('σύγκρουση: άλλο κύριο όπλο στην ίδια κατηγορία δεν γράφεται πάνω· άλλης κατηγορίας γίνεται δεύτερο όπλο', async () => {
    const { holders, state } = world(); const g = await genUnitWeapons(3, holders); const sheets = await load(g); const prof = userProf(g);
    const base = planWeapons({ settings: state.settings, people: state.people, cadreList: state.cadreList, sheets, prof, state });
    const pr = base.apply.primary.find(p => p.owner.k === 'person')!; const pid = (pr.owner as { pid: number }).pid;
    const mk = (wtype: string) => ({ ...state, people: state.people.map(p => (p.id === pid ? { ...p, weapon: '999999', wtype } : p)) });
    const rifleCat = base.resolved.items.find(x => weaponKey(x.it.no) === weaponKey(pr.weapon))!.res.cat!.id;
    const own = rifleCat === 'tyfekia' ? 'G3A3' : 'Μ1911 Α1', other = rifleCat === 'tyfekia' ? 'Μ1911 Α1' : 'G3A3';
    const s1 = mk(own); const p1 = planWeapons({ settings: s1.settings, people: s1.people, cadreList: s1.cadreList, sheets, prof, state: s1 });
    expect(p1.counts.conflicts).toBeGreaterThan(0); expect(p1.apply.primary.some(p => p.owner.k === 'person' && p.owner.pid === pid)).toBe(false);
    expect(p1.apply.assets.some(a => weaponKey(a.no) === weaponKey(pr.weapon))).toBe(false);
    const s2 = mk(other); const p2 = planWeapons({ settings: s2.settings, people: s2.people, cadreList: s2.cadreList, sheets, prof, state: s2 });
    expect(p2.apply.assets.some(a => weaponKey(a.no) === weaponKey(pr.weapon) && a.holder?.k === 'person')).toBe(true);
    const r = apply(s1, { t: 'importWeapons', apply: p1.apply, source: 'x', date: TODAY }, ctx()).state; expect(r.people.find(p => p.id === pid)!.weapon).toBe('999999');
  });

  it('υπάρχων αριθμός με άλλον κάτοχο: αναφέρεται, δεν αλλάζει', async () => {
    const { holders, state } = world(); const g = await genUnitWeapons(5, holders); const sheets = await load(g); const prof = userProf(g);
    const base = planWeapons({ settings: state.settings, people: state.people, cadreList: state.cadreList, sheets, prof, state });
    const a0 = base.apply.assets.find(a => !a.holder)!;
    const s1 = { ...state, assets: [{ id: 'z1', cat: a0.cat, type: a0.type, no: a0.no, state: 'ok' as const, holder: { k: 'person' as const, pid: 1 } }] };
    const p = planWeapons({ settings: s1.settings, people: s1.people, cadreList: s1.cadreList, sheets, prof, state: s1 });
    expect(p.counts.conflicts).toBe(1); expect(p.apply.assets.some(a => a.no === a0.no)).toBe(false);
    const r = apply(s1, { t: 'importWeapons', apply: p.apply, source: 'x', date: TODAY }, ctx()).state; expect(r.assets!.find(a => a.id === 'z1')!.holder).toEqual({ k: 'person', pid: 1 });
  });
});

describe('το αρχείο δεν αλλάζει και .xls περνά από τον μετατροπέα', () => {
  it('η ανάγνωση δεν πειράζει τα φύλλα· .xls με ψεύτικο μετατροπέα δίνει το ίδιο σχέδιο', async () => {
    const { holders, state } = world(); const g = await genUnitWeapons(7, holders); const sheets = await load(g); const before = JSON.stringify(sheets.map(s => [s.name, s.rows, [...(s.fx || [])]]));
    const direct = planWeapons({ settings: state.settings, people: state.people, cadreList: state.cadreList, sheets, prof: userProf(g), state });
    expect(JSON.stringify(sheets.map(s => [s.name, s.rows, [...(s.fx || [])]]))).toBe(before);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-wpn-'));
    try {
      const f = path.join(dir, 'old.xls'); fs.writeFileSync(f, 'fake xls'); const conv: XlsConverter = { name: 'fake', async run(_c, out) { const o = path.join(out, 'o.xlsx'); fs.writeFileSync(o, g.buf); return o; } };
      const b = await readBook(f, 2000, 64, [conv]); expect(fs.readFileSync(f, 'utf8')).toBe('fake xls');
      const viaXls = planWeapons({ settings: state.settings, people: state.people, cadreList: state.cadreList, sheets: b.sheets, prof: userProf(g), state });
      expect(viaXls.counts).toEqual(direct.counts); expect(viaXls.apply).toEqual(direct.apply);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('το προφίλ αποθηκεύεται και διαβάζεται· κατεστραμμένο κόβεται', () => {
    const prof = { ...emptyWpn(), roles: { Α: 'derived' as const }, cats: { Β: 'polyvola' }, holders: { Χ: 'free' } };
    const p = sanitizeProfiles([{ v: 1, id: 'w', kind: 'weapons', fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], wpn: prof }])[0];
    expect(p.wpn).toEqual(prof);
    const bad = sanitizeProfiles([{ v: 1, id: 'w', kind: 'weapons', fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], wpn: { roles: { Α: 'zzz' }, holders: { Χ: 'zzz' }, types: 5 } }])[0];
    expect(bad.wpn!.roles).toEqual({}); expect(bad.wpn!.holders).toEqual({}); expect(bad.wpn!.types).toEqual({});
  });
  it('θέσεις', () => {
    expect(placeParts('12/13').seat).toEqual({ rack: '', wpos: '12/13' }); expect(placeParts('Ε6').seat).toEqual({ rack: 'Ε', wpos: '6' });
    expect(placeParts('ΚΙΒΩΤΙΟ 52').word).toBe('ΚΙΒΩΤΙΟ 52'); expect(placeParts('2 (2η ΙΛΗ)').seat).toEqual({ rack: '', wpos: '2' }); expect(placeParts('_')).toEqual({});
  });
});

describe('Δημιουργία: λέξη θέσης, τύπος, κατηγορία μέσω των Ρυθμίσεων', () => {
  it('adaptTpl φτιάχνει ό,τι λείπει και δεν διπλογράφει', () => {
    const s0 = emptyState(); const prof = { v: 1, id: 'weapons-1', kind: 'weapons' as const, fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], wpn: emptyWpn() };
    const create = [{ k: 'assetCat' as const, name: 'Όλμοι', kind: 'weapon' as const }, { k: 'assetType' as const, name: 'ΜΜ-81', cat: 'new:Όλμοι' }, { k: 'assetType' as const, name: 'ΖΧ-7', cat: 'antiarm' }, { k: 'placeWord' as const, name: 'ΑΥΔΜ', means: 'duty' as const }];
    const s1 = apply(s0, { t: 'adaptTpl', profile: prof, create, text: 't' }, ctx()).state; const s2 = apply(s1, { t: 'adaptTpl', profile: prof, create, text: 't' }, ctx()).state;
    for (const s of [s1, s2]) {
      const cats = s.settings.assets!.cats!; expect(cats.find(c => c.name === 'Όλμοι')!.types).toEqual(['ΜΜ-81']); expect(cats.find(c => c.id === 'antiarm')!.types).toEqual(['ΖΧ-7']); expect(cats.filter(c => c.name === 'Όλμοι').length).toBe(1);
      expect(s.settings.assets!.places!.filter(p => p.word === 'ΑΥΔΜ').length).toBe(1); expect(s.settings.assets!.places!.some(p => p.word === 'Α.Ο')).toBe(true);
    }
  });
});

describe('αναφορά', () => { it('πίνακας', () => { console.log('WEAPON-UNIT ' + JSON.stringify(stat)); expect(stat.wrongSure).toBe(0); }); });

interface WpnTruthLite { no: string }

const dir = process.env.REAL_TEMPLATES_DIR;
describe.skipIf(!dir || !fs.existsSync(path.join(dir || '', 'OPLISMOS.xlsx')))('αρχείο μονάδας (τοπικό, μόνο αριθμοί)', () => {
  it('OPLISMOS.xlsx', async () => {
    const buf = fs.readFileSync(path.join(dir!, 'OPLISMOS.xlsx')); const wb = await Workbook.open(buf); const sheets: RawSheet[] = [];
    for (const n of wb.sheetNames()) { const fx = new Set<string>(); sheets.push({ name: n, rows: await wb.values(n, 2000, 200, fx), fx }); }
    const st = emptyState(); const pl = planWeapons({ settings: st.settings, people: [], cadreList: [], sheets, prof: emptyWpn(), state: st });
    const rz = pl.resolved; const cnt = (k: string) => rz.sheets.filter(s => s.role === k).length;
    console.log('REAL-OPLISMOS φύλλα=' + rz.sheets.length + ' (λίστες=' + cnt('items') + ' βγαίνουν από άλλο=' + cnt('derived') + ' άλλα=' + cnt('skip') + ') | ' + JSON.stringify(pl.counts)
      + ' | τύποι σίγουροι=' + rz.typeWords.filter(w => w.state === 'sure').length + ' πρόταση=' + rz.typeWords.filter(w => w.state === 'suggest').length + ' άγνωστοι=' + rz.typeWords.filter(w => w.state === 'unknown').length
      + ' | θέσεις σίγουρες=' + rz.placeWords.filter(w => w.state === 'sure').length + ' πρόταση=' + rz.placeWords.filter(w => w.state === 'suggest').length + ' άγνωστες=' + rz.placeWords.filter(w => w.state === 'unknown').length + ' | κείμενα κατόχου χωρίς απάντηση=' + rz.holderWords.length
      + ' | στήλες σίγουρες=' + rz.read.cols.filter(c => c.state === 'sure').length + ' προτάσεις=' + rz.read.cols.filter(c => c.state === 'suggest').length + ' άγνωστες=' + rz.read.cols.filter(c => c.role == null).length);
    expect(rz.read.items.length).toBeGreaterThan(0);
  }, 120000);
});
