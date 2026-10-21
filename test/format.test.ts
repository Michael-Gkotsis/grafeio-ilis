// Μορφή των Excel που γράφει η εφαρμογή: στο κέντρο, πλαίσια όπως ο πίνακας, τίτλος σε συγχωνευμένα κελιά,
// λίστες επιλογής για βαθμό και Ο/Σ που δέχονται και άλλη τιμή. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import type { AppState, Person } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { bestFor, defaultBinding, listColumns, titleSpans, type SourceBinding } from '../src/shared/sources';
import { SOLDIER_RANKS, SPECS, optionsOf } from '../src/shared/ranks';
import { Workbook } from '../src/main/xlsx';
import { readBook, tidyPreview, writeSource, type SourceMeta } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
const HEAD = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Τηλέφωνο', 'Θάλαμος'];
const pr = (p: Person, i: number) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room];
const META = { keys: [], at: 'x', mtime: 0, size: 0 } as unknown as SourceMeta;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-fmt-'));

// Φύλλα με πλαίσια (στυλ 2 του κενού βιβλίου) σε όλες τις γραμμές των εγγραφών, όπως τα έχει ο λοχίας
async function toFile(sheets: RawSheet[], file: string, opts: { styled?: (sheet: string, r: number) => boolean; merge?: Record<string, string>; extra?: (zip: JSZip) => Promise<void> } = {}) {
  const wb = await Workbook.blank(sheets[0].name);
  for (const sh of sheets) {
    const ws = wb.hasSheet(sh.name) ? await wb.sheet(sh.name) : await wb.addSheet(sh.name);
    sh.rows.forEach((row, r) => row.forEach((v, c) => {
      const ref = String.fromCharCode(65 + c) + (r + 1);
      if (v != null && v !== '') ws.set(ref, v as string | number);
      if (opts.styled?.(sh.name, r)) ws.setStyle(ref, 2);
    }));
    if (opts.merge?.[sh.name]) ws.addMerge(opts.merge[sh.name]);
  }
  let data = await wb.save();
  if (opts.extra) { const zip = await JSZip.loadAsync(data); await opts.extra(zip); data = await zip.generateAsync({ type: 'nodebuffer' }); }
  fs.writeFileSync(file, data);
}
const sheetXml = async (file: string, n = 1) => (await JSZip.loadAsync(fs.readFileSync(file))).file(n === 1 ? 'xl/worksheets/sheet1.xml' : `xl/worksheets/sheet_a${n}.xml`)!.async('string');
const stylesXml = async (file: string) => (await JSZip.loadAsync(fs.readFileSync(file))).file('xl/styles.xml')!.async('string');
const xfOf = async (file: string, sheet: string, ref: string) => {
  const ws = await (await Workbook.open(fs.readFileSync(file))).sheet(sheet); const s = ws.style(ref);
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(await stylesXml(file))![1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)!;
  return s == null ? '' : xfs[s];
};
const pun = (s: AppState, i: number, from: string, to: string): AppState => ({ ...s, statuses: [...s.statuses, { id: 'p' + i, pid: s.people[i].id, type: 'PUN', from, to, kind: 'ΠΕΡΙΟΡΙΣΜΟΣ' }] });

