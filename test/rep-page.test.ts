// Έντυπα › σελίδα δημιουργίας (Φάση 2): δείγμα ανά πίνακα στην προεπισκόπηση, σελίδες, διαδρομή. Το δείγμα δεν φτάνει ποτέ στο βγάλσιμο.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport, previewReport } from '../src/main/reports';
import { defaultPick, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import { FORM_PARAM, PV_MAX, PV_PAGES, PV_SAMPLES, PV_SAMPLE_DEF, clampPage, cutSample, editForm, formOpen, formSnap, getSample, isFormDirty, newForm, noForm, pageText, sampleName, sampleLabel, setSample, shownPages } from '../src/shared/repPage';
import { fakeState } from './fixtures';

const D = '2026-10-19';
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const two = (): BuildOpts => ({
  title: 'ΔΥΝΑΜΟΛΟΓΙΟ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray',
  cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }],
  more: [{ id: 't2', title: 'ΔΕΥΤΕΡΟΣ ΠΙΝΑΚΑΣ', kind: 'people', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }] }]
});
async function setup(n = 130) {
  const s = fakeState(n); const o = two(); const b = await buildTemplate(o, 'people');
  const r = withBuilt(rep({}), b, o); r.more = r.more!.map(t => ({ ...t, pick: defaultPick() }));
  return { s, b, r, ids: s.people.map(p => p.id) };
}
const pgs = (html: string) => (html.match(/class="pg"/g) || []).length;

