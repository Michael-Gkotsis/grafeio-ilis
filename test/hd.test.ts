// Ημερήσια Διαταγή (Michael, 3/11): γραμμές από την ΗΚΑΙ, αλλαγές μόνο στην ΗΔ, Ιλχος εβδομάδας, Τμήματα 2/3 από την προηγούμενη, Word. Μόνο ψεύτικα στοιχεία.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { hkaiDiaLines, hkaiEgrLines, hkaiLeaveLines, hkaiPunLines, linesText } from '../src/shared/hkaiText';
import { hdAuto, hdDate, hdDefaultDay, hdDocOf, hdPageHtml, hdTags } from '../src/shared/hd';
import { builtinTemplate, checkTemplate, fillDocx, fillParagraph } from '../src/main/hdDocx';
import { fakeState } from './fixtures';

const D = '2026-11-04';   // Τετάρτη
let seq = 0;
const ctx: Ctx = { today: '2026-11-03', newId: () => 'h' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const base = () => {
  let s = fakeState(8);
  s.people[0].inOn = D; s.people[1].active = false; s.people[1].outOn = D; s.people[1].notes = 'Εκτός δύναμης: μετάθεση';
  s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [3], from: D, to: '2026-11-06' } as never });
  s = run(s, { t: 'declare', cmd: { type: 'PUN', pids: [4], from: D, to: D, kind: 'Κράτηση', days: 2 } as never });
  s.cadreList = [{ id: 'c1', rank: 'ΛΧΙΑΣ', spec: 'ΠΖ', last: 'ΔΟΚΙΜΑΣΤΙΚΟΣ', first: 'ΕΨΙΛΟΝ', active: true } as never];
  s.cadreAbs = [{ id: 'a1', cid: 'c1', kind: 'ka', from: D, to: '2026-11-06' }];
  return s;
};
const sigs = [{ art: 'Ο', title: 'ΔΚΤΗΣ ΙΛΗΣ', name: 'ΟΝΟΜΑ ΕΠΩΝΥΜΟ' }];

describe('γραμμές', () => {
  it('οι μεταβολές των οπλιτών είναι οι γραμμές της ΗΚΑΙ· οι άδειες στελεχών χωριστά', () => {
    const s = base(); const a = hdAuto(s, D);
    expect(a.op[0].join('\n')).toBe(linesText(hkaiEgrLines(s, D))); expect(a.op[1].join('\n')).toBe(linesText(hkaiDiaLines(s, D)));
    expect(a.op[3].join('\n')).toBe(linesText(hkaiPunLines(s, D)));
    expect(a.op[0]).toHaveLength(1); expect(a.op[2]).toHaveLength(1); expect(a.op[3]).toHaveLength(1);
    expect(a.ax[2]).toHaveLength(1); expect(a.ax[2][0]).toMatch(/^1\. ΛΧΙΑΣ \(ΠΖ\) ΔΟΚΙΜΑΣΤΙΚΟΣ ΕΨΙΛΟΝ: .*ΑΔΕΙΑ/);
    expect(a.op[2][0]).toMatch(/^1\. /);   // οι οπλίτες ξαναρχίζουν από το 1
    // μαζί με του στελέχους, η ΗΚΑΙ έχει μία αρίθμηση: ίδιο κείμενο, άλλος αριθμός
    s.hkaiManual = { [D]: { cells: {}, text: {}, lv: true } } as never;   // η ΗΚΑΙ γράφει άδειες μόνο όταν είναι ανοιχτή η ενότητα· η ΗΔ πάντα
    expect(linesText(hkaiLeaveLines(s, D))).toContain(a.op[2][0].replace(/^1\. /, ''));
    expect(a.ax[0]).toEqual([]); expect(a.ax[4]).toEqual([]); expect(a.op[4]).toEqual([]);
  });
  it('προεπιλογή: αύριο· τα όργανα από την ΗΚΑΙ ή ό,τι γράφεις', () => {
    expect(hdDefaultDay('2026-11-03')).toBe(D); expect(hdDate(D)).toBe('04 ΝΟΕΜΒΡΙΟΥ 2026');
    const s = base(); s.hkaiManual = { [D]: { text: { off: 'ΥΠΟΘΕΤΙΚΟΣ ΓΙΑΝΝΗΣ' } } } as never;
    expect(hdAuto(s, D).dn).toBe('ΥΠΟΘΕΤΙΚΟΣ ΓΙΑΝΝΗΣ');
  });
});

