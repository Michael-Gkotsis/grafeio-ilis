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

describe('Έντυπα: στοίχιση τίτλων (αριστερά, κέντρο, δεξιά)', () => {
  // η οριζόντια στοίχιση του κελιού όπως είναι γραμμένη στο xlsx (general: καμία)
  const hOf = async (data: Buffer | Uint8Array, g: unknown[][], text: string) => {
    const { r, c } = firstAt(g, text); const ref = String.fromCharCode(65 + c) + (r + 1);
    const wb = await Workbook.open(data); const s = (await wb.sheet(wb.sheetNames()[0])).style(ref);
    const z = await JSZip.loadAsync(data); const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(await z.file('xl/styles.xml')!.async('string'))![1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)!;
    return /horizontal="(\w+)"/.exec(xfs[s ?? 0])?.[1] || 'general';
  };
  const built = async (o: BuildOpts, x: Partial<Report> = {}) => { const bo = forBuild(o, rep(x)); const b = await buildTemplate(bo, 'people'); return { b, bo, g: await grid(b.data) }; };
  it('προεπιλογές: ο τίτλος πίνακα αριστερά, ο γενικός τίτλος στο κέντρο· ta1 «κέντρο» κεντράρει τον τίτλο του 1ου πίνακα, «δεξιά» τον πάει δεξιά', async () => {
    const d = await built(base({ t1: 'ΠΑΡΟΝΤΕΣ' }));
    expect(await hOf(d.b.data, d.g, 'ΠΑΡΟΝΤΕΣ')).toBe('left'); expect(await hOf(d.b.data, d.g, 'ΚΑΤΑΣΤΑΣΗ ΔΥΝΑΜΗΣ')).toBe('center');
    const c = await built(base({ t1: 'ΠΑΡΟΝΤΕΣ', ta1: 'center' })); expect(await hOf(c.b.data, c.g, 'ΠΑΡΟΝΤΕΣ')).toBe('center');
    const r = await built(base({ t1: 'ΠΑΡΟΝΤΕΣ', ta1: 'right' })); expect(await hOf(r.b.data, r.g, 'ΠΑΡΟΝΤΕΣ')).toBe('right');
    // ο τίτλος μένει στην ίδια γραμμή και στην ίδια στήλη, αλλάζει μόνο η στοίχιση
    expect(firstAt(c.g, 'ΠΑΡΟΝΤΕΣ')).toEqual(firstAt(d.g, 'ΠΑΡΟΝΤΕΣ'));
  });
  it('πίνακας 2: ta στον τίτλο του· ο τίτλος του 1ου δεν επηρεάζεται', async () => {
    const o = base({ t1: 'ΠΑΡΟΝΤΕΣ', more: [{ id: 't2', title: 'ΙΑΤΡΙΚΑ', ta: 'right', kind: 'people', cols }] });
    const d = await built(o); expect(await hOf(d.b.data, d.g, 'ΙΑΤΡΙΚΑ')).toBe('right'); expect(await hOf(d.b.data, d.g, 'ΠΑΡΟΝΤΕΣ')).toBe('left');
  });
  it('γενικός τίτλος σελίδας: tta «αριστερά» τον πάει αριστερά πάνω στην ίδια συγχωνευμένη γραμμή', async () => {
    const d = await built(base({ tta: 'left' })); const a = await built(base());
    expect(await hOf(d.b.data, d.g, 'ΚΑΤΑΣΤΑΣΗ ΔΥΝΑΜΗΣ')).toBe('left'); expect(firstAt(d.g, 'ΚΑΤΑΣΤΑΣΗ ΔΥΝΑΜΗΣ')).toEqual(firstAt(a.g, 'ΚΑΤΑΣΤΑΣΗ ΔΥΝΑΜΗΣ'));
    const rt = await built(base({ tta: 'right' })); expect(await hOf(rt.b.data, rt.g, 'ΚΑΤΑΣΤΑΣΗ ΔΥΝΑΜΗΣ')).toBe('right');
  });
  it('τίτλος πίνακα τιμών δίπλα σε πίνακα (Spot.tt): το ta περνά από το forBuild και μπαίνει στο πρότυπο', async () => {
    const d = await built(base({ t1: 'ΠΑΡΟΝΤΕΣ' }), { bands: [['main', 'v1']], vals: [{ ...VT, ta: 'right' }] });
    expect(d.bo.vals![0].ta).toBe('right'); expect(d.b.vals![0].tt).toBe(true);
    expect(await hOf(d.b.data, d.g, 'ΣΥΝΟΛΑ')).toBe('right'); expect(await hOf(d.b.data, d.g, 'ΠΑΡΟΝΤΕΣ')).toBe('left');
    const n = await built(base({ t1: 'ΠΑΡΟΝΤΕΣ' }), { bands: [['main', 'v1']], vals: [VT] }); expect(n.bo.vals![0]).not.toHaveProperty('ta'); expect(await hOf(n.b.data, n.g, 'ΣΥΝΟΛΑ')).toBe('left');
  });
  it('τίτλος πίνακα τιμών που γράφεται όταν βγαίνει το έντυπο (στο τέλος): το ta της στοίχισης στο κελί του τίτλου', async () => {
    for (const [ta, want] of [['center', 'center'], ['right', 'right'], [undefined, 'left']] as const) {
      const s = fakeState(40); const r0 = rep({ vals: [{ ...VT, ...(ta ? { ta } : {}) }] }); const bo = forBuild(base(), r0); const b = await buildTemplate(bo, 'people');
      const r = withBuilt(r0, b, bo); r.sigs = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }];
      const out = await fillReport(b.data, s, r, s.people.slice(0, 5).map(p => p.id), D, { clock });
      expect(await hOf(out.data, await grid(out.data), 'ΣΥΝΟΛΑ'), String(ta)).toBe(want);
    }
  });
  it('μετά το γέμισμα, ο τίτλος πίνακα τιμών δίπλα σε πίνακα (Spot.tt) δεν διπλογράφεται και μένει κεντραρισμένος', async () => {
    const s = fakeState(40); const r0 = rep({ bands: [['main', 'v1']], vals: [{ ...VT, ta: 'center' }] }); const bo = forBuild(base(), r0); const b = await buildTemplate(bo, 'people');
    const r = withBuilt(r0, b, bo); r.sigs = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }];
    const out = await fillReport(b.data, s, r, s.people.slice(0, 5).map(p => p.id), D, { clock }); const g = await grid(out.data);
    expect(at(g, 'ΣΥΝΟΛΑ')).toHaveLength(1); expect(await hOf(out.data, g, 'ΣΥΝΟΛΑ')).toBe('center');
  });
  it('χωρίς στοίχιση (ή με τις προεπιλογές «αριστερά» / «κέντρο») το πρότυπο βγαίνει ίδιο με πριν', async () => {
    const x = { t1: 'ΠΑΡΟΝΤΕΣ', more: [{ id: 't2', title: 'ΙΑΤΡΙΚΑ', kind: 'people' as const, cols }] };
    const a = await buildTemplate(base(x), 'people');
    const b = await buildTemplate(base({ ...x, ta1: 'left', tta: 'center', more: [{ ...x.more[0], ta: 'left' }] }), 'people');
    expect(await parts(b.data)).toEqual(await parts(a.data));
  });
});
