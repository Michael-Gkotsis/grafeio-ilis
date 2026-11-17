// Μητρώο οπλισμού και υλικού (17/11, φάση 4): προεπιλογές, εικονικές γραμμές από τα κύρια όπλα, εγγραφή με την πρώτη αλλαγή, κάτοχος από το
// Δυναμολόγιο, δεύτερο όπλο, είδη κατόχων, φίλτρα, λέξεις θέσης, Excel «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ», παλιά κατάσταση. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import { apply, type Command } from '../src/shared/commands';
import type { AppState, Asset } from '../src/shared/domain';
import { addMonths, assetCfgOf, assetSheets, assetView, catCounts, catOfType, heldBy, heldGroups, materialise, maintState, placeMeans, placeText, placeWord, registry, assetHistory } from '../src/shared/assets';
import { weaponSheets } from '../src/shared/weapons';
import { assetBook } from '../src/main/excel';
import { fileNameOf } from '../src/shared/fileNames';
import { Store } from '../src/main/db';
import { fakeState } from './fixtures';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'x' + ++n }).state;
const wp = (s: AppState, pid: number, weapon: string, more: object = {}) => run(s, { t: 'setWeapons', changes: [{ pid, weapon, ...more }] });
function base() {
  let s = fakeState(12);
  s = wp(s, 1, 'Ι 12345', { wtype: 'G3A3', rack: 'Ε', wpos: '6' });
  s = wp(s, 2, '343148', { wtype: 'G3A4' });
  s = wp(s, 3, 'MG-77', { wtype: 'MG3A1' });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΛΟΧΙΑΣ', first: 'ΒΗΤΑΣ', weapon: 'Μ-555', wtype: 'Μ1911 Α1' } });
  return s;
}
const rowOf = (s: AppState, key: string) => registry(s).find(r => r.key === key)!;
const cadreOf = (s: AppState) => s.cadreList[0];

describe('Μητρώο: προεπιλογές και ρυθμίσεις', () => {
  it('οι κατηγορίες, οι λέξεις θέσης και οι μέρες προειδοποίησης έχουν προεπιλογές', () => {
    const c = assetCfgOf(fakeState(1).settings);
    expect(c.cats.map(x => x.name)).toEqual(['Τυφέκια', 'Πιστόλια', 'Πολυβόλα', 'Αντιαρματικά', 'Πυροβόλα', 'Διόπτρες', 'Ασύρματοι', 'Ιματισμός', 'Λοιπό υλικό', 'Τροχοφόρα', 'Ερπυστριοφόρα', 'Πολιτικού τύπου']);
    expect(c.cats.map(x => x.kind)).toEqual(['weapon', 'weapon', 'weapon', 'weapon', 'weapon', 'material', 'material', 'material', 'material', 'vehicle', 'vehicle', 'vehicle']);
    expect(c.cats[0].types).toEqual(expect.arrayContaining(['G3A3', 'G3A4', 'M16A2', 'M4']));
    expect(c.cats[1].types).toEqual(['Μ1911 Α1']); expect(c.cats[2].types).toEqual(['MG3A1', 'ΠΟΛ 0,50']);
    expect(c.cats[2].fields).toEqual([{ id: 'barrel', name: 'Αριθμός κάνης' }, { id: 'spare', name: 'Εφεδρική κάνη' }]);
    expect(c.places).toEqual([{ word: 'ΟΠΛΟΒΑΣΤΟ', means: 'rack' }, { word: 'ΚΙΒΩΤΙΟ', means: 'box' }, { word: 'Α.Ο', means: 'duty' }, { word: 'Α.Ο (ΑΔΕΙΑ)', means: 'leave' }, { word: 'Φ.Γ', means: 'guard' }, { word: 'Φ.Μ', means: 'guard' }, { word: 'ΑΠΟΘΗΚΗ', means: 'store' }]);
    expect(c.warnDays).toBe(30);
  });
  it('οι δικές σου κατηγορίες και λέξεις αντικαθιστούν τις προεπιλογές (δεδομένα, όχι κώδικας)', () => {
    const s = run(fakeState(1), { t: 'setSettings', settings: { assets: { cats: [{ id: 'k1', name: 'Φορητά', kind: 'weapon', types: ['ΧΧ'], fields: [], every: 3 }], places: [{ word: 'ΡΑΦΙ', means: 'store' }], warnDays: 10 } }, text: 'δοκιμή' });
    const c = assetCfgOf(s.settings);
    expect(c.cats).toHaveLength(1); expect(c.cats[0].every).toBe(3); expect(c.places[0].word).toBe('ΡΑΦΙ'); expect(c.warnDays).toBe(10);
    expect(catOfType(c, 'άγνωστος').id).toBe('k1');
  });
  it('τύπος όπλου → κατηγορία: η κατηγορία που τον έχει, αλλιώς Τυφέκια', () => {
    const c = assetCfgOf(fakeState(1).settings);
    expect(catOfType(c, 'MG3A1').name).toBe('Πολυβόλα'); expect(catOfType(c, 'μ1911 α1').name).toBe('Πιστόλια');
    expect(catOfType(c, 'G3A3').name).toBe('Τυφέκια'); expect(catOfType(c, '').name).toBe('Τυφέκια'); expect(catOfType(c, 'ΑΓΝΩΣΤΟ').name).toBe('Τυφέκια');
  });
});

