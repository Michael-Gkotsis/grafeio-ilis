// Sweep 17/11: weapons/materials registry (#347) and vehicles (#348). Random sequences of the real commands, with the Δυναμολόγιο
// (Person.weapon, the «Κατάσταση οπλισμού») and the registry checked against each other after every step (Michael: «δες πως
// συνδυάζονται με την κατάσταση οπλισμού»), the Excel sheets against plain counts, and the ΗΚΑΙ vehicles block against a model.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { addDays, type ISODate } from '../src/shared/dates';
import type { AppState, AssetHolder } from '../src/shared/domain';
import { assetSheets, holderText, registry, sameHolder, totalsSheet, assetCfgOf, type AssetRow } from '../src/shared/assets';
import { weaponInfo, weaponKey, inOutText, weaponSheets } from '../src/shared/weapons';
import { hkaiVeh, vehHkai, vehMaint, vehicleRows, vehicleSheets } from '../src/shared/vehicles';
import { upper } from '../src/shared/text';
import { fakeState } from './fixtures';

const D = '2026-11-17';
let n = 0;
const ctx = (today = D) => ({ today, newId: () => 'y' + ++n });
const run = (s: AppState, c: Command, today = D) => apply(s, c, ctx(today)).state;
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = <T,>(r: () => number, l: T[]): T => l[Math.floor(r() * l.length)];
// capitals; the disjunctive «Ή» keeps its accent in capitals (so it is not read as the article «Η»)
const isUp = (v: unknown) => typeof v !== 'string' || v.replace(/ Ή /g, ' Η ') === upper(v);

// the registry row the screen would act on, as a command target (id + base for a virtual row)
const target = (r: AssetRow) => (r.stored ? { id: r.key } : { id: r.key, base: r.a });
const prim = (s: AppState): { h: AssetHolder; k: string }[] => [
  ...s.people.filter(p => weaponKey(p.weapon)).map(p => ({ h: { k: 'person', pid: p.id } as AssetHolder, k: weaponKey(p.weapon) })),
  ...s.cadreList.filter(c => weaponKey(c.weapon)).map(c => ({ h: { k: 'cadre', cid: c.id } as AssetHolder, k: weaponKey(c.weapon) }))
];

function world(seed: number) {
  const r = rng(seed); let s = fakeState(10);
  for (const p of s.people) if (r() < 0.8) s = run(s, { t: 'setWeapons', changes: [{ pid: p.id, weapon: String(100 + Math.floor(r() * 30)), wtype: pick(r, ['G3A3', 'G3A4', 'MG3A1', '']), rack: pick(r, ['Ε', 'Α', '']), wpos: String(1 + Math.floor(r() * 9)) }] });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΕΝΑ', weapon: 'Μ-' + Math.floor(r() * 9), wtype: 'Μ1911 Α1' } as any });
  return { s, r };
}

