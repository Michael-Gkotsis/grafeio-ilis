// ΣΤΕΠ με στήλη στην ΗΚΑΙ (Michael, 29/10): ό,τι ισχύει όταν το STEP_COL δεν είναι null (π.χ. 'ey'). Μόνο ψεύτικα ονόματα.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fakeState } from './fixtures';

const D = '2026-10-22', D2 = '2026-10-23';
let seq = 0;
const st = (pid: number, type: string, from: string, to: string, x: Record<string, unknown> = {}) => ({ id: 'c' + ++seq, pid, type, from, to, ...x }) as any;
let R: typeof import('../src/shared/rules'), SV: typeof import('../src/shared/strengthView'), DM: typeof import('../src/shared/domain'), V: typeof import('../src/shared/values');
beforeAll(async () => {
  vi.resetModules();
  vi.doMock('../src/shared/domain', async importOriginal => ({ ...(await importOriginal<typeof import('../src/shared/domain')>()), STEP_COL: 'ey' }));
  R = await import('../src/shared/rules'); SV = await import('../src/shared/strengthView'); DM = await import('../src/shared/domain'); V = await import('../src/shared/values');
});

describe('ΣΤΕΠ με STEP_COL = ey', () => {
  it('η ΗΚΑΙ τον μετρά κωλυόμενο στη στήλη, μία φορά, πάνω από υπηρεσία και ΕΥ· δεν είναι απών', () => {
    expect(DM.STEP_COL).toBe('ey');
    const base = { ...fakeState(30), guards: { [D]: { th1: 3, th2: 4 } } }, h0 = R.hkaiCounts(base, D);
    const s = { ...base, statuses: [st(3, 'STEP', D, D2), st(5, 'STEP', D, D), st(5, 'EY', D, D)] };
    const h = R.hkaiCounts(s, D), v = R.kolView(s, D);
    expect(h.cols.ey.map(p => p.id).sort()).toEqual([3, 5]); expect(h.cols.yp.map(p => p.id)).not.toContain(3);
    expect(h.kol).toBe(h0.kol + 1);   // ο 3 άλλαξε στήλη (Υπηρεσία → ΕΥ), ο 5 είναι καινούργιος (ΣΤΕΠ πάνω από ΕΥ)
    expect(h.apo).toBe(h0.apo); expect(R.strengthOf(s, D).absent).toBe(0);
    expect(v.minus.map(x => [x.p.id, x.col]).sort()).toEqual([[3, 'ey'], [5, 'ey']]);
    expect(h.cols.ey.map(p => p.id).sort()).toEqual(v.cols.ey.map(p => p.id).sort());
  });
  it('δηλωμένος κωλυόμενος με αφαίρεση νικά τον ΣΤΕΠ· Δύναμη: η στήλη φαίνεται ως ετικέτα', () => {
    const s = { ...fakeState(30), statuses: [st(3, 'STEP', D, D), st(3, 'KOL', D, D, { note: 'Συνοδεία', minus: true, hkCol: 'mag' }), st(4, 'STEP', D, D)] };
    const h = R.hkaiCounts(s, D); expect(h.cols.mag.map(p => p.id)).toEqual([3]); expect(h.cols.ey.map(p => p.id)).toEqual([4]);
    const v = SV.strengthView(s, D, 480);
    expect(v.kol).toBe(2); expect(v.present + v.kol + v.absent).toBe(v.total);
    expect(v.cats.kol.groups.find(g => g.key === 'step')!.rows[0].tag).toBe(DM.kolColName('ey'));
  });
  it('οι πίνακες τιμών: «Κωλυόμενοι στη στήλη …» και «Παρόντες» τον μετρούν', () => {
    const s = { ...fakeState(30), statuses: [st(4, 'STEP', D, D)] }, at = R.hkMin(s.rules);
    const ev = (m: string) => V.evalValue(s, D, at, [{ sign: '+', metric: m }]);
    expect(ev('kol.col:ey')).toBe(1); expect(ev('kol.col:yp')).toBe(0); expect(ev('str.kol')).toBe(1);
    expect(ev('str.present')).toBe(R.strengthOf(s, D, at).present - 1);
  });
});