describe('Μητρώο: εικονικές γραμμές από τα κύρια όπλα', () => {
  it('κάθε αριθμός όπλου ατόμου ή στελέχους γίνεται γραμμή, με κάτοχο, τύπο, οπλοβαστό και κατηγορία', () => {
    const s = base(); const rows = registry(s);
    expect(rows).toHaveLength(4); expect(rows.every(r => !r.stored && r.link)).toBe(true);
    const r1 = rowOf(s, 'v:p:1');
    expect(r1.a).toMatchObject({ no: 'Ι 12345', type: 'G3A3', rack: 'Ε', wpos: '6', holder: { k: 'person', pid: 1 }, state: 'ok' }); expect(r1.cat!.name).toBe('Τυφέκια');
    expect(rowOf(s, 'v:p:3').cat!.name).toBe('Πολυβόλα');
    const rc = rowOf(s, 'v:c:' + cadreOf(s).id); expect(rc.cat!.name).toBe('Πιστόλια'); expect(rc.a.holder).toEqual({ k: 'cadre', cid: cadreOf(s).id });
  });
  it('και όσοι βγήκαν εκτός δύναμης και δεν παρέδωσαν το όπλο', () => {
    let s = base(); s = { ...s, people: s.people.map(p => (p.id === 2 ? { ...p, active: false } : p)) };
    expect(registry(s).some(r => r.key === 'v:p:2')).toBe(true);
    expect(assetView(s, { filter: 'out' }, D).map(r => r.key)).toEqual(['v:p:2']);
  });
  it('άτομο χωρίς όπλο δεν δίνει γραμμή· ίδιος αριθμός με εγγραφή δεν διπλασιάζεται', () => {
    const s = base(); expect(registry(s).some(r => r.a.holder?.k === 'person' && (r.a.holder as { pid: number }).pid === 5)).toBe(false);
    const t = run(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'G3A3', no: 'Ι-12345', state: 'ok' }, date: D });
    expect(registry(t).filter(r => /12345/.test(r.a.no))).toHaveLength(1); expect(registry(t)).toHaveLength(4);
  });
});

