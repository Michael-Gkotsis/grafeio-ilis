// Άγνοια, Λιποταξία, Αδικαιολόγητη απουσία (Michael, 17/11): απών, σε καμία υπηρεσία, όχι έξοδο, στη στήλη «Αγνοούμενοι / Αδικαιολογήτως Απών»
// της ΗΚΑΙ (adik) και στο 6. ΛΟΙΠΑ της πίσω όψης (έναρξη και επιστροφή). Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fillHkai } from '../src/main/exports';
import { backEntries } from '../src/main/backFill';
import { Workbook } from '../src/main/xlsx';
import { formatOf } from '../src/shared/backForm';
import { isAway } from '../src/shared/ranks';
import { dutyBlock, hkaiCounts, hkaiClassify, outBlock, strengthOf, hkMin } from '../src/shared/rules';
import { hkaiAdikLines, lineText } from '../src/shared/hkaiText';
import { awayName } from '../src/shared/outsStay';
import { ADIK_TYPES, TYPES, type AppState, type Status, type TypeKey } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-15';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'q' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const decl = (s: AppState, type: TypeKey, pid: number, from: string, to: string, extra: Record<string, unknown> = {}) =>
  run(s, { t: 'declare', cmd: { type, pids: [pid], from, to, ...extra } as any });

describe('ιδιότητες των τριών καταστάσεων', () => {
  it('απών, καμία υπηρεσία, όχι έξοδο, στήλη adik', () => {
    for (const k of ADIK_TYPES) { const t = TYPES[k]; expect(t.away && t.noDuty && t.noOut && t.hkai === 'adik').toBe(true); expect(isAway({ type: k })).toBe(true); }
  });
  it('οι οθόνες τις λένε «Σε άγνοια», «Σε λιποταξία», «Σε αδικαιολόγητη απουσία»', () => {
    expect(ADIK_TYPES.map(k => awayName({ type: k }))).toEqual(['Σε άγνοια', 'Σε λιποταξία', 'Σε αδικαιολόγητη απουσία']);
    expect(awayName({ type: 'LEAVE' })).toBe('Σε άδεια');
  });
});

describe('μέτρηση στην ΗΚΑΙ και στη Δύναμη', () => {
  it('μετρά στη στήλη adik, προστίθεται σε ό,τι γράφτηκε με το χέρι, και αφαιρείται από τους διαθέσιμους', () => {
    let s = fakeState(12);
    const base = hkaiCounts(s, D);
    s = decl(s, 'AGN', 3, D, '2026-10-17'); s = decl(s, 'LIP', 4, '2026-10-10', '2026-10-20'); s = decl(s, 'ADK', 5, D, D);
    const h = hkaiCounts(s, D);
    expect(h.cols.adik.map(p => p.id).sort()).toEqual([3, 4, 5]);
    expect(h.apo).toBe(base.apo + 3); expect(h.avail).toBe(base.avail - 3);
    // με το χέρι: +2 στη γραμμή των Στρατιωτών· το αυτόματο προστίθεται
    const row = Object.keys(h.rank).find(r => h.cols.adik.some(p => h.rank[r].c.adik))!;
    const man = run(s, { t: 'setHkaiManual', date: D, manual: { cells: { [row]: { adik: 2 } }, text: {} } });
    const h2 = hkaiCounts(man, D);
    expect(h2.rank[row].c.adik).toBe(h.rank[row].c.adik + 2); expect(h2.apo).toBe(h.apo + 2);
    // η στήλη της κάθε μέρας: μετά τη λήξη ή πριν την έναρξη όχι
    expect(hkaiCounts(s, '2026-10-18').cols.adik.map(p => p.id)).toEqual([4]);
    expect(hkaiCounts(s, '2026-10-09').cols.adik).toEqual([]);
    // ο ίδιος ένας άνθρωπος, μία στήλη: ακόμα και με άδεια την ίδια μέρα
    const both = decl(s, 'LEAVE', 3, D, D, { kind: 'Κανονική' });
    expect(hkaiClassify(both, D).who.filter(w => w.p?.id === 3 && w.col).length).toBe(1);
  });
  it('Σήμερα και Δύναμη: απών· στη λήξη (επόμενη μέρα) παρών', () => {
    let s = fakeState(12); const total = 12;
    s = decl(s, 'AGN', 3, D, D); s = decl(s, 'ADK', 4, D, D, { open: true });
    const at = hkMin(s.rules);
    const c = strengthOf(s, D, at);
    expect(c.absent).toBe(2); expect(c.present).toBe(total - 2); expect(c.away.AGN).toBe(1); expect(c.away.ADK).toBe(1);
    const n = strengthOf(s, '2026-10-16', at);
    expect(n.absent).toBe(1);   // η «χωρίς λήξη» συνεχίζει
  });
  it('ούτε υπηρεσία ούτε έξοδο', () => {
    let s = fakeState(12);
    s = decl(s, 'LIP', 3, D, '2026-10-17');
    expect(dutyBlock(s.statuses, D, 3, { armed: false })).toMatch(/Λιποταξία/);
    expect(dutyBlock(s.statuses, D, 3, { armed: true })).not.toBeNull();
    expect(outBlock(s, D, 3)).toBeTruthy();
    expect(dutyBlock(s.statuses, '2026-10-18', 3, { armed: false })).toBeNull();
  });
});

