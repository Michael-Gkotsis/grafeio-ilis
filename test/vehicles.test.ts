// Οχήματα (17/11, φάση 5): συντήρηση ανά ημερομηνία ή χιλιόμετρα, γέμισμα που ενημερώνει τα km, μετρήσεις, ΗΚΑΙ από το μητρώο
// (υπολογισμός, υπερίσχυση χειρόγραφου, κλειστή από προεπιλογή και ίδιο έντυπο), Excel με κεφαλαία. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { assetCfgOf, assetView, registry, totalsSheet } from '../src/shared/assets';
import { drivenBy, hkaiVeh, vehHkai, vehMaint, vehStats, vehStatus, vehicleRows, vehicleSheets, vehicleView } from '../src/shared/vehicles';
import { fillHkai } from '../src/main/exports';
import { vehicleBook } from '../src/main/excel';
import { Workbook } from '../src/main/xlsx';
import { fileNameOf, FILE_ROWS } from '../src/shared/fileNames';
import { fakeState } from './fixtures';

const D = '2026-11-17';
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'x' + ++n }).state;
const add = (s: AppState, cat: string, type: string, plate: string, more: object = {}) => run(s, { t: 'saveAsset', asset: { cat, type, no: plate, plate, state: 'ok', ...more }, date: D });
const idOf = (s: AppState, plate: string) => s.assets!.find(a => a.plate === plate)!.id;
function sample() {
  let s = fakeState(12);
  s = add(s, 'troxofora', 'ΜΑΝ 6t', 'ΕΣ 12345', { km: 48210, kmOn: '2026-11-15' });
  s = add(s, 'troxofora', 'HUMMER', 'ΕΣ 22871', { km: 91400 });
  s = add(s, 'erpystr', 'M113', 'ΕΣ 30411', { km: 6120 });
  s = add(s, 'politikou', 'Nissan', 'ΕΣ 40102', { km: 132900 });
  s = add(s, 'troxofora', 'ΜΑΝ 6t', 'ΕΣ 12399', { km: 77050 });
  return s;
}

describe('Οχήματα: κατηγορίες και ξεχωριστό μητρώο', () => {
  it('προεπιλεγμένες κατηγορίες οχημάτων: κάθε 6 μήνες και 5000, ώρες στα ερπυστριοφόρα', () => {
    const v = assetCfgOf(fakeState(1).settings).cats.filter(c => c.kind === 'vehicle');
    expect(v.map(c => c.name)).toEqual(['Τροχοφόρα', 'Ερπυστριοφόρα', 'Πολιτικού τύπου']);
    for (const c of v) { expect(c.every).toBe(6); expect(c.everyKm).toBe(5000); expect(c.types.length).toBeGreaterThan(0); }
    expect(v.map(c => !!c.hours)).toEqual([false, true, false]);
  });
  it('τα οχήματα μένουν έξω από το Μητρώο όπλων, τα σύνολα και το Excel του οπλισμού', () => {
    const s = sample();
    expect(vehicleRows(s)).toHaveLength(5); expect(assetView(s, {}, D)).toHaveLength(0);
    expect(totalsSheet(registry(s), assetCfgOf(s.settings), D).rows.map(r => r[0])).toEqual(['ΓΕΝΙΚΟ ΣΥΝΟΛΟ']);
  });
});