describe('νέο αρχείο ή νέο φύλλο από την εφαρμογή', () => {
  it('τίτλος σε συγχωνευμένα κελιά στο κέντρο, επικεφαλίδες έντονες με πλαίσιο, τιμές και ημερομηνίες στο κέντρο με πλαίσιο', async () => {
    const s = pun(fakeState(4), 1, '2026-10-11', '2026-10-14');
    const file = path.join(tmp(), 'ΤΙΜΩΡΗΜΕΝΟΙ.xlsx'); const b = defaultBinding('punish', file);
    const w = await writeSource('punish', b, s, undefined, TODAY);
    expect(w.ok && w.created).toBe(true);
    const xml = await sheetXml(file);
    const last = String.fromCharCode(65 + Math.max(...Object.values(b.cols)));
    expect(xml).toContain(`<mergeCell ref="A1:${last}1"/>`);
    expect(await xfOf(file, b.sheet, 'A1')).toMatch(/horizontal="center"/);
    for (const ref of ['A2', 'D2']) expect(await xfOf(file, b.sheet, ref)).toMatch(/borderId="[1-9]".*horizontal="center"/);
    // κάθε κελί της γραμμής (και τα κενά) έχει πλαίσιο, στο κέντρο
    for (let c = 0; c <= Math.max(...Object.values(b.cols)); c++) expect(await xfOf(file, b.sheet, String.fromCharCode(65 + c) + 3), String(c)).toMatch(/borderId="[1-9]".*horizontal="center"/);
    // η ημερομηνία κρατά dd/mm/yyyy, πλαίσιο και κέντρο
    const from = String.fromCharCode(65 + b.cols.from) + 3;
    expect(await xfOf(file, b.sheet, from)).toMatch(/numFmtId="164".*borderId="[1-9]".*horizontal="center"/);
    expect((await readBook(file)).sheets[0].rows[2][b.cols.from]).toBeInstanceOf(Date);
    // πλάτη στηλών και το έντονο του τίτλου
    expect(xml).toMatch(/<cols><col min="1"/);
    expect(await stylesXml(file)).toMatch(/<font><b\/><sz val="14"\/>/);
  });
  it('νέο φύλλο σε υπάρχον αρχείο: ίδια μορφή, χωρίς να αλλάξει το άλλο φύλλο', async () => {
    const s = pun(fakeState(4), 2, '2026-10-11', '2026-10-14'); const file = path.join(tmp(), 'Δ.xlsx');
    await toFile([{ name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΣΥΝΟΛΙΚΟ'], HEAD, ...s.people.map(pr)] }], file);
    const before = await sheetXml(file);
    const b = defaultBinding('punish', file);
    const w = await writeSource('punish', b, s, undefined, TODAY);
    expect(w.ok && w.created).toBe(true);
    expect(await sheetXml(file)).toBe(before);
    expect(await xfOf(file, b.sheet, 'D3')).toMatch(/borderId="[1-9]".*horizontal="center"/);
    expect(await sheetXml(file, 2)).toContain('<mergeCell ref="A1:');
  });
});

describe('υπάρχον φύλλο του λοχία', () => {
  const dyn = (s: AppState): RawSheet[] => [{ name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΔΥΝΑΜΟΛΟΓΙΟ ΕΣΣΟ'], ['ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ ΙΛΗΣ'], [...HEAD, 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], ...s.people.map((p, i) => [...pr(p, i), null])] }];
  const bind = async (file: string, kind: 'people' | 'punish') => { const x = bestFor(kind, (await readBook(file)).sheets)!; return { file, sheet: x.sheet, header: x.header, cols: x.cols, write: true } as SourceBinding; };

  it('«Ενημέρωση Excel» βάζει τίτλο στο κέντρο σε συγχωνευμένα κελιά και λίστες επιλογής, και μετά δεν ξαναγράφει', async () => {
    const s = fakeState(6); const file = path.join(tmp(), 'Δ.xlsx');
    // η γραμμή 2 είναι ήδη συγχωνευμένη από τον λοχία: μένει όπως είναι
    await toFile(dyn(s), file, { merge: { 'ΣΥΝΟΛΙΚΟ': 'A2:J2' } });
    const b = await bind(file, 'people');
    expect(await tidyPreview('people', b)).toHaveLength(3);
    // αυτόματη εγγραφή χωρίς αλλαγές: δεν πειράζει το αρχείο μόνο για τη μορφή
    const auto = await writeSource('people', b, s, META, TODAY);
    expect(auto.ok && auto.unchanged).toBe(true);
    const w = await writeSource('people', b, s, META, TODAY, { tidy: true });
    expect(w.ok && !w.unchanged && w.tidy).toHaveLength(3);
    const xml = await sheetXml(file);
    expect(xml).toContain('<mergeCell ref="A1:J1"/>');
    expect(xml.match(/<mergeCell ref="A2:J2"\/>/g)).toHaveLength(1);
    expect(xml).toMatch(/<mergeCells count="2">/);
    expect(await xfOf(file, 'ΣΥΝΟΛΙΚΟ', 'A1')).toMatch(/horizontal="center"/);
    // λίστες: δέχονται και άλλη τιμή (showErrorMessage="0"), από τη γραμμή κάτω από τις επικεφαλίδες και 200 κενές από κάτω
    const dv = [...xml.matchAll(/<dataValidation [^>]*sqref="([^"]+)"><formula1>([^<]*)<\/formula1>/g)].map(m => [m[1], m[2]]);
    expect(dv.map(x => x[0])).toEqual(['B4:B' + (3 + s.people.length + 200), 'C4:C' + (3 + s.people.length + 200)]);
    expect(dv[0][1]).toBe('&quot;' + SOLDIER_RANKS.join(',') + '&quot;');
    expect(dv[1][1]).toBe('&quot;' + SPECS.join(',') + '&quot;');
    expect(xml).toMatch(/<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0"/);
    // σωστή σειρά στο XML: mergeCells πριν από dataValidations, και τα δύο πριν από pageMargins (αν υπάρχει)
    expect(xml.indexOf('<mergeCells')).toBeLessThan(xml.indexOf('<dataValidations'));
    // τα δεδομένα δεν άλλαξαν, και δεύτερη φορά δεν έχει τίποτα να βάλει
    expect((await readBook(file)).sheets[0].rows[3].slice(0, 9)).toEqual(pr(s.people[0], 0).map(v => (v === '' ? undefined : v)));
    expect(await tidyPreview('people', b)).toEqual([]);
    const again = await writeSource('people', b, s, META, TODAY, { tidy: true });
    expect(again.ok && again.unchanged).toBe(true);
  });

  it('Λίστες: νέος βαθμός μπαίνει και στο dropdown που έβαλε η εφαρμογή, όχι σε δική σου λίστα', async () => {
    const s0 = fakeState(6); const file = path.join(tmp(), 'Δ.xlsx');
    await toFile(dyn(s0), file);
    const b = await bind(file, 'people');
    await writeSource('people', b, s0, META, TODAY, { tidy: true });
    expect(await tidyPreview('people', b)).toEqual([]);
    const lists = { soldierRanks: { add: [{ name: 'ΚΛΗΡ', hk: 'Στρατιώτες' }], hide: ['ΔΕΑ'] } };
    const s = { ...s0, settings: { ...s0.settings, lists } };
    const t = await tidyPreview('people', b, lists);
    expect(t).toEqual(['Στη λίστα επιλογής της στήλης «Βαθμός» μπαίνουν και: ΚΛΗΡ']);
    // αυτόματη εγγραφή χωρίς αλλαγές δεν πειράζει το αρχείο· η «Ενημέρωση Excel» ναι
    const auto = await writeSource('people', b, s, META, TODAY);
    expect(auto.ok && auto.unchanged).toBe(true);
    const w = await writeSource('people', b, s, META, TODAY, { tidy: true });
    expect(w.ok && !w.unchanged).toBe(true);
    const dv = [...(await sheetXml(file)).matchAll(/<dataValidation [^>]*sqref="([^"]+)"><formula1>([^<]*)<\/formula1>/g)].map(m => m[2]);
    // το κρυμμένο ΔΕΑ μένει (δεν σβήνεται τιμή από λίστα που υπάρχει), το ΚΛΗΡ μπαίνει στο τέλος
    expect(dv[0]).toBe('&quot;' + [...SOLDIER_RANKS, 'ΚΛΗΡ'].join(',') + '&quot;');
    expect(dv[1]).toBe('&quot;' + SPECS.join(',') + '&quot;');
    expect(await tidyPreview('people', b, lists)).toEqual([]);
    // τιμή που απλώς γράφτηκε στη στήλη μετά (όχι από τις Λίστες) δεν μπαίνει μόνη της στη λίστα
    const s2 = { ...s, people: s.people.map((p, i) => (i === 0 ? { ...p, rank: 'ΥΠΟΨ' } : p)) };
    await writeSource('people', b, s2, META, TODAY);
    expect(await tidyPreview('people', b, lists)).toEqual([]);
    // δική σου λίστα (με μήνυμα λάθους): δεν αλλάζει
    const file2 = path.join(tmp(), 'Δ2.xlsx');
    const own = '<dataValidations count="1"><dataValidation type="list" sqref="B4:B50"><formula1>"ΣΤΡ,ΔΝΕΑΣ"</formula1></dataValidation></dataValidations>';
    await toFile(dyn(s0), file2, { extra: async z => { const x = await z.file('xl/worksheets/sheet1.xml')!.async('string'); z.file('xl/worksheets/sheet1.xml', x.replace('</sheetData>', '</sheetData>' + own)); } });
    const b2 = await bind(file2, 'people');
    expect((await tidyPreview('people', b2, lists)).some(x => /Βαθμός/.test(x))).toBe(false);
  });

  it('δική σου λίστα στη στήλη ή τίτλος με κι άλλο κείμενο στη γραμμή: δεν αλλάζουν', async () => {
    const s = fakeState(4); const file = path.join(tmp(), 'Δ.xlsx');
    const sheets = dyn(s); sheets[0].rows[0] = ['ΔΥΝΑΜΟΛΟΓΙΟ ΕΣΣΟ', null, null, null, null, null, null, 'ΑΥΛΩΝΑΣ'];
    const own = '<dataValidations count="1"><dataValidation type="list" sqref="B4:B50"><formula1>"ΣΤΡ,ΔΝΕΑΣ"</formula1></dataValidation></dataValidations>';
    await toFile(sheets, file, { merge: { 'ΣΥΝΟΛΙΚΟ': 'A2:J2' }, extra: async z => { const x = await z.file('xl/worksheets/sheet1.xml')!.async('string'); z.file('xl/worksheets/sheet1.xml', x.replace('</mergeCells>', '</mergeCells>' + own)); } });
    const b = await bind(file, 'people');
    const t = await tidyPreview('people', b);
    expect(t).toHaveLength(1); expect(t[0]).toMatch(/Ο\/Σ/);
    await writeSource('people', b, s, META, TODAY, { tidy: true });
    const xml = await sheetXml(file);
    expect(xml).not.toContain('<mergeCell ref="A1:');
    expect(xml).toContain('sqref="B4:B50"'); expect(xml).toMatch(/<dataValidations count="2">/);
    expect(xml.match(/sqref="B/g)).toHaveLength(1);
  });

  it('νέα εγγραφή σε ελεύθερη γραμμή (μόνο Α/Α) παίρνει τα πλαίσια της γραμμής από πάνω· δικό σου στυλ μένει', async () => {
    const s0 = fakeState(6); const file = path.join(tmp(), 'Δ.xlsx');
    const rows: RawSheet['rows'] = [['ΤΙΜΩΡΗΜΕΝΟΙ'], [...HEAD, 'ΑΠΌ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [...pr(s0.people[3], 0), 46000, 46003, 'ΠΕΡΙΟΡΙΣΜΟΣ'], [2], [3]];
    await toFile([{ name: 'ΤΙΜΩΡΗΜΕΝΟΙ', rows }], file, { styled: (_n, r) => r === 2 });
    const b = await bind(file, 'punish');
    const s = pun(s0, 1, '2026-10-11', '2026-10-14');
    const w = await writeSource('punish', b, s, META, TODAY);
    expect(w.ok && w.added).toBe(1);
    const wb = await Workbook.open(fs.readFileSync(file)); const ws = await wb.sheet(0);
    expect(ws.get('D4')).toBe(s.people[1].last);
    // ίδιο πλαίσιο και στοίχιση με τη γραμμή από πάνω (το μέγεθος γραμμάτων μπορεί να μικρύνει για να χωρέσει το όνομα)
    const frame = async (ref: string) => (await xfOf(file, 'ΤΙΜΩΡΗΜΕΝΟΙ', ref)).match(/borderId="\d+"|horizontal="\w+"/g);
    for (const c of 'ABCDEFGHIL') expect(await frame(c + '4'), c).toEqual(await frame(c + '3'));
    // η ημερομηνία πήρε μορφή ημέρα/μήνας/έτος πάνω στο ίδιο πλαίσιο
    expect(await xfOf(file, 'ΤΙΜΩΡΗΜΕΝΟΙ', 'J4')).toMatch(/borderId="1"/);
    // η γραμμή 5 δεν γράφτηκε: μένει χωρίς στυλ
    expect(ws.style('D5')).toBeNull();
  });
});

describe('λίστες και τίτλοι (σχέδιο)', () => {
  it('η λίστα βάζει πρώτα τις βασικές τιμές και μετά όσες έχει ήδη η στήλη, ως 255 χαρακτήρες', () => {
    expect(optionsOf(['ΠΖ', 'ΤΘ'], ['τθ', 'ΤΧ', ' ΑΣ ', '', null, 'ΤΧ'])).toEqual(['ΠΖ', 'ΤΘ', 'ΑΣ', 'ΤΧ']);
    const many = Array.from({ length: 80 }, (_, i) => 'ΕΙΔ' + i);
    const sh: RawSheet = { name: 'Φ', rows: [HEAD, ...many.map((x, i) => [i + 1, 'ΣΤΡ', x, 'ΕΠΩΝ' + i, 'ΟΝ'])] };
    const b: SourceBinding = { file: 'x', sheet: 'Φ', header: 0, cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4 } };
    const spec = listColumns('people', sh, b).find(l => l.what === 'Ο/Σ')!;
    expect(spec.items.slice(0, SPECS.length)).toEqual(SPECS);
    expect(spec.items.join(',').length).toBeLessThanOrEqual(250);
  });
  it('η λίστα σταματά πριν από τον επόμενο πίνακα του ίδιου φύλλου, και ο τίτλος του πίνακα βρίσκεται', () => {
    const sh: RawSheet = { name: 'IATRIKA', rows: [['ΕΙΣΑΓΩΓΕΣ ΣΤΕΠ'], HEAD, [1, 'ΣΤΡ', 'ΠΖ', 'Α', 'Β'], [], [], ['ΕΑ-ΕΥ'], HEAD] };
    const b: SourceBinding = { file: 'x', sheet: 'IATRIKA', header: 1, cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4 } };
    expect(listColumns('step', sh, b).map(l => [l.r1, l.r2])).toEqual([[2, 4], [2, 4]]);
    expect(titleSpans('step', sh, b)).toEqual([{ r: 0, c1: 0, c2: 8 }]);
    expect(titleSpans('step', sh, { ...b, header: 6 })).toEqual([{ r: 5, c1: 0, c2: 8 }]);
    expect(listColumns('duties', sh, b)).toEqual([]);
  });
});

describe('βαθμοί στελεχών', () => {
  it('κάθε βαθμός της λίστας πάει στη σωστή γραμμή της ΗΚΑΙ', async () => {
    const { CADRE_RANKS, guessHk } = await import('../src/shared/ranks');
    expect(Object.fromEntries(CADRE_RANKS.map(r => [r, guessHk(r)]))).toEqual({
      ΟΒΑ: 'ΟΒΑ Στρατιώτης', ΕΠΟΠ: 'ΕΠΟΠ Στρατιώτης', ΔΝΕΑΣ: 'Δεκανείς', ΛΧΙΑΣ: 'Λοχίες', ΕΠΛΧΙΑΣ: 'Επιλοχίες', ΑΛΧΙΑΣ: 'Αρχιλοχίες', ΑΝΘΣΤΗΣ: 'Ανθυπασπιστές', ΑΝΘΛΧΟΣ: 'Ανθυπίλαρχοι-Ανθλγοι', ΥΠΛΧΟΣ: 'Ανθυπίλαρχοι-Ανθλγοι',
      ΙΛΧΟΣ: 'Ίλαρχοι', ΑΝΘΛΓΟΣ: 'Ανθυπίλαρχοι-Ανθλγοι', ΥΠΛΓΟΣ: 'Ανθυπίλαρχοι-Ανθλγοι', ΛΓΟΣ: 'Ίλαρχοι', ΕΠΛΧΟΣ: 'Επίλαρχοι', ΤΧΗΣ: 'Επίλαρχοι', ΔΕΑ: 'ΔΕΑ'
    });
  });
});