describe('Δείγμα προεπισκόπησης', () => {
  it('καθαρή λογική: κόψιμο, ετικέτα, μνήμη ανά έντυπο', () => {
    expect(PV_SAMPLES).toEqual([5, 10, 20, 0]); expect(sampleName(0)).toBe('Όλοι'); expect(sampleName(5)).toBe('5');
    expect(cutSample([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([1, 2, 3, 4, 5]); expect(cutSample([1, 2], 5)).toEqual([1, 2]);
    expect(cutSample(Array.from({ length: PV_MAX + 50 }, (_, i) => i), 0).length).toBe(PV_MAX);
    expect(sampleLabel({ shown: 5, total: 130 })).toBe('Δείγμα: 5 από 130'); expect(sampleLabel({ shown: 7, total: 7 })).toBe(''); expect(sampleLabel()).toBe('');
    expect(getSample('x1')).toBe(PV_SAMPLE_DEF); setSample('x1', 20); expect(getSample('x1')).toBe(20); expect(getSample('x2')).toBe(PV_SAMPLE_DEF);
  });

  it('κάθε πίνακας δείχνει ως Ν άτομα και ο δεύτερος φαίνεται στην 1η σελίδα· counts «5 από 130» ανά πίνακα', async () => {
    const { s, b, r, ids } = await setup();
    const before = JSON.stringify(r);
    // όπως ήταν πριν: 130 γραμμές στον 1ο, ο 2ος πίνακας δεν φαίνεται στην 1η σελίδα
    const old = await previewReport(b.data, s, r, ids, D);
    expect(old.html).not.toContain('ΔΕΥΤΕΡΟΣ ΠΙΝΑΚΑΣ'); expect(old.pages).toBeGreaterThan(1); expect(old.counts).toBeUndefined();
    const pv = await previewReport(b.data, s, r, ids, D, PV_PAGES, 5);
    expect(pv.counts).toEqual([{ shown: 5, total: 130 }, { shown: 5, total: 130 }]);
    expect(pv.html).toContain('ΔΕΥΤΕΡΟΣ ΠΙΝΑΚΑΣ'); expect(pv.pages).toBe(1);
    const p20 = await previewReport(b.data, s, r, ids, D, PV_PAGES, 20);
    expect(p20.counts).toEqual([{ shown: 20, total: 130 }, { shown: 20, total: 130 }]);
    expect(JSON.stringify(r)).toBe(before);   // το έντυπο δεν αλλάζει (το δείγμα δεν μπαίνει σε αυτό)
  });

  it('«Όλοι»: όλοι οι πίνακες, σε πολλές σελίδες που φαίνονται όλες· λιγότεροι από το δείγμα: όλοι', async () => {
    const { s, b, r, ids } = await setup();
    const all = await previewReport(b.data, s, r, ids, D, PV_PAGES, 0);
    expect(all.counts).toEqual([{ shown: 130, total: 130 }, { shown: 130, total: 130 }]);
    expect(all.pages).toBeGreaterThan(2); expect(pgs(all.html)).toBe(shownPages(all.pages));
    const few = await setup(3);
    const pv = await previewReport(few.b.data, few.s, few.r, few.ids, D, PV_PAGES, 10);
    expect(pv.counts).toEqual([{ shown: 3, total: 3 }, { shown: 3, total: 3 }]);
  });

  it('το δείγμα δεν φτάνει στο έντυπο που βγαίνει: fillReport χωρίς pv έχει όλους και όλους τους πίνακες', async () => {
    const { s, b, r, ids } = await setup();
    await previewReport(b.data, s, r, ids, D, PV_PAGES, 5);   // προεπισκόπηση πριν
    const out = await fillReport(b.data, s, r, ids, D);       // όπως το καλεί το rep:run (χωρίς 7ο όρισμα)
    expect(out.counts).toBeUndefined();
    const ws = await (await Workbook.open(out.data)).sheet(0);
    expect(ws.get('A8')).toBe('1'); expect(ws.get('A137')).toBe('130'); expect(ws.get('A138')).toBeNull();
    // ο 2ος πίνακας κάτω από τους 130: επικεφαλίδες και οι 130 γραμμές του
    const title = Array.from({ length: 30 }, (_, i) => 139 + i).find(i => ws.get('A' + i) === 'ΔΕΥΤΕΡΟΣ ΠΙΝΑΚΑΣ'); expect(title).toBeDefined();
    expect(ws.get('A' + (title! + 2))).toBe('1'); expect(ws.get('A' + (title! + 131))).toBe('130'); expect(ws.get('A' + (title! + 132))).toBeNull();
  });

  it('στον main το δείγμα μπαίνει μόνο στο rep:preview, όχι στο rep:run ούτε στις αυτόματες ενημερώσεις', () => {
    const src = fs.readFileSync(new URL('../src/main/main.ts', import.meta.url), 'utf8');
    const body = (name: string) => { const i = src.indexOf("ipcMain.handle('" + name + "'"); const j = src.indexOf('ipcMain.handle(', i + 10); return src.slice(i, j); };
    expect(body('rep:preview')).toMatch(/sample/); expect(body('rep:run')).not.toMatch(/sample|PV_/);
    // κάθε εμφάνιση της λέξης sample στον main είναι μέσα στο σχόλιο και τον χειριστή του rep:preview
    const from = src.indexOf('// opts.sample'), to = src.indexOf('ipcMain.handle(', src.indexOf("ipcMain.handle('rep:preview'") + 10);
    for (const m of src.matchAll(/\bsample\b/g)) expect(m.index! >= from && m.index! < to).toBe(true);
    // και το fillReport της εξαγωγής (worker) παίρνει μόνο τα 5 ορίσματα
    const w = fs.readFileSync(new URL('../src/main/worker.ts', import.meta.url), 'utf8');
    expect(w).toMatch(/fillReport: \(tpl, r, ids, d, o\) => fillReport\(buf\(tpl\), state, r, ids, d, o\)/);
  });
});

describe('Σελίδες προεπισκόπησης', () => {
  it('Σελίδα Ν από Μ και πλοήγηση ‹ ›', () => {
    expect(pageText(1, 5)).toBe('Σελίδα 1 από 5'); expect(pageText(9, 5)).toBe('Σελίδα 5 από 5');
    expect(clampPage(0, 5)).toBe(1); expect(clampPage(6, 5)).toBe(5); expect(clampPage(3, 0)).toBe(1);
    expect(shownPages(40)).toBe(PV_PAGES); expect(shownPages(3)).toBe(3); expect(clampPage(30, 40)).toBe(PV_PAGES);
  });
});

describe('Διαδρομή της σελίδας δημιουργίας', () => {
  const reports = [rep({ id: 'a' }), rep({ id: 'b' })];
  it('χωρίς param: κανένα (η λίστα)· νέο έντυπο με επιλογές εκκίνησης· αλλαγή ενός υπάρχοντος', () => {
    expect(formOpen({}, reports)).toBeNull(); expect(formOpen({ [FORM_PARAM]: undefined }, reports)).toBeNull(); expect(formOpen(noForm(), reports)).toBeNull();
    const n = formOpen(newForm({ start: 'build', preset: 'p1' }), reports)!;
    expect(n.arg).toEqual({ start: 'build', preset: 'p1' }); expect(n.r).toBeUndefined();
    const e = formOpen(editForm('b'), reports)!; expect(e.r).toBe(reports[1]); expect(e.key).toBe('b');
  });
  it('έντυπο που δεν υπάρχει πια: όχι σελίδα· άκυρες τιμές αγνοούνται· δεύτερο «Νέο έντυπο» έχει άλλο κλειδί', () => {
    expect(formOpen(editForm('zzz'), reports)).toBeNull();
    expect(formOpen({ [FORM_PARAM]: { start: 'hack', preset: 5, tpl: 't' } }, reports)!.arg).toEqual({ tpl: 't' });
    expect(formOpen({ [FORM_PARAM]: 'x' }, reports)).toBeNull();
    const a = formOpen({ [FORM_PARAM]: { n: 1 } }, reports)!, b = formOpen({ [FORM_PARAM]: { n: 2 } }, reports)!; expect(a.key).not.toBe(b.key);
  });
});

describe('Σελίδα δημιουργίας: σύνδεση με την εφαρμογή', () => {
  const src = (f: string) => fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
  it('δεν είναι πια παράθυρο· μη αποθηκευμένες αλλαγές ρωτούν σε πίσω, Esc και αλλαγή οθόνης', () => {
    const r = src('renderer/screens/reports.ts');
    expect(r).not.toMatch(/ReportWizard/); expect(r).toMatch(/function ReportPage/);
    expect(r).toMatch(/usePending\(dirty,/); expect(r).toMatch(/useEscape\(/); expect(r).toMatch(/<\$\{DiscardAsk\}/);
    const a = src('renderer/app.ts');
    expect(a).toMatch(/reports: FORM_PARAM/);   // από το μενού: η λίστα, όχι η σελίδα που είχε μείνει
    expect(a).toMatch(/r\.params\[FORM_PARAM\] && !next\.params\[FORM_PARAM\]\) \{ guard\(\(\) => requestLeave\(doIt\)\)/);
  });
  it('το δείγμα και η σελίδα μένουν έξω από το έντυπο που αποθηκεύεται', () => {
    const r = src('renderer/screens/reports.ts');
    const save = r.slice(r.indexOf('const save = async (andRun'), r.indexOf('const canGo = '));
    expect(save).not.toMatch(/sample|setPage|PV_/);
  });
});

describe('σελίδα δημιουργίας: μη αποθηκευμένες αλλαγές', () => {
  const sg = { sergeant: '', commander: '' };
  const snap = (r: Report, build: BuildOpts | null = null, mode: string | null = null) => formSnap(r, build, mode, sg);
  it('νέο έντυπο: η αφετηρία είναι η αρχική κατάσταση και η πλοήγηση στα βήματα δεν αλλάζει το στιγμιότυπο', () => {
    const r = rep({ id: 'n1', name: '' }); const base = snap(r);
    // βήμα, δείγμα και σελίδα δεν είναι ορίσματα του formSnap: όσα βήματα κι αν πατηθούν, το στιγμιότυπο μένει ίδιο
    expect(isFormDirty(base, snap({ ...r }))).toBe(false);
  });
  it('διαδρομή με προεπιλογή: ό,τι μπαίνει πριν την αφετηρία δεν είναι αλλαγή· αλλαγή πεδίου μετά είναι', () => {
    const b = two(); const r = rep({ id: 'n2', name: 'ΔΥΝΑΜΟΛΟΓΙΟ' });
    const base = snap(r, b, 'build');
    expect(isFormDirty(base, snap({ ...r }, JSON.parse(JSON.stringify(b)), 'build'))).toBe(false);
    expect(isFormDirty(base, snap({ ...r, name: 'ΔΥΝΑΜΟΛΟΓΙΟ Α' }, b, 'build'))).toBe(true);
    expect(isFormDirty(base, snap(r, { ...b, title: 'Άλλος τίτλος' }, 'build'))).toBe(true);
  });
  it('χωρίς αφετηρία (αρχικοποίηση σε εξέλιξη) ή την ώρα της αποθήκευσης δεν είναι αλλαγή', () => {
    const r = rep({ id: 'n3' });
    expect(isFormDirty(null, snap({ ...r, name: 'x' }))).toBe(false);
    expect(isFormDirty(snap(r), snap({ ...r, name: 'x' }), true)).toBe(false);
  });
  it('υπάρχον έντυπο χωρίς αλλαγή δεν είναι αλλαγμένο, με αλλαγή είναι', () => {
    const r = rep({ id: 'e1' }); const base = snap(r, null, 'upload');
    expect(isFormDirty(base, snap({ ...r }, null, 'upload'))).toBe(false);
    expect(isFormDirty(base, snap({ ...r, name: 'Αλλαγμένο' }, null, 'upload'))).toBe(true);
  });
});
