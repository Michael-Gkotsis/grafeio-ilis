// Νέα γραμμή μέσα στον πίνακα: Α/Α με τύπο (=A4+1), διπλανός πίνακας δεξιά, σχόλια και σχέδια από κάτω. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { apply, type Command, type Ctx, type NewPerson } from '../src/shared/commands';
import type { AppState, Person } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { bestFor, planPeopleWrite, planWrite, snapFromSheet, type SourceBinding } from '../src/shared/sources';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource, type SourceMeta } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-13';
const ctx: Ctx = { today: TODAY, newId: () => 'n' + Math.random() };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const NEW: NewPerson = { rank: 'ΣΤΡ', spec: 'ΠΖ', last: 'ΚΑΙΝΟΥΡΓΙΟΣ', first: 'ΝΕΟΣ', father: 'ΠΑΤΕΡΑΣ', asm: '910001', phone: '', room: 1, si: 'Ι1', post: null, role: null, essos: '', attached: false, notes: '' };
const HEAD = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Κινητό Τηλέφωνο', 'ΘΑΛΑΜΟΣ'];
const pr = (p: Person, i: number) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, Number(p.asm), Number(p.phone), p.room];
const ROOMED: [string, number][] = [['ΤΥΧΑΙΟΣ', 1], ['ΔΟΚΙΜΙΟΣ', 1], ['ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ', 1], ['ΑΓΝΩΣΤΟΠΟΥΛΟΣ', 2], ['ΦΑΝΤΑΣΙΟΣ', 2], ['ΔΕΙΓΜΑΤΑΣ', 4]];
const roomed = (): AppState => { const s = fakeState(ROOMED.length); s.people = s.people.map((p, i) => ({ ...p, last: ROOMED[i][0], room: ROOMED[i][1] })); return s; };
const META = { keys: [], at: 'x', mtime: 0, size: 0 } as unknown as SourceMeta;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gi-ins-'));

// Δυναμολόγιο με Α/Α σε τύπο: 1 στη γραμμή 4 και «προηγούμενο + 1» από κάτω (απλός ή κοινός τύπος, όπως με σύρσιμο)
async function aaFile(people: Person[], shared: boolean): Promise<{ file: string; b: SourceBinding }> {
  const file = path.join(tmp(), 'Δ.xlsx'); const wb = await Workbook.blank('ΣΥΝΟΛΙΚΟ'); const ws = await wb.sheet('ΣΥΝΟΛΙΚΟ');
  [['ΔΥΝΑΜΟΛΟΓΙΟ'], ['ΣΥΝΟΛΙΚΟ'], HEAD, ...people.map(pr)].forEach((row, r) => row.forEach((v, c) => { if (v != null && v !== '') ws.set(String.fromCharCode(65 + c) + (r + 1), v as string | number); }));
  const last = 3 + people.length;
  for (let r = 5; r <= last; r++) ws.setFormula('A' + r, 'A' + (r - 1) + '+1');
  let buf = await wb.save();
  if (shared) {
    const zip = await JSZip.loadAsync(buf); const p = 'xl/worksheets/sheet1.xml'; let x = await zip.file(p)!.async('string');
    x = x.replace(/<c r="A(\d+)"([^>]*)><f>[^<]*<\/f><\/c>/g, (_m, r: string, a: string) => (+r === 5 ? `<c r="A5"${a}><f t="shared" ref="A5:A${last}" si="0">A4+1</f><v>2</v></c>` : `<c r="A${r}"${a}><f t="shared" si="0"/><v>${+r - 3}</v></c>`));
    zip.file(p, x); buf = await zip.generateAsync({ type: 'nodebuffer' });
  }
  fs.writeFileSync(file, buf);
  const x = bestFor('people', (await readBook(file)).sheets)!;
  return { file, b: { file, sheet: x.sheet, header: x.header, cols: x.cols, write: true } };
}
const aaCells = async (file: string) => { const ws = await (await Workbook.open(fs.readFileSync(file))).sheet('ΣΥΝΟΛΙΚΟ'); const out: Record<number, string> = {}; for (const c of ws.cells()) if (c.c === 1 && c.r >= 4) out[c.r] = /<f[^>]*\/>/.test(c.inner) ? '(κοινός)' : ws.formula('A' + c.r) ?? ws.get('A' + c.r) ?? ''; return out; };

