// Excel Εξοδούχων «Όλη η δύναμη» (Michael, 30/10, 31/10): το πραγματικό template, δύο φύλλα (σελίδα 1 οι εξοδούχοι = Πίνακας Α,
// σελίδα 2 η υπόλοιπη δύναμη Β, Γ και η Δ), κάθε άτομο μία φορά, σύνολα που κλείνουν, υπογραφές ανά σελίδα, κεφαλαία
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fillOuts } from '../src/main/exports';
import { Workbook, mergeSheets } from '../src/main/xlsx';
import { dayBook, whenList, DAY_GROUPS } from '../src/shared/outsDay';
import { activePeople } from '../src/shared/rules';
import { fatherTxt } from '../src/shared/domain';
import { pskDays } from '../src/shared/dates';
import { upper } from '../src/shared/text';
import { fakeState } from './fixtures';
import { genState } from './outs-gen';
import { genOuts } from './tplgen';
import type { AppState } from '../src/shared/domain';

const T = fs.readFileSync(path.join(__dirname, '..', 'templates', 'exodouxoi.xlsx'));
const all = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, outsFmt: 'all' } });
const cell = (rows: (string | number | boolean | Date | null)[][], r: number, c: number) => String(rows[r - 1]?.[c - 1] ?? '');

// ό,τι γράφτηκε σε ένα φύλλο: τίτλος, σύνοψη, υποομάδες με τα άτομά τους (Α/Α, όνομα), Δ και υπογραφές
interface Page { name: string; rows: (string | number | boolean | Date | null)[][]; subs: { code: string; n: number; people: { no: number; key: string }[] }[]; secs: Record<string, number>; summary: string; when: { when: string; n: number; refs: string }[]; texts: string[] }
async function readPage(wb: Workbook, name: string): Promise<Page> {
  const rows = await wb.values(name, 600, 30);
  const subs: Page['subs'] = []; const secs: Record<string, number> = {}; const when: Page['when'] = [];
  let summary = '', inDelta = false; const texts: string[] = [];
  rows.forEach((row, i) => { for (const v of row) if (typeof v === 'string' && v) texts.push(v); const r = i + 1, a = cell(rows, r, 1);
    if (/^ΔΥΝΑΜΗ \d+ = /.test(a)) summary = a;
    const sec = /^([ΑΒΓ])\. [^(]*\((\d+)\)$/.exec(a); if (sec) secs[sec[1]] = Number(sec[2]);
    if (/^Δ\. ΠΟΤΕ ΓΥΡΙΖΟΥΝ/.test(a)) inDelta = true;
    const sub = /^([ΑΒΓ]\d)\. .*\((\d+)\)$/.exec(a); if (sub) subs.push({ code: sub[1], n: Number(sub[2]), people: [] });
    else if (inDelta) { if (/^\d+$/.test(cell(rows, r, 6)) && cell(rows, r, 7)) when.push({ when: a, n: Number(cell(rows, r, 6)), refs: cell(rows, r, 7) }); }
    else if (subs.length && /^\d+$/.test(a) && cell(rows, r, 4)) subs[subs.length - 1].people.push({ no: Number(a), key: cell(rows, r, 4) + '|' + cell(rows, r, 5) }); });
  return { name, rows, subs, secs, summary, when, texts };
}
async function read(data: Buffer, sheets: string[]) {
  const wb = await Workbook.open(data); const p1 = await readPage(wb, sheets[0]), p2 = await readPage(wb, sheets[1]);
  return { wb, p1, p2, names: wb.sheetNames() };
}
const keyOf = (p: { last: string; first: string; father?: string }) => upper(p.last) + '|' + upper(p.first + fatherTxt(p as any));
// «ΣΕΛ. 1: 1, 2 · ΣΕΛ. 2: 1» → [[1, 1], [1, 2], [2, 1]]
const refsOf = (t: string) => t.split(' · ').flatMap(part => { const m = /^ΣΕΛ\. (\d): (.*)$/.exec(part)!; return m[2].split(', ').map(n => [Number(m[1]), Number(n)] as [number, number]); });

describe('Excel «Όλη η δύναμη»: δύο σελίδες', () => {
  it('σε πολλές τυχαίες καταστάσεις: κάθε ενεργός μία φορά στο Α (φύλλο 1) ∪ Β, Γ (φύλλο 2), σύνολα που κλείνουν, Δ με ΣΕΛ. 1/2, όλα κεφαλαία', async () => {
    for (let seed = 1; seed <= 24; seed++) {
      const s = all(genState(1000 + seed, seed % 2 === 0, 10));
      for (const d of ['2026-10-24', '2026-10-25', '2026-10-28', '2026-10-30']) {
        const tag = 'seed ' + seed + ' ' + d;
        const r = await fillOuts(T, s, d); const book = dayBook(s, d);
        expect(r.warnings, tag).toEqual([]); expect(r.name).toBe('ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ ' + d.split('-').reverse().join('-') + '.xlsx');
        expect(r.sheets, tag).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
        const { p1, p2, names } = await read(r.data, r.sheets!); expect(names, tag).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
        // κάθε ενεργός μία φορά: Α στο φύλλο 1, Β και Γ στο φύλλο 2, με Α/Α που ξεκινά από 1 σε κάθε φύλλο
        const f1 = p1.subs.flatMap(g => g.people), f2 = p2.subs.flatMap(g => g.people);
        const want = activePeople(s).map(keyOf).sort();
        expect([...f1, ...f2].map(p => p.key).sort(), tag).toEqual(want);
        expect(f1.map(p => p.no), tag).toEqual(f1.map((_p, i) => i + 1)); expect(f2.map(p => p.no), tag).toEqual(f2.map((_p, i) => i + 1));
        expect(p1.subs.every(g => g.code[0] === 'Α'), tag).toBe(true); expect(p2.subs.every(g => g.code[0] !== 'Α'), tag).toBe(true);
        expect(f1.map(p => p.key).sort(), tag).toEqual(book.filter(b => b.g[0] === 'A').map(b => keyOf(b.p)).sort());
        // σύνολα: ΔΥΝΑΜΗ = Α + Β + Γ (στο φύλλο 2, με παραπομπή στη σελ. 1), ομάδες όσες του dayBook, ομάδα χωρίς κανέναν δεν γράφεται
        const n = (k: string) => book.filter(b => b.g[0] === k).length;
        expect(p2.summary, tag).toBe('ΔΥΝΑΜΗ ' + book.length + ' = Α ' + n('A') + ' (ΕΞΟΔΟΥΧΟΙ, ΣΕΛ. 1) + Β ' + n('B') + ' + Γ ' + n('G'));
        // η σελίδα 1 έχει γραμμή σύνοψης «Α. ΒΓΑΙΝΟΥΝ ΣΗΜΕΡΑ n: …» (μόνο αν έχει άτομα) και καμία επικεφαλίδα «Α. … (n)» πάνω από τις υποομάδες
        expect(p1.texts.filter(t => /^Α\. ΒΓΑΙΝΟΥΝ ΣΗΜΕΡΑ \d+: /.test(t)), tag).toHaveLength(n('A') ? 1 : 0);
        expect(p1.secs, tag).toEqual(n('A') ? {} : { Α: 0 }); expect(p1.texts.some(t => t === '—'), tag).toBe(n('A') === 0);
        expect(p2.secs, tag).toEqual(Object.fromEntries([['Β', n('B')], ['Γ', n('G')]].filter(e => e[1])));
        const groups = (pg: string) => DAY_GROUPS.filter(([g]) => (pg === '1') === (g[0] === 'A')).map(([g]) => [{ A: 'Α', B: 'Β', G: 'Γ' }[g[0] as 'A'] + g[1], book.filter(b => b.g === g).length] as [string, number]).filter(e => e[1]);
        expect(p1.subs.map(g => [g.code, g.n]), tag).toEqual(groups('1')); expect(p2.subs.map(g => [g.code, g.n]), tag).toEqual(groups('2'));
        for (const g of [...p1.subs, ...p2.subs]) expect(g.people.length, tag + ' ' + g.code).toBe(g.n);
        // Δ (φύλλο 2): όσοι του Α, του Β και του Γ4, με αναφορές ΣΕΛ. 1/ΣΕΛ. 2 που δείχνουν στα σωστά Α/Α
        expect(p1.when, tag).toEqual([]);
        const at = new Map<string, string>();
        f1.forEach(p => at.set('1:' + p.no, p.key)); f2.forEach(p => at.set('2:' + p.no, p.key));
        const w = whenList(book);
        expect(p2.when.map(x => x.when), tag).toEqual(w.map(x => upper(x.when)));
        p2.when.forEach((x, i) => {
          expect(x.n, tag).toBe(w[i].rows.length);
          expect(refsOf(x.refs).map(([pg, no]) => at.get(pg + ':' + no)).sort(), tag).toEqual(w[i].rows.map(y => keyOf(y.p)).sort());
          // μόνο σελίδες που έχουν άτομα
          expect(x.refs.includes('ΣΕΛ. 1') === w[i].rows.some(y => y.g[0] === 'A'), tag).toBe(true);
          expect(x.refs.includes('ΣΕΛ. 2') === w[i].rows.some(y => y.g[0] !== 'A'), tag).toBe(true);
        });
        // κεφαλαία παντού, και στα δύο φύλλα
        for (const t of [...p1.texts, ...p2.texts]) expect(upper(t), tag + ' «' + t + '»').toBe(t);
      }
    }
  }, 240000);
  it('σελίδα 1: τίτλος «ΕΞΟΔΟΥΧΟΙ ΤΗΣ …», ώρες, σύνοψη Α και ΓΥΡΝΑ· σελίδα 2: «ΔΥΝΑΜΗ ΤΗΣ …», ΓΥΡΝΑ / ΓΙΑΤΙ ΜΕΝΕΙ, κεφαλίδα και ημερομηνία σε κάθε φύλλο', async () => {
    const s = all(genState(1008, true, 10));
    const r = await fillOuts(T, s, '2026-10-30'); const { p1, p2 } = await read(r.data, r.sheets!);
    expect(p1.texts).toContain('ΕΞΟΔΟΥΧΟΙ ΤΗΣ ΠΑΡΑΣΚΕΥΗΣ 30-10-2026'); expect(p2.texts).toContain('ΔΥΝΑΜΗ ΤΗΣ ΠΑΡΑΣΚΕΥΗΣ 30-10-2026');
    expect(p1.texts.some(t => /^ΕΞΟΔΟΣ \d\d:\d\d · ΕΠΙΣΤΡΟΦΗ ΕΞΟΔΟΥΧΩΝ \d\d:\d\d · ΕΠΙΣΤΡΟΦΗ ΔΝ \d\d:\d\d · ΑΥΡΙΟ ΕΚΠΑΙΔΕΥΣΗ (ΝΑΙ|ΟΧΙ)$/.test(t))).toBe(true);
    expect(p1.texts.some(t => /^Α\. ΒΓΑΙΝΟΥΝ ΣΗΜΕΡΑ \d+: /.test(t))).toBe(true);
    expect(p1.texts).toContain('ΓΥΡΝΑ'); expect(p1.texts).not.toContain('ΓΙΑΤΙ ΜΕΝΕΙ');
    expect(p2.texts).toContain('ΓΙΑΤΙ ΜΕΝΕΙ'); expect(p2.texts.some(t => /^Β\. ΕΙΝΑΙ ΗΔΗ ΕΞΩ \(\d+\)$/.test(t))).toBe(true);
    for (const p of [p1, p2]) {
      expect(p.texts.filter(t => /^ΑΥΛΩΝΑΣ, 30-10-2026$/.test(t)), p.name).toHaveLength(1);
      expect(p.texts.some(t => /ΚΕΝ ΑΥΛΩΝΑ/.test(t)), p.name).toBe(true);
    }
  });
  it('υπογραφές και στα δύο φύλλα (προεπιλογή: οι ίδιες)', async () => {
    const s = all(genState(1008, true, 10));
    const { p1, p2 } = await read((await fillOuts(T, s, '2026-10-30')).data, ['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
    for (const p of [p1, p2]) { expect(p.texts.filter(t => t === 'ΑΛΧΙΑΣ ΙΛΗΣ'), p.name).toHaveLength(1); expect(p.texts.filter(t => t === 'ΔΚΤΗΣ ΙΛΗΣ'), p.name).toHaveLength(1); }
  });
  it('σελίδα 2 «Καμία»: υπογραφές μόνο στη σελίδα 1· «Δικές της»: η λίστα της σελίδας 2 μόνο εκεί', async () => {
    const s = all(genState(1008, true, 10));
    const none = await read((await fillOuts(T, { ...s, settings: { ...s.settings, outsSig2: 'none' } }, '2026-10-30')).data, ['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
    expect(none.p1.texts).toContain('ΑΛΧΙΑΣ ΙΛΗΣ'); expect(none.p1.texts).toContain('ΔΚΤΗΣ ΙΛΗΣ');
    expect(none.p2.texts).not.toContain('ΑΛΧΙΑΣ ΙΛΗΣ'); expect(none.p2.texts).not.toContain('ΔΚΤΗΣ ΙΛΗΣ');
    expect(none.p2.texts.filter(t => /^(Ο|Η|ΤΟ)$/.test(t))).toEqual([]);
    const own = await read((await fillOuts(T, { ...s, settings: { ...s.settings, outsSig2: 'own', outsSigs2: [{ art: 'Ο', title: 'ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ', name: 'Α. ΤΕΣΤ' }] } }, '2026-10-30')).data, ['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
    expect(own.p2.texts).toContain('ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ'); expect(own.p2.texts).toContain('Α. ΤΕΣΤ'); expect(own.p2.texts).not.toContain('ΑΛΧΙΑΣ ΙΛΗΣ');
    expect(own.p1.texts).toContain('ΑΛΧΙΑΣ ΙΛΗΣ'); expect(own.p1.texts).toContain('ΔΚΤΗΣ ΙΛΗΣ'); expect(own.p1.texts).not.toContain('ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ');
    // 'own' χωρίς δική της λίστα: ξεκινά από των Εξοδούχων
    const own0 = await read((await fillOuts(T, { ...s, settings: { ...s.settings, outsSig2: 'own' } }, '2026-10-30')).data, ['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
    expect(own0.p2.texts).toContain('ΑΛΧΙΑΣ ΙΛΗΣ');
    // η θέση των υπογραφών ανά σελίδα: key 'outs' και 'stay'
    const lay = (await fillOuts(T, s, '2026-10-30')).layout!; expect(lay.map(l => [l.key, l.sheet])).toEqual([['outs', 'ΕΞΟΔΟΥΧΟΙ'], ['stay', 'ΔΥΝΑΜΗ']]);
    for (const l of lay) expect(l.blocks.map(b => b.id).sort()).toEqual(['date', 'head', 's0', 's1']);
  });
  it('οι θέσεις στο χαρτί (Θέσεις στο χαρτί…) ισχύουν χωριστά ανά σελίδα', async () => {
    const s = all(genState(1008, true, 10));
    const base = (await fillOuts(T, s, '2026-10-30')).layout!;
    const moved = (await fillOuts(T, { ...s, settings: { ...s.settings, layout: { outs: { stay: { s0: [0, 1] } } } } }, '2026-10-30')).layout!;
    const blk = (l: typeof base, k: string, id: string) => l.find(x => x.key === k)!.blocks.find(b => b.id === id)!;
    expect(blk(moved, 'stay', 's0').c1).toBe(blk(base, 'stay', 's0').c1 + 1);
    expect(blk(moved, 'outs', 's0').c1).toBe(blk(base, 'outs', 's0').c1);
  });
  it('χωρίς κανέναν ενεργό: γράφεται χωρίς σφάλμα, με μία γραμμή «—» σε κάθε φύλλο', async () => {
    const s0 = fakeState(3); const s = all({ ...s0, people: s0.people.map(p => ({ ...p, active: false })) });
    const r = await fillOuts(T, s, '2026-10-30'); const { p1, p2 } = await read(r.data, r.sheets!);
    expect(r.warnings).toEqual([]); expect(p2.texts).toContain('ΔΥΝΑΜΗ 0 = Α 0 (ΕΞΟΔΟΥΧΟΙ, ΣΕΛ. 1) + Β 0 + Γ 0'); expect(p1.texts).toContain('—'); expect(p2.texts).toContain('—'); expect(p2.when).toEqual([]);
  });
});

describe('Excel «Όλη η δύναμη»: ό,τι template και αν έχεις', () => {
  const pages = async (buf: Buffer) => {
    const s = all(genState(1008, true, 10)); const r = await fillOuts(buf, s, '2026-10-30'); const book = dayBook(s, '2026-10-30');
    expect(r.warnings).toEqual([]); expect(r.sheets).toHaveLength(2);
    const { p1, p2, names } = await read(r.data, r.sheets!);
    return { s, r, book, p1, p2, names };
  };
  const check = (x: Awaited<ReturnType<typeof pages>>) => {
    expect(x.p1.texts).toContain('ΕΞΟΔΟΥΧΟΙ ΤΗΣ ΠΑΡΑΣΚΕΥΗΣ 30-10-2026'); expect(x.p2.texts).toContain('ΔΥΝΑΜΗ ΤΗΣ ΠΑΡΑΣΚΕΥΗΣ 30-10-2026');
    // κάθε ενεργός μία φορά, στο σωστό φύλλο (οι στήλες του template μπορεί να είναι άλλες: ψάχνουμε το επώνυμο στα κελιά)
    const times = (rows: Page['rows'], last: string) => { const re = new RegExp('(^|[^Α-Ω0-9])' + upper(last) + '([^Α-Ω0-9]|$)'); return rows.filter(r => (r || []).some(v => typeof v === 'string' && re.test(v))).length; };
    for (const p of activePeople(x.s)) {
      const inA = x.book.find(b => b.p.id === p.id)!.g[0] === 'A';
      expect(times(x.p1.rows, p.last), p.last + ' φύλλο 1').toBe(inA ? 1 : 0); expect(times(x.p2.rows, p.last), p.last + ' φύλλο 2').toBe(inA ? 0 : 1);
    }
    expect(x.p1.subs.every(g => g.code[0] === 'Α')).toBe(true); expect(x.p2.subs.every(g => g.code[0] !== 'Α')).toBe(true);
    expect(x.p2.texts.some(t => /^ΔΥΝΑΜΗ \d+ = Α \d+ \(ΕΞΟΔΟΥΧΟΙ, ΣΕΛ\. 1\) \+ Β \d+ \+ Γ \d+$/.test(t))).toBe(true);
  };
  it('template με ένα φύλλο (μόνο ΕΞΟΔΟΥΧΟΙ): η ΔΥΝΑΜΗ γράφεται σε αντίγραφό του', async () => {
    const wb = await Workbook.open(T); await wb.dropSheet('ΠΑΡΑΜΕΝΟΝΤΕΣ'); expect(wb.sheetNames()).toEqual(['ΕΞΟΔΟΥΧΟΙ']);
    const x = await pages(await wb.save()); expect(x.names).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']); check(x);
    for (const p of [x.p1, x.p2]) { expect(p.texts).toContain('ΑΛΧΙΑΣ ΙΛΗΣ'); expect(p.texts).toContain('ΔΚΤΗΣ ΙΛΗΣ'); }
  });
  it('template με τις δύο λίστες στο ίδιο φύλλο: πάλι δύο φύλλα, και στο πρώτο δεν μένουν οι Παραμένοντες', async () => {
    let n = 0;
    for (let seed = 1; seed <= 400 && n < 6; seed++) {
      const gen = await genOuts(seed * 13); if (!gen.same || gen.one) continue; n++;
      const x = await pages(gen.buf); const why = gen.desc.join(' · ');
      expect(x.names.filter(nm => nm === 'ΔΥΝΑΜΗ'), why).toHaveLength(1); check(x);
      for (const p of [x.p1, x.p2]) expect(p.texts.filter(t => /ΠΑΡΑΜΕΝΟΝΤΕΣ/.test(t)), why + ' ' + p.name).toEqual([]);
    }
    expect(n).toBeGreaterThan(0);
  });
  it('το φύλλο των Παραμενόντων του template μετονομάζεται ΔΥΝΑΜΗ· άλλα φύλλα του template μένουν', async () => {
    const wb = await Workbook.open(T); (await wb.addSheet('ΣΗΜΕΙΩΣΕΙΣ')).set('A1', 'Πρόχειρο');
    const x = await pages(await wb.save()); expect(x.names).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ', 'ΣΗΜΕΙΩΣΕΙΣ']); check(x);
  });
});

describe('Εξοδούχοι ΠΣΚ «Όλη η δύναμη»', () => {
  it('δύο φύλλα ανά μέρα: «ΠΑΡ 30-10», «ΠΑΡ 30-10 ΔΥΝ», … (6 φύλλα), με τα σωστά περιεχόμενα και περιοχές εκτύπωσης', async () => {
    const s = all(genState(1008, true, 10)); const days = pskDays('2026-10-23');
    const parts = await Promise.all(days.map(d => fillOuts(T, s, d)));
    const tabs = days.map((_d, i) => ['ΠΑΡ 23-10', 'ΣΑΒ 24-10', 'ΚΥΡ 25-10'][i]);
    const merged = await mergeSheets(parts.map(x => x.data), parts.map(x => x.sheets!), tabs.map(n => [n, n + ' ΔΥΝ']));
    const wb = await Workbook.open(merged);
    expect(wb.sheetNames()).toEqual(['ΠΑΡ 23-10', 'ΠΑΡ 23-10 ΔΥΝ', 'ΣΑΒ 24-10', 'ΣΑΒ 24-10 ΔΥΝ', 'ΚΥΡ 25-10', 'ΚΥΡ 25-10 ΔΥΝ']);
    const titles = ['ΠΑΡΑΣΚΕΥΗΣ 23-10-2026', 'ΣΑΒΒΑΤΟΥ 24-10-2026', 'ΚΥΡΙΑΚΗΣ 25-10-2026'];
    for (const [i, t] of titles.entries()) {
      const a = await readPage(wb, tabs[i]), b = await readPage(wb, tabs[i] + ' ΔΥΝ');
      expect(a.texts).toContain('ΕΞΟΔΟΥΧΟΙ ΤΗΣ ' + t); expect(b.texts).toContain('ΔΥΝΑΜΗ ΤΗΣ ' + t);
      const book = dayBook(s, days[i]);
      expect(a.subs.flatMap(g => g.people)).toHaveLength(book.filter(x => x.g[0] === 'A').length);
      expect(b.subs.flatMap(g => g.people)).toHaveLength(book.filter(x => x.g[0] !== 'A').length);
    }
    const JSZip = (await import('jszip')).default; const wbx = await (await JSZip.loadAsync(merged)).file('xl/workbook.xml')!.async('string');
    expect([...wbx.matchAll(/name="_xlnm\.Print_Area" localSheetId="(\d)"/g)].map(m => m[1])).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(wbx).toContain("'ΠΑΡ 30-10 ΔΥΝ'!".replace('30-10', '23-10'));
  });
  it('τα δύο φύλλα του ΠΣΚ διατηρούν τις υπογραφές κάθε σελίδας', async () => {
    const s0 = all(genState(1008, true, 10)); const s = { ...s0, settings: { ...s0.settings, outsSig2: 'none' as const } };
    const days = pskDays('2026-10-23'); const parts = await Promise.all(days.map(d => fillOuts(T, s, d)));
    const tabs = ['ΠΑΡ', 'ΣΑΒ', 'ΚΥΡ'];
    const wb = await Workbook.open(await mergeSheets(parts.map(x => x.data), parts.map(x => x.sheets!), tabs.map(n => [n, n + ' ΔΥΝ'])));
    for (const n of tabs) { expect((await readPage(wb, n)).texts).toContain('ΑΛΧΙΑΣ ΙΛΗΣ'); expect((await readPage(wb, n + ' ΔΥΝ')).texts).not.toContain('ΑΛΧΙΑΣ ΙΛΗΣ'); }
  });
});
