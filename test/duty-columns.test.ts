// Έλεγχος υπηρεσιών: στήλες ημερών με ημερομηνίες ή σε άλλη γραμμή, και άγνωστοι κωδικοί με «τι σημαίνει».
import { describe, it, expect } from 'vitest';
import type { AppState } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { readDuty } from '../src/shared/codes';
import { bestFor, dayColumns, planDuties, type SourceBinding } from '../src/shared/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
const D = (iso: string) => new Date(iso + 'T00:00:00Z');
const HEAD = ['Α/Α', 'ΒΘΜ', 'Ο-Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΘΑΛΑΜΟΣ', 'ΣΥΝΟΛΟ'];
const rowsOf = (s: AppState, cells: Record<string, string>, n: number) => s.people.slice(0, 4).map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.room, 0, ...Array.from({ length: n }, (_, d) => cells[i + ':' + (d + 1)] || null)]);
const bind = (sh: RawSheet, d1?: number): SourceBinding => { const x = bestFor('duties', [sh])!; return { file: 'x', sheet: sh.name, header: x.header, cols: { ...x.cols, ...(d1 != null ? { d1 } : {}) }, write: true }; };

describe('στήλες ημερών', () => {
  it('επικεφαλίδες με ημερομηνίες (μέρα του μήνα)', () => {
    const s = fakeState(6); const days = Array.from({ length: 30 }, (_, i) => D('2026-09-' + String(i + 1).padStart(2, '0')));
    const sh: RawSheet = { name: 'Ε', rows: [['ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ 2026'], [...HEAD, ...days], ...rowsOf(s, { '0:3': 'Θ1α' }, 30)] };
    expect(dayColumns(sh.rows[1])).toHaveLength(30);
    const b = bind(sh); expect(b.cols.d1).toBe(7);
    const p = planDuties(sh, b, s, '2026-09', TODAY);
    expect(p.days.map(d => [d.date, d.adds[0].k])).toEqual([['2026-09-03', 'th1']]); expect(p.warn).toBeUndefined();
  });
  it('οι αριθμοί των ημερών στη γραμμή κάτω από τις επικεφαλίδες· λιγότερες στήλες από τον μήνα: ⚠', () => {
    const s = fakeState(6);
    const sh: RawSheet = { name: 'Ε', rows: [['ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ 2026'], [...HEAD, 'ΗΜΕΡΕΣ'], [null, null, null, null, null, null, null, ...Array.from({ length: 28 }, (_, i) => i + 1)], ...rowsOf(s, { '1:5': 'Μ2' }, 28)] };
    const b = bind(sh, 7);
    const p = planDuties(sh, b, s, '2026-09', TODAY);
    expect(p.days.map(d => d.date)).toEqual(['2026-09-05']);
    expect(p.warn?.join(' ')).toMatch(/28 στήλες ημερών.*30/);
  });
});

describe('άγνωστοι κωδικοί: τι σημαίνει ο καθένας', () => {
  it('θέση, είδος χωρίς θέση, ή αγνόησε', () => {
    const s0 = fakeState(4);
    const st = { ...s0.settings, dutyCodeAliases: { 'ΠΥ': 'mg2', 'ΦΡ': 'kind:other', 'Χ': 'ignore' } };
    expect(readDuty('ΠΥ', s0.settings)).toBe('unknown');
    expect([readDuty('πυ', st), readDuty('ΦΡ', st), readDuty('Χ', st)]).toEqual([{ k: 'mg2', kind: 'mg' }, { kind: 'other' }, null]);
  });
});