describe('Α/Α με τύπο: η νέα γραμμή μπαίνει στην αλυσίδα', () => {
  it('απλός τύπος =A4+1: η νέα γραμμή παίρνει τον ίδιο τύπο και η από κάτω δείχνει τη νέα', async () => {
    const s0 = roomed(); const { file, b } = await aaFile(s0.people, false);
    const s = run(s0, { t: 'addPerson', person: NEW });   // θάλαμος 1, αλφαβητικά μετά τον ΔΟΚΙΜΙΟ (γραμμή 5)
    const w = await writeSource('people', b, s, META, TODAY); if (!w.ok) throw new Error(w.error);
    expect(await aaCells(file)).toEqual({ 4: '1', 5: 'A4+1', 6: 'A5+1', 7: 'A6+1', 8: 'A7+1', 9: 'A8+1', 10: 'A9+1' });
    expect((await readBook(file)).sheets[0].rows[5][3]).toBe('ΚΑΙΝΟΥΡΓΙΟΣ');
  });
  it('κοινός τύπος (σύρσιμο): η νέα γραμμή στην αλυσίδα, οι από κάτω μένουν κοινός τύπος που δείχνει τη γραμμή από πάνω', async () => {
    const s0 = roomed(); const { file, b } = await aaFile(s0.people, true);
    const s = run(s0, { t: 'addPerson', person: NEW });
    const w = await writeSource('people', b, s, META, TODAY); if (!w.ok) throw new Error(w.error);
    const a = await aaCells(file);
    expect([a[4], a[5], a[6], a[7]]).toEqual(['1', 'A4+1', 'A5+1', '(κοινός)']);
    const x = await (await JSZip.loadAsync(fs.readFileSync(file))).file('xl/worksheets/sheet1.xml')!.async('string');
    expect(x).toMatch(/<f t="shared" ref="A5:A10" si="0">A4\+1<\/f>/);   // η περιοχή του κοινού τύπου μεγάλωσε μαζί
  });
});

