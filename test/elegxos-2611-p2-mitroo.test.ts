// Έλεγχος 25/11, πακέτο Π2 (Οπλισμός, Υλικό, Οχήματα, Μητρώο). Τυχαίες σειρές εντολών σε 300 όπλα και 100 υλικά
// (χρέωση, επιστροφή, μετονομασία τύπου, κίνηση δύναμης, απόλυση, αλλαγή αριθμού, διαγραφή, συντήρηση, κατάσταση) και μετά από κάθε
// εντολή: το Μητρώο, ο Οπλισμός (Όπλα ανά άτομο, δεύτερα όπλα), η καρτέλα του ατόμου (Χρεωμένα) και το Excel «Κατάσταση οπλισμού»
// συμφωνούν. Η αναίρεση (patch της βάσης) γυρίζει όλα πίσω. Και τα σφάλματα που βρέθηκαν: διαγραφή στελέχους με χρεωμένα,
// μετονομασία τύπου που έφτιαχνε «φάντασμα» κατηγορία, προειδοποίηση για στέλεχος εκτός δύναμης. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import { addDays } from '../src/shared/dates';
import type { AppState, AssetHolder } from '../src/shared/domain';
import { assetCfgOf, assetSheets, heldBy, heldGroups, holderText, registry, sameHolder, type AssetRow } from '../src/shared/assets';
import { secondWeapons, weaponInfo, weaponKey, weaponSheets, W_NUM } from '../src/shared/weapons';
import { listOf } from '../src/shared/ranks';
import { Store } from '../src/main/db';
import { fakeState } from './fixtures';

const D = '2026-11-25';
let n = 0;
const ctx = (today = D) => ({ today, newId: () => 'p2-' + ++n });
const run = (s: AppState, c: Command, today = D) => apply(s, c, ctx(today)).state;
const res = (s: AppState, c: Command) => apply(s, c, ctx());
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = <T,>(r: () => number, l: T[]): T => l[Math.floor(r() * l.length)];
const target = (r: AssetRow) => (r.stored ? { id: r.key } : { id: r.key, base: r.a });
const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

// 150 στρατιώτες με κύριο όπλο (150), 150 αποθηκευμένα όπλα (πιστόλια/πολυβόλα: δεύτερα ή αχρέωτα), 100 υλικά, 3 στελέχη
function world(seed: number) {
  const r = rng(seed); let s = fakeState(150);
  s = run(s, { t: 'setWeapons', changes: s.people.map(p => ({ pid: p.id, weapon: String(100000 + p.id), wtype: pick(r, ['G3A3', 'G3A4']), rack: pick(r, ['Α', 'Ε']), wpos: String(1 + (p.id % 40)) })) });
  for (let i = 0; i < 3; i++) s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ' + i, first: 'ΑΛΦΑ', weapon: 'Μ-' + i, wtype: 'Μ1911 Α1' } as any });
  const assets = [];
  for (let i = 0; i < 150; i++) {
    const q = r(); const holder: AssetHolder | undefined = q < 0.5 ? { k: 'person', pid: 1 + Math.floor(r() * 150) } : q < 0.6 ? { k: 'cadre', cid: s.cadreList[i % 3].id } : q < 0.7 ? { k: 'unit', name: 'ΑΛΛΗ ΙΛΗ' } : undefined;
    assets.push({ id: 'w' + i, cat: i % 3 ? 'pistolia' : 'polyvola', type: i % 3 ? 'Μ1911 Α1' : 'MG3A1', no: 'W' + i, state: 'ok' as const, ...(holder ? { holder } : {}) });
  }
  for (let i = 0; i < 100; i++) {
    const q = r(); const holder: AssetHolder | undefined = q < 0.5 ? { k: 'person', pid: 1 + Math.floor(r() * 150) } : q < 0.6 ? { k: 'cadre', cid: s.cadreList[i % 3].id } : undefined;
    assets.push({ id: 'm' + i, cat: pick(r, ['diopt', 'asyrm', 'imatismos']), type: 'ΕΙΔΟΣ' + (i % 5), no: i % 4 ? 'M' + i : '', ...(i % 4 ? {} : { qty: 1 + (i % 7) }), state: 'ok' as const, ...(holder ? { holder } : {}), ...(i % 3 ? {} : { accs: [{ name: 'ΘΗΚΗ', qty: 2 }], acc: '2 ΘΗΚΗ' }) });
  }
  return { s: { ...s, assets } as AppState, r };
}

