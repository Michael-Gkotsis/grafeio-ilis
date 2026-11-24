// Ανενεργή υπηρεσία (Ρυθμίσεις › Υπηρεσίες › «Ενεργή» off): ο πίνακας ή οι γραμμές της δεν μένουν στο Excel ΦΡΟΥΡΑ.
// Όταν ο πίνακας είναι μόνος του στις γραμμές του, οι γραμμές σβήνονται και ό,τι είναι από κάτω ανεβαίνει (συγχωνεύσεις,
// περιοχή εκτύπωσης, υπογραφές)· όταν είναι δίπλα σε άλλον πίνακα αδειάζει μόνο το κομμάτι του. Χωρίς ανενεργές: όπως πάντα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fillFroura } from '../src/main/exports';
import { previewOf } from '../src/main/formPreview';
import { Workbook } from '../src/main/xlsx';
import { blocksOf, withBlocks, type AppState, type BlockDef } from '../src/shared/domain';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const D = '2026-10-12';
const mk = (phase: string): AppState => { const s = fakeState(60); return { ...s, settings: { ...s.settings, phase } }; };
const setBlocks = (s: AppState, phase: string, f: (b: BlockDef[]) => BlockDef[]): AppState => ({ ...s, settings: withBlocks(s.settings, phase, f(blocksOf(s.settings, phase))) });
const off = (s: AppState, ids: string[], phase = 'sven'): AppState => setBlocks(s, phase, bs => bs.map(b => (ids.includes(b.id) ? { ...b, hidden: true } : b)));
async function out(s: AppState, tpl = 'froura.xlsx', phase = 'sven') {
  const r = await fillFroura(T(tpl), s, D, phase);
  const ws = await (await Workbook.open(r.data)).sheet(0);
  return { ws, d: ws.dump(), r };
}
const rowOf = (cells: Record<string, string>, re: RegExp) => { const k = Object.keys(cells).find(x => re.test(cells[x])); return k ? Number(k.replace(/^[A-Z]+/, '')) : 0; };
const rowsWith = (cells: Record<string, string>) => new Set(Object.keys(cells).map(k => Number(k.replace(/^[A-Z]+/, ''))));