describe('Μητρώο ↔ Δυναμολόγιο (Κατάσταση οπλισμού): 300 τυχαίες σειρές εντολών', () => {
  it('κάθε όπλο ατόμου είναι στο μητρώο μία φορά με αυτόν κάτοχο, και κανείς δεν «κρατά» στο μητρώο όπλο που δεν έχει πια', () => {
    for (let seed = 1; seed <= 300; seed++) {
      let { s, r } = world(seed); const second = new Set<string>();   // ids of second weapons created by hand (allowed extra holdings)
      for (let step = 0; step < 14; step++) {
        const rows = registry(s).filter(x => x.cat?.kind === 'weapon'); const op = r(); const date = addDays(D, step);
        const who = (): AssetHolder | null => { const q = r(); return q < 0.5 ? { k: 'person', pid: pick(r, s.people).id } : q < 0.65 ? { k: 'cadre', cid: s.cadreList[0].id } : q < 0.8 ? { k: 'unit', name: 'ΑΛΛΗ ΙΛΗ' } : null; };
        if (op < 0.15 && rows.length) s = run(s, { t: 'assetMaint', ...target(pick(r, rows)), date });
        else if (op < 0.3 && rows.length) {
          const row = pick(r, rows); const h = who(); const had = h && prim(s).find(p => sameHolder(p.h, h));
          s = run(s, { t: 'assetHolder', ...target(row), holder: h, date });
          // given to someone who already has a weapon: it is his second weapon (allowed), not his Δυναμολόγιο one
          if (h && had && had.k !== weaponKey(row.a.no)) for (const a of s.assets || []) if (weaponKey(a.no) === weaponKey(row.a.no) && sameHolder(a.holder, h)) second.add(a.id);
          if (!h || !had || had.k === weaponKey(row.a.no)) for (const a of s.assets || []) if (weaponKey(a.no) === weaponKey(row.a.no)) second.delete(a.id);
        }
        else if (op < 0.42 && rows.length) s = run(s, { t: 'assetState', ...target(pick(r, rows)), state: pick(r, ['ok', 'repair', 'writeoff']), why: 'ΒΛΑΒΗ', date });
        else if (op < 0.5 && rows.length) {
          const row = pick(r, rows); s = run(s, { t: 'assetGone', ...target(row), why: 'ΚΑΤΑΣΤΡΑΦΗ', date });
          // written off for good: nobody keeps it in the Δυναμολόγιο (the Κατάσταση οπλισμού showed it ΕΝΤΟΣ)
          if (row.link) expect(prim(s).some(p => sameHolder(p.h, row.link!) && p.k === weaponKey(row.a.no)), 'seed ' + seed + ' gone but still assigned').toBe(false);
        }
        else if (op < 0.75) { const p = pick(r, s.people); s = run(s, { t: 'setWeapons', changes: [{ pid: p.id, weapon: r() < 0.2 ? '' : String(100 + Math.floor(r() * 30)) }] }); }
        else if (op < 0.85) { const p = pick(r, s.people); const before = new Set((s.assets || []).map(a => a.id)); s = run(s, { t: 'saveAsset', asset: { cat: 'pistolia', type: 'Μ1911 Α1', no: 'Π-' + step + '-' + Math.floor(r() * 1000), holder: { k: 'person', pid: p.id }, state: 'ok' }, date }); for (const a of s.assets || []) if (!before.has(a.id)) second.add(a.id); }
        else { const c = s.cadreList[0]; s = run(s, { t: 'saveCadre', cadre: { ...c, weapon: r() < 0.3 ? '' : 'Μ-' + Math.floor(r() * 9) } }); }
        // ---- invariants ----
        const reg = registry(s).filter(x => x.cat?.kind === 'weapon');
        expect(new Set(reg.map(x => x.key)).size, 'seed ' + seed).toBe(reg.length);
        const pr = prim(s); const dupK = new Set(pr.filter((p, i) => pr.findIndex(q => q.k === p.k) !== i).map(p => p.k));   // same number twice in the Δυναμολόγιο: a data error the Οπλισμός flags («Ίδιος αριθμός»)
        for (const p of pr) {
          if (dupK.has(p.k)) continue;
          const hits = reg.filter(x => weaponKey(x.a.no) === p.k && x.link && sameHolder(x.link, p.h));
          expect(hits.length, 'seed ' + seed + ' step ' + step + ' ' + p.k).toBe(1);
          expect(sameHolder(hits[0].a.holder, p.h)).toBe(true);
        }
        for (const x of reg) {
          const h = x.a.holder; if (!h || (h.k !== 'person' && h.k !== 'cadre') || second.has(x.key)) continue;
          // a weapon «held» by a soldier or cadre in the registry is that one's weapon in the Δυναμολόγιο
          const mine = prim(s).find(p => sameHolder(p.h, h));
          if (mine && dupK.has(mine.k)) continue;
          expect(mine?.k, 'seed ' + seed + ' step ' + step + ' stale holder ' + x.a.no + ' → ' + holderText(s, h)).toBe(weaponKey(x.a.no));
        }
      }
    }
  });

  it('όπλο προς επισκευή στο μητρώο: στην Κατάσταση οπλισμού δεν φαίνεται ΕΝΤΟΣ', () => {
    let { s } = world(77); const p = s.people.find(x => weaponKey(x.weapon))!;
    const row = registry(s).find(x => x.link && x.link.k === 'person' && x.link.pid === p.id)!;
    s = run(s, { t: 'assetState', ...target(row), state: 'repair', why: 'ΣΠΑΣΜΕΝΟ ΚΛΕΙΣΤΡΟ', date: D });
    const info = weaponInfo(s, D);
    expect(inOutText(s.people.find(x => x.id === p.id)!, info)).toMatch(/^ΕΚΤΟΣ: ΠΡΟΣ ΕΠΙΣΚΕΥΗ/);
    const all = weaponSheets(s, D)[0]; expect(all.rows.find(x => x[10] === p.weapon)![13]).toMatch(/ΠΡΟΣ ΕΠΙΣΚΕΥΗ/);
    s = run(s, { t: 'assetState', id: registry(s).find(x => x.link && x.link.k === 'person' && x.link.pid === p.id)!.key, state: 'ok', date: D });
    expect(inOutText(s.people.find(x => x.id === p.id)!, weaponInfo(s, D))).toBe('ΕΝΤΟΣ');
  });
});