describe('διπλανός πίνακας δεξιά (X12)', () => {
  const s0 = roomed();
  const sheetWith = (side: (r: number) => unknown, blanks = 0): RawSheet => {
    // ο πίνακας τελειώνει στα «ΣΥΝΟΛΑ» (στη στήλη Α/Α), μετά από όσες κενές γραμμές θέλουμε
    const rows = [['ΔΥΝΑΜΟΛΟΓΙΟ'], ['ΣΥΝΟΛΙΚΟ'], HEAD, ...s0.people.map(pr), ...Array.from({ length: blanks }, () => []), ['ΣΥΝΟΛΑ']] as unknown[][];
    for (let r = 0; r < 30; r++) { rows[r] = rows[r] || []; const v = side(r); if (v != null) rows[r][13] = v; }
    return { name: 'ΣΥΝΟΛΙΚΟ', rows: rows as RawSheet['rows'] };
  };
  const bind = (sh: RawSheet): SourceBinding => { const x = bestFor('people', [sh])!; return { file: 'Δ.xlsx', sheet: x.sheet, header: x.header, cols: x.cols, write: true }; };
  it('δεν μπαίνει ολόκληρη γραμμή που θα έκοβε τον διπλανό πίνακα· αν δεν υπάρχει κενή γραμμή, το λέει', () => {
    const sh = sheetWith(r => r);   // αριθμοί δίπλα σε όλες τις γραμμές
    const s = run(s0, { t: 'addPerson', person: NEW });
    const p = planPeopleWrite(sh, bind(sh), s, snapFromSheet(sh, bind(sh), s.people));
    expect(p.inserts).toEqual([]); expect(p.added).toBe(0); expect(p.keys).toEqual([]);
    expect(p.warn?.join(' ')).toMatch(/δεν χωράει/i);
  });
  it('με κενή γραμμή στο τέλος του πίνακα: μπαίνει εκεί αντί για νέα γραμμή στη μέση', () => {
    const sh = sheetWith(r => r, 2);
    const s = run(s0, { t: 'addPerson', person: NEW });
    const p = planPeopleWrite(sh, bind(sh), s, snapFromSheet(sh, bind(sh), s.people));
    expect(p.inserts).toEqual([]); expect(p.added).toBe(1);
    expect(p.sets.filter(x => x.c === 3)).toEqual([{ r: 9, c: 3, v: 'ΚΑΙΝΟΥΡΓΙΟΣ' }]);
  });
  it('διπλανός πίνακας μόνο πιο πάνω: η γραμμή μπαίνει κανονικά στον θάλαμό του', () => {
    const sh = sheetWith(r => (r < 3 ? r : null));
    const s = run(s0, { t: 'addPerson', person: NEW });
    expect(planPeopleWrite(sh, bind(sh), s, snapFromSheet(sh, bind(sh), s.people)).inserts).toEqual([{ after: 4, n: 1, tpl: 5 }]);
  });
  it('καταστάσεις: χωρίς κενή γραμμή και με διπλανό πίνακα, η νέα ποινή δεν σπάει τον πίνακα', () => {
    const s = { ...fakeState(4), statuses: [{ id: 'a', pid: 2, type: 'PUN' as const, from: '2026-10-10', to: '2026-10-12', kind: 'Κράτηση' }] };
    const rows: unknown[][] = [['ΤΙΜΩΡΗΜΕΝΟΙ'], ['Α/Α', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ']];
    rows.push(['ΣΥΝΟΛΟ']);
    for (let r = 0; r < 20; r++) { rows[r] = rows[r] || []; rows[r][10] = r; }
    const sh = { name: 'ΤΙΜΩΡΗΜΕΝΟΙ', rows: rows as RawSheet['rows'] };
    const x = bestFor('punish', [sh])!; const b: SourceBinding = { file: 't.xlsx', sheet: sh.name, header: x.header, cols: x.cols, write: true };
    const w = planWrite('punish', sh, b, s, [], TODAY);
    expect(w.insert).toBeNull(); expect(w.added).toBe(0); expect(w.keys).toEqual([]);
    expect(w.warn?.join(' ')).toMatch(/δεν χωράει/i);
  });
});

describe('σχόλια και σχέδια κάτω από τη γραμμή που μπαίνει (X10)', () => {
  it('το σχόλιο, το πλαίσιό του (VML) και η εικόνα κατεβαίνουν μαζί με τη γραμμή τους', async () => {
    const wb = await Workbook.blank('Φ'); const ws = await wb.sheet('Φ');
    for (let r = 1; r <= 12; r++) ws.set('A' + r, 'Γ' + r);
    const zip = await JSZip.loadAsync(await wb.save());
    const sp = 'xl/worksheets/sheet1.xml';
    zip.file(sp, (await zip.file(sp)!.async('string')).replace('</worksheet>', '<drawing r:id="rId2"/><legacyDrawing r:id="rId1"/></worksheet>'));
    zip.file('xl/worksheets/_rels/sheet1.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/></Relationships>');
    zip.file('xl/comments1.xml', '<?xml version="1.0"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>Χ</author></authors><commentList><comment ref="B3" authorId="0"><text><t>πάνω</t></text></comment><comment ref="B10" authorId="0"><text><t>κάτω</t></text></comment></commentList></comments>');
    zip.file('xl/drawings/vmlDrawing1.vml', '<xml xmlns:x="urn:schemas-microsoft-com:office:excel"><v:shape><x:ClientData ObjectType="Note"><x:Anchor>2, 15, 1, 10, 4, 15, 5, 4</x:Anchor><x:Row>2</x:Row><x:Column>1</x:Column></x:ClientData></v:shape><v:shape><x:ClientData ObjectType="Note"><x:Anchor>2, 15, 8, 10, 4, 15, 12, 4</x:Anchor><x:Row>9</x:Row><x:Column>1</x:Column></x:ClientData></v:shape></xml>');
    zip.file('xl/drawings/drawing1.xml', '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><xdr:twoCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>10</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to></xdr:twoCellAnchor><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from></xdr:oneCellAnchor></xdr:wsDr>');
    const w2 = await Workbook.open(await zip.generateAsync({ type: 'nodebuffer' }));
    (await w2.sheet('Φ')).insertRows(5, 2, 5, w2);   // δύο γραμμές μετά τη 5
    const out = await JSZip.loadAsync(await w2.save());
    const com = await out.file('xl/comments1.xml')!.async('string');
    expect(com).toMatch(/ref="B3"/); expect(com).toMatch(/ref="B12"/);
    const vml = await out.file('xl/drawings/vmlDrawing1.vml')!.async('string');
    expect(vml).toMatch(/<x:Row>2<\/x:Row>/); expect(vml).toMatch(/<x:Row>11<\/x:Row>/);
    expect(vml).toMatch(/<x:Anchor>2, 15, 1, 10, 4, 15, 7, 4<\/x:Anchor>/); expect(vml).toMatch(/<x:Anchor>2, 15, 10, 10, 4, 15, 14, 4<\/x:Anchor>/);
    const dr = await out.file('xl/drawings/drawing1.xml')!.async('string');
    expect([...dr.matchAll(/<xdr:row>(\d+)<\/xdr:row>/g)].map(m => +m[1])).toEqual([10, 12, 1]);
  });
});