describe('Μητρώο: εγγραφή με την πρώτη αλλαγή', () => {
  it('συντήρηση εικονικής γραμμής: γίνεται εγγραφή με τον ίδιο αριθμό και κάτοχο, ημερομηνίες και γεγονός', () => {
    let s = base(); const r = rowOf(s, 'v:p:1');
    s = run(s, { t: 'saveAsset', asset: { ...materialise(r, ''), id: undefined, state: 'ok', maint: { every: 6 } }, date: D });
    expect(s.assets).toHaveLength(1); const a = s.assets![0]; expect(a).toMatchObject({ no: 'Ι 12345', holder: { k: 'person', pid: 1 }, type: 'G3A3' });
    const m = run(s, { t: 'assetMaint', id: a.id, date: '2026-11-10' }).assets![0];
    expect(m.maint).toMatchObject({ last: '2026-11-10', next: '2027-05-10', every: 6 });
    // πατώντας κατευθείαν «Έγινε συντήρηση» σε άλλη εικονική γραμμή: δημιουργείται εγγραφή
    const t = run(base(), { t: 'assetState', id: 'v:p:3', base: rowOf(base(), 'v:p:3').a, state: 'repair', why: 'σκάνδαλο', date: D });
    expect(t.assets).toHaveLength(1); expect(t.assets![0]).toMatchObject({ no: 'MG-77', state: 'repair', why: 'σκάνδαλο', cat: 'polyvola', holder: { k: 'person', pid: 3 } });
    expect(registry(t).filter(x => x.a.no === 'MG-77')).toHaveLength(1);
    expect(t.assetLog!.map(e => e.what)).toEqual(['repair']);
    const b = run(t, { t: 'assetState', id: t.assets![0].id, state: 'ok', date: D });
    expect(b.assets![0].state).toBe('ok'); expect(b.assets![0].why).toBeUndefined(); expect(assetHistory(b.assetLog, t.assets![0].id).map(e => e.what)).toEqual(['back', 'repair']);
  });
  it('η μεταβολή δεν αλλάζει το Δυναμολόγιο: ο αριθμός, ο τύπος και η θέση μένουν στο άτομο', () => {
    const s = base(); const t = run(s, { t: 'assetMaint', id: 'v:p:1', base: rowOf(s, 'v:p:1').a, date: D });
    expect(t.people).toEqual(s.people);
  });
  it('άγνωστη εγγραφή ή χωρίς αριθμό: σφάλμα που εξηγεί· σβήσιμο εγγραφής επαναφέρει την εικονική γραμμή', () => {
    const s = base();
    expect(() => run(s, { t: 'assetMaint', id: 'zzz', date: D })).toThrow(/Δεν βρέθηκε/);
    expect(() => run(s, { t: 'saveAsset', asset: { cat: 'diopt', type: '', no: '  ', state: 'ok' }, date: D })).toThrow(/αριθμό/);
    const t = run(s, { t: 'assetMaint', id: 'v:p:1', base: rowOf(s, 'v:p:1').a, date: D }); const del = run(t, { t: 'deleteAsset', id: t.assets![0].id });
    expect(del.assets).toEqual([]); expect(del.assetLog).toEqual([]); expect(rowOf(del, 'v:p:1').stored).toBe(false);
  });
});