// Τα όπλα που έχει ο καθένας κατά το Μητρώο (κύριο + δεύτερα, όχι προς διαγραφή) και κατά τον Οπλισμό / την Κατάσταση οπλισμού
function checkAgree(s: AppState, tag: string) {
  const reg = registry(s); const sec = secondWeapons(s);
  const sheet = weaponSheets(s, D)[0]; const head = sheet.head; const iLast = head.indexOf('ΕΠΙΘΕΤΟ');
  // κάθε αριθμός όπλου (όχι διπλός στο Δυναμολόγιο) μία φορά στο Μητρώο
  const wk = reg.filter(x => x.cat?.kind === 'weapon').map(x => weaponKey(x.a.no)).filter(Boolean);
  const dupPrim = new Set<string>(); const seenP = new Set<string>();
  for (const p of [...s.people, ...s.cadreList]) { const k = weaponKey(p.weapon); if (!k) continue; if (seenP.has(k)) dupPrim.add(k); seenP.add(k); }
  const seenR = new Set<string>(); for (const k of wk) { if (!dupPrim.has(k)) expect(seenR.has(k), tag + ' διπλή γραμμή ' + k).toBe(false); seenR.add(k); }
  for (const p of s.people) {
    if (!p.active) continue;
    const h: AssetHolder = { k: 'person', pid: p.id };
    const held = heldBy(reg, h); const card = heldGroups(reg, h).flatMap(([, l]) => l);
    // η καρτέλα του ατόμου (Χρεωμένα) = το Μητρώο
    expect(card.map(x => x.key).sort(), tag + ' καρτέλα ' + p.id).toEqual(held.filter(x => x.cat?.kind !== 'vehicle').map(x => x.key).sort());
    // ο Οπλισμός (δεύτερα όπλα) = τα όπλα του Μητρώου του ατόμου που δεν είναι το κύριο και δεν είναι προς διαγραφή
    const mine = held.filter(x => x.cat?.kind === 'weapon' && !x.link && x.a.state !== 'writeoff' && !seenP.has(weaponKey(x.a.no))).map(x => weaponKey(x.a.no)).sort();
    expect([...new Set((sec.get(p.id) || []).map(a => weaponKey(a.no)))].sort(), tag + ' δεύτερα ' + p.id).toEqual([...new Set(mine)].sort());
    // η Κατάσταση οπλισμού (φύλλο ΟΛΟΙ): το κύριο και τα δεύτερα του ατόμου
    const xl = sheet.rows.filter(row => row[iLast] === p.last && row[iLast + 1] === p.first).map(row => weaponKey(String(row[W_NUM]))).filter(Boolean).sort();
    const want = [...(weaponKey(p.weapon) ? [weaponKey(p.weapon)] : []), ...new Set(mine)].sort();
    expect(xl, tag + ' Excel ' + p.id).toEqual(want);
  }
}