describe('Οχήματα: συντήρηση ανά ημερομηνία ή χιλιόμετρα, όποιο έρθει πρώτο', () => {
  it('«Έγινε συντήρηση» με ημερομηνία και km βγάζει και τα δύο όρια', () => {
    let s = sample(); const id = idOf(s, 'ΕΣ 12345');
    s = run(s, { t: 'assetMaint', id, date: '2026-06-02', km: 43900 });
    const a = s.assets!.find(x => x.id === id)!;
    expect(a.maint).toMatchObject({ last: '2026-06-02', next: '2026-12-02', lastKm: 43900, nextKm: 48900, every: 6 });
    expect(s.assetLog!.find(e => e.what === 'maint')).toMatchObject({ aid: id, km: 43900 });
  });
  it('έρχεται πρώτη η ημερομηνία ή τα χιλιόμετρα', () => {
    const c = { everyKm: 5000 };
    // μακριά στα km, κοντά στην ημερομηνία
    expect(vehMaint({ maint: { next: '2026-12-02', nextKm: 60000 }, km: 48210 }, c, D, 30)).toMatchObject({ st: 'soon', by: 'date', days: 15 });
    // μακριά στην ημερομηνία, πέρασαν τα km
    expect(vehMaint({ maint: { next: '2027-05-01', nextKm: 48000 }, km: 48210 }, c, D, 30)).toMatchObject({ st: 'overdue', by: 'km', kmLeft: -210 });
    // κοντά στα km (κάτω από το 1/10 του διαστήματος)
    expect(vehMaint({ maint: { next: '2027-05-01', nextKm: 48500 }, km: 48210 }, c, D, 30)).toMatchObject({ st: 'soon', by: 'km', kmLeft: 290 });
    expect(vehMaint({ maint: { next: '2027-05-01', nextKm: 55000 }, km: 48210 }, c, D, 30).st).toBe('ok');
    expect(vehMaint({}, c, D, 30)).toMatchObject({ st: 'none', days: null, kmLeft: null });
  });
  it('κατάσταση στον πίνακα: ακινησία με λόγο, επισκευή, συντήρηση, σε κίνηση, διαθέσιμο', () => {
    let s = sample(); const cfg = assetCfgOf(s.settings);
    const st = (plate: string) => { const r = vehicleRows(s).find(x => x.a.plate === plate)!; return vehStatus(r.a, r.cat, s.assetLog, D, cfg.warnDays); };
    s = run(s, { t: 'assetState', id: idOf(s, 'ΕΣ 30411'), state: 'immobile', why: 'μπαταρίες', date: D });
    s = run(s, { t: 'assetState', id: idOf(s, 'ΕΣ 12399'), state: 'repair', date: D });
    s = run(s, { t: 'assetMaint', id: idOf(s, 'ΕΣ 12345'), date: '2026-06-02', km: 43900 });
    expect(st('ΕΣ 30411')).toMatchObject({ tone: 'bad', text: 'Ακινησία: μπαταρίες' }); expect(st('ΕΣ 12399')).toMatchObject({ tone: 'bad', text: 'Προς επισκευή' });
    expect(st('ΕΣ 12345')).toMatchObject({ tone: 'warn', text: 'Συντήρηση 02/12' });
    expect(st('ΕΣ 40102')).toMatchObject({ tone: 'ok', text: 'Διαθέσιμο' });
    s = run(s, { t: 'assetKm', id: idOf(s, 'ΕΣ 40102'), date: D, km: 132950 }); expect(st('ΕΣ 40102').text).toBe('Σε κίνηση');
    s = run(s, { t: 'assetState', id: idOf(s, 'ΕΣ 30411'), state: 'ok', date: D }); expect(st('ΕΣ 30411').text).toBe('Διαθέσιμο');
  });
});

