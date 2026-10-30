// Excel Εξοδούχων «Όλη η δύναμη» (Michael, 30/10): το πραγματικό template, κάθε άτομο μία φορά στις ενότητες Α–Γ, σύνολα που κλείνουν, κεφαλαία
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fillOuts } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { dayBook, DAY_GROUPS } from '../src/shared/outsDay';
import { activePeople } from '../src/shared/rules';
import { fatherTxt } from '../src/shared/domain';
import { upper } from '../src/shared/text';
import { fakeState } from './fixtures';
import { genState } from './outs-gen';
import type { AppState } from '../src/shared/domain';

const T = fs.readFileSync(path.join(__dirname, '..', 'templates', 'exodouxoi.xlsx'));
const all = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, outsFmt: 'all' } });
const cell = (rows: (string | number | boolean | Date | null)[][], r: number, c: number) => String(rows[r - 1]?.[c - 1] ?? '');

// ό,τι γράφτηκε: ο τίτλος, η σύνοψη, οι υποομάδες με τα άτομά τους (Α/Α, όνομα) και η Δ
async function read(data: Buffer) {
  const wb = await Workbook.open(data); const sheets = wb.sheetNames(); const rows = await wb.values(sheets[0], 600, 30);
  const subs: { code: string; n: number; people: { no: number; key: string }[] }[] = []; const secs: Record<string, number> = {}; const when: { n: number; list: number[] }[] = [];
  let summary = '', inDelta = false; const texts: string[] = [];
  rows.forEach((row, i) => { for (const v of row) if (typeof v === 'string' && v) texts.push(v); const r = i + 1, a = cell(rows, r, 1);
    if (/^ΔΥΝΑΜΗ \d+ = /.test(a)) summary = a;
    const sec = /^([ΑΒΓ])\. [^(]*\((\d+)\)$/.exec(a); if (sec) secs[sec[1]] = Number(sec[2]);
    if (/^Δ\. ΠΟΤΕ ΓΥΡΙΖΟΥΝ/.test(a)) inDelta = true;
    const sub = /^([ΑΒΓ]\d)\. .*\((\d+)\)$/.exec(a); if (sub) subs.push({ code: sub[1], n: Number(sub[2]), people: [] });
    else if (inDelta) { if (/^\d+$/.test(cell(rows, r, 6)) && cell(rows, r, 7)) when.push({ n: Number(cell(rows, r, 6)), list: cell(rows, r, 7).split(', ').map(Number) }); }
    else if (subs.length && /^\d+$/.test(a) && cell(rows, r, 4)) subs[subs.length - 1].people.push({ no: Number(a), key: cell(rows, r, 4) + '|' + cell(rows, r, 5) }); });
  return { sheets, rows, subs, secs, summary, when, texts };
}

describe('Excel «Όλη η δύναμη»', () => {
  it('σε πολλές τυχαίες καταστάσεις: κάθε ενεργός μία φορά στο Α–Γ, σύνολα που κλείνουν, Δ = Α + Β + Γ4, όλα κεφαλαία', async () => {
    for (let seed = 1; seed <= 24; seed++) {
      const s = all(genState(1000 + seed, seed % 2 === 0, 10));
      for (const d of ['2026-10-24', '2026-10-25', '2026-10-28', '2026-10-30']) {
        const tag = 'seed ' + seed + ' ' + d;
        const r = await fillOuts(T, s, d); const x = await read(r.data); const book = dayBook(s, d);
        expect(r.warnings, tag).toEqual([]); expect(r.name).toBe('ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ ' + d.split('-').reverse().join('-') + '.xlsx'); expect(x.sheets, tag).toHaveLength(1);
        // κάθε ενεργός μία φορά, με τον Α/Α του συνεχή (1, 2, 3…)
        const found = x.subs.flatMap(g => g.people), want = activePeople(s).map(p => upper(p.last) + '|' + upper(p.first + fatherTxt(p))).sort();
        expect(found.map(p => p.key).sort(), tag).toEqual(want);
        expect(found.map(p => p.no), tag).toEqual(found.map((_p, i) => i + 1));
        // σύνολα: ΔΥΝΑΜΗ = Α + Β + Γ, ενότητες και υποομάδες όσες οι ομάδες του dayBook, ομάδα χωρίς κανέναν δεν γράφεται
        const n = (k: string) => book.filter(b => b.g[0] === k).length;
        expect(x.summary, tag).toBe('ΔΥΝΑΜΗ ' + book.length + ' = Α ' + n('A') + ' + Β ' + n('B') + ' + Γ ' + n('G'));
        expect(x.secs, tag).toEqual(Object.fromEntries([['Α', n('A')], ['Β', n('B')], ['Γ', n('G')]].filter(e => e[1])));
        expect(x.subs.map(g => [g.code, g.n]), tag).toEqual(DAY_GROUPS.map(([g]) => [{ A: 'Α', B: 'Β', G: 'Γ' }[g[0] as 'A'] + g[1], book.filter(b => b.g === g).length] as [string, number]).filter(e => e[1]));
        for (const g of x.subs) expect(g.people.length, tag + ' ' + g.code).toBe(g.n);
        // Δ: όσοι του Α, του Β και του Γ4, με το πλήθος σωστό
        const delta = x.subs.filter(g => /^[ΑΒ]/.test(g.code) || g.code === 'Γ4').flatMap(g => g.people.map(p => p.no)).sort((a, b) => a - b);
        expect(x.when.flatMap(w => w.list).sort((a, b) => a - b), tag).toEqual(delta);
        for (const w of x.when) expect(w.list.length, tag).toBe(w.n);
        // κεφαλαία παντού
        for (const t of x.texts) expect(upper(t), tag + ' «' + t + '»').toBe(t);
      }
    }
  }, 180000);
  it('τίτλος με τη μέρα, ώρες, ΠΡΟΣΟΧΗ στις παρατηρήσεις και στήλη ΓΥΡΝΑ / ΓΙΑΤΙ ΜΕΝΕΙ', async () => {
    const s = all(genState(1008, true, 10));
    const x = await read((await fillOuts(T, s, '2026-10-30')).data);
    expect(x.texts).toContain('ΕΞΟΔΟΥΧΟΙ ΚΑΙ ΔΥΝΑΜΗ ΤΗΣ ΠΑΡΑΣΚΕΥΗΣ 30-10-2026');
    expect(x.texts.some(t => /^ΕΞΟΔΟΣ \d\d:\d\d · ΕΠΙΣΤΡΟΦΗ ΕΞΟΔΟΥΧΩΝ \d\d:\d\d · ΕΠΙΣΤΡΟΦΗ ΔΝ \d\d:\d\d · ΑΥΡΙΟ ΕΚΠΑΙΔΕΥΣΗ (ΝΑΙ|ΟΧΙ)$/.test(t))).toBe(true);
    expect(x.texts).toContain('ΓΥΡΝΑ'); expect(x.texts).toContain('ΓΙΑΤΙ ΜΕΝΕΙ');
  });
  it('χωρίς κανέναν ενεργό: γράφεται χωρίς σφάλμα, με μία γραμμή «—»', async () => {
    const s0 = fakeState(3); const s = all({ ...s0, people: s0.people.map(p => ({ ...p, active: false })) });
    const r = await fillOuts(T, s, '2026-10-30'); const x = await read(r.data);
    expect(r.warnings).toEqual([]); expect(x.texts).toContain('ΔΥΝΑΜΗ 0 = Α 0 + Β 0 + Γ 0'); expect(x.texts).toContain('—'); expect(x.when).toEqual([]);
  });
});