describe('Π2: Μητρώο ↔ Οπλισμός ↔ καρτέλα ↔ Excel σε 300 όπλα και 100 υλικά', () => {
  it('30 τυχαίες σειρές των 25 εντολών: όλες οι οθόνες συμφωνούν μετά από κάθε εντολή', () => {
    let steps = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let { s, r } = world(seed); checkAgree(s, 'seed ' + seed + ' αρχή');
      for (let step = 0; step < 25; step++) {
        const rows = registry(s).filter(x => x.cat?.kind !== 'vehicle'); const row = pick(r, rows); const op = r(); const date = addDays(D, step % 3);
        const who = (): AssetHolder | null => { const q = r(); return q < 0.55 ? { k: 'person', pid: pick(r, s.people).id } : q < 0.7 ? { k: 'cadre', cid: pick(r, s.cadreList).id } : q < 0.8 ? { k: 'ext', name: 'ΙΔΙΩΤΗΣ' } : null; };
        let c: Command;
        if (op < 0.2) c = { t: 'assetHolder', ...target(row), holder: who(), date };
        else if (op < 0.27) c = { t: 'assetBulk', items: [row, pick(r, rows), pick(r, rows)].filter((x, i, l) => l.indexOf(x) === i).map(target), op: { k: 'holder', holder: who() }, date };
        else if (op < 0.35) c = { t: 'assetState', ...target(row), state: pick(r, ['ok', 'repair', 'writeoff', 'immobile'] as const), why: 'ΒΛΑΒΗ', date };
        else if (op < 0.4) c = { t: 'assetGone', ...target(row), date };
        else if (op < 0.45) c = { t: 'assetMaint', ...target(row), date };
        else if (op < 0.6) { const p = pick(r, s.people); c = { t: 'setWeapons', changes: [{ pid: p.id, weapon: r() < 0.2 ? '' : r() < 0.5 ? 'W' + Math.floor(r() * 150) : String(100000 + Math.floor(r() * 200)) }] }; }
        else if (op < 0.68) { const cat = pick(r, assetCfgOf(s.settings, s).cats.filter(x => x.kind !== 'vehicle' && x.types.length && !x.id.startsWith('wt:'))); c = { t: 'renameAssetType', cat: cat.id, from: pick(r, cat.types), to: 'ΤΥΠΟΣ ' + seed + '-' + step }; }
        else if (op < 0.76) { const p = pick(r, s.people.filter(x => x.active)); if (!p) continue; c = { t: 'addMove', pid: p.id, dir: 'out', why: pick(r, ['ΜΕΤΑΘΕΣΗ', 'ΑΠΟΣΠΑΣΗ']), where: 'ΜΟΝΑΔΑ Χ', on: D }; }
        else if (op < 0.8) { const l = s.people.filter(x => x.active).slice(0, 3); if (!l.length) continue; c = { t: 'dischargeEsso', esso: '2026 Α', on: D, pids: l.map(x => x.id) }; }
        else if (op < 0.9) c = { t: 'saveAsset', asset: { cat: pick(r, ['pistolia', 'diopt', 'asyrm']), type: 'ΝΕΟ', no: 'N' + seed + '-' + step, holder: who() || undefined, state: 'ok' }, date, addType: r() < 0.5 };
        else { const x = pick(r, s.cadreList); c = { t: 'saveCadre', cadre: { ...x, weapon: r() < 0.3 ? '' : 'Μ-' + Math.floor(r() * 6) } }; }
        try { s = run(s, c, date); steps++; } catch { continue; }
        checkAgree(s, 'seed ' + seed + ' βήμα ' + step + ' ' + c.t);
      }
    }
    expect(steps).toBeGreaterThan(500);
  }, 300000);

  it('η αναίρεση (patch της βάσης) γυρίζει πίσω κάθε εντολή, με τη σειρά, ως την αρχή', async () => {
    const norm = (s: AppState) => JSON.stringify({ people: s.people, cadre: s.cadreList, assets: [...(s.assets || [])].sort((a, b) => a.id.localeCompare(b.id)), log: [...(s.assetLog || [])].sort((a, b) => a.id.localeCompare(b.id)), cats: s.settings.assets, lists: s.settings.lists });
    for (let seed = 1; seed <= 6; seed++) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-undo-')); const st = new Store(dir, WASM); await st.open();
      try {
        const w = world(100 + seed); const r = w.r; st.commit(w.s);
        const snaps: string[] = []; const patches: ReturnType<Store['commit']>[] = [];
        for (let step = 0; step < 30; step++) {
          const s = st.state; const rows = registry(s).filter(x => x.cat?.kind !== 'vehicle'); const row = pick(r, rows); const op = r();
          const c: Command = op < 0.3 ? { t: 'assetHolder', ...target(row), holder: r() < 0.6 ? { k: 'person', pid: pick(r, s.people).id } : null, date: D }
            : op < 0.45 ? { t: 'assetState', ...target(row), state: pick(r, ['repair', 'ok'] as const), date: D }
            : op < 0.55 ? { t: 'assetGone', ...target(row), date: D }
            : op < 0.7 ? { t: 'setWeapons', changes: [{ pid: pick(r, s.people).id, weapon: r() < 0.3 ? '' : 'W' + Math.floor(r() * 150) }] }
            : op < 0.8 ? { t: 'renameAssetType', cat: 'tyfekia', from: pick(r, assetCfgOf(s.settings, s).cats[0].types), to: 'ΤΥΦ ' + step }
            : op < 0.9 ? { t: 'deleteAsset', id: pick(r, (s.assets || []).map(a => a.id)) }
            : { t: 'addMove', pid: pick(r, s.people).id, dir: 'out', why: 'ΜΕΤΑΘΕΣΗ', on: D };
          let next: AppState; try { next = run(s, c); } catch { continue; }
          snaps.push(norm(s)); patches.push(st.commit(next));
        }
        expect(patches.length).toBeGreaterThan(15);
        for (let i = patches.length - 1; i >= 0; i--) { st.revert(patches[i]); expect(norm(st.state), 'seed ' + seed + ' βήμα ' + i).toBe(snaps[i]); }
      } finally { st.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    }
  }, 120000);

  it('το Excel ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ μετά από τυχαίες εντολές: κάθε γραμμή του Μητρώου μία φορά', () => {
    for (let seed = 1; seed <= 10; seed++) {
      let { s, r } = world(200 + seed);
      for (let step = 0; step < 15; step++) { const row = pick(r, registry(s).filter(x => x.cat?.kind !== 'vehicle')); try { s = run(s, { t: 'assetHolder', ...target(row), holder: r() < 0.5 ? { k: 'person', pid: pick(r, s.people).id } : null, date: D }); } catch { /* */ } }
      const rows = registry(s).filter(x => x.cat?.kind !== 'vehicle'); const sh = assetSheets(s, rows, D).filter(x => x.kind !== 'totals');
      expect(sh.reduce((a, x) => a + x.rows.length, 0), 'seed ' + seed).toBe(rows.length);
    }
  });
});