describe('αλλαγές μόνο στην ΗΔ', () => {
  it('γραμμή που αλλάζει ή σβήνεται δεν αγγίζει την ΗΚΑΙ', () => {
    let s = base(); const hk = { egr: linesText(hkaiEgrLines(s, D)), lv: linesText(hkaiLeaveLines(s, D)), man: s.hkaiManual, st: s.statuses, ppl: s.people };
    const doc = hdAuto(s, D); doc.op[0] = []; doc.op[2] = ['1. ΑΛΛΑΓΜΕΝΗ ΓΡΑΜΜΗ'];
    s = run(s, { t: 'setHd', date: D, doc });
    expect(hdDocOf(s, D).op[0]).toEqual([]); expect(hdDocOf(s, D).op[2]).toEqual(['1. ΑΛΛΑΓΜΕΝΗ ΓΡΑΜΜΗ']);
    expect(linesText(hkaiEgrLines(s, D))).toBe(hk.egr); expect(linesText(hkaiLeaveLines(s, D))).toBe(hk.lv);
    expect(s.hkaiManual).toBe(hk.man); expect(s.statuses).toBe(hk.st); expect(s.people).toBe(hk.ppl);
  });
  it('κεφαλαία, χωρίς κενές γραμμές· το «ξανά από τα δεδομένα» σβήνει την ΗΔ', () => {
    let s = base(); const doc = hdAuto(s, D); doc.ax[4] = ['  λοιπά  ', '']; doc.t2 = 'υλικό';
    s = run(s, { t: 'setHd', date: D, doc }); expect(s.hd![D].ax[4]).toEqual(['ΛΟΙΠΑ']); expect(s.hd![D].t2).toBe('ΥΛΙΚΟ');
    s = run(s, { t: 'setHd', date: D, doc: null }); expect(s.hd).toEqual({});
    expect(apply(s, { t: 'setHd', date: D, doc: null }, ctx).text).toBe('');
  });
});

describe('Ιλχος, ΑΥΔΜ και Τμήματα', () => {
  it('Ιλχος μένει μέσα στην εβδομάδα και ξαναρχίζει μετά την Κυριακή', () => {
    let s = base(); const d = hdAuto(s, D); d.ilxos = 'ΥΠΟΘΕΤΙΚΟΣ ΑΛΦΑ';
    s = run(s, { t: 'setHd', date: D, doc: d });
    expect(hdAuto(s, '2026-11-05').ilxos).toBe('ΥΠΟΘΕΤΙΚΟΣ ΑΛΦΑ'); expect(hdAuto(s, '2026-11-08').ilxos).toBe('ΥΠΟΘΕΤΙΚΟΣ ΑΛΦΑ');
    expect(hdAuto(s, '2026-11-09').ilxos).toBe('');
  });
  it('ΑΥΔΜ και Τμήματα 2 και 3 από την προηγούμενη ΗΔ', () => {
    let s = base(); const d = hdAuto(s, D); Object.assign(d, { aydm: 'ΑΛΧΙΑΣ ΒΗΤΑ', t2: 'ΚΑΤΑΛΟΓΙΣΜΟΣ Χ', t3: 'ΠΡΟΣΚΟΛΛΑΤΑΙ ΕΝΑΣ' });
    s = run(s, { t: 'setHd', date: D, doc: d });
    const n = hdAuto(s, '2026-11-05'); expect([n.aydm, n.t2, n.t3]).toEqual(['ΑΛΧΙΑΣ ΒΗΤΑ', 'ΚΑΤΑΛΟΓΙΣΜΟΣ Χ', 'ΠΡΟΣΚΟΛΛΑΤΑΙ ΕΝΑΣ']);
    expect([hdAuto(s, '2026-11-03').aydm, hdAuto(s, '2026-11-03').t2]).toEqual(['', '']);   // όχι από μεταγενέστερη
  });
  it('η ΗΔ που βγήκε ξαναβγαίνει ίδια όταν αλλάξουν τα δεδομένα', () => {
    let s = base(); s = run(s, { t: 'setHd', date: D, doc: hdAuto(s, D) });
    const before = JSON.stringify(hdTags(s.settings, D, hdDocOf(s, D), sigs)), html0 = hdPageHtml(hdTags(s.settings, D, hdDocOf(s, D), sigs), 10);
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [5], from: D, to: D } as never }); s.people[0].inOn = undefined;
    expect(hdAuto(s, D).op[2]).toHaveLength(2);   // τα νέα δεδομένα αλλάζουν το αυτόματο
    expect(JSON.stringify(hdTags(s.settings, D, hdDocOf(s, D), sigs))).toBe(before);
    expect(hdPageHtml(hdTags(s.settings, D, hdDocOf(s, D), sigs), 10)).toBe(html0);
  });
});

