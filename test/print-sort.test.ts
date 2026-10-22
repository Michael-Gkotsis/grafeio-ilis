// Ταξινόμηση στο παράθυρο «Εκτύπωση» (Michael, 22/10): «πρώτα θάλαμος, μετά αλφαβητικά κτλπ». Αλλάζει μόνο η σειρά των
// γραμμών του πίνακα· κεφαλίδα, τίτλοι, σύνολα και υπογραφές μένουν στη θέση τους και το Α/Α μετράει ξανά από το 1
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura, fillHkai } from '../src/main/exports';
import { dutyCheck, rosterPrint } from '../src/main/excel';
import { buildTemplate, fillReport } from '../src/main/reports';
import { blankBuild, defaultPick, type Report } from '../src/shared/reports';
import { cleanOpts, previewHtml, PRINT_DEFAULT, renderBook, type PrintOpts, type PrintSort } from '../src/main/print';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const D = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 's' + ++seq };
const O = (sort?: PrintSort[], x: Partial<PrintOpts> = {}): PrintOpts => ({ ...PRINT_DEFAULT, ...(sort ? { sort } : {}), ...x });
// οι γραμμές όπως τυπώνονται: αριθμός γραμμής του Excel και κείμενα των κελιών (με τα άδεια, για να μετράνε οι στήλες)
const rowsOf = (html: string) => [...html.matchAll(/<tr data-r="(\d+)"([^>]*)>([\s\S]*?)<\/tr>/g)]
  .map(m => ({ r: +m[1], rep: /data-t/.test(m[2]), td: [...m[3].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => /<span>([^<]*)<\/span>/.exec(x[1])?.[1] ?? '') }));
const el = new Intl.Collator('el', { numeric: true, sensitivity: 'base' });

function people() {
  const s = fakeState(90);
  // επίθετα με τόνους και αριθμούς (το Excel τα γράφει κεφαλαία χωρίς τόνους): ελληνική σειρά, 2 πριν από 10
  const names = ['ΏΡΑΣ', 'ΆΒΑΤΟΣ', 'ΒΕΡΟΣ', 'ΖΑΧΟΣ', 'ΑΛΦΑ10', 'ΑΛΦΑ2'];
  names.forEach((n, i) => { s.people[i] = { ...s.people[i], last: n }; });
  s.people[3] = { ...s.people[3], rank: 'ΛΧΙΑΣ' }; s.people[7] = { ...s.people[7], rank: 'ΥΔΝΕΑΣ' };
  return s;
}