describe('Μητρώο: κάτοχοι', () => {
  it('το κύριο όπλο δείχνει πάντα τον κάτοχο του Δυναμολογίου, όχι τον αποθηκευμένο', () => {
    const s0 = base();
    const s = run(s0, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'G3A4', no: '343-148', holder: { k: 'unit', name: '50 ΕΜΑ' }, rack: 'Ζ', state: 'ok' }, date: D });
    const r = registry(s).find(x => x.stored)!;
    expect(r.a.holder).toEqual({ k: 'person', pid: 2 }); expect(r.link).toEqual({ k: 'person', pid: 2 }); expect(r.a.rack).toBeUndefined();
    // αλλάζει το Δυναμολόγιο: ακολουθεί
    const t = wp(s, 2, '343148', { rack: 'Ε', wpos: '9' }); expect(registry(t).find(x => x.stored)!.a).toMatchObject({ rack: 'Ε', wpos: '9' });
  });
  it('δεύτερο όπλο: «χρέωσε» σε άτομο που έχει ήδη κύριο όπλο το αποθηκεύει με κάτοχο, χωρίς να αλλάξει το Person', () => {
    let s = base(); s = run(s, { t: 'saveAsset', asset: { cat: 'pistolia', type: 'Μ1911 Α1', no: 'ΠΙΣ-1', state: 'ok' }, date: D });
    const id = s.assets![0].id; const before = s.people;
    s = run(s, { t: 'assetHolder', id, holder: { k: 'person', pid: 1 }, date: D });
    expect(s.people).toEqual(before); expect(s.assets![0].holder).toEqual({ k: 'person', pid: 1 });
    expect(heldBy(registry(s), { k: 'person', pid: 1 }).map(r => r.a.no).sort()).toEqual(['ΠΙΣ-1', 'Ι 12345'].sort());
    expect(heldGroups(registry(s), { k: 'person', pid: 1 }).map(g => g[0])).toEqual(['Τυφέκια', 'Πιστόλια']);
    expect(assetHistory(s.assetLog, id)[0]).toMatchObject({ what: 'assign' });
  });
  it('«χρέωσε» σε άτομο χωρίς κύριο όπλο το βάζει από τις εντολές του Οπλισμού (Person.weapon)· στέλεχος το ίδιο', () => {
    let s = base(); s = run(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'M16A2', no: 'ΝΕΟ-9', state: 'ok' }, date: D });
    const id = s.assets![0].id;
    const t = run(s, { t: 'assetHolder', id, holder: { k: 'person', pid: 5 }, date: D });
    expect(t.people.find(p => p.id === 5)).toMatchObject({ weapon: 'ΝΕΟ-9', wtype: 'M16A2' });
    expect(registry(t).find(r => r.key === id)!.link).toEqual({ k: 'person', pid: 5 });
    const c = run(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'M4', no: 'ΣΤ-1', state: 'ok' }, date: D });
    const cid = s.cadreList[0].id; const c2 = run(run(c, { t: 'saveCadre', cadre: { ...cadreOf(c), weapon: undefined, wtype: undefined } }), { t: 'assetHolder', id: c.assets![1].id, holder: { k: 'cadre', cid }, date: D });
    expect(c2.cadreList[0]).toMatchObject({ weapon: 'ΣΤ-1', wtype: 'M4' });
  });
  it('άλλη μονάδα, φυσικό πρόσωπο, στέλεχος, κανείς· χρέωση αλλού ενός κύριου όπλου το σβήνει από το άτομο', () => {
    let s = base(); const id0 = 'v:p:2';
    s = run(s, { t: 'assetHolder', id: id0, base: rowOf(s, id0).a, holder: { k: 'unit', name: '50 ΕΜΑ' }, date: D });
    expect(s.people.find(p => p.id === 2)!.weapon).toBeUndefined();
    const a = registry(s).find(r => r.a.no === '343148')!; expect(a.a.holder).toEqual({ k: 'unit', name: '50 ΕΜΑ' }); expect(a.link).toBeUndefined();
    const id = a.key;
    s = run(s, { t: 'assetHolder', id, holder: { k: 'ext', name: 'ΙΔΙΩΤΗΣ' }, date: D }); expect(registry(s).find(r => r.key === id)!.a.holder).toEqual({ k: 'ext', name: 'ΙΔΙΩΤΗΣ' });
    s = run(s, { t: 'assetHolder', id, holder: { k: 'cadre', cid: cadreOf(s).id }, date: D });
    s = run(s, { t: 'assetHolder', id, holder: null, date: D }); expect(registry(s).find(r => r.key === id)!.a.holder).toBeUndefined();
    expect(assetHistory(s.assetLog, id).map(e => e.text)).toEqual(['έγινε αχρέωτο', expect.stringContaining('στέλεχος'), expect.stringContaining('φυσικό πρόσωπο'), expect.stringContaining('άλλη μονάδα')]);
  });
});

