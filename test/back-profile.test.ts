// Pieces of the 4b: line format helpers, wrapping with hyphenation, the profile keeps the ignored words and the format, cell notes as hints, stale totals in the trial.
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { modelOfBuffer } from '../src/main/bookModel';
import { tryFill } from '../src/main/tplAdapt';
import { buildTplModel, emptyChoices, kindOfSettings, profileFromChoices } from '../src/shared/tplMap';
import { sanitizeProfiles } from '../src/shared/tplStore';
import { backView, fillTitle, formatOf, frame, greekNum, numLabel, sampleLine, sectionWord, wrapText } from '../src/shared/backForm';
import { defaultLexicon } from '../src/shared/lexicon';
import { genFillMock } from './mockgen';

describe('line format', () => {
  it('Greek numbering', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 20, 21].map(greekNum)).toEqual(['α', 'β', 'γ', 'δ', 'ε', 'στ', 'ζ', 'η', 'θ', 'ι', 'ια', 'ιε', 'κ', 'κα']);
    expect(numLabel(6, formatOf({ num: 'greek' }))).toBe('στ.'); expect(numLabel(6, formatOf(null))).toBe('6.');
  });
  it('the sample line follows the format', () => {
    expect(sampleLine(formatOf(null))).toMatch(/^1\. ΣΤΡ \(ΠΖ\) .* 15 ΟΚΤ 26\.$/);
    expect(sampleLine(formatOf({ num: 'greek', date: 'slash', line: 'person' }))).toMatch(/^α\. ΣΤΡ \(ΠΖ\) ΠΑΠΑΔΟΠΟΥΛΟΣ ΝΙΚΟΣ \(ΣΑ :123456\) : .* 15\/10\/26\.$/);
  });
  it('wrapping at the column width hyphenates a long word and loses nothing', () => {
    const m = (t: string) => t.length * 7;
    const text = 'Ο ΑΝΤΙΠΑΡΑΒΟΛΗ ΧΑΤΖΗΓΕΩΡΓΙΑΔΗΣΚΩΝΣΤΑΝΤΙΝΙΔΗΣ ΕΠΙΣΤΡΕΦΕΙ ΑΠΟ ΑΔΕΙΑ';
    const lines = wrapText(text, m, 150);
    expect(lines.every(l => m(l) <= 150)).toBe(true);
    expect(lines.join(' ').replace(/- /g, '')).toBe(text);
    expect(lines.some(l => l.endsWith('-'))).toBe(true);
  });
  it('section words with or without number and group', () => {
    expect(sectionWord('1. ΕΓΓΡΑΦΕΣ:').word).toBe('ΕΓΓΡΑΦΕΣ'); expect(sectionWord('ΟΜΑΔΑ Α΄ ΣΤΡΑΤΟΛΟΓΙΚΕΣ: ΕΓΓΡΑΦΕΣ')).toEqual({ word: 'ΕΓΓΡΑΦΕΣ', group: 'Α' });
    expect(sectionWord('ΟΜΑΔΑ Β΄ - ΔΙΟΙΚΗΤΙΚΕΣ ΜΕΤΑΒΟΛΕΣ')).toEqual({ word: '', group: 'Β' }); expect(sectionWord('5.ΑΙΤΗΣΕΙΣ:').word).toBe('ΑΙΤΗΣΕΙΣ');
  });
  it('only the blank part of a title is replaced', () => {
    const r = fillTitle('Ημερήσια αναφορά της ____ της / / ', { unit: '4ΗΣ ΙΛΗΣ', d: '2026-10-15', fmt: 'hk' });
    expect(r.text).toBe('Ημερήσια αναφορά της 4ΗΣ ΙΛΗΣ της 15/10/26 ');
    expect(frame(r.text, ['4ΗΣ ΙΛΗΣ', '15/10/26'])).toBe(frame('Ημερήσια αναφορά της ____ της / / '));
  });
});

describe('profile keeps the ignored words and the format of the back side', () => {
  it('through profileFromChoices, a second save and the loader', async () => {
    const m = await genFillMock(5, { countifs: true });
    const sheets = await modelOfBuffer(m.buf); const kind = kindOfSettings(m.s.settings);
    const ch = { ...emptyChoices(), skip: ['ΧΧ ΛΕΞΗ'], back: { num: 'greek' as const, date: 'slash4' as const, line: 'person' as const, accepted: ['ΛΟΙΠΑ'] } };
    const p1 = profileFromChoices(sheets, { kind, settings: m.s.settings, choices: ch, id: 'hkai-1' });
    expect(p1.ignoreWords).toEqual(['ΧΧ ΛΕΞΗ']); expect(p1.back).toEqual({ num: 'greek', date: 'slash4', line: 'person', accepted: ['ΛΟΙΠΑ'] });
    const p2 = profileFromChoices(sheets, { kind, settings: m.s.settings, choices: emptyChoices(), prev: p1, id: 'hkai-1' });
    expect(p2.ignoreWords).toEqual(['ΧΧ ΛΕΞΗ']); expect(p2.back?.num).toBe('greek');
    expect(sanitizeProfiles(JSON.parse(JSON.stringify([p2])))[0].back).toEqual(p2.back);
    const model = buildTplModel(sheets, { settings: m.s.settings, kind, profile: p2 });
    expect(model.choices.skip).toEqual(['ΧΧ ΛΕΞΗ']); expect(model.choices.back?.line).toBe('person');
  });
});

describe('the note of a section label is shown as a hint', () => {
  it('read from the file, never written', async () => {
    const wb = new ExcelJS.Workbook(); const w = wb.addWorksheet('ΠΙΣΩ');
    w.getCell('F1').value = '1. ΑΙΤΗΣΕΙΣ'; w.getCell('G1').value = 'ΕΙΣΗΓΗΣΗ'; w.getCell('F6').value = '2. ΠΟΙΝΕΣ'; w.getCell('G6').value = 'ΕΙΣΗΓΗΣΗ';
    for (let r = 2; r <= 5; r++) w.getCell(r, 6).border = { top: { style: 'thin' } };
    w.getCell('F1').note = 'για πρωινά υπηρεσιακά (μέχρι τις 3) μπαίνει εδώ. Αλλιώς στο χαρτί.';
    const sheets = await modelOfBuffer(Buffer.from(await wb.xlsx.writeBuffer()));
    const v = backView(sheets, { lex: defaultLexicon() })!;
    expect(v.sections.map(x => x.id)).toEqual(['requests', 'punish']); expect(v.sections[0].comment).toMatch(/πρωινά υπηρεσιακά/); expect(v.sections[0].layout).toBe('below'); expect(v.decision).toBe(2);
    expect(v.missing).toContain('enroll');
  });
});

describe('the trial marks stale typed totals', () => {
  it('a total that holds a typed number is "stale" (not written, not a formula)', async () => {
    let hit = 0;
    for (let seed = 1; seed <= 12 && !hit; seed++) {
      const m = await genFillMock(seed, { totals: 'numbers', countifs: false, unknownRow: true });
      const sheets = await modelOfBuffer(m.buf);
      const t = await tryFill(sheets, m.buf, m.s, m.date, { choices: emptyChoices(), creates: [], ...(m.profile ? {} : {}) });
      hit += t.rows.filter(r => r.total).reduce((a, r) => a + r.cells.filter(c => c.how === 'stale').length, 0);
      for (const r of t.rows) for (const c of r.cells) if (c.how === 'stale') expect(r.total).toBe(true);
    }
    expect(hit).toBeGreaterThan(0);
  });
});