describe('Οχήματα: γέμισμα, χιλιόμετρα, οδηγός (μία αναίρεση η καθεμία)', () => {
  it('το γέμισμα γράφει γεγονός με λίτρα και km και ενημερώνει km/kmOn', () => {
    let s = sample(); const id = idOf(s, 'ΕΣ 12345');
    s = run(s, { t: 'assetFuel', id, date: D, litres: 120, km: 48500 });
    expect(s.assets!.find(a => a.id === id)).toMatchObject({ km: 48500, kmOn: D });
    expect(s.assetLog!.filter(e => e.what === 'fuel')).toEqual([expect.objectContaining({ aid: id, date: D, litres: 120, km: 48500 })]);
    // παλιότερη μέρα: γράφεται το γεγονός, αλλά η τρέχουσα ένδειξη μένει
    s = run(s, { t: 'assetFuel', id, date: '2026-11-10', litres: 60, km: 48100 });
    expect(s.assets!.find(a => a.id === id)).toMatchObject({ km: 48500, kmOn: D }); expect(s.assetLog!.filter(e => e.what === 'fuel')).toHaveLength(2);
    // χωρίς λίτρα: δεν γράφεται
    expect(() => run(s, { t: 'assetFuel', id, date: D, litres: 0 })).toThrow();
  });
  it('χιλιόμετρα και οδηγός: γεγονότα στο ιστορικό, οδηγός στην καρτέλα του στρατιώτη', () => {
    let s = sample(); const id = idOf(s, 'ΕΣ 22871');
    s = run(s, { t: 'assetKm', id, date: D, km: 91500 });
    expect(s.assets!.find(a => a.id === id)).toMatchObject({ km: 91500, kmOn: D }); expect(s.assetLog!.find(e => e.what === 'km')).toMatchObject({ km: 91500 });
    s = run(s, { t: 'assetDriver', id, date: D, driver: { k: 'person', pid: 3 } });
    expect(drivenBy(registry(s), { k: 'person', pid: 3 }).map(r => r.a.plate)).toEqual(['ΕΣ 22871']); expect(vehicleView(s, { q: s.people[2].last }).map(r => r.a.plate)).toEqual(['ΕΣ 22871']);
    s = run(s, { t: 'assetDriver', id, date: D, driver: null }); expect(s.assets!.find(a => a.id === id)!.driver).toBeUndefined();
    s = run(s, { t: 'assetHolder', id, holder: { k: 'unit', name: '4η ΙΛΗ' }, date: D }); expect(s.assets!.find(a => a.id === id)!.holder).toEqual({ k: 'unit', name: '4η ΙΛΗ' });
    s = run(s, { t: 'deleteAsset', id }); expect(vehicleRows(s)).toHaveLength(4);
  });
  it('μετρήσεις της οθόνης: σύνολο, σε κίνηση σήμερα, επισκευή/ακινησία, συντήρηση σε N μέρες', () => {
    let s = sample(); const cfg = assetCfgOf(s.settings);
    s = run(s, { t: 'assetKm', id: idOf(s, 'ΕΣ 22871'), date: D, km: 91450 });
    s = run(s, { t: 'assetFuel', id: idOf(s, 'ΕΣ 40102'), date: D, litres: 40 });
    s = run(s, { t: 'assetState', id: idOf(s, 'ΕΣ 30411'), state: 'immobile', date: D });
    s = run(s, { t: 'assetState', id: idOf(s, 'ΕΣ 12399'), state: 'repair', date: D });
    s = run(s, { t: 'assetMaint', id: idOf(s, 'ΕΣ 12345'), date: '2026-06-02', km: 43900 });
    expect(vehStats(vehicleRows(s), s.assetLog, D, cfg.warnDays)).toEqual({ total: 5, moving: 2, down: 2, due: 1 });
  });
});

