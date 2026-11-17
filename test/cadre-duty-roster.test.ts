// Υπηρεσίες στελεχών (17/11, φάση 3α): ομάδες/υπηρεσίες ως δεδομένα, όρια με μεταφορά, λόγοι επιλεξιμότητας (ποτέ μπλοκάρισμα), ΗΚΑΙ με τη
// στήλη της υπηρεσίας, αξιωματικοί υπηρεσίας, απαλλαγές, παλιά βάση, Excel. Οι υπηρεσίες των στρατιωτών μένουν ακριβώς ίδιες. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import { apply, type Command } from '../src/shared/commands';
import type { AppState, Cadre, CadreDutyCfg } from '../src/shared/domain';
import { dutyStats, fillDay, hkaiCounts, pickPeople } from '../src/shared/rules';
import { dutyOfficers, cadreSheets } from '../src/shared/cadre';
import { apalLedger } from '../src/shared/cadreBalance';
import { dutyCfgOf, eligibility, monthCheck, monthLimit, dutySections, dutySheet, serviceOf, carryText, limitText } from '../src/shared/cadreDuty';
import { monthIndex, planFilters, planRows } from '../src/shared/cadrePlan';
import { cadreDutyBook } from '../src/main/excel';
import { fileNameOf } from '../src/shared/fileNames';
import { Store } from '../src/main/db';
import { fakeState } from './fixtures';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'x' + ++n }).state;
const CFG: Partial<CadreDutyCfg> = {
  groups: [
    { id: 'g1', name: 'ΑΥΔΜ', services: [{ id: 's1', name: 'ΑΥΔΜ', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: 'yp', offOnly: true }] },
    { id: 'g2', name: 'Πύλη', services: [{ id: 's2', name: 'Αξ/κός Κεντρικής Πύλης', short: 'Π', perDay: 1, h24: true, hkCol: 'yp' }, { id: 's4', name: 'Ημερήσια πύλη', short: 'ΗΠ', perDay: 1, h24: false, hkCol: '', days: [1, 2, 3, 4, 5] }] },
    { id: 'g3', name: 'Φυλάκιο ποταμού', services: [{ id: 's3', name: 'Δ/ντης φυλακίου', short: 'Φ', perDay: 1, h24: true, hkCol: 'fyl' }] }
  ],
  limits: { off: { base: 3, extra: 1 }, nco: { base: 4, extra: 1 } }, rest: 1, carry: true, fairHol: true
};
interface W { s: AppState; off: Cadre; nco: Cadre; nco2: Cadre; epop: Cadre }
function base(): W {
  let s = fakeState(30);
  s = run(s, { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
  for (const c of [
    { rank: 'ΥΠΛΓΟΣ', hk: 'Ανθυπίλαρχοι-Ανθλγοι', last: 'ΑΞΙΩΜΑΤΙΚΟΣ', first: 'ΑΛΦΑΣ' }, { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΛΟΧΙΑΣ', first: 'ΒΗΤΑΣ' },
    { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΕΥΤΕΡΟΣ', first: 'ΓΑΜΜΑΣ' }, { rank: 'ΕΠΟΠ', hk: 'ΕΠΟΠ Στρατιώτης', last: 'ΕΠΟΠΑΚΗΣ', first: 'ΔΕΛΤΑΣ', monthMax: 2 }
  ]) s = run(s, { t: 'saveCadre', cadre: c });
  const by = (l: string) => s.cadreList.find(c => c.last === l)!;
  return { s, off: by('ΑΞΙΩΜΑΤΙΚΟΣ'), nco: by('ΛΟΧΙΑΣ'), nco2: by('ΔΕΥΤΕΡΟΣ'), epop: by('ΕΠΟΠΑΚΗΣ') };
}
const duty = (s: AppState, c: Cadre, date: string, svc: string, why?: string) => run(s, { t: 'saveCadreDuty', duty: { date, svc, cid: c.id, ...(why ? { why } : {}) } });
const grp = (s: AppState, c: Cadre, group: string, more: object = {}) => run(s, { t: 'setCadreDutyOf', cid: c.id, person: { group, ...more } });
// στέλεχος σε θέση στρατιωτών (με το χέρι), όπως στο cadre-duty.test.ts
const seat = (s: AppState, c: Cadre, date: string, k: string) => run(s, { t: 'assign', date, k, pid: pickPeople(s).find(p => p.cid === c.id)!.id, cid: c.id });
const codes = (s: AppState, c: Cadre, date: string, svc: string) => eligibility(s, c, date, serviceOf(dutyCfgOf(s.settings), svc)?.svc).map(r => r.code);

describe('Υπηρεσίες στελεχών: δεδομένα και εντολές', () => {
  it('οι ρυθμίσεις καθαρίζονται σε προεπιλογές και οι ομάδες είναι δεδομένα', () => {
    const { s } = base();
    const c = dutyCfgOf(s.settings);
    expect(c.groups.map(g => g.name)).toEqual(['ΑΥΔΜ', 'Πύλη', 'Φυλάκιο ποταμού']);
    expect(dutyCfgOf(fakeState(1).settings)).toMatchObject({ groups: [], limits: { off: { base: 3, extra: 1 }, nco: { base: 4, extra: 1 } }, rest: 1, carry: true, fairHol: true });
    expect(serviceOf(c, 's4')!.svc).toMatchObject({ h24: false, days: [1, 2, 3, 4, 5], perDay: 1, hkCol: '' });
  });
  it('saveCadreDuty: νέα, ίδια μέρα+υπηρεσία+άτομο αντικαθίσταται (με αιτία), delete, batch· άγνωστη υπηρεσία δεν γράφεται', () => {
    const { s, nco } = base();
    let t = duty(s, nco, '2026-12-05', 's2');
    expect(t.cadreDuties).toHaveLength(1);
    t = duty(t, nco, '2026-12-05', 's2', 'αλλαγή');
    expect(t.cadreDuties).toHaveLength(1); expect(t.cadreDuties![0].why).toBe('αλλαγή');
    expect(() => run(t, { t: 'saveCadreDuty', duty: { date: '2026-12-06', svc: 'zz', cid: nco.id } })).toThrow(/υπηρεσία/);
    const r = apply(t, { t: 'setCadreDuties', add: [{ date: '2026-12-10', svc: 's2', cid: nco.id }, { date: '2026-12-12', svc: 's2', cid: nco.id }], del: [t.cadreDuties![0].id], text: 'δοκιμή' }, { today: D, newId: () => 'q' + ++n });
    expect(r.state.cadreDuties!.map(x => x.date).sort()).toEqual(['2026-12-10', '2026-12-12']);
    expect(r.files).toContain('ΗΚΑΙ'); expect(r.text).toMatch(/Υπηρεσίες στελεχών/);
    const d = run(r.state, { t: 'deleteCadreDuty', id: r.state.cadreDuties![0].id });
    expect(d.cadreDuties).toHaveLength(1);
    // διαγραφή στελέχους: φεύγουν οι υπηρεσίες και τα στοιχεία του
    const g = grp(t, nco, 'g2', { limit: 2 });
    const del = run(g, { t: 'deleteCadre', id: nco.id });
    expect(del.cadreDuties).toEqual([]); expect(del.cadreDutyOf?.[nco.id]).toBeUndefined();
  });
  it('setCadreDutyOf καθαρίζει κενά: χωρίς τίποτα το κλειδί φεύγει', () => {
    const { s, nco } = base();
    const g = grp(s, nco, 'g2', { noDow: [0, 6] }); expect(g.cadreDutyOf![nco.id]).toEqual({ group: 'g2', noDow: [0, 6] });
    expect(run(g, { t: 'setCadreDutyOf', cid: nco.id, person: null }).cadreDutyOf).toEqual({});
  });
  it('τα στοιχεία ανά άτομο ΔΕΝ μπαίνουν στο στέλεχος ούτε στο ΣΤΕΛΕΧΗ.xlsx (οι στήλες μένουν ίδιες)', () => {
    const { s, nco } = base();
    const before = JSON.stringify(cadreSheets(s, D));
    let t = grp(s, nco, 'g2', { limit: 2, none: {} }); t = duty(t, nco, '2026-12-05', 's2');
    expect(JSON.stringify(cadreSheets(t, D))).toBe(before);
    expect(Object.keys(t.cadreList.find(c => c.id === nco.id)!).sort()).toEqual(Object.keys(nco).sort());
  });
});

describe('Όρια του μήνα: κατηγορία, ΕΠΟΠ/ΟΒΑ, δικό του, μεταφορά', () => {
  it('αξιωματικοί 3+1, υπαξιωματικοί 4+1, ΕΠΟΠ το monthMax του· δικό του όριο νικά', () => {
    let { s, off, nco, epop } = base();
    expect(monthLimit(s, off, '2026-12')).toMatchObject({ cat: 'off', base: 3, effBase: 3, extra: 1, carry: 0, done: 0 });
    expect(monthLimit(s, nco, '2026-12')).toMatchObject({ cat: 'nco', base: 4, effBase: 4, extra: 1 });
    expect(monthLimit(s, epop, '2026-12')).toMatchObject({ base: 2, effBase: 2, extra: 0 });
    s = grp(s, nco, 'g2', { limit: 6 });
    expect(monthLimit(s, nco, '2026-12')).toMatchObject({ base: 6, effBase: 6, extra: 1 });
  });
  it('μετρά μαζί πρόγραμμα και θέσεις στρατιωτών, και ΣΚ/αργίες', () => {
    let { s, nco } = base();
    s = duty(s, nco, '2026-12-05', 's2');   // Σάββατο
    s = duty(s, nco, '2026-12-10', 's2');
    s = seat(s, nco, '2026-12-20', 'dy');   // Κυριακή, με το χέρι
    expect(monthLimit(s, nco, '2026-12')).toMatchObject({ done: 3, roster: 2, seat: 1, hol: 2 });
    expect(monthLimit(s, nco, '2026-11').done).toBe(0);
  });
  it('μεταφορά: μόνο από τον προηγούμενο μήνα, θετική αν έκανε λιγότερες, αρνητική αν περισσότερες, ποτέ κάτω από 0', () => {
    let { s, nco, nco2, off } = base();
    s = grp(s, nco, 'g2'); s = grp(s, nco2, 'g2'); s = grp(s, off, 'g1');
    for (const d of ['02', '04', '06', '08', '10']) s = duty(s, nco, '2026-11-' + d, 's2');   // 5 από 4
    for (const d of ['03', '09']) s = duty(s, nco2, '2026-11-' + d, 's2');                   // 2 από 4
    const nov = monthLimit(s, nco, '2026-11'); expect(nov).toMatchObject({ done: 5, carry: 0, nextCarry: -1 });
    expect(monthLimit(s, nco2, '2026-11').nextCarry).toBe(2);
    expect(monthLimit(s, nco, '2026-12')).toMatchObject({ carry: -1, effBase: 3, base: 4 });
    expect(monthLimit(s, nco2, '2026-12')).toMatchObject({ carry: 2, effBase: 6 });
    expect(monthLimit(s, off, '2026-12')).toMatchObject({ carry: 3, effBase: 6 });   // δεν έκανε καμία τον Νοέμβριο
    expect(monthLimit(s, nco2, '2027-01')).toMatchObject({ carry: 0, effBase: 4 });   // ο Δεκέμβριος δεν έχει πρόγραμμα: δεν μεταφέρεται τίποτα
    for (const d of ['02', '03', '04', '05', '06', '07', '08', '09']) s = duty(s, nco2, '2026-12-' + d, 's2');
    expect(monthLimit(s, nco2, '2027-01')).toMatchObject({ carry: -4, effBase: 0 });   // 4 − 8 = −4 → ποτέ κάτω από 0 (4 + (−4) = 0)
    for (const d of ['10', '11']) s = duty(s, nco2, '2026-12-' + d, 's2');
    expect(monthLimit(s, nco2, '2027-01').effBase).toBe(0);
    expect(carryText('2026-11', -1)).toBe('−1 Δεκ'); expect(carryText('2026-12', 2)).toBe('+2 Ιαν'); expect(carryText('2026-12', 0)).toBe('—');
  });
  it('χωρίς πρόγραμμα τον προηγούμενο μήνα, ή με carry κλειστό ή «ελαφράς καμία», δεν μεταφέρεται τίποτα', () => {
    let { s, nco, nco2 } = base();
    s = grp(s, nco, 'g2'); s = grp(s, nco2, 'g2', { none: {} });
    s = duty(s, nco, '2026-11-04', 's2');
    expect(monthLimit(s, nco, '2026-11').carry).toBe(0);
    expect(monthLimit(s, nco, '2026-12').carry).toBe(3);
    expect(monthLimit(s, nco2, '2026-12').carry).toBe(0); expect(monthLimit(s, nco2, '2026-11').nextCarry).toBe(0);
    const off = run(s, { t: 'setSettings', settings: { cadreDuty: { ...CFG, carry: false } }, text: 'δοκιμή' });
    expect(monthLimit(off, nco, '2026-12').carry).toBe(0); expect(monthLimit(off, nco, '2026-11').nextCarry).toBe(0);
    expect(limitText(s, nco2, '2026-12', monthLimit(s, nco2, '2026-12'))).toBe('καμία');
  });
});

describe('Επιλεξιμότητα: λόγοι, ποτέ μπλοκάρισμα', () => {
  it('χωρίς πρόβλημα: κανένας λόγος· εκτός δύναμης, ομάδα, offOnly', () => {
    let { s, off, nco } = base();
    s = grp(s, nco, 'g2'); s = grp(s, off, 'g1');
    expect(codes(s, nco, '2026-12-08', 's2')).toEqual([]);
    expect(codes(s, nco, '2026-12-08', 's3')).toEqual(['group']);
    expect(codes(s, nco, '2026-12-08', 's1')).toEqual(expect.arrayContaining(['group', 'offonly']));
    expect(codes(s, off, '2026-12-08', 's1')).toEqual([]);
    const gone = run(s, { t: 'saveCadre', cadre: { ...nco, active: false } });
    expect(codes(gone, gone.cadreList.find(c => c.id === nco.id)!, '2026-12-08', 's2')).toContain('inactive');
  });
  it('κατάσταση της μέρας (όχι η «υπηρεσία»), «δεν θέλει υπηρεσία», μέρα εβδομάδας', () => {
    let { s, nco } = base();
    s = run(s, { t: 'addCadreAbs', abs: { cid: nco.id, kind: 'ka', from: '2026-12-14', to: '2026-12-18' }, replace: false });
    s = run(s, { t: 'addCadreAbs', abs: { cid: nco.id, kind: 'yp', from: '2026-12-21', to: '2026-12-21' }, replace: false });
    s = run(s, { t: 'setCadreNoDuty', cid: nco.id, from: '2026-12-23', to: '2026-12-24' });
    s = grp(s, nco, 'g2', { noDow: [3] });   // Τετάρτη
    expect(codes(s, nco, '2026-12-15', 's2')).toEqual(['state']);
    expect(codes(s, nco, '2026-12-21', 's2')).toEqual([]);   // «Υπηρεσία εντός στρατοπέδου»: δεν είναι εμπόδιο
    expect(codes(s, nco, '2026-12-24', 's2')).toContain('noduty');
    expect(codes(s, nco, '2026-12-02', 's2')).toEqual(['dow']);   // 2/12/2026 = Τετάρτη
    expect(codes(s, nco, '2026-12-03', 's2')).toEqual([]);
  });
  it('ελαφράς καμία / μόνο / όχι 24ωρες, με ημερομηνία λήξης', () => {
    let { s, nco, nco2 } = base();
    s = grp(s, nco, 'g2', { none: { until: '2026-12-10' } });
    expect(codes(s, nco, '2026-12-10', 's2')).toEqual(['none']); expect(codes(s, nco, '2026-12-11', 's2')).toEqual([]);   // ως και τη μέρα λήξης
    s = grp(s, nco2, 'g2', { only: { services: ['s4'], until: '2026-12-31' }, no24: { until: '2026-12-20', why: 'μητέρα' } });
    expect(codes(s, nco2, '2026-12-08', 's2')).toEqual(expect.arrayContaining(['only', 'no24']));
    expect(eligibility(s, nco2, '2026-12-08', serviceOf(dutyCfgOf(s.settings), 's2')!.svc).find(r => r.code === 'no24')!.text).toMatch(/μητέρα/);
    expect(codes(s, nco2, '2026-12-08', 's4')).toEqual([]);   // ημερήσια: δεν είναι 24ωρη
    expect(codes(s, nco2, '2026-12-21', 's2')).toEqual(['only']);   // η «όχι 24ωρες» έληξε
    expect(codes(s, nco2, '2027-01-05', 's2')).toEqual([]);   // έληξαν και τα δύο
  });
  it('υπηρεσία που δεν γίνεται εκείνη τη μέρα εβδομάδας', () => {
    const { s, nco } = base();
    expect(codes(s, nco, '2026-12-05', 's4')).toContain('days');   // Σάββατο
    expect(codes(s, nco, '2026-12-04', 's4')).not.toContain('days');
  });
  it('ανάπαυση: υπηρεσία προγράμματος ή θέση στρατιωτών μέσα στις μέρες· διπλή υπηρεσία την ίδια μέρα', () => {
    let { s, nco } = base();
    s = duty(s, nco, '2026-12-10', 's2');
    expect(codes(s, nco, '2026-12-11', 's2')).toEqual(['rest']); expect(codes(s, nco, '2026-12-09', 's2')).toEqual(['rest']);
    expect(codes(s, nco, '2026-12-12', 's2')).toEqual([]);
    expect(codes(s, nco, '2026-12-10', 's3')).toEqual(['same']);
    s = seat(s, nco, '2026-12-20', 'dy');
    expect(codes(s, nco, '2026-12-21', 's2')).toEqual(['rest']);   // ανάπαυση και από θέση στρατιωτών
    expect(codes(s, nco, '2026-12-20', 's2')).toEqual(['seat']);   // «και υπηρεσία στρατιωτών»
    expect(eligibility(s, nco, '2026-12-20', serviceOf(dutyCfgOf(s.settings), 's2')!.svc)[0].text).toMatch(/υπηρεσία στρατιωτών/);
    const wide = run(s, { t: 'setSettings', settings: { cadreDuty: { ...CFG, rest: 2 } }, text: 'δοκιμή' });
    expect(codes(wide, nco, '2026-12-12', 's2')).toEqual(['rest']);
    expect(codes(run(s, { t: 'setSettings', settings: { cadreDuty: { ...CFG, rest: 0 } }, text: 'δοκιμή' }), nco, '2026-12-11', 's2')).toEqual([]);
    // η ίδια η εγγραφή δεν μετρά ως «ήδη υπηρεσία» όταν ελέγχεται η ίδια
    const mine = s.cadreDuties![0];
    expect(eligibility(s, nco, '2026-12-10', serviceOf(dutyCfgOf(s.settings), 's2')!.svc, { ignore: mine.id })).toEqual([]);
  });
  it('πάνω από το όριο, και πάνω από το έξτρα (πιο έντονο)· η υπηρεσία χωρίς θέση για άλλον δεν μετρά', () => {
    let { s, off } = base();
    for (const d of ['02', '05', '08']) s = duty(s, off, '2026-12-' + d, 's1');
    expect(eligibility(s, off, '2026-12-12', serviceOf(dutyCfgOf(s.settings), 's1')!.svc).map(r => r.code)).toEqual(['over']);
    s = duty(s, off, '2026-12-12', 's1');
    const r = eligibility(s, off, '2026-12-16', serviceOf(dutyCfgOf(s.settings), 's1')!.svc);
    expect(r.map(x => x.code)).toEqual(['over2']); expect(r[0].strong).toBe(true);
    // γεμάτη υπηρεσία της μέρας
    expect(codes(s, s.cadreList.find(c => c.last === 'ΛΟΧΙΑΣ')!, '2026-12-12', 's1')).toContain('full');
    // ποτέ μπλοκάρισμα: η εντολή γράφει κανονικά
    expect(duty(s, off, '2026-12-16', 's1').cadreDuties).toHaveLength(5);
  });
});

describe('Έλεγχος μήνα και γραμμές', () => {
  it('κενές υπηρεσίες, πάνω/κάτω από το όριο, διπλές, περιορισμοί που παραβιάζονται', () => {
    let { s, off, nco, nco2 } = base();
    s = grp(s, off, 'g1'); s = grp(s, nco, 'g2'); s = grp(s, nco2, 'g2', { none: {} });
    for (const d of ['01', '02', '03', '04', '05']) s = duty(s, nco, '2026-12-' + d, 's2');   // 5 από 4, και ανάπαυση
    s = duty(s, nco, '2026-12-01', 's3');
    s = duty(s, nco2, '2026-12-07', 's2');   // ελαφράς καμία
    const c = monthCheck(s, '2026-12');
    expect(c.over.map(x => x.c.id)).toEqual([nco.id]); expect(c.over[0].lim.nextCarry).toBe(-2);   // 6 από 4 (η s3 μετρά) → −2
    expect(c.under.map(x => x.c.id)).toEqual([off.id]);   // 0 από 3· ο nco2 είναι «καμία»: δεν είναι «κάτω»
    expect(c.double.map(x => [x.c.id, x.d])).toEqual([[nco.id, '2026-12-01']]);
    expect(c.broken.some(x => x.c.id === nco2.id && x.reasons.some(r => r.code === 'none'))).toBe(true);
    expect(c.broken.some(x => x.c.id === nco.id && x.reasons.some(r => r.code === 'rest'))).toBe(false);   // η ανάπαυση είναι άλλη κατηγορία: δεν είναι «περιορισμός»
    const e = c.empty.find(x => x.svc.id === 's1')!; expect(e.days).toHaveLength(31);
    expect(c.empty.find(x => x.svc.id === 's4')!.days).toHaveLength(23);   // μόνο Δευ–Παρ
  });
  it('γραμμές: ομάδες, χωρίς ομάδα (μόνο όσοι έχουν θέσεις), περιορισμοί', () => {
    let { s, off, nco, nco2, epop } = base();
    s = grp(s, off, 'g1'); s = grp(s, nco, 'g2'); s = grp(s, nco2, 'g2', { none: { until: '2027-03-01' } });
    s = seat(s, epop, '2026-12-08', 'dy');
    const sec = dutySections(s, '2026-12');
    expect(sec.map(x => [x.kind, x.people.map(c => c.last)])).toEqual([['group', ['ΑΞΙΩΜΑΤΙΚΟΣ']], ['group', ['ΛΟΧΙΑΣ']], ['group', []], ['free', ['ΕΠΟΠΑΚΗΣ']], ['restr', ['ΔΕΥΤΕΡΟΣ']]]);
  });
  it('φίλτρα Προγράμματος αδειών: οι ομάδες υπηρεσιών ως chips', () => {
    let { s, nco, nco2 } = base();
    s = grp(s, nco, 'g2'); s = grp(s, nco2, 'g3');
    const f = planFilters(s.settings); expect(f.map(x => x.id)).toEqual(['all', 'off', 'nco', 'leave', 'g:g1', 'g:g2', 'g:g3']);
    expect(planFilters().map(x => x.id)).toEqual(['all', 'off', 'nco', 'leave']);   // χωρίς ρυθμίσεις: όπως πριν
    const ix = monthIndex(s, '2026-12');
    expect(planRows(s, ix, 'g:g2').map(c => c.last)).toEqual(['ΛΟΧΙΑΣ']); expect(planRows(s, ix, 'g:g3').map(c => c.last)).toEqual(['ΔΕΥΤΕΡΟΣ']);
  });
});

describe('ΗΚΑΙ, αξιωματικοί υπηρεσίας, απαλλαγές', () => {
  it('στήλη «Υπηρ.» (yp) και «Φυλ.» (fyl) από την υπηρεσία· ρητή κατάσταση νικά· χωρίς στήλη δεν μετρά', () => {
    let { s, off, nco, nco2 } = base();
    s = duty(s, off, '2026-12-08', 's1');    // yp
    s = duty(s, nco, '2026-12-08', 's3');    // fyl
    s = duty(s, nco2, '2026-12-08', 's4');   // χωρίς στήλη
    const h = hkaiCounts(s, '2026-12-08');
    expect(h.cadre.yp?.map(c => c.id)).toEqual([off.id]); expect(h.cadre.fyl?.map(c => c.id)).toEqual([nco.id]);
    expect(h.rank['Ανθυπίλαρχοι-Ανθλγοι'].c.yp).toBe(1); expect(h.rank['Λοχίες'].c.fyl).toBe(1);
    expect(Object.values(h.cadre).flat().some(c => c.id === nco2.id)).toBe(false);
    const other = hkaiCounts(s, '2026-12-09'); expect(other.cadre.yp || []).toEqual([]);
    // ρητή κατάσταση (άδεια) την ίδια μέρα: μετρά η κατάσταση, όχι η υπηρεσία
    const t = run(s, { t: 'addCadreAbs', abs: { cid: off.id, kind: 'ka', from: '2026-12-08', to: '2026-12-08' }, replace: false });
    const h2 = hkaiCounts(t, '2026-12-08'); expect(h2.cadre.yp || []).toEqual([]); expect(h2.cadre.ka?.map(c => c.id)).toEqual([off.id]);
    expect(h2.kol + h2.apo).toBe(h.kol + h.apo);   // ένας άνθρωπος, μία στήλη
  });
  it('μέτρηση: δεν μετρά διπλά όταν υπάρχει και θέση στρατιωτών την ίδια μέρα', () => {
    let { s, off } = base();
    s = duty(s, off, '2026-12-08', 's1'); s = seat(s, off, '2026-12-08', 'ly');
    const h = hkaiCounts(s, '2026-12-08'); expect(h.cadre.yp!.filter(c => c.id === off.id)).toHaveLength(1);
    expect(h.rank['Ανθυπίλαρχοι-Ανθλγοι'].c.yp).toBe(1);
  });
  it('dutyOfficers: μόνο αξιωματικοί με υπηρεσία που έχει yp· όχι υπαξιωματικοί, όχι fyl, όχι αν έχουν άλλη κατάσταση', () => {
    const base0 = base(); let { s, off, nco } = base0;
    s = duty(s, off, '2026-12-08', 's1'); s = duty(s, nco, '2026-12-08', 's2');   // ο υπαξιωματικός δεν είναι «αξιωματικός υπηρεσίας»
    expect(dutyOfficers(s, '2026-12-08')).toBe('ΥΠΛΓΟΣ ΑΞΙΩΜΑΤΙΚΟΣ ΑΛΦΑΣ');
    expect(dutyOfficers(s, '2026-12-09')).toBe('');
    const f = duty(base0.s, base0.off, '2026-12-08', 's3'); expect(dutyOfficers(f, '2026-12-08')).toBe('');   // Φυλ.
    const k = run(s, { t: 'addCadreAbs', abs: { cid: off.id, kind: 'ka', from: '2026-12-08', to: '2026-12-08' }, replace: false });
    expect(dutyOfficers(k, '2026-12-08')).toBe('');
  });
  it('απαλλαγές: η υπηρεσία του προγράμματος δίνει απαλλαγή (μόνο μέρες που πέρασαν), με το όνομα της υπηρεσίας· ΣΚ/αργία με έξτρα', () => {
    let { s, nco } = base();
    s = run(s, { t: 'setSettings', settings: { cadreLeave: { apalPerDuty: 1, apalHolExtra: 1 } }, text: 'δοκιμή' });
    s = duty(s, nco, '2026-11-14', 's2');   // Σάββατο, πριν από σήμερα (17/11)
    s = duty(s, nco, '2026-11-10', 's2'); s = duty(s, nco, '2026-11-25', 's2');   // μέλλον: δεν μετρά ακόμα
    const l = apalLedger(s, nco, D).filter(r => r.kind === 'duty');
    expect(l.map(r => [r.d, r.what, r.gain])).toEqual([['2026-11-10', 'Υπηρεσία Αξ/κός Κεντρικής Πύλης', 1], ['2026-11-14', 'Υπηρεσία Αξ/κός Κεντρικής Πύλης (ΣΚ/αργία)', 2]]);
    expect(apalLedger(s, nco, D).at(-1)!.left).toBe(3);
    // μαζί με υπηρεσία στις θέσεις: και οι δύο κερδίζουν
    const t = seat(s, nco, '2026-11-12', 'dy');
    expect(apalLedger(t, t.cadreList.find(c => c.id === nco.id)!, D).filter(r => r.kind === 'duty')).toHaveLength(3);
  });
});

describe('Οι στρατιώτες δεν επηρεάζονται· παλιά βάση', () => {
  it('η αυτόματη συμπλήρωση και τα στατιστικά των στρατιωτών ίδια με και χωρίς πρόγραμμα στελεχών', () => {
    const { s, off, nco } = base();
    const plain = { ...s, settings: { ...s.settings, cadreDuty: undefined } };
    let t = grp(s, nco, 'g2'); t = duty(t, nco, '2026-12-08', 's2'); t = duty(t, off, '2026-12-09', 's1'); t = duty(t, off, '2026-12-08', 's3');
    for (const d of ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-12']) {
      expect(fillDay(t, d).guards).toEqual(fillDay(plain, d).guards);
    }
    const a = dutyStats(fillDay(t, '2026-12-08') && t), b = dutyStats(plain);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
  it('παλιά κατάσταση χωρίς τα νέα πεδία: όλα δουλεύουν, χωρίς εγγραφές στο kv', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gipl-'));
    const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    let st = new Store(dir, WASM); await st.open();
    expect(st.state.cadreDuties).toBeUndefined(); expect(st.state.cadreDutyOf).toBeUndefined();
    const o = st.state;
    expect(monthLimit(o, { id: 'x', rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'Α', first: 'Β', active: true }, '2026-12')).toMatchObject({ done: 0, effBase: 4, carry: 0 });
    expect(monthCheck(o, '2026-12')).toMatchObject({ empty: [], over: [], broken: [] });
    st.commit(run(o, { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' }));
    st.commit(run(st.state, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ' } }));
    const cid = st.state.cadreList[0].id;
    const p1 = st.commit(run(st.state, { t: 'saveCadreDuty', duty: { date: '2026-12-05', svc: 's2', cid } }));
    const p2 = st.commit(run(st.state, { t: 'setCadreDutyOf', cid, person: { group: 'g2', limit: 3 } }));
    expect(p1.kvd).toMatchObject([{ key: 'cadreDuties' }]); expect(p2.kvd).toMatchObject([{ key: 'cadreDutyOf' }]);
    st.close(); st = new Store(dir, WASM); await st.open();
    expect(st.state.cadreDuties!.map(x => x.date)).toEqual(['2026-12-05']); expect(st.state.cadreDutyOf![cid]).toEqual({ group: 'g2', limit: 3 });
    st.revert(p2); expect(st.state.cadreDutyOf).toEqual({}); st.revert(p1); expect(st.state.cadreDuties).toEqual([]);
    st.close();
  });
});

describe('Excel «ΥΠΗΡΕΣΙΕΣ ΣΤΕΛΕΧΩΝ»', () => {
  function sample() {
    let { s, off, nco, nco2 } = base();
    s = run(s, { t: 'setSettings', settings: { holidays: { '2026-12-10': 'Γιορτή μονάδας' } }, text: 'δοκιμή' });
    s = grp(s, off, 'g1'); s = grp(s, nco, 'g2'); s = grp(s, nco2, 'g3');
    s = duty(s, off, '2026-12-05', 's1'); s = duty(s, nco, '2026-12-10', 's2'); s = duty(s, nco2, '2026-12-24', 's3');
    s = seat(s, nco, '2026-12-20', 'dy');
    s = run(s, { t: 'setCadreNoDuty', cid: off.id, from: '2026-12-29', to: '2026-12-29' });
    return s;
  }
  it('δεδομένα: κωδικοί, Σ από θέση στρατιωτών, Χ, σύνολο και όριο, ανά ημέρα', () => {
    const sh = dutySheet(sample(), '2026-12');
    const o = sh.byPerson.find(r => r.name === 'ΑΞΙΩΜΑΤΙΚΟΣ ΑΛΦΑΣ')!; expect(o.cells[4]).toBe('ΑΥΔΜ'); expect(o.cells[28]).toBe('X'); expect(o.sum).toBe(1); expect(o.limit).toBe('3+1'); expect(o.group).toBe('ΑΥΔΜ');
    const l = sh.byPerson.find(r => r.name === 'ΛΟΧΙΑΣ ΒΗΤΑΣ')!; expect(l.cells[9]).toBe('Π'); expect(l.cells[19]).toBe('Σ'); expect(l.sum).toBe(2);
    expect(sh.byDay.find(r => r.date === '10/12/2026' && r.svc === 'ΑΞ/ΚΟΣ ΚΕΝΤΡΙΚΗΣ ΠΥΛΗΣ')!.who).toBe('ΛΧΙΑΣ ΛΟΧΙΑΣ ΒΗΤΑΣ');
    expect(sh.byDay.filter(r => r.svc === 'ΗΜΕΡΗΣΙΑ ΠΥΛΗ')).toHaveLength(23);   // μόνο Δευ–Παρ
    expect(sh.byDay.find(r => r.date === '10/12/2026')!.shade).toBe('hol');
  });
  it('το αρχείο: δύο φύλλα, A4 οριζόντια σε μία σελίδα φάρδος, γκρι ΣΚ/αργίες, όνομα από το fileNames, όλα κεφαλαία', async () => {
    const s = sample();
    const m = await cadreDutyBook(s, '2026-12', D);
    expect(m.name).toBe('ΥΠΗΡΕΣΙΕΣ ΣΤΕΛΕΧΩΝ ΔΕΚΕΜΒΡΙΟΣ 2026.xlsx'); expect(m.name).toBe(fileNameOf(s.settings, 'cadreDuty', { text: 'ΔΕΚΕΜΒΡΙΟΣ 2026' }));
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(m.data as any);
    expect(wb.worksheets.map(w => w.name)).toEqual(['ΑΝΑ ΑΤΟΜΟ', 'ΑΝΑ ΗΜΕΡΑ']);
    const [a, b] = wb.worksheets;
    for (const w of wb.worksheets) expect(w.pageSetup).toMatchObject({ paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 });
    expect(String(a.getCell(1, 1).value)).toMatch(/^ΥΠΗΡΕΣΙΕΣ ΣΤΕΛΕΧΩΝ ΔΕΚΕΜΒΡΙΟΣ 2026 · /);
    const head = a.getRow(3).values as any[]; expect(head.slice(1, 5)).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΟΜΑΔΑ']); expect(head[head.length - 2]).toBe('Σ'); expect(head[head.length - 1]).toBe('ΟΡΙΟ');
    expect(a.getCell(4, 3).value).toBe('ΑΞΙΩΜΑΤΙΚΟΣ ΑΛΦΑΣ'); expect(a.getCell(4, 4 + 5).value).toBe('ΑΥΔΜ'); expect(a.getCell(4, 4).value).toBe('ΑΥΔΜ');
    expect(a.getCell(5, 4 + 20).value).toBe('Σ');
    const fg = (r: number, c: number) => (a.getCell(r, c).fill as any)?.fgColor?.argb;
    expect(fg(4, 4 + 5)).toBe('FFD9D9D9'); expect(fg(4, 4 + 10)).toBe('FFBFBFBF'); expect(fg(4, 4 + 1)).toBeUndefined();
    expect(String(b.getRow(3).values && (b.getRow(3).values as any[])[3])).toBe('ΥΠΗΡΕΣΙΑ');
    for (const w of wb.worksheets) w.eachRow(r => r.eachCell(c => { if (typeof c.value === 'string') expect(c.value).toBe(c.value.toUpperCase()); }));
    expect(m.marks).toHaveLength(2);
  });
  it('χωρίς ομάδες: φύλλα με «ΚΑΝΕΝΑΣ» και χωρίς σφάλμα', async () => {
    const m = await cadreDutyBook(fakeState(3), '2026-12', D);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(m.data as any);
    expect(wb.worksheets[0].getCell(4, 1).value).toBe('ΚΑΝΕΝΑΣ');
  });
});