describe('Excel ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ: ίδιο με απλό μέτρημα', () => {
  it('200 τυχαία μητρώα: κάθε γραμμή μία φορά, ΣΥΝΟΛΑ = μέτρημα, χρεωμένα + αχρέωτα + σε άλλον = σύνολο, κεφαλαία, ονόματα φύλλων έγκυρα', () => {
    for (let seed = 1; seed <= 200; seed++) {
      let { s, r } = world(3000 + seed);
      for (let i = 0; i < 8; i++) {
        const cat = pick(r, ['tyfekia', 'pistolia', 'polyvola', 'diopt', 'asyrm', 'imatismos', 'loipo']);
        const h: AssetHolder | undefined = pick(r, [undefined, { k: 'person', pid: pick(r, s.people).id }, { k: 'unit', name: '2Η ΙΛΗ' }, { k: 'ext', name: 'ΠΟΛΙΤΗΣ' }]) as AssetHolder | undefined;
        s = run(s, { t: 'saveAsset', asset: { cat, type: pick(r, ['G3A3', 'Μ1911 Α1', 'MG3A1', 'ΑΣΥΡΜΑΤΟΣ RF-13', 'χλαίνη', 'Τύπος/με:σύμβολα*?', 'πολύ μακρύς τύπος όπλου που ξεπερνά τα τριάντα ένα γράμματα']), no: 'Χ' + i + seed, qty: cat === 'imatismos' ? 1 + Math.floor(r() * 40) : undefined, holder: h, state: pick(r, ['ok', 'ok', 'repair', 'writeoff', 'immobile']), warOnly: r() < 0.2, note: r() < 0.3 ? 'σημείωση με μικρά' : undefined } as any, date: D });
      }
      const rows = registry(s); const cfg = assetCfgOf(s.settings);
      const sh = assetSheets(s, rows, D);
      const names = sh.map(x => x.name); expect(new Set(names).size).toBe(names.length);
      for (const nm of names) { expect(nm.length).toBeLessThanOrEqual(31); expect(nm).not.toMatch(/[\\/?*[\]:]/); }
      for (const x of sh) { expect(isUp(x.title)).toBe(true); for (const h of x.head) expect(isUp(h)).toBe(true); for (const row of x.rows) { expect(row.length).toBe(x.head.length); for (const v of row) expect(isUp(v), 'seed ' + seed + ' ' + x.name + ' ' + v).toBe(true); } }
      // every non-vehicle row appears exactly once in the per-type/per-category sheets
      const listed = sh.filter(x => x.kind === 'weapon' || x.kind === 'material').reduce((a, x) => a + x.rows.length, 0);
      expect(listed, 'seed ' + seed).toBe(rows.filter(x => x.cat && x.cat.kind !== 'vehicle').length);
      const tot = sh.find(x => x.kind === 'totals')!; const g = tot.rows[tot.rows.length - 1];
      const q = (x: AssetRow) => x.a.qty || 1; const nonV = rows.filter(x => x.cat && x.cat.kind !== 'vehicle');
      expect(g[2]).toBe(nonV.reduce((a, x) => a + q(x), 0));
      expect(g[3]).toBe(nonV.filter(x => x.a.holder && (x.a.holder.k === 'person' || x.a.holder.k === 'cadre')).reduce((a, x) => a + q(x), 0));
      expect(g[4]).toBe(nonV.filter(x => !x.a.holder).reduce((a, x) => a + q(x), 0));
      expect(g[6]).toBe(nonV.filter(x => x.a.state === 'repair' || x.a.state === 'immobile').reduce((a, x) => a + q(x), 0));
      for (const row of tot.rows) expect((row[3] as number) + (row[4] as number) + (row[5] as number)).toBe(row[2]);
      const sum = tot.rows.slice(0, -1).reduce((a, x) => a + (x[2] as number), 0); expect(sum).toBe(g[2]);
      void cfg; void totalsSheet;
    }
  });
});