describe('εκτύπωση: ταξινόμηση με 1η, 2η, 3η στήλη', async () => {
  const S = people();
  const dyn = await rosterPrint(S, D);
  const body = (html: string) => { const all = rowsOf(html).filter(x => !x.rep); const h = all.findIndex(x => x.td.includes('ΘΑΛΑΜΟΣ')); return { head: all[h].td, rows: all.slice(h + 1), before: all.slice(0, h + 1) }; };

  it('οι στήλες που ταξινομούνται: όλες με τιμές, όχι το Α/Α', async () => {
    const doc = await renderBook(dyn.data, { file: dyn.name, layout: O() });
    const ks = (doc.cols || []).map(c => c.k);
    expect(ks).toEqual(expect.arrayContaining(['ΒΑΘΜΟΣ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΘΑΛΑΜΟΣ', 'ΟΣ', 'ΣΙ']));
    expect(ks).not.toContain('ΑΑ');
    expect(doc.cols!.find(c => c.k === 'ΒΑΘΜΟΣ')!.kind).toBe('rank');
    expect(doc.cols!.find(c => c.k === 'ΘΑΛΑΜΟΣ')!.kind).toBe('num');
    expect(doc.cols!.find(c => c.k === 'ΟΣ')!.label).toBe('Ο/Σ');
  });

  it('πρώτα θάλαμος (9 → 1), μετά επίθετο (Α → Ω): Α/Α ξανά 1, 2, 3…, κεφαλίδα στη θέση της', async () => {
    const plain = body((await renderBook(dyn.data, { file: dyn.name, layout: O() })).sheets[0].html);
    const doc = await renderBook(dyn.data, { file: dyn.name, layout: O([{ c: 'ΘΑΛΑΜΟΣ', d: true }, { c: 'ΕΠΙΘΕΤΟ' }]) });
    const { head, rows, before } = body(doc.sheets[0].html);
    expect(before.map(x => x.r)).toEqual(plain.before.map(x => x.r));
    expect(rows.length).toBe(plain.rows.length);
    const room = head.indexOf('ΘΑΛΑΜΟΣ'), last = head.indexOf('ΕΠΙΘΕΤΟ'), aa = head.indexOf('Α/Α');
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1].td, b = rows[i].td;
      expect(+a[room]).toBeGreaterThanOrEqual(+b[room]);
      if (a[room] === b[room]) expect(el.compare(a[last], b[last])).toBeLessThanOrEqual(0);
    }
    expect(rows.map(x => x.td[aa])).toEqual(rows.map((_, i) => String(i + 1)));
    expect(rows[0].td[room]).toBe('8');
  });

  it('ελληνική αλφαβητική σειρά: Α πριν από Β… Ω τελευταίο, 2 πριν από 10', async () => {
    const doc = await renderBook(dyn.data, { file: dyn.name, layout: O([{ c: 'ΕΠΙΘΕΤΟ' }]) });
    const { head, rows } = body(doc.sheets[0].html); const last = head.indexOf('ΕΠΙΘΕΤΟ');
    const names = rows.map(x => x.td[last]);
    expect(names[0]).toBe('ΑΒΑΤΟΣ');
    expect(names.indexOf('ΑΛΦΑ2')).toBe(names.indexOf('ΑΛΦΑ10') - 1);
    expect(names.indexOf('ΩΡΑΣ')).toBe(names.length - 1);
    expect(names).toEqual([...names].sort(el.compare));
    expect(names.indexOf('ΒΕΡΟΣ')).toBeLessThan(names.indexOf('ΖΑΧΟΣ'));
    // Ω → Α: ανάποδα
    const rev = body((await renderBook(dyn.data, { file: dyn.name, layout: O([{ c: 'ΕΠΙΘΕΤΟ', d: true }]) })).sheets[0].html);
    expect(rev.rows.map(x => x.td[last])).toEqual([...names].reverse());
  });

  it('βαθμός: ανώτεροι πρώτα (ΛΧΙΑΣ, ΔΝΕΑΣ, ΥΔΝΕΑΣ, ΣΤΡ), με το ίδιο Α/Α στη σειρά', async () => {
    const doc = await renderBook(dyn.data, { file: dyn.name, layout: O([{ c: 'ΒΑΘΜΟΣ' }, { c: 'ΕΠΙΘΕΤΟ' }]) });
    const { head, rows } = body(doc.sheets[0].html); const rk = head.indexOf('ΒΑΘΜΟΣ');
    expect(rows.slice(0, 4).map(x => x.td[rk])).toEqual(['ΛΧΙΑΣ', 'ΔΝΕΑΣ', 'ΥΔΝΕΑΣ', 'ΣΤΡ']);
    const low = body((await renderBook(dyn.data, { file: dyn.name, layout: O([{ c: 'ΒΑΘΜΟΣ', d: true }]) })).sheets[0].html);
    expect(low.rows[low.rows.length - 1].td[rk]).toBe('ΛΧΙΑΣ');
  });

  it('κενά κελιά πάντα στο τέλος· σε 3 σελίδες η κεφαλίδα ξανά πάνω (όχι για κλικ) και χωράει', async () => {
    const doc = await renderBook(dyn.data, { file: dyn.name, layout: O([{ c: 'ΠΟΣΤΟ' }], { pages: 3 }) });
    const all = rowsOf(doc.sheets[0].html); const h = all.find(x => x.td.includes('ΠΟΣΤΟ'))!; const ci = h.td.indexOf('ΠΟΣΤΟ');
    const data = all.filter(x => !x.rep && x.r > h.r);
    expect(data[0].td[ci]).toBe('ΚΨΜ'); expect(data.slice(1).every(x => x.td[ci] === '')).toBe(true);
    expect(doc.total).toBe(3);
    expect(all.filter(x => x.rep).length).toBeGreaterThan(0);
    expect(all.filter(x => x.rep).every(x => x.td.includes('ΠΟΣΤΟ') || x.r <= h.r)).toBe(true);
    // κλικ σε γραμμή με ταξινόμηση: η σελίδα αλλάζει εκεί (η γραμμή του Excel, όπου κι αν βρίσκεται τώρα)
    const at = data[12].r;
    const br = await renderBook(dyn.data, { file: dyn.name, layout: O([{ c: 'ΠΟΣΤΟ' }], { breaks: { ΔΥΝΑΜΟΛΟΓΙΟ: [at] } }) });
    expect([...br.sheets[0].html.matchAll(/data-first="(\d+)"/g)].map(m => +m[1])).toEqual([1, at]);
  });

  it('στήλη που δεν υπάρχει στο έντυπο (από άλλη μέρα): ίδια σειρά με το Excel', async () => {
    const a = await renderBook(dyn.data, { file: dyn.name, layout: O() });
    const b = await renderBook(dyn.data, { file: dyn.name, layout: O([{ c: 'ΟΠΛΟΒΑΣΤΟΣ' }]) });
    expect(b.sheets[0].html).toBe(a.sheets[0].html);
  });

  it('Έντυπα: ο δικός σου πίνακας ταξινομείται, οι υπογραφές από κάτω μένουν τελευταίες', async () => {
    const tpl = await buildTemplate({ ...blankBuild(), cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }, { f: 'room', h: 'ΘΑΛ.', w: 'narrow' }] }, 'people');
    const r: Report = { id: 'r1', name: 'Αγγαρεία', tpl: 't1', kind: 'people', sheet: tpl.sheet, head: tpl.head, cols: tpl.cols, cells: tpl.cells, pick: defaultPick(), sort: 'name', day: 'today', out: 'file' };
    const out = await fillReport(tpl.data, S, r, S.people.slice(0, 12).map(p => p.id), D);
    const plain = rowsOf((await renderBook(out.data, { file: out.name, layout: O() })).sheets[0].html);
    const doc = await renderBook(out.data, { file: out.name, layout: O([{ c: 'ΘΑΛ' }, { c: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', d: true }]) });
    expect(doc.cols!.map(c => c.k)).toEqual(['ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΘΑΛ']);
    const rows = rowsOf(doc.sheets[0].html);
    expect(rows.slice(-3).map(x => x.r)).toEqual(plain.slice(-3).map(x => x.r));
    const h = rows.findIndex(x => x.td.includes('ΘΑΛ.')); const data = rows.slice(h + 1, h + 13);
    expect(data.map(x => +x.td[2])).toEqual([...data.map(x => +x.td[2])].sort((a, b) => a - b));
    expect(data.map(x => x.td[0])).toEqual(data.map((_, i) => String(i + 1)));
  });

  it('Έλεγχος υπηρεσιών: όχι οι στήλες-μέρες· ΦΡΟΥΡΑ και ΗΚΑΙ: όχι οι πίνακες με συγχωνεύσεις ή αριθμούς', async () => {
    let s = fakeState(40); s = apply(s, { t: 'autofill', date: D }, ctx).state;
    const chk = await dutyCheck(s, '2026-10');
    const c = await renderBook(chk.data, { file: chk.name, layout: O() });
    expect(c.cols!.map(x => x.k)).toEqual(expect.arrayContaining(['ΕΠΩΝΥΜΟ', 'ΣΥΝ']));
    expect(c.cols!.some(x => /^\d+$/.test(x.k))).toBe(false);
    const fr = await fillFroura(T('froura.xlsx'), s, D);
    const f = await renderBook(fr.data, { file: fr.name, layout: O() });
    expect(f.cols!.map(x => x.k)).not.toContain('ΘΑΛΑΜΟΦΥΛΑΚΕΣ');
    expect(f.cols!.map(x => x.k)).not.toContain('ΤΙΜΩΡΗΜΕΝΟΙ');
    const hk = await fillHkai(T('hkai.xlsx'), s, D);
    expect((await renderBook(hk.data, { file: hk.name, layout: O() })).cols).toEqual([]);
  });

  it('οι ρυθμίσεις: ως 3 στήλες, χωρίς διπλές, με κλειδί από την επικεφαλίδα· στο παράθυρο οι στήλες και το «Ταξινόμηση»', async () => {
    const o = cleanOpts({ sort: [{ c: 'Θάλαμος', l: 'ΘΑΛΑΜΟΣ', d: true }, { c: 'ΘΑΛΑΜΟΣ' }, { c: 'Ο/Σ', d: 'ναι' }, 5, { c: '' }, { c: 'ΟΝΟΜΑ' }, { c: 'ΑΣΜ' }] });
    expect(o.sort).toEqual([{ c: 'ΘΑΛΑΜΟΣ', l: 'ΘΑΛΑΜΟΣ', d: true }, { c: 'ΟΣ' }]);
    expect(cleanOpts({ sort: [] }).sort).toBeUndefined();
    expect(cleanOpts({ pages: 2 }, { ...PRINT_DEFAULT, sort: [{ c: 'ΘΑΛΑΜΟΣ' }] }).sort).toEqual([{ c: 'ΘΑΛΑΜΟΣ' }]);
    const doc = await renderBook(dyn.data, { file: dyn.name, layout: O([{ c: 'ΘΑΛΑΜΟΣ' }]) });
    const html = previewHtml(doc, dyn.name, { opts: O([{ c: 'ΘΑΛΑΜΟΣ' }]) });
    expect(html).toContain('id="sortGrp"'); expect(html).toContain('id="menu" role="listbox"');
    expect(html).not.toMatch(/<select id="(?!prn)/);
    const init = JSON.parse(/data-init="([^"]*)"/.exec(html)![1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    expect(init.opts.sort).toEqual([{ c: 'ΘΑΛΑΜΟΣ' }]);
    expect(init.info.cols.map((c: { k: string }) => c.k)).toContain('ΕΠΙΘΕΤΟ');
  });
});