describe('Μητρώο: φίλτρα, αναζήτηση, μετρητές', () => {
  function sample() {
    let s = base();
    const add = (a: Partial<Asset> & { no: string }) => { s = run(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'G3A3', state: 'ok', ...a }, date: D }); };
    add({ no: 'Α1', maint: { next: '2026-11-01' } });                   // καθυστερεί
    add({ no: 'Α2', maint: { next: '2026-12-10' } });                   // σε 23 μέρες
    add({ no: 'Α3', maint: { next: '2027-03-01' } });                   // μακριά
    add({ no: 'Α4', state: 'repair', holder: { k: 'unit', name: '50 ΕΜΑ' } });
    add({ no: 'Α5', state: 'writeoff', warOnly: true });
    add({ cat: 'diopt', type: 'ΔΙΟΠΤΡΑ', no: 'Δ1', qty: 3, holder: { k: 'cadre', cid: cadreOf(s).id } });
    add({ no: 'Α6', holder: { k: 'ext', name: 'Χ' } });
    return s;
  }
  const keys = (s: AppState, o: object) => assetView(s, o, D).map(r => r.a.no);
  it('φίλτρα: χρεωμένα, αχρέωτα, σε άλλον, επισκευή, διαγραφή, εμπόλεμη, συντήρηση (και καθυστέρηση), εκτός δύναμης', () => {
    let s = sample();
    expect(keys(s, { filter: 'free' })).toEqual(['Α1', 'Α2', 'Α3', 'Α5']);
    expect(keys(s, { filter: 'other' })).toEqual(['Α4', 'Α6']);
    expect(keys(s, { filter: 'repair' })).toEqual(['Α4']); expect(keys(s, { filter: 'writeoff' })).toEqual(['Α5']); expect(keys(s, { filter: 'war' })).toEqual(['Α5']);
    expect(keys(s, { filter: 'due' })).toEqual(['Α1', 'Α2']);   // 30 μέρες: η καθυστερημένη και η επόμενη
    expect(keys(s, { filter: 'held' }).sort()).toEqual(['343148', 'Ι 12345', 'Δ1', 'MG-77', 'Μ-555'].sort());
    s = run(s, { t: 'setSettings', settings: { assets: { warnDays: 10 } }, text: 'δοκιμή' }); expect(keys(s, { filter: 'due' })).toEqual(['Α1']);
    // ο κάτοχος βγήκε εκτός δύναμης (άτομο ή στέλεχος): εμφανίζεται στο «Σε εκτός δύναμης»
    s = { ...s, people: s.people.map(p => (p.id === 1 ? { ...p, active: false } : p)), cadreList: s.cadreList.map(c => ({ ...c, active: false })) };
    expect(keys(s, { filter: 'out' }).sort()).toEqual(['Ι 12345', 'Δ1', 'Μ-555'].sort());
  });
  it('αναζήτηση χωρίς τόνους σε αριθμό, τύπο, κάτοχο και θέση· κατηγορία και μετρητές', () => {
    let s = sample(); s = run(s, { t: 'assetHolder', id: s.assets![0].id, holder: { k: 'unit', name: 'Ελληνική Μονάδα' }, date: D });
    expect(keys(s, { q: 'ελληνικη μοναδα' })).toEqual(['Α1']); expect(keys(s, { q: 'mg-77' })).toEqual(['MG-77']);
    expect(keys(s, { q: 'διοπτρα' })).toEqual(['Δ1']);
    s = run(s, { t: 'saveAsset', asset: { ...s.assets![1], place: 'κιβώτιο 53' }, date: D }); expect(keys(s, { q: 'ΚΙΒΩΤΙΟ 53' })).toEqual(['Α2']);
    expect(keys(s, { cat: 'diopt' })).toEqual(['Δ1']);
    const c = catCounts(s, {}, D); expect(c.get('tyfekia')).toBe(8); expect(c.get('diopt')).toBe(1); expect(c.get('polyvola')).toBe(1);
    // τα οχήματα δεν φαίνονται στο Μητρώο (φάση 5)
    const v = run(s, { t: 'setSettings', settings: { assets: { cats: [{ id: 'v1', name: 'Τροχοφόρα', kind: 'vehicle', types: [], fields: [] }, ...assetCfgOf(s.settings).cats] } }, text: 'δοκιμή' });
    expect(assetView(run(v, { t: 'saveAsset', asset: { cat: 'v1', type: 'ΜΑΝ', no: 'ΕΘ-1', state: 'ok' }, date: D }), {}, D).some(r => r.a.no === 'ΕΘ-1')).toBe(false);
  });
  it('ημερομηνίες συντήρησης: μήνες με όριο μήνα, κατάσταση', () => {
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28'); expect(addMonths('2026-11-17', 12)).toBe('2027-11-17'); expect(addMonths('2026-11-17', 1)).toBe('2026-12-17');
    expect(maintState({ maint: { next: '2026-11-16' } }, D, 30)).toBe('overdue'); expect(maintState({ maint: { next: '2026-11-17' } }, D, 30)).toBe('soon');
    expect(maintState({ maint: { next: '2027-01-01' } }, D, 30)).toBe('ok'); expect(maintState({}, D, 30)).toBe('none');
    // κάθε N μήνες από την κατηγορία
    const s = run(run(fakeState(1), { t: 'setSettings', settings: { assets: { cats: [{ id: 'k', name: 'Κ', kind: 'weapon', types: [], fields: [], every: 4 }] } }, text: 'δ' }), { t: 'saveAsset', asset: { cat: 'k', type: '', no: '1', state: 'ok' }, date: D });
    expect(run(s, { t: 'assetMaint', id: s.assets![0].id, date: '2026-11-17' }).assets![0].maint).toMatchObject({ last: '2026-11-17', next: '2027-03-17', every: 4 });
  });
});