describe('πίσω όψη: 6. ΛΟΙΠΑ', () => {
  const st = (type: TypeKey, pid: number, from: string, to: string, extra: Partial<Status> = {}): Status => ({ id: 'z' + ++seq, pid, type, from, to, ...extra });
  it('έναρξη και επιστροφή, με σημείωση, αριθμημένες, κεφαλαία', () => {
    const s = fakeState(12);
    s.statuses = [st('AGN', 3, D, '2026-10-17'), st('ADK', 5, D, '2026-10-15', { note: 'διότι δεν επέστρεψε από 3ήμερη κανονική άδεια' }), st('LIP', 4, '2026-10-12', '2026-10-14')];
    expect(hkaiAdikLines(s, D).map(lineText)).toEqual([
      '1. ΣΤΡ (ΠΖ) ΠΛΑΣΜΑΤΙΚΟΣ ΕΨΙΛΟΝ: ΣΕ ΑΔΙΚΑΙΟΛΟΓΗΤΗ ΑΠΟΥΣΙΑ ΤΗΝ 15 ΟΚΤ 26 ΔΙΟΤΙ ΔΕΝ ΕΠΕΣΤΡΕΨΕ ΑΠΟ 3ΗΜΕΡΗ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ.',
      '2. ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ: ΣΕ ΑΓΝΟΙΑ ΤΗΝ 15 ΟΚΤ 26.',
      '3. ΣΤΡ (ΠΖ) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ: ΕΠΕΣΤΡΕΨΕ ΤΗΝ 15 ΟΚΤ 26 ΑΠΟ ΛΙΠΟΤΑΞΙΑ.'
    ]);
    // την ενδιάμεση μέρα και χωρίς λήξη: καμία γραμμή· ανενεργός: καμία
    expect(hkaiAdikLines(s, '2026-10-19')).toEqual([]);
    s.statuses = [st('AGN', 3, '2026-10-01', '2026-10-15', { open: true })]; expect(hkaiAdikLines(s, '2026-10-19')).toEqual([]);
    s.people = s.people.map(p => (p.id === 3 ? { ...p, active: false } : p)); s.statuses = [st('AGN', 3, D, D)]; expect(hkaiAdikLines(s, D)).toEqual([]);
  });
  it('προσαρμοστική διαδρομή: στο misc, με τη μορφή και την ημερομηνία του εντύπου, πριν από το ελεύθερο κείμενο', () => {
    const s = fakeState(12);
    s.statuses = [st('LIP', 4, D, '2026-10-20'), st('AGN', 3, '2026-10-10', '2026-10-14')];
    s.hkaiManual = { [D]: { cells: {}, text: { loi: 'ΕΛΕΥΘΕΡΟ' } } };
    const misc = backEntries(s, D, formatOf(null)).filter(e => e.sec === 'misc');
    expect(misc.map(e => e.text)).toEqual(['ΣΤΡ (ΠΖ) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ: ΣΕ ΛΙΠΟΤΑΞΙΑ ΤΗΝ 15 ΟΚΤ 26.', 'ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ: ΕΠΕΣΤΡΕΨΕ ΤΗΝ 15 ΟΚΤ 26 ΑΠΟ ΑΓΝΟΙΑ.', 'ΕΛΕΥΘΕΡΟ']);
    expect(misc.map(e => e.numbered)).toEqual([true, true, false]);
    const sl = backEntries(s, D, formatOf({ date: 'slash4', line: 'person' })).filter(e => e.sec === 'misc').map(e => e.text);
    expect(sl[0]).toBe('ΣΤΡ (ΠΖ) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ : ΣΕ ΛΙΠΟΤΑΞΙΑ ΤΗΝ 15/10/2026.');
    // χωρίς τέτοια κατάσταση: ίδιο με πριν
    const plain = fakeState(12); plain.hkaiManual = s.hkaiManual;
    expect(backEntries(plain, D, formatOf(null)).filter(e => e.sec === 'misc').map(e => e.text)).toEqual(['ΕΛΕΥΘΕΡΟ']);
  });
  it('κλασική ΗΚΑΙ: στο 6. ΛΟΙΠΑ πριν από το ελεύθερο κείμενο· χωρίς κατάσταση μόνο το ελεύθερο κείμενο', async () => {
    const find = async (s: AppState) => { const bk = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(1); return [...bk.cells()].map(c => bk.get(colRef(c))).filter((v): v is string => !!v && /ΕΛΕΥΘΕΡΟ|ΑΓΝΟΙΑ/.test(v)); };
    const colRef = (c: { r: number; c: number }) => String.fromCharCode(64 + c.c) + c.r;
    const s0 = fakeState(12); s0.hkaiManual = { [D]: { cells: {}, text: { loi: 'ΕΛΕΥΘΕΡΟ' } } };
    expect(await find(s0)).toEqual(['ΕΛΕΥΘΕΡΟ']);
    const s1 = decl(s0, 'AGN', 3, D, '2026-10-17');
    const got = await find(s1);
    expect(got).toHaveLength(1);
    expect(got[0].split('\n')).toEqual(['1. ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ: ΣΕ ΑΓΝΟΙΑ ΤΗΝ 15 ΟΚΤ 26.', 'ΕΛΕΥΘΕΡΟ']);
  });
});