describe('ΗΚΑΙ «Κατάσταση οχημάτων» από το μητρώο', () => {
  function reg() {
    let s = sample();
    s = run(s, { t: 'assetKm', id: idOf(s, 'ΕΣ 22871'), date: D, km: 91450 });
    s = run(s, { t: 'assetFuel', id: idOf(s, 'ΕΣ 40102'), date: D, litres: 40 });
    s = run(s, { t: 'assetState', id: idOf(s, 'ΕΣ 30411'), state: 'immobile', why: 'μπαταρίες', date: D });
    s = run(s, { t: 'assetState', id: idOf(s, 'ΕΣ 12399'), state: 'repair', date: D });
    s = run(s, { t: 'assetMaint', id: idOf(s, 'ΕΣ 22871'), date: '2026-04-01', km: 90000 });   // επόμενη 01/10/2026: καθυστερημένη
    s = run(s, { t: 'assetDriver', id: idOf(s, 'ΕΣ 22871'), date: D, driver: { k: 'person', pid: 2 } });
    return s;
  }
  it('υπολογισμός: προβλέπονται, σε κίνηση, για συντήρηση, βλάβη και είδος', () => {
    expect(vehHkai(reg(), D)).toEqual({ type: 'ΤΡΟΧΟΦΟΡΑ, ΕΡΠΥΣΤΡΙΟΦΟΡΑ, ΠΟΛΙΤΙΚΟΥ ΤΥΠΟΥ', prov: 5, kin: 2, maint: 2, dmg: 1 });
    // άλλη μέρα: κανείς σε κίνηση, και η καθυστέρηση μετρά από τη μέρα εκείνη
    expect(vehHkai(reg(), '2026-09-01')).toMatchObject({ kin: 0, maint: 1 });
    // όχημα που διαγράφηκε δεν μετρά· χωρίς οχήματα: τίποτα
    const r0 = reg(); const g = run(r0, { t: 'assetGone', id: idOf(r0, 'ΕΣ 12399'), date: D });
    expect(vehHkai(g, D)).toMatchObject({ prov: 4, maint: 1 }); expect(vehHkai(fakeState(3), D)).toBeUndefined();
  });
  it('κλειστή από προεπιλογή: ό,τι είχες γράψει με το χέρι, ακριβώς ίδιο αντικείμενο', () => {
    const man = { type: '1/4 τόνων', prov: 2, kin: 1 };
    let s = run(reg(), { t: 'setSettings', settings: { hkai: { veh: man } }, text: 'x' });
    expect(s.settings.hkai?.vehReg).toBeUndefined(); expect(hkaiVeh(s, D)).toBe(s.settings.hkai!.veh);
    expect(hkaiVeh(run(s, { t: 'setSettings', settings: { hkai: { veh: man, vehReg: false } }, text: 'x' }), D)).toEqual(man);
    expect(hkaiVeh(run(reg(), { t: 'setSettings', settings: { hkai: {} }, text: 'x' }), D)).toBeUndefined();
  });
  it('ανοιχτή: τα κενά από το μητρώο, ό,τι έγραψες με το χέρι υπερισχύει', () => {
    let s = run(reg(), { t: 'setSettings', settings: { hkai: { vehReg: true } }, text: 'x' });
    expect(hkaiVeh(s, D)).toEqual({ type: 'ΤΡΟΧΟΦΟΡΑ, ΕΡΠΥΣΤΡΙΟΦΟΡΑ, ΠΟΛΙΤΙΚΟΥ ΤΥΠΟΥ', prov: 5, kin: 2, maint: 2, dmg: 1 });
    s = run(s, { t: 'setSettings', settings: { hkai: { vehReg: true, veh: { type: 'ΜΑΝ 6t', prov: 9, dmg: 0 } } }, text: 'x' });
    expect(hkaiVeh(s, D)).toEqual({ type: 'ΜΑΝ 6t', prov: 9, kin: 2, maint: 2, dmg: 0 });
    // χωρίς οχήματα στο μητρώο μένει το χειρόγραφο
    const e = run(fakeState(3), { t: 'setSettings', settings: { hkai: { vehReg: true, veh: { type: 'Χ', prov: 1 } } }, text: 'x' });
    expect(hkaiVeh(e, D)).toEqual({ type: 'Χ', prov: 1 });
  });
  const cells = async (s: AppState) => { const bk = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(1); return ['F5', 'G5', 'H5', 'I5', 'J5'].map(c => bk.get(c)); };
  it('στο έντυπο: με κλειστή την επιλογή το αρχείο είναι byte-ίδιο με το χειρόγραφο, με ανοιχτή γεμίζουν τα κελιά', async () => {
    const hand = { veh: { type: '1/4 τόνων', prov: 2, kin: 1, maint: 0, dmg: 1 } };
    const plain = run(fakeState(12), { t: 'setSettings', settings: { hkai: hand }, text: 'x' });
    const withReg = run(reg(), { t: 'setSettings', settings: { hkai: hand }, text: 'x' });   // το μητρώο έχει οχήματα, η επιλογή είναι κλειστή
    const a = (await fillHkai(T('hkai.xlsx'), plain, D)).data; const b = (await fillHkai(T('hkai.xlsx'), withReg, D)).data;
    expect(Buffer.compare(Buffer.from(a as any), Buffer.from(b as any))).toBe(0);
    expect(await cells(withReg)).toEqual(['1/4 ΤΟΝΩΝ', '2', '1', '0', '1']);
    // ανοιχτή, με χειρόγραφο μόνο το είδος: το υπόλοιπο από το μητρώο
    const on = run(reg(), { t: 'setSettings', settings: { hkai: { vehReg: true, veh: { type: '1/4 τόνων' } } }, text: 'x' });
    expect(await cells(on)).toEqual(['1/4 ΤΟΝΩΝ', '5', '2', '2', '1']);
    // κλειστή η ενότητα «Όχημα»: κανένας αριθμός, ούτε από το μητρώο
    const off = run(reg(), { t: 'setSettings', settings: { hkai: { vehReg: true, off: ['veh'] } }, text: 'x' });
    expect(await cells(off)).toEqual(['1/4 τόνων', null, null, null, null]);   // το είδος είναι το κείμενο του εντύπου
  });
});