describe('Μητρώο: λέξεις θέσης', () => {
  const c = assetCfgOf(fakeState(1).settings);
  it('βρίσκει τη μακρύτερη λέξη, χωρίς τόνους, τελείες και κενά', () => {
    expect(placeWord(c, 'ΚΙΒΩΤΙΟ 53')!.means).toBe('box'); expect(placeWord(c, 'κιβωτιο 7')!.means).toBe('box');
    expect(placeWord(c, 'Α.Ο')!.means).toBe('duty'); expect(placeWord(c, 'Α.Ο (ΑΔΕΙΑ)')!.means).toBe('leave'); expect(placeWord(c, 'ΑΟ  ΑΔΕΙΑ')!.means).toBe('leave');
    expect(placeWord(c, 'Φ.Γ 3')!.means).toBe('guard'); expect(placeWord(c, 'Αποθήκη')!.means).toBe('store'); expect(placeWord(c, 'ΚΑΤΙ ΑΛΛΟ')).toBeUndefined();
  });
  it('οπλοβαστός από Person.rack/wpos· η λέξη του αρχείου της μονάδας (fileWord) μετρά', () => {
    expect(placeText(c, { rack: 'Ε', wpos: '6' })).toBe('ΟΠΛΟΒΑΣΤΟ Ε 6'); expect(placeMeans(c, { rack: 'Ε' })).toBe('rack');
    expect(placeMeans(c, { place: 'ΣΤΗ ΜΟΝΑΔΑ', fileWord: 'Α.Ο' })).toBe('duty'); expect(placeMeans(c, { place: 'ΚΙΒΩΤΙΟ 53' })).toBe('box');
    const u = assetCfgOf(run(fakeState(1), { t: 'setSettings', settings: { assets: { places: [{ word: 'ΡΑΦΙ', means: 'store' }] } }, text: 'δ' }).settings);
    expect(placeMeans(u, { place: 'ραφι 3' })).toBe('store'); expect(placeMeans(u, { place: 'ΚΙΒΩΤΙΟ 53' })).toBe('');
  });
});

