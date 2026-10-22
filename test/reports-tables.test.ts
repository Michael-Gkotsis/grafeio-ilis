// Έντυπα (Michael, 22/10): στήλες με καταστάσεις σε μορφή που διαλέγεις (ΕΑ, ΕΥ, ΑΔΕΙΑ…), συνδυασμοί στοιχείων σε μία
// στήλη (ΣΤΡ (ΜΧ)) και πολλοί πίνακες σε ένα έντυπο, ο καθένας με δικές του στήλες και δικούς του ποιοι μπαίνουν
import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport, inspectTemplate, splitSpan } from '../src/main/reports';
import { ST_FMTS, comboFmts, comboHead, defaultPick, fieldValue, fillFmt, guessField, moreRows, newTable, pickForKind, stText, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import type { Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-19';
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const st = (id: string, pid: number, type: Status['type'], from: string, to: string, x: Partial<Status> = {}): Status => ({ id, pid, type, from, to, ...x });
function withStatuses() {
  const s = fakeState(12);
  s.people[0].spec = 'ΜΧ'; s.people[1].spec = '';
  s.statuses = [st('a', 1, 'EA', '2026-10-17', '2026-10-21'), st('b', 1, 'PUN', '2026-10-19', '2026-10-22', { kind: 'Περιορισμός' }), st('c', 2, 'LEAVE', '2026-10-18', '2026-10-25'),
    st('d', 3, 'EY', '2026-10-19', '2026-10-19', { open: true }), st('e', 4, 'EA', '2026-10-01', '2026-10-05')];
  return s;
}

describe('Στήλες με καταστάσεις και μορφή', () => {
  it('κάθε είδος χωριστά, με τη μορφή που διαλέγεις', () => {
    const s = withStatuses(); const [p1, p2, p3, p4] = s.people;
    const v = (p: typeof p1, f: string, sf?: string) => fieldValue(s, 'people', p, f, 0, D, undefined, sf ? { sf } : undefined);
    expect(v(p1, 'smed')).toBe('ΕΑ'); expect(v(p1, 'spun')).toBe('ΠΕΡΙΟΡΙΣΜΟΣ'); expect(v(p1, 'sabs')).toBe('');
    expect(v(p2, 'sabs')).toBe('ΚΑ'); expect(v(p2, 'sabs', '{ΣΥΝΤΟΜΑ}')).toBe('ΑΔΕΙΑ'); expect(v(p1, 'status', '{ΣΥΝΤΟΜΑ}')).toBe('ΕΑ, ΠΟΙΝΗ');
    expect(v(p1, 'smed', '{ΟΝΟΜΑ}')).toBe('Ελεύθερος Ασκήσεων'); expect(v(p2, 'sabs', '{ΚΑΤΗΓΟΡΙΑ}')).toBe('ΑΔΕΙΑ');
    expect(v(p1, 'smed', '{ΚΩΔ} ΕΩΣ {ΕΩΣ}')).toBe('ΕΑ ΕΩΣ 21/10'); expect(v(p1, 'smed', '{ΚΩΔ} {ΑΠΟ}-{ΕΩΣ}')).toBe('ΕΑ 17/10-21/10');
    expect(v(p3, 'smed', '{ΚΩΔ} ΕΩΣ {ΕΩΣ}')).toBe('ΕΥ ΕΩΣ …');   // χωρίς λήξη
    expect(v(p1, 'smed', 'ΝΑΙ')).toBe('ΝΑΙ'); expect(v(p4, 'smed', 'ΝΑΙ')).toBe('');   // το ΕΑ του έληξε
    expect(v(p1, 'smed', '{κωδ} ({ημερες} ΗΜ.)')).toMatch(/^ΕΑ \(\d+ ΗΜ\.\)$/);   // ετικέτες και με μικρά
    // ίδιο με πριν όταν δεν διαλέγεις μορφή
    expect(v(p1, 'status')).toBe('ΕΑ, ΠΕΡΙΟΡΙΣΜΟΣ');
    // στις Καταστάσεις, το «Είδος» με τη μορφή
    const row = { ...p2, id: 'c', pid: 2, st: s.statuses[2], p: p2 };
    expect(fieldValue(s, 'status', row, 'stype', 0, D, undefined, { sf: '{ΣΥΝΤΟΜΑ} ΕΩΣ {ΕΩΣ}' })).toBe('ΑΔΕΙΑ ΕΩΣ 25/10');
    expect(fieldValue(s, 'status', row, 'stype', 0, D)).toBe('ΚΑ');
    // όλες οι έτοιμες μορφές δίνουν κάτι
    for (const f of ST_FMTS) expect(stText(s.statuses[0], f)).not.toBe('');
  });

  it('μαντεύει τις νέες στήλες από τις επικεφαλίδες', () => {
    expect(guessField('people', 'ΙΑΤΡΙΚΟ')).toBe('smed'); expect(guessField('people', 'Άδεια')).toBe('sabs'); expect(guessField('people', 'ΠΟΙΝΗ')).toBe('spun');
    expect(guessField('status', 'ΠΟΙΝΗ')).toBe('stype');   // στις καταστάσεις είναι το είδος
    expect(guessField('wmove', 'ΕΞΟΔΟΣ')).toBe('mout');    // στις κινήσεις όπλων η έξοδος του όπλου
  });
});

describe('Συνδυασμός στοιχείων σε μία στήλη', () => {
  it('ΣΤΡ (ΜΧ), και χωρίς Ο/Σ σκέτο ΣΤΡ', () => {
    const s = withStatuses(); const [p1, p2] = s.people;
    expect(fieldValue(s, 'people', p1, 'combo', 0, D)).toBe('ΣΤΡ (ΜΧ)'.replace('ΣΤΡ', p1.rank));
    expect(fieldValue(s, 'people', p2, 'combo', 0, D)).toBe('ΣΤΡ');
    const o = { parts: ['rank1', 'last', 'smed'], fmt: '{1} {2} - {3}', sf: '{ΣΥΝΤΟΜΑ}' };
    expect(fieldValue(s, 'people', p1, 'combo', 0, D, undefined, o)).toBe(p1.rank + ' ' + p1.last + ' - ΕΑ');
    expect(fieldValue(s, 'people', p2, 'combo', 0, D, undefined, o)).toBe('ΣΤΡ ' + p2.last);
    expect(comboHead('people', { parts: ['rank1', 'spec'], fmt: '{1} ({2})' })).toBe('ΒΑΘΜΟΣ (Ο/Σ)');
  });
  it('οι άδειες παρενθέσεις και τα διπλά διαχωριστικά φεύγουν', () => {
    expect(fillFmt('{1} ({2})', ['ΣΤΡ', ''])).toBe('ΣΤΡ');
    expect(fillFmt('{1} - {2} - {3}', ['Α', '', 'Γ'])).toBe('Α - Γ');
    expect(fillFmt('{1}/{2}', ['', 'Β'])).toBe('Β');
    expect(fillFmt('{1}, {2}', ['', ''])).toBe('');
    expect(fillFmt('{1} [{2}]', ['Α', 'Β'])).toBe('Α [Β]');
    expect(comboFmts(3)).toContain('{1} ({2} {3})');
  });
});

describe('Πολλοί πίνακες σε ένα έντυπο', () => {
  const two = (): BuildOpts => ({
    title: 'ΚΑΤΑΣΤΑΣΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray',
    cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'combo', h: 'ΒΑΘΜΟΣ', w: 'auto', o: { parts: ['rank1', 'spec'], fmt: '{1} ({2})' } }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }],
    more: [{ id: 't2', title: 'ΙΑΤΡΙΚΑ', kind: 'status', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }, { f: 'stype', h: 'ΕΙΔΟΣ', w: 'auto', o: { sf: '{ΚΩΔ} ΕΩΣ {ΕΩΣ}' } }, { f: 'to', h: 'ΕΩΣ', w: 'auto' }] }]
  });
  it('«Φτιάξ\' το εδώ»: ο 2ος πίνακας κάτω από τον 1ο, με τον τίτλο του, και οι υπογραφές στο τέλος', async () => {
    const s = withStatuses(); const o = two();
    const b = await buildTemplate(o, 'people');
    expect(b.more?.length).toBe(1); expect(b.head).toBe(7); expect(b.more![0].head).toBe(11);   // 7 επικεφαλίδες, 8 γραμμή, 10 τίτλος, 11 επικεφαλίδες
    const r = withBuilt(rep({}), b, o);
    expect(r.more![0]).toMatchObject({ id: 't2', kind: 'status', title: 'ΙΑΤΡΙΚΑ', head: 11 });
    r.more![0].pick = { ...r.more![0].pick, cats: ['med'] };
    expect(moreRows(s, r, D)[0].map(x => x.id)).toEqual(['a', 'd']);
    const out = await fillReport(b.data, s, r, s.people.slice(0, 6).map(p => p.id), D);
    const ws = await (await Workbook.open(out.data)).sheet(0);
    // 1ος πίνακας: 6 γραμμές από τη 8 (μπήκαν 5)· ο συνδυασμός στη στήλη Β
    expect(ws.get('A13')).toBe('6'); expect(ws.get('B8')).toBe(s.people[0].rank + ' (ΜΧ)'); expect(ws.get('B9')).toBe('ΣΤΡ');
    // 2ος πίνακας κατέβηκε 5: τίτλος 15, επικεφαλίδες 16, 2 γραμμές
    expect(ws.get('A15')).toBe('ΙΑΤΡΙΚΑ'); expect(ws.get('C16')).toBe('ΕΙΔΟΣ');
    expect(ws.get('A17')).toBe('1'); expect(ws.get('C17')).toBe('ΕΑ ΕΩΣ 21/10'); expect(ws.get('A18')).toBe('2'); expect(ws.get('C18')).toBe('ΕΥ ΕΩΣ …');
    expect(ws.get('A19')).toBeNull();
    // χωρίς επικεφαλίδες σε κάθε σελίδα (θα έβγαιναν του 1ου πάνω από τον 2ο)
    expect(await wb2names(out.data)).not.toMatch(/Print_Titles/);
  });

  it('δικές του υπογραφές με δύο πίνακες: κάτω από τον τελευταίο, όσες γραμμές κι αν μπουν στον 1ο', async () => {
    const s = withStatuses(); const o = two();
    const b = await buildTemplate(o, 'people'); const r = withBuilt(rep({}), b, o);
    r.more![0].pick = { ...r.more![0].pick, cats: ['med'] };
    const sigs = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }, { art: 'Ο', title: 'ΥΠΑΣΠΙΣΤΗΣ' }];
    const out = await fillReport(b.data, s, { ...r, sigs }, s.people.slice(0, 6).map(p => p.id), D);
    const ws = await (await Workbook.open(out.data)).sheet(0);
    const vals = await (await Workbook.open(out.data)).values(0, 60, 30);
    const rowOf = (v: string) => vals.findIndex(row => (row || []).some(x => x === v)) + 1;
    expect(ws.get('A18')).toBe('2');   // ο 2ος πίνακας τελειώνει στη 18
    expect(rowOf('ΕΠΟΠΤΗΣ')).toBeGreaterThan(18); expect(rowOf('ΥΠΑΣΠΙΣΤΗΣ')).toBe(rowOf('ΕΠΟΠΤΗΣ'));
    expect(vals.flat()).not.toContain('Ο ΛΟΧΙΑΣ');
  });

  it('ανεβασμένο Excel με δύο πίνακες με ίδιες επικεφαλίδες: τους ξαναβρίσκει και αν μπει γραμμή από πάνω', async () => {
    const wb = await Workbook.blank('ΦΥΛΛΟ'); const ws = await wb.sheet(0);
    const head = await wb.style({ b: true, border: true }), cell = await wb.style({ border: true });
    ws.set('A1', 'ΠΑΡΟΝΤΕΣ'); ['ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'].forEach((h, i) => ws.set('AB'[i] + '2', h).setStyle('AB'[i] + '2', head)); ws.setStyle('A3', cell).setStyle('B3', cell);
    ws.set('A5', 'ΣΕ ΑΔΕΙΑ'); ['ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΑΔΕΙΑ'].forEach((h, i) => ws.set('ABC'[i] + '6', h).setStyle('ABC'[i] + '6', head)); for (const c of 'ABC') ws.setStyle(c + '7', cell);
    ws.set('A9', 'Ο ΛΟΧΙΑΣ');
    const buf = await wb.save();
    const i1 = await inspectTemplate(buf, 'people'); expect(i1.head).toBe(6);   // περισσότερες γνωστές επικεφαλίδες: ο 2ος
    const a = await inspectTemplate(buf, 'people', 'ΦΥΛΛΟ', 2); const b = await inspectTemplate(buf, 'people', 'ΦΥΛΛΟ', 6);
    expect(b.headers.map(h => h.f)).toEqual(['rank', 'name', 'sabs']);
    const cols = (x: typeof a) => x.headers.filter(h => h.f).map(h => ({ c: h.c, f: h.f!, h: h.text }));
    const s = withStatuses();
    const t2 = { ...newTable('people', 't2'), head: 6, cols: cols(b), pick: { ...defaultPick(), need: ['leave' as const] } };
    const r = rep({ sheet: 'ΦΥΛΛΟ', head: 2, cols: cols(a), more: [t2] });
    // στο Excel μπήκαν 2 γραμμές πάνω πάνω
    const wb2 = await Workbook.open(buf); const w2 = await wb2.sheet(0); w2.insertRows(0, 2, 1, wb2);
    const out = await fillReport(await wb2.save(), s, r, [1, 3, 5], D);
    const o = await (await Workbook.open(out.data)).sheet(0);
    expect(o.get('B5')).toBe(s.people[0].last + ' ' + s.people[0].first); expect(o.get('B7')).toBe(s.people[4].last + ' ' + s.people[4].first);
    expect(o.get('A9')).toBe('ΣΕ ΑΔΕΙΑ'); expect(o.get('B11')).toBe(s.people[1].last + ' ' + s.people[1].first); expect(o.get('C11')).toBe('ΚΑ');
    expect(o.get('A13')).toBe('Ο ΛΟΧΙΑΣ');
  });

  it('ανά θάλαμο: κάθε φύλλο με τους δικούς του και στους δύο πίνακες', async () => {
    const s = withStatuses(); const o = two();
    const b = await buildTemplate(o, 'people');
    const r = { ...withBuilt(rep({ split: 'room' }), b, o) };
    // ο θάλαμος 3 δεν έχει κανέναν στον 1ο πίνακα, μόνο ιατρικό στον 2ο: παίρνει κι αυτός φύλλο
    const out = await fillReport(b.data, s, r, [1, 2], D);
    expect(out.sheets).toEqual(['ΘΑΛΑΜΟΣ 1', 'ΘΑΛΑΜΟΣ 2', 'ΘΑΛΑΜΟΣ 3']);
    const wb = await Workbook.open(out.data);
    const w1 = await wb.sheet('ΘΑΛΑΜΟΣ 1'); expect(w1.get('C8')).toBe(s.people[0].last + ' ' + s.people[0].first); expect(w1.get('B12')).toBe(s.people[0].last + ' ' + s.people[0].first);
    expect(w1.get('C12')).toBe('ΕΑ ΕΩΣ 21/10'); expect(w1.get('C13')).toBe('ΠΕΡΙΟΡΙΣΜΟΣ ΕΩΣ 22/10'); expect(w1.get('B14')).toBeNull();
    const w3 = await wb.sheet('ΘΑΛΑΜΟΣ 3'); expect(w3.get('C8')).toBeNull(); expect(w3.get('B12')).toBe(s.people[2].last + ' ' + s.people[2].first);
  });

  it('μέγεθος και θέση: ο 1ος σε όλο το πλάτος, ο 2ος με 2 ίσες στήλες στο μισό, στο κέντρο', async () => {
    const s = withStatuses(); const o = two();
    o.lay = { w: 'full' }; o.more![0].cols = o.more![0].cols.slice(1, 3); o.more![0].lay = { w: '1/2', at: 'center', even: true, gap: 2 };
    const b = await buildTemplate(o, 'people'); expect(b.fixed).toBe(true);
    // 24 στήλες πλέγματος: ο 1ος (3 στήλες) σε όλο το πλάτος, ο 2ος από τη στήλη G (7) ως την R (18), 6 + 6
    expect(b.cols.map(c => c.c)).toEqual([1, expect.any(Number), expect.any(Number)]);
    expect(b.more![0].cols.map(c => c.c)).toEqual([7, 13]); expect(b.more![0].head).toBe(12);   // 2 κενές γραμμές, τίτλος, επικεφαλίδες
    const r = withBuilt(rep({}), b, o); expect(r.fixed).toBe(true);
    r.more![0].pick = { ...r.more![0].pick, cats: ['med'] };
    const out = await fillReport(b.data, s, r, [1, 2, 3], D);
    const ws = await (await Workbook.open(out.data)).sheet(0);
    expect(ws.merges().some(m => m.c1 === 7 && m.c2 === 12 && m.r1 === 16)).toBe(true);   // οι νέες γραμμές με τις ίδιες συγχωνεύσεις
    expect(ws.get('G14')).toBe('ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); expect(ws.get('G15')).toBe(s.people[0].last + ' ' + s.people[0].first); expect(ws.get('M16')).toBe('ΕΥ ΕΩΣ …');
    expect(ws.colWidth(7)).toBe(ws.colWidth(1));   // δεν φάρδυνε καμία στήλη του πλέγματος
    expect(splitSpan(12, [1, 1])).toEqual([6, 6]); expect(splitSpan(7, [1, 1, 1])).toEqual([3, 2, 2]); expect(splitSpan(10, [5, 28, 13])).toEqual([1, 6, 3]);
    // χωρίς μέγεθος/θέση όλα όπως πριν (χωρίς πλέγμα)
    expect((await buildTemplate(two(), 'people')).fixed).toBeUndefined();
  });

  it('άλλαξε το είδος ενός πίνακα: κρατά ό,τι ταιριάζει', () => {
    const t = newTable('people', 'x'); expect(t.pick.mode).toBe('all');
    const x = pickForKind('people', { ...t.pick, rooms: [2] }, 'room', 'status');
    expect(x.pick.cats).toEqual(['med', 'pun', 'abs']); expect(x.pick.rooms).toEqual([2]); expect(x.sort).toBe('room');
    expect(pickForKind('people', t.pick, 'name', 'duty').sort).toBe('seat');
  });
});

async function wb2names(data: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default; const z = await JSZip.loadAsync(data); return (await z.file('xl/workbook.xml')!.async('string'));
}
