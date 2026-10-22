// UX 22/10 (Π4, Π5, Μ6, Μ9, Χ2, Χ3): ό,τι χρειάζεται φαίνεται σε 1366×698 και σε 1024, χωρίς κομμένα κείμενα. Έλεγχος στον κώδικα.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { siShort } from '../src/shared/si';
import { GUIDE } from '../src/renderer/guideText';

const src = (f: string) => readFileSync(new URL('../src/renderer/' + f, import.meta.url), 'utf8');
const css = src('styles.css');

describe('διάταξη', () => {
  it('ΗΚΑΙ: Excel, Εκτύπωση και Υπογραφές στην κεφαλίδα, όχι κάτω από την προεπισκόπηση', () => {
    const o = src('screens/other.ts');
    const head = o.indexOf('title=${HK() + \' της \' + dmy(date)}');
    const ex = o.indexOf('<${ExportButton} kind="hkai"');
    expect(head).toBeGreaterThan(0);
    expect(ex - head).toBeGreaterThan(0);
    expect(ex - head).toBeLessThan(600);
    expect(o.match(/ExportButton\} kind="hkai"/g)).toHaveLength(1);
  });
  it('μενού: ο Οδηγός βγήκε (ανοίγει με ? και F1), κουμπιά 48/44 px ώστε να χωρά και σε ύψος 638', () => {
    const a = src('app.ts');
    expect(a).toMatch(/NAV_MORE = \['history', 'templates'\]/);
    const nMenu = (a.match(/NAV_MAIN = \[([^\]]+)\]/)![1].split(',').length) + 2;
    // στενό μενού: κουμπιά, ο διακόπτης, η γραμμή και τα περιθώρια. 1366×768 χωρίς γραμμή εργασιών: 708 px για το μενού·
    // στο PC με τη γραμμή εργασιών (698 ύψος): 638, όπου τα κουμπιά γίνονται 44 px
    const fit = (h: number) => nMenu * h + 42 + 9 + 20 + (nMenu + 1) * 2;
    expect(fit(48)).toBeLessThanOrEqual(708);
    expect(fit(44)).toBeLessThanOrEqual(638);
    expect(css).toMatch(/\.is-rail \.navbtn\{[^}]*min-height:48px/);
    expect(css).toMatch(/@media \(max-height:700px\)\{\.is-rail \.navbtn\{min-height:44px/);
  });
  it('F1 = Οδηγός, Shift+F1 = Υπόμνημα, και το Υπόμνημα είναι θέμα του Οδηγού', () => {
    const a = src('app.ts');
    expect(a).toMatch(/e\.key === 'F1' && e\.shiftKey\) \{ e\.preventDefault\(\); setOver\('legend'\)/);
    expect(a).toMatch(/e\.key === 'F1'\) \{ e\.preventDefault\(\); help\(\)/);
    const lg = GUIDE.find(t => t.id === 'legend')!;
    expect(GUIDE[0]).toBe(lg);
    expect(lg.body).toMatch(/\| \*\*ΕΥ\*\* \|/);
  });
  it('υπότιτλοι ολόκληροι, όχι κομμένοι με «…»', () => {
    expect(css).not.toMatch(/\.page-head__sub\{[^}]*ellipsis/);
  });
  it('Στελέχη: «Κατάσταση…» αντί για σκέτο «+»', () => {
    expect(src('screens/cadre.ts')).toMatch(/>Κατάσταση…<\/\/>/);
    expect(src('screens/cadre.ts')).not.toMatch(/data-tip-side="left">\+<\/\/>/);
  });
  it('Δυναμολόγιο σε στενή οθόνη: χωρίς Πατρώνυμο και Τηλέφωνο', () => {
    const p = src('screens/people.ts');
    expect(p).toMatch(/NARROW_HIDE = \['father', 'phone'\]/);
    expect(p).toMatch(/useMedia\('\(max-width: 1279px\)'\)/);
  });
  it('Σ.Ι. σύντομα σε στενές στήλες', () => {
    expect(siShort('Ι3 ΧΩΡΙΣ ΟΠΛΟ')).toBe('Ι3 άοπλος');
    expect(siShort('Ι3 ΜΕ ΟΠΛΟ ΟΡΘΟΠΑΙΔΙΚΟ')).toBe('Ι3 ένοπλος ΟΡΘΟΠΑΙΔΙΚΟ');
    expect(siShort('Ι1')).toBe('Ι1');
  });
});