describe('Excel «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ»', () => {
  function sample() {
    let s = base();
    const add = (a: Partial<Asset> & { no: string }) => { s = run(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'G3A3', state: 'ok', ...a }, date: D }); };
    add({ no: 'Α1', place: 'κιβώτιο 53', maint: { last: '2026-05-29', next: '2027-02-02' }, note: 'καλό' });
    add({ no: 'Α2', state: 'repair', why: 'σκανδάλη', holder: { k: 'unit', name: '50 ΕΜΑ' } });
    add({ cat: 'polyvola', type: 'MG3A1', no: 'ΜΒ-1', extra: { barrel: 'κ-77', spare: 'ε-78' } });
    add({ cat: 'diopt', type: 'ΔΙΟΠΤΡΑ', no: 'Δ1', qty: 3 });
    add({ cat: 'diopt', type: 'ΔΙΟΠΤΡΑ', no: 'Δ2', holder: { k: 'cadre', cid: cadreOf(s).id } });
    add({ cat: 'asyrm', type: 'ΑΣΥΡΜΑΤΟΣ', no: 'Ρ1', state: 'writeoff' });
    return s;
  }
  it('ένα φύλλο ανά τύπο όπλου, ένα ανά κατηγορία υλικού και ΣΥΝΟΛΑ· κεφαλίδες όπως η ΟΠΛΙΣΜΟΥ της 50 ΕΜΑ + πεδία κατηγορίας', () => {
    const s = sample(); const sh = assetSheets(s, assetView(s, {}, D), D);
    expect(sh.map(x => x.name)).toEqual(['G3A3', 'G3A4', 'Μ1911 Α1', 'MG3A1', 'ΔΙΟΠΤΡΕΣ', 'ΑΣΥΡΜΑΤΟΙ', 'ΣΥΝΟΛΑ']);
    const g = sh[0]; expect(g.head.slice(0, 9)).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΘΕΣΗ', 'ΚΑΤΑΣΤΑΣΗ', 'ΤΕΛ. ΣΥΝΤΗΡΗΣΗ', 'ΕΠΟΜ. ΣΥΝΤΗΡΗΣΗ']); expect(g.head[g.head.length - 1]).toBe('ΠΑΡΑΤΗΡΗΣΕΙΣ');
    const mg = sh.find(x => x.name === 'MG3A1')!; expect(mg.head).toEqual(expect.arrayContaining(['ΑΡΙΘΜΟΣ ΚΑΝΗΣ', 'ΕΦΕΔΡΙΚΗ ΚΑΝΗ'])); expect(mg.rows[0]).toEqual(expect.arrayContaining(['Κ-77', 'Ε-78'].map(x => x.toUpperCase())));
    const a1 = g.rows.find(r => r[4] === 'Α1')!; expect(a1[2]).toBe('ΑΧΡΕΩΤΟ'); expect(a1[5]).toBe('ΚΙΒΩΤΙΟ 53'); expect(a1[7]).toBe('29/05/2026'); expect(a1[8]).toBe('02/02/2027');
    expect(g.rows.find(r => r[4] === 'Α2')![6]).toBe('ΠΡΟΣ ΕΠΙΣΚΕΥΗ'); expect(g.rows.find(r => r[4] === 'Α2')![2]).toBe('50 ΕΜΑ (ΑΛΛΗ ΜΟΝΑΔΑ)');
    const v = g.rows.find(r => r[4] === 'Ι 12345')!; expect(v[1]).toBe('ΔΝΕΑΣ'); expect(v[5]).toBe('ΟΠΛΟΒΑΣΤΟ Ε 6');
  });
  it('όλα τα κείμενα με κεφαλαία· η ΣΥΝΟΛΑ μετρά σωστά (υλικό με ποσότητα)', () => {
    const s = sample(); const sh = assetSheets(s, assetView(s, {}, D), D);
    for (const x of sh) for (const v of [x.name, x.title, ...x.head, ...x.rows.flat()]) if (typeof v === 'string') expect(v, x.name).toBe(v.toUpperCase());
    const t = sh[sh.length - 1]; expect(t.head).toEqual(['ΚΑΤΗΓΟΡΙΑ', 'ΤΥΠΟΣ', 'ΣΥΝΟΛΟ', 'ΧΡΕΩΜΕΝΑ', 'ΑΧΡΕΩΤΑ', 'ΣΕ ΑΛΛΟΝ', 'ΕΠΙΣΚΕΥΗ', 'ΔΙΑΓΡΑΦΗ']);
    // Τυφέκια G3A3: Ι 12345 (Στρατιώτης), Α1 (αχρέωτο), Α2 (άλλη μονάδα, επισκευή)
    expect(t.rows.find(r => r[0] === 'ΤΥΦΕΚΙΑ' && r[1] === 'G3A3')).toEqual(['ΤΥΦΕΚΙΑ', 'G3A3', 3, 1, 1, 1, 1, 0]);
    expect(t.rows.find(r => r[0] === 'ΔΙΟΠΤΡΕΣ')).toEqual(['ΔΙΟΠΤΡΕΣ', 'ΔΙΟΠΤΡΑ', 4, 1, 3, 0, 0, 0]);
    expect(t.rows.find(r => r[0] === 'ΑΣΥΡΜΑΤΟΙ')![7]).toBe(1);
    expect(t.rows[t.rows.length - 1]).toEqual(['ΓΕΝΙΚΟ ΣΥΝΟΛΟ', '', 12, 5, 6, 1, 1, 1]);
  });
  it('σέβεται το φίλτρο της οθόνης· χωρίς είδη βγαίνει μόνο η ΣΥΝΟΛΑ· τα υπάρχοντα φύλλα οπλισμού μένουν ίδια', () => {
    const s = sample(); const sh = assetSheets(s, assetView(s, { filter: 'repair' }, D), D);
    expect(sh.map(x => x.name)).toEqual(['G3A3', 'ΣΥΝΟΛΑ']); expect(sh[0].rows).toHaveLength(1);
    expect(assetSheets(fakeState(1), [], D).map(x => x.name)).toEqual(['ΣΥΝΟΛΑ']);
    // το Excel «Οπλισμός» δεν επηρεάζεται από το μητρώο
    expect(weaponSheets(s, D)).toEqual(weaponSheets({ ...s, assets: undefined, assetLog: undefined }, D));
  });
  it('αρχείο: ΝΕΟ «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ», A4 οριζόντια σε μία σελίδα φάρδος, όλα κεφαλαία', async () => {
    const s = sample(); const r = await assetBook(s, assetView(s, {}, D), D);
    expect(r.name).toBe('ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ.xlsx'); expect(fileNameOf(s.settings, 'assets', D)).toBe('ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ 17-11-2026.xlsx');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.data as any);
    expect(wb.worksheets.map(w => w.name)).toEqual(['G3A3', 'G3A4', 'Μ1911 Α1', 'MG3A1', 'ΔΙΟΠΤΡΕΣ', 'ΑΣΥΡΜΑΤΟΙ', 'ΣΥΝΟΛΑ']);
    const w = wb.getWorksheet('G3A3')!; expect(w.pageSetup).toMatchObject({ paperSize: 9, orientation: 'landscape', fitToWidth: 1 });
    expect(String(w.getCell(1, 1).value)).toMatch(/^ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ G3A3 /);
    const bad: string[] = []; wb.eachSheet(ws => ws.eachRow(row => row.eachCell(c => { if (typeof c.value === 'string' && c.value !== c.value.toUpperCase()) bad.push(ws.name + ':' + c.value); })));
    expect(bad).toEqual([]); expect(r.marks.length).toBe(7);
  });
});

