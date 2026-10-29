// Έντυπα (Michael, 29/10): ο 1ος πίνακας έχει δικό του τίτλο (t1), χωριστό από τον γενικό τίτλο της σελίδας
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { defaultPick, forBuild, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-10-19', clock = { today: D, now: 12 * 60 };
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }, { f: 'room', h: 'ΘΑΛ', w: 'narrow' as const }];
const base = (x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΚΑΤΑΣΤΑΣΗ ΔΥΝΑΜΗΣ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols, ...x });
const VT = { id: 'v1', title: 'ΣΥΝΟΛΑ', rows: [{ label: 'Σε δύναμη', expr: [{ sign: '+' as const, metric: 'str.total' }] }] };
const grid = async (data: Buffer | Uint8Array) => { const wb = await Workbook.open(data); return wb.values(wb.sheetNames()[0], 200, 40); };
const at = (g: unknown[][], text: string): { r: number; c: number }[] => g.flatMap((row, r) => row.map((v, c) => (v === text ? { r, c } : null)).filter(Boolean) as { r: number; c: number }[]);
const firstAt = (g: unknown[][], text: string) => { const x = at(g, text)[0]; expect(x, text).toBeTruthy(); return x; };
// όλα τα αρχεία του xlsx (εκτός από τις ώρες του zip) · ίδια με ίδια byte
const parts = async (data: Buffer | Uint8Array) => { const z = await JSZip.loadAsync(data); const o: Record<string, string> = {}; for (const n of Object.keys(z.files).sort()) if (!z.files[n].dir) o[n] = (await z.files[n].async('nodebuffer')).toString('base64'); return o; };

describe('Έντυπα: τίτλος του 1ου πίνακα (t1)', () => {
  it('ο t1 μπαίνει μία γραμμή πάνω από τις επικεφαλίδες του 1ου πίνακα, ο γενικός τίτλος μένει μόνος του στη συγχωνευμένη γραμμή και το γέμισμα βρίσκει τις επικεφαλίδες', async () => {
    const s = fakeState(40); const r0 = rep({}); const o = base({ t1: 'ΠΑΡΟΝΤΕΣ' }); const bo = forBuild(o, r0); const b = await buildTemplate(bo, 'people');
    const g = await grid(b.data); const t = firstAt(g, 'ΠΑΡΟΝΤΕΣ'), h = firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'), pg = firstAt(g, 'ΚΑΤΑΣΤΑΣΗ ΔΥΝΑΜΗΣ');
    expect(t.r).toBe(h.r - 1); expect(t.c).toBe(0); expect(pg.r).toBeLessThan(t.r);
    expect(b.head).toBe(h.r + 1);   // το head του προτύπου δείχνει στην επικεφαλίδα, όχι στον τίτλο
    expect(at(g, 'ΠΑΡΟΝΤΕΣ')).toHaveLength(1);
    expect(g[pg.r].filter(v => v === 'ΠΑΡΟΝΤΕΣ')).toHaveLength(0);
    const r = withBuilt(r0, b, bo); r.sigs = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }];
    const ids = s.people.slice(0, 12).map(p => p.id);
    const out = await fillReport(b.data, s, r, ids, D, { clock }); const f = await grid(out.data);
    const fh = firstAt(f, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'), ft = firstAt(f, 'ΠΑΡΟΝΤΕΣ');
    expect(ft.r).toBe(fh.r - 1);
    const names = ids.map(i => s.people.find(p => p.id === i)!).map(p => (p.last || '').toString());
    const below = f.slice(fh.r + 1, fh.r + 13).map(row => String(row[1] ?? ''));
    expect(below.filter(Boolean)).toHaveLength(12);
    for (const n of names) expect(below.some(x => x.includes(n)), n).toBe(true);
    expect(f.slice(0, fh.r).flat().some(v => typeof v === 'string' && names.some(n => n && String(v).includes(n)))).toBe(false);
  });
  it('t1 δίπλα σε πίνακα τιμών στην ίδια ζώνη: ο τίτλος του 1ου και ο τίτλος του πίνακα τιμών είναι στην ίδια γραμμή', async () => {
    const r0 = rep({ bands: [['main', 'v1']], vals: [VT] }); const o = base({ t1: 'ΠΑΡΟΝΤΕΣ' }); const bo = forBuild(o, r0); const b = await buildTemplate(bo, 'people');
    const g = await grid(b.data); const a = firstAt(g, 'ΠΑΡΟΝΤΕΣ'), v = firstAt(g, 'ΣΥΝΟΛΑ'), h = firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ');
    expect(a.r).toBe(v.r); expect(a.c).toBeLessThan(v.c); expect(h.r).toBe(a.r + 1);
  });
  it('χωρίς t1 το πρότυπο βγαίνει ίδιο με t1: «» (και με κενά t1 δεν μπαίνει γραμμή τίτλου)', async () => {
    for (const x of [{}, { more: [{ id: 't2', title: 'ΔΕΥΤΕΡΟΣ', kind: 'people' as const, cols }] }, { head: false, date: false }]) {
      const a = await buildTemplate(forBuild(base(x), rep({})), 'people'), b = await buildTemplate(forBuild(base({ ...x, t1: '' }), rep({})), 'people');
      expect(await parts(b.data)).toEqual(await parts(a.data)); expect(b.head).toBe(a.head); expect(b.cells).toEqual(a.cells);
    }
    const a = await buildTemplate(base(), 'people'), c = await buildTemplate(base({ t1: '   ' }), 'people');
    expect(c.head).toBe(a.head); expect(await parts(c.data)).toEqual(await parts(a.data));
  });
});