describe('Word', () => {
  const xmlOf = async (b: Buffer) => (await JSZip.loadAsync(b)).file('word/document.xml')!.async('string');
  const paras = (x: string) => [...x.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(m => [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join(''));
  it('ετικέτα κομμένη σε runs αντικαθίσταται, με τη μορφή του πρώτου κομματιού', () => {
    const p = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>ΗΜΕΡΟΜΗΝΙΑ: {ΗΜΕΡΟ</w:t></w:r><w:r><w:t>ΜΗΝΙΑ</w:t></w:r><w:r><w:t>}</w:t></w:r></w:p>';
    const r = fillParagraph(p, { 'ΗΜΕΡΟΜΗΝΙΑ': '04 ΝΟΕΜΒΡΙΟΥ 2026' });
    expect(r).toContain('ΗΜΕΡΟΜΗΝΙΑ: 04 ΝΟΕΜΒΡΙΟΥ 2026'); expect(r).toContain('<w:jc w:val="center"/>'); expect(r).toContain('<w:b/>'); expect(r).not.toContain('{');
  });
  it('πολλές γραμμές γίνονται παράγραφοι με την ίδια μορφή· άγνωστη ετικέτα μένει', () => {
    const p = '<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t>{ΟΠ3}</w:t></w:r></w:p>';
    const r = fillParagraph(p, { 'ΟΠ3': '1. ΠΡΩΤΗ\n2. ΔΕΥΤΕΡΗ' });
    expect(r.match(/<w:p>/g)).toHaveLength(2); expect(r.match(/w:val="both"/g)).toHaveLength(2);
    expect(fillParagraph('<w:p><w:r><w:t>{ΑΓΝΩΣΤΗ}</w:t></w:r></w:p>', {})).toContain('{ΑΓΝΩΣΤΗ}');
  });
  it('το έτοιμο πρότυπο γεμίζει σε έγκυρο .docx με όλες τις γραμμές', async () => {
    const s = base(); const doc = hdAuto(s, D); doc.aydm = 'ΑΛΧΙΑΣ ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ'; doc.op[2].push('2. ΔΕΥΤΕΡΗ ΓΡΑΜΜΗ');
    const tpl = await builtinTemplate(); expect(await checkTemplate(tpl)).toBeNull();
    const out = await fillDocx(tpl, hdTags(s.settings, D, doc, sigs)); const zip = await JSZip.loadAsync(out);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['word/document.xml', '[Content_Types].xml', '_rels/.rels']));
    const x = await xmlOf(out); expect(x.startsWith('<?xml')).toBe(true); expect(x).not.toMatch(/\{[Α-Ω0-9]+\}/);
    const ps = paras(x);
    expect(ps).toContain('ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ΤΗΣ 04 ΝΟΕΜΒΡΙΟΥ 2026'); expect(ps).toContain('ΑΛΧΙΑΣ ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ');
    expect(ps.filter(t => /^\d\. /.test(t) && /ΑΔΕΙΑ/.test(t)).length).toBe(2);   // μία του στελέχους, μία του οπλίτη (ξεχωριστές παράγραφοι)
    expect(ps).toContain('2. ΔΕΥΤΕΡΗ ΓΡΑΜΜΗ'); expect(ps).toContain('- Ο -'); expect(ps).toContain('ΔΚΤΗΣ ΙΛΗΣ'); expect(ps).toContain('ΟΝΟΜΑ ΕΠΩΝΥΜΟ');
    expect(ps.filter(t => t === 'Ø').length).toBeGreaterThan(3);   // ό,τι δεν έχει γραμμές
  });
  it('πρότυπο χωρίς ετικέτες ή όχι Word δεν γίνεται δεκτό', async () => {
    const z = new JSZip(); z.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>τίποτα</w:t></w:r></w:p></w:body></w:document>');
    expect(await checkTemplate(await z.generateAsync({ type: 'nodebuffer' }))).toMatch(/ετικέτα/);
    expect(await checkTemplate(Buffer.from('όχι zip'))).toMatch(/Word/);
  });
});