describe('Οχήματα: Excel «ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ»', () => {
  it('όνομα αρχείου στις ρυθμίσεις ονομάτων', () => {
    const s = fakeState(1).settings;
    expect(fileNameOf(s, 'vehicles', D)).toBe('ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ 17-11-2026.xlsx'); expect(FILE_ROWS(s).some(r => r.id === 'vehicles')).toBe(true);
  });
  it('φύλλο ανά κατηγορία, ΚΑΥΣΙΜΑ και ΣΥΝΤΗΡΗΣΕΙΣ, όλα με κεφαλαία', async () => {
    let s = sample(); const id = idOf(s, 'ΕΣ 12345');
    s = run(s, { t: 'assetFuel', id, date: D, litres: 120.5, km: 48500 });
    s = run(s, { t: 'assetMaint', id, date: '2026-06-02', km: 43900, note: 'λάδια και φίλτρα' });
    s = run(s, { t: 'assetDriver', id: idOf(s, 'ΕΣ 22871'), date: D, driver: { k: 'person', pid: 2 } });
    s = run(s, { t: 'assetState', id: idOf(s, 'ΕΣ 30411'), state: 'immobile', why: 'μπαταρίες', date: D });
    const sh = vehicleSheets(s, D); expect(sh.map(x => x.name)).toEqual(['ΤΡΟΧΟΦΟΡΑ', 'ΕΡΠΥΣΤΡΙΟΦΟΡΑ', 'ΠΟΛΙΤΙΚΟΥ ΤΥΠΟΥ', 'ΚΑΥΣΙΜΑ', 'ΣΥΝΤΗΡΗΣΕΙΣ']);
    expect(sh[1].head).toContain('ΩΡΕΣ'); expect(sh[0].head).toContain('ΧΛΜ');
    expect(sh[3].rows).toEqual([[1, '17/11/2026', 'ΜΑΝ 6T · ΕΣ 12345', 120.5, '48.500']]);
    expect(sh[4].rows[0]).toEqual([1, '02/06/2026', 'ΜΑΝ 6T · ΕΣ 12345', '43.900', 'ΛΑΔΙΑ ΚΑΙ ΦΙΛΤΡΑ']);
    const r = await vehicleBook(s, D); expect(r.name).toBe('ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ 17-11-2026.xlsx');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.data as any);
    expect(wb.worksheets.map(w => w.name)).toEqual(['ΤΡΟΧΟΦΟΡΑ', 'ΕΡΠΥΣΤΡΙΟΦΟΡΑ', 'ΠΟΛΙΤΙΚΟΥ ΤΥΠΟΥ', 'ΚΑΥΣΙΜΑ', 'ΣΥΝΤΗΡΗΣΕΙΣ']);
    expect(wb.getWorksheet('ΤΡΟΧΟΦΟΡΑ')!.pageSetup).toMatchObject({ paperSize: 9, orientation: 'landscape', fitToWidth: 1 });
    const bad: string[] = []; wb.eachSheet(ws => ws.eachRow(row => row.eachCell(c => { if (typeof c.value === 'string' && c.value !== c.value.toUpperCase()) bad.push(ws.name + ':' + c.value); })));
    expect(bad).toEqual([]); expect(r.marks.length).toBe(5);
    const cell = (sheet: string, text: string) => { let f = false; wb.getWorksheet(sheet)!.eachRow(row => row.eachCell(c => { if (String(c.value).includes(text)) f = true; })); return f; };
    expect(cell('ΕΡΠΥΣΤΡΙΟΦΟΡΑ', 'ΑΚΙΝΗΣΙΑ: ΜΠΑΤΑΡΙΕΣ')).toBe(true); expect(cell('ΤΡΟΧΟΦΟΡΑ', '48.900 ΧΛΜ')).toBe(true);
  });
  it('χωρίς οχήματα: μόνο ΚΑΥΣΙΜΑ και ΣΥΝΤΗΡΗΣΕΙΣ', () => {
    expect(vehicleSheets(fakeState(3), D).map(x => x.name)).toEqual(['ΚΑΥΣΙΜΑ', 'ΣΥΝΤΗΡΗΣΕΙΣ']);
  });
});