describe('Οχήματα: χιλιόμετρα, συντήρηση και ΗΚΑΙ', () => {
  const veh = (s: AppState, type: string, plate: string, cat = 'troxofora') => run(s, { t: 'saveAsset', asset: { cat, type, no: plate, plate, state: 'ok' } as any, date: D });
  it('300 τυχαίες σειρές (γέμισμα, χλμ, συντήρηση, βλάβη, ακινησία, διαγραφή): ΗΚΑΙ «Κατάσταση οχημάτων» = μέτρημα, χλμ = η τελευταία καταγραφή κατά μέρα', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(8000 + seed); let s = fakeState(4);
      const plates = ['ΕΣ 1001', 'ΕΣ 1002', 'ΕΣ 1003', 'ΕΣ 1004'].slice(0, 1 + Math.floor(r() * 4));
      for (const p of plates) s = veh(s, pick(r, ['ΜΑΝ 6t', 'HUMMER', 'M113']), p, pick(r, ['troxofora', 'erpystr']));
      const lastKm = new Map<string, { d: ISODate; km: number }>();
      for (let step = 0; step < 15; step++) {
        const v = pick(r, vehicleRows(s)); const date = addDays('2026-11-01', Math.floor(r() * 30)); const op = r();
        if (op < 0.3) { const km = Math.floor(r() * 90000); s = run(s, { t: 'assetFuel', id: v.key, date, litres: 10 + Math.floor(r() * 80), km }); const o = lastKm.get(v.key); if (!o || date >= o.d) lastKm.set(v.key, { d: date, km }); }
        else if (op < 0.5) { const km = Math.floor(r() * 90000); s = run(s, { t: 'assetKm', id: v.key, date, km }); const o = lastKm.get(v.key); if (!o || date >= o.d) lastKm.set(v.key, { d: date, km }); }
        else if (op < 0.65) { const km = r() < 0.5 ? Math.floor(r() * 90000) : undefined; s = run(s, { t: 'assetMaint', id: v.key, date, km }); if (km != null) { const o = lastKm.get(v.key); if (!o || date >= o.d) lastKm.set(v.key, { d: date, km }); } }
        else if (op < 0.85) s = run(s, { t: 'assetState', id: v.key, state: pick(r, ['ok', 'repair', 'immobile', 'writeoff']), why: 'ΒΛΑΒΗ', date });
        else if (op < 0.9 && vehicleRows(s).length > 1) { s = run(s, { t: 'assetGone', id: v.key, date }); lastKm.delete(v.key); }
      }
      const rows = vehicleRows(s);
      for (const x of rows) { const o = lastKm.get(x.key); expect(x.a.km, 'seed ' + seed).toBe(o?.km); expect(x.a.kmOn).toBe(o?.d); }
      for (const d of [D, '2026-11-05', '2026-11-30', '2027-06-01']) {
        const h = vehHkai(s, d)!;
        const cfg = assetCfgOf(s.settings);
        expect(h.prov).toBe(rows.length);
        expect(h.kin).toBe(rows.filter(x => x.a.kmOn === d || (s.assetLog || []).some(e => e.aid === x.key && e.date === d && (e.what === 'km' || e.what === 'fuel'))).length);
        expect(h.dmg).toBe(rows.filter(x => x.a.state === 'immobile').length);
        expect(h.maint).toBe(rows.filter(x => x.a.state === 'repair' || (x.a.state === 'ok' && vehMaint(x.a, x.cat, d, cfg.warnDays).st === 'overdue')).length);
        expect((h.dmg || 0) + (h.maint || 0)).toBeLessThanOrEqual(h.prov || 0);
        expect(isUp(h.type)).toBe(true);
      }
      // the ΗΚΑΙ uses the registry only when the option is on; what you wrote by hand always wins
      expect(hkaiVeh(s, D)).toEqual(s.settings.hkai?.veh);
      const on = { ...s, settings: { ...s.settings, hkai: { ...(s.settings.hkai || {}), vehReg: true, veh: { type: '', prov: 9 } } } } as AppState;
      expect(hkaiVeh(on, D)).toMatchObject({ prov: 9, kin: vehHkai(s, D)!.kin, dmg: vehHkai(s, D)!.dmg, type: vehHkai(s, D)!.type });
      for (const x of vehicleSheets(s, D)) for (const row of x.rows) for (const v of row) expect(isUp(v), 'seed ' + seed + ' ' + x.name + ' «' + v + '»').toBe(true);
    }
  });
  it('edge: συντήρηση κάθε 6 μήνες από 31/8 → 28/2 (ή 29/2), και κατά χλμ όποιο έρθει πρώτο', () => {
    let s = veh(fakeState(2), 'ΜΑΝ 6t', 'ΕΣ 9');
    const id = vehicleRows(s)[0].key;
    s = run(s, { t: 'assetMaint', id, date: '2026-08-31', km: 1000 });
    let a = vehicleRows(s)[0].a; expect(a.maint).toMatchObject({ last: '2026-08-31', next: '2027-02-28', lastKm: 1000, nextKm: 6000 });
    s = run(s, { t: 'assetMaint', id, date: '2027-08-31' }); a = vehicleRows(s)[0].a; expect(a.maint!.next).toBe('2028-02-29');
    s = run(s, { t: 'assetKm', id, date: '2027-09-01', km: 5999 });
    a = vehicleRows(s)[0].a; expect(vehMaint(a, vehicleRows(s)[0].cat, '2027-09-01', 30)).toMatchObject({ st: 'soon', by: 'km', kmLeft: 1 });
    s = run(s, { t: 'assetKm', id, date: '2027-09-02', km: 6000 });
    a = vehicleRows(s)[0].a; expect(vehMaint(a, vehicleRows(s)[0].cat, '2027-09-02', 30)).toMatchObject({ st: 'overdue', by: 'km' });
    // an older reading does not overwrite a newer one
    s = run(s, { t: 'assetKm', id, date: '2027-08-01', km: 10 }); expect(vehicleRows(s)[0].a.km).toBe(6000);
  });
});