describe('Π2: σφάλματα που βρέθηκαν', () => {
  const cadreWith = () => {
    let s = fakeState(3);
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΟΣ', first: 'ΑΛΦΑ', weapon: 'Μ-5', wtype: 'Μ1911 Α1' } as any });
    return s;
  };
  it('διαγραφή στελέχους που έχει χρεωμένα: δεν γίνεται, λέει τι έχει (αλλιώς έμεναν χρεωμένα σε «άγνωστο στέλεχος»)', () => {
    let s = cadreWith(); const cid = s.cadreList[0].id;
    s = run(s, { t: 'saveAsset', asset: { cat: 'diopt', type: 'ΔΙΟΠΤΡΑ', no: 'D1', holder: { k: 'cadre', cid }, state: 'ok' }, date: D });
    expect(() => run(s, { t: 'deleteCadre', id: cid })).toThrow(/ΔΙΟΠΤΡΑ D1/);
    // μόνο το κύριο όπλο: το ίδιο (αλλιώς το όπλο έφευγε από το Μητρώο και την Κατάσταση οπλισμού)
    const s2 = cadreWith(); expect(() => run(s2, { t: 'deleteCadre', id: s2.cadreList[0].id })).toThrow(/Μ-5/);
    // χωρίς χρεωμένα: σβήνεται όπως πριν
    let s3 = cadreWith(); s3 = run(s3, { t: 'saveCadre', cadre: { ...s3.cadreList[0], weapon: '' } });
    expect(run(s3, { t: 'deleteCadre', id: s3.cadreList[0].id }).cadreList).toHaveLength(0);
    // οδηγός οχήματος: το ίδιο
    let s4 = cadreWith(); const c4 = s4.cadreList[0].id; s4 = run(s4, { t: 'saveCadre', cadre: { ...s4.cadreList[0], weapon: '' } });
    s4 = run(s4, { t: 'saveAsset', asset: { cat: 'troxofora', type: 'ΜΑΝ 6t', no: 'ΕΣ 1', plate: 'ΕΣ 1', state: 'ok', driver: { k: 'cadre', cid: c4 } }, date: D });
    expect(() => run(s4, { t: 'deleteCadre', id: c4 })).toThrow(/οδηγός/);
  });
  it('στέλεχος εκτός δύναμης με χρεωμένα: η ενέργεια το λέει (όπως για τους στρατιώτες)', () => {
    let s = cadreWith(); const c = s.cadreList[0];
    s = run(s, { t: 'saveAsset', asset: { cat: 'asyrm', type: 'ΑΣΥΡΜΑΤΟΣ', no: 'R9', holder: { k: 'cadre', cid: c.id }, state: 'ok' }, date: D });
    const r = res(s, { t: 'saveCadre', cadre: { ...s.cadreList[0], active: false } });
    expect(r.text).toMatch(/ΠΡΟΣΟΧΗ: χρεωμένα/); expect(r.text).toMatch(/R9/); expect(r.text).toMatch(/Μ-5/);
    // άλλη αλλαγή στοιχείων: καμία προειδοποίηση
    expect(res(s, { t: 'saveCadre', cadre: { ...s.cadreList[0], first: 'ΒΗΤΑ' } }).text).not.toMatch(/ΠΡΟΣΟΧΗ/);
  });
  it('μετονομασία τύπου όπλου: αλλάζει και στη λίστα «Τύποι όπλων», χωρίς νέα κατηγορία με το παλιό όνομα', () => {
    let s = fakeState(3); s = run(s, { t: 'setWeapons', changes: [{ pid: 1, weapon: '1', wtype: 'G3A3' }] });
    // οι κατηγορίες αποθηκευμένες (όπως μετά από μια αλλαγή στις Ρυθμίσεις)
    s = { ...s, settings: { ...s.settings, assets: { ...(s.settings.assets || {}), cats: assetCfgOf(s.settings).cats } } };
    s = run(s, { t: 'renameAssetType', cat: 'tyfekia', from: 'G3A3', to: 'G3A3 Νεο' });
    const cats = assetCfgOf(s.settings, s).cats;
    expect(cats.filter(c => c.types.some(t => t === 'G3A3'))).toHaveLength(0);
    expect(cats.find(c => c.id === 'tyfekia')!.types).toContain('G3A3 Νεο');
    expect(listOf(s.settings.lists, 'weaponTypes')).toContain('G3A3 ΝΕΟ'); expect(listOf(s.settings.lists, 'weaponTypes')).not.toContain('G3A3');
    expect(s.people[0].wtype).toBe('G3A3 ΝΕΟ');
    // ξανά πίσω: ο βασικός τύπος ξαναφαίνεται, χωρίς διπλό
    s = run(s, { t: 'renameAssetType', cat: 'tyfekia', from: 'G3A3 Νεο', to: 'G3A3' });
    expect(listOf(s.settings.lists, 'weaponTypes').filter(t => t === 'G3A3')).toHaveLength(1); expect(listOf(s.settings.lists, 'weaponTypes')).not.toContain('G3A3 ΝΕΟ');
    // τύπος υλικού: η λίστα τύπων όπλων δεν αλλάζει
    const m = run(fakeState(2), { t: 'renameAssetType', cat: 'polyvola', from: 'MG3A1', to: 'MG3' });
    expect(listOf(m.settings.lists, 'weaponTypes')).toEqual(listOf(fakeState(2).settings.lists, 'weaponTypes').map(t => (t === 'MG3A1' ? 'MG3' : t)));
    expect(holderText(m, undefined)).toBe('αχρέωτο');
    void sameHolder; void weaponInfo;
  });
});
