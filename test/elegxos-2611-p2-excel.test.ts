// Έλεγχος 25/11, πακέτο Π2: το Μητρώο οπλισμού λέει ό,τι η Κατάσταση οπλισμού. Αλλάζουν τιμές του Excel ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ
// (Michael 25/11: «Ναι, και τα δύο»): (1) υλικό με τον ίδιο αριθμό δεν κρύβει το κύριο όπλο ατόμου, (2) δεύτερο όπλο ΑΠΩΝ σε υπηρεσία
// εκτός στρατοπέδου. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState } from '../src/shared/domain';
import { assetCfgOf, assetSheets, registry, rowPlace } from '../src/shared/assets';
import { secondText, secondWeapons, weaponInfo } from '../src/shared/weapons';
import { fakeState } from './fixtures';

const D = '2026-11-25';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'p2x-' + ++n }).state;

describe('Π2: Μητρώο ίδιο με την Κατάσταση οπλισμού (Michael 25/11: «Ναι, και τα δύο»)', () => {
  it('υλικό με τον ίδιο αριθμό με το όπλο ενός στρατιώτη: το όπλο μένει στο Μητρώο και στο Excel του', () => {
    let s = fakeState(3); s = run(s, { t: 'setWeapons', changes: [{ pid: 1, weapon: '123456', wtype: 'G3A3' }] });
    s = run(s, { t: 'saveAsset', asset: { cat: 'asyrm', type: 'ΑΣΥΡΜΑΤΟΣ', no: '123456', state: 'ok' }, date: D });
    const reg = registry(s);
    const w = reg.filter(x => x.cat?.kind === 'weapon'); expect(w).toHaveLength(1); expect(w[0].link).toEqual({ k: 'person', pid: 1 }); expect(w[0].a.type).toBe('G3A3');
    expect(reg.filter(x => x.cat?.kind === 'material')).toHaveLength(1);
    const sh = assetSheets(s, reg, D); expect(sh.find(x => x.name === 'G3A3')!.rows).toHaveLength(1); expect(sh.find(x => x.name === 'ΑΣΥΡΜΑΤΟΙ')!.rows).toHaveLength(1);
  });
  it('δεύτερο όπλο στρατιώτη σε υπηρεσία εκτός στρατοπέδου: ΑΠΩΝ και στο Μητρώο· όχι όταν είναι προς επισκευή', () => {
    let k = 0; const r2 = (st: AppState, c: Command) => apply(st, c, { today: D, newId: () => 'blk' + ++k }).state;
    let s = fakeState(6); s = { ...s, people: s.people.map(p => ({ ...p, weapon: String(5000 + p.id), wtype: 'G3A3' })) };
    s = r2(s, { t: 'addBlock', phase: s.settings.phase, name: 'Φυλάκιο Ποταμού', kind: 'other', armed: true, n: 1, per: 1, hrs: '15:00-22:00', armWeapon: 'own', hkCol: 'fyl' } as Command);
    const post = blocksOf(s.settings).find(b => b.name === 'Φυλάκιο Ποταμού')!;
    s = { ...s, guards: { [D]: { [post.posts[0].k]: 1 } } };
    s = run(s, { t: 'saveAsset', asset: { cat: 'pistolia', type: 'Μ1911 Α1', no: 'P77', holder: { k: 'person', pid: 1 }, state: 'ok' }, date: D });
    s = run(s, { t: 'saveAsset', asset: { cat: 'diopt', type: 'ΔΙΟΠΤΡΑ', no: 'D7', holder: { k: 'person', pid: 1 }, state: 'ok' }, date: D });
    const cfg = assetCfgOf(s.settings); const at = (st: AppState, no: string, hm = '18:00') => rowPlace(cfg, registry(st, { day: D, hm }).find(r => r.a.no === no)!);
    expect(at(s, '5001')).toBe('ΑΠΩΝ (ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ)'); expect(at(s, 'P77')).toBe('ΑΠΩΝ (ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ)');
    expect(secondText(s.people[0], secondWeapons(s).get(1)![0], weaponInfo(s, D, '18:00'))).toMatch(/^ΑΠΩΝ/);
    expect(at(s, 'D7')).toBe('');                       // το υλικό δεν «πηγαίνει» στο φυλάκιο
    expect(at(s, 'P77', '23:30')).toBe('');             // μετά την υπηρεσία
    const tot = assetSheets(s, registry(s, { day: D, hm: '18:00' }), D).find(x => x.kind === 'totals')!; expect(tot.rows[tot.rows.length - 1][tot.head.indexOf('ΑΠΟΝΤΑ')]).toBe(2);
    const id = registry(s).find(r => r.a.no === 'P77')!.key;
    s = run(s, { t: 'assetState', id, state: 'repair', why: 'ΒΛΑΒΗ', date: D });
    expect(at(s, 'P77')).toBe(''); expect(secondText(s.people[0], secondWeapons(s).get(1)![0], weaponInfo(s, D, '18:00'))).toMatch(/^ΕΚΤΟΣ: ΠΡΟΣ ΕΠΙΣΚΕΥΗ/);
  });
});