describe('ΦΡΟΥΡΑ: ανενεργή υπηρεσία', () => {
  it('μαγειρεία ανενεργά: ο πίνακας φεύγει, ό,τι είναι από κάτω ανεβαίνει, οι υπογραφές μένουν', async () => {
    const s = mk('sven');
    const a = await out(s); const b = await out(off(s, ['mg']));
    expect(Object.values(a.d.cells).some(v => /ΜΑΓΕΙΡΕΙΑ/.test(v))).toBe(true);
    expect(Object.values(b.d.cells).some(v => /ΜΑΓΕΙΡΕΙΑ/.test(v))).toBe(false);
    const pa = rowOf(a.d.cells, /^ΤΙΜΩΡΗΜΕΝΟΙ$/), pb = rowOf(b.d.cells, /^ΤΙΜΩΡΗΜΕΝΟΙ$/);
    expect(pb).toBeGreaterThan(0); expect(pb).toBeLessThan(pa);
    const k = pa - pb;   // πόσες γραμμές έφυγαν
    expect(rowOf(b.d.cells, /^ΑΛΧΙΑΣ ΙΛΗΣ$/)).toBe(rowOf(a.d.cells, /^ΑΛΧΙΑΣ ΙΛΗΣ$/) - k);
    // καμία κενή τρύπα: ανάμεσα στους πίνακες θαλαμοφυλάκων και στους ΤΙΜΩΡΗΜΕΝΟΥΣ μένει μία κενή γραμμή
    const used = rowsWith(b.d.cells);
    expect(used.has(pb - 1)).toBe(false); expect(used.has(pb - 2)).toBe(true);
    // συγχωνεύσεις και περιοχή εκτύπωσης ανεβαίνουν μαζί
    expect(b.d.merges).toContain('A' + pb + ':F' + pb);
    expect(b.d.merges.some(m => /^F2[6-9]|^F3[01]/.test(m))).toBe(false);
    expect(b.d.print).toBe(a.d.print);
    // οι θαλαμοφύλακες δεν αλλάζουν
    for (const ref of ['B12', 'C12', 'J12', 'D13', 'K24', 'A5', 'A9']) expect(b.d.cells[ref]).toBe(a.d.cells[ref]);
  });
  it('Λ/Υ και Δ/Υ ανενεργά: οι δύο γραμμές φεύγουν', async () => {
    const s = mk('sven');
    const a = await out(s); const b = await out(off(s, ['ly']));
    expect(Object.values(b.d.cells).some(v => /^(Λ|Δ)\/Υ:/.test(v))).toBe(false);
    expect(rowOf(b.d.cells, /^ΘΑΛΑΜΟΦΥΛΑΚΕΣ$/)).toBe(rowOf(a.d.cells, /^ΘΑΛΑΜΟΦΥΛΑΚΕΣ$/) - 2);
    expect(rowOf(b.d.cells, /^ΑΛΧΙΑΣ ΙΛΗΣ$/)).toBe(rowOf(a.d.cells, /^ΑΛΧΙΑΣ ΙΛΗΣ$/) - 2);
    expect(b.d.merges).not.toContain('A9:D9'); expect(b.d.merges).not.toContain('A10:E10');
  });
  it('πίνακας δίπλα σε άλλον (β΄ θαλαμοφύλακες): αδειάζει μόνο το κομμάτι του, οι γραμμές μένουν', async () => {
    const s = mk('sven');
    const a = await out(s); const b = await out(off(s, ['th2']));
    expect(a.d.cells.J12).toBe('ΘΑΛΑΜΟΦΥΛΑΚΕΣ'); expect(b.d.cells.J12).toBeUndefined();
    expect(b.d.cells.I13).toBeUndefined(); expect(b.d.cells.K13).toBeUndefined();
    expect(b.d.cells.C12).toBe('ΘΑΛΑΜΟΦΥΛΑΚΕΣ'); expect(b.d.cells.D13).toBe(a.d.cells.D13);
    expect(rowOf(b.d.cells, /^ΤΙΜΩΡΗΜΕΝΟΙ$/)).toBe(rowOf(a.d.cells, /^ΤΙΜΩΡΗΜΕΝΟΙ$/));
    expect(b.d.merges).not.toContain('J13:J15');
  });
  it('δική σου υπηρεσία ανενεργή: ούτε ο πίνακάς της', async () => {
    const mine: BlockDef = { id: 'c1', kind: 'other', name: 'Πύλη', armed: false, custom: true, posts: [{ k: 'c1a', label: 'Πύλη 1', short: '1' }, { k: 'c1b', label: 'Πύλη 2', short: '2' }] };
    const base = mk('sven'); const withMine = setBlocks(base, 'sven', bs => [...bs, mine]);
    const on = await out(withMine); const hid = await out(off(withMine, ['c1'])); const none = await out(base);
    expect(Object.values(on.d.cells).some(v => /ΠΥΛΗ/.test(v))).toBe(true);
    expect(Object.values(hid.d.cells).some(v => /ΠΥΛΗ/.test(v))).toBe(false);
    expect(hid.d.cells).toEqual(none.d.cells); expect(hid.d.merges.slice().sort()).toEqual(none.d.merges.slice().sort());
  });
  it('ΣΠΕΝ: μαγειρεία δίπλα στους σκοπούς και ΤΑΕ από κάτω, ανενεργά: ούτε ΜΑΓΕΙΡΕΙΑ ούτε ΤΑΕ, οι σκοποί μένουν', async () => {
    const s = mk('spen');
    const b = await out(off(s, ['mg', 'tae'], 'spen'), 'froura-spen.xlsx', 'spen');
    const vs = Object.values(b.d.cells);
    expect(vs.some(v => /ΜΑΓΕΙΡΕΙΑ/.test(v))).toBe(false); expect(vs.includes('ΤΑΕ')).toBe(false);
    expect(b.d.cells.J26).toBe('ΣΚΟΠΟΙ');
  });
  it('τίποτα ανενεργό: ίδια κελιά με το έντυπο όπως πάντα', async () => {
    const s = mk('sven');
    const a = await out(s); const b = await out(setBlocks(s, 'sven', bs => bs.map(x => ({ ...x, hidden: false }))));
    expect(b.d).toEqual(a.d);
    expect(a.d.cells.F26).toBe('ΜΑΓΕΙΡΕΙΑ '); expect(a.d.cells.A34).toBe('ΤΙΜΩΡΗΜΕΝΟΙ');
  });
  it('κενές θέσεις της προεπισκόπησης: μετακινούνται μαζί με τις γραμμές', async () => {
    const s = mk('sven');
    const a = await out(s); const b = await out(off(s, ['th', 'th2']));
    const k = rowOf(a.d.cells, /^ΜΑΓΕΙΡΕΙΑ/) - rowOf(b.d.cells, /^ΜΑΓΕΙΡΕΙΑ/);
    expect(k).toBeGreaterThan(0);
    const ea = a.r.empty!, eb = b.r.empty!;
    // οι θέσεις των μαγειρείων κατεβαίνουν k γραμμές πάνω· των θαλαμοφυλάκων φεύγουν
    const mg = ea.filter(x => /^F(2[7-9]|3[01])$/.test(x));
    expect(mg.length).toBe(5);
    expect(eb.slice().sort()).toEqual(mg.map(x => 'F' + (Number(x.slice(1)) - k)).sort());
    for (const ref of eb) {
      const r = Number(ref.slice(1));
      expect(b.ws.get(ref)).toBeNull();                                  // το κελί είναι κενό
      expect(b.ws.get('E' + r)).toBe(a.ws.get('E' + (r + k)));           // και η ετικέτα της γραμμής του («1ο»…) είναι η ίδια
    }
    // ανενεργά μαγειρεία: οι κενές θέσεις τους δεν μένουν
    const c = await out(off(s, ['mg']));
    expect(c.r.empty!.some(x => /^F(2[6-9]|3[01])$/.test(x))).toBe(false);
    expect(c.r.empty!.sort()).toEqual(ea.filter(x => !/^F(2[7-9]|3[01])$/.test(x)).sort());
  });
  it('προεπισκόπηση: χωρίς ΜΑΓΕΙΡΕΙΑ και όχι περισσότερες σελίδες', async () => {
    const s = mk('sven');
    const a = await out(s); const b = await out(off(s, ['mg']));
    const pa = await previewOf({ name: a.r.name, data: a.r.data, warnings: a.r.warnings, empty: a.r.empty, sheet: a.r.sheet });
    const pb = await previewOf({ name: b.r.name, data: b.r.data, warnings: b.r.warnings, empty: b.r.empty, sheet: b.r.sheet });
    expect(pa.sheets.map(x => x.html).join('')).toContain('ΜΑΓΕΙΡΕΙΑ');
    expect(pb.sheets.map(x => x.html).join('')).not.toContain('ΜΑΓΕΙΡΕΙΑ');
    const n = (p: typeof pa) => p.sheets.reduce((x, y) => x + y.pages, 0);
    expect(n(pb)).toBeLessThanOrEqual(n(pa));
  });
  it('περιοχή εκτύπωσης: μικραίνει όσο οι γραμμές που σβήστηκαν και οι υπογραφές μένουν τελευταίες', async () => {
    const s = mk('sven');
    const a = await out(s); const b = await out(off(s, ['mg']));
    const k = rowOf(a.d.cells, /^ΤΙΜΩΡΗΜΕΝΟΙ$/) - rowOf(b.d.cells, /^ΤΙΜΩΡΗΜΕΝΟΙ$/);
    const last = (c: Record<string, string>) => Math.max(...Object.keys(c).map(x => Number(x.replace(/^[A-Z]+/, ''))));
    expect(last(b.d.cells)).toBe(last(a.d.cells) - k);
    expect(last(b.d.cells)).toBe(rowOf(b.d.cells, /^ΑΛΧΙΑΣ ΙΛΗΣ$/));   // οι υπογραφές είναι το τελευταίο περιεχόμενο
    const wa = await Workbook.open(a.r.data), wb = await Workbook.open(b.r.data);
    const na = wa.printLastRow(a.r.sheet!), nb = wb.printLastRow(b.r.sheet!);
    if (na != null) expect(nb).toBe(na - k);
  });
});