describe('Μητρώο: παλιά κατάσταση και αποθήκευση', () => {
  it('παλιά βάση χωρίς μητρώο: όλα ίδια, χωρίς εγγραφές στο kv· οι εγγραφές και το ιστορικό αναιρούνται και φορτώνονται', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gipl-'));
    const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    let st = new Store(dir, WASM); await st.open();
    expect(st.state.assets).toBeUndefined(); expect(st.state.assetLog).toBeUndefined(); expect(registry(st.state)).toEqual([]);
    st.commit(run(st.state, { t: 'saveAsset', asset: { cat: 'diopt', type: 'ΔΙΟΠΤΡΑ', no: 'Δ9', state: 'ok' }, date: D }));
    const p = st.commit(run(st.state, { t: 'assetMaint', id: st.state.assets![0].id, date: D }));
    expect(p.kvd!.map(x => x.key).sort()).toEqual(['assetLog', 'assets']);
    st.close(); st = new Store(dir, WASM); await st.open();
    expect(st.state.assets![0]).toMatchObject({ no: 'Δ9' }); expect(st.state.assets![0].maint?.last).toBe(D); expect(st.state.assetLog).toHaveLength(2);
    st.revert(p); expect(st.state.assets![0].maint).toBeUndefined(); expect(st.state.assetLog).toHaveLength(1);
    st.close();
  });
});
