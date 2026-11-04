// Ιατρικά «μόνο σημείωση» (Michael, 4/11): υπάρχουν μόνο σαν σημείωση πάνω στον στρατιώτη. Δεν αλλάζουν υπηρεσίες, έξοδο, ΗΚΑΙ, Δύναμη,
// έντυπα και Excel. Το βασικό τεστ: ο πλούσιος τυχαίος πίνακας του outs-gen, με σημείωση σε ΚΑΘΕ στρατιώτη σε όλες τις μέρες, δίνει
// ακριβώς τα ίδια αποτελέσματα με τον πίνακα χωρίς σημειώσεις. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { genState, DAYS } from './outs-gen';
import { fillOuts, fillHkai, fillFroura } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { apply, type Ctx } from '../src/shared/commands';
import { activePeople, noteTxt, notesOn, dutyBlock, fillDay, hkaiCounts, outBlock, planStatusChange, statusesAt, statusesOn, strengthOf, statusWarn } from '../src/shared/rules';
import { strengthView } from '../src/shared/strengthView';
import { dayBook } from '../src/shared/outsDay';
import { outsAndStay } from '../src/shared/outsStay';
import { outsTables, returnsOn } from '../src/shared/returns';
import { preflight } from '../src/shared/preflight';
import { dayCode } from '../src/shared/dayCode';
import { imerGrid } from '../src/shared/imer';
import { absenceOfPerson } from '../src/shared/absence';
import { evalValue, metricsOf } from '../src/shared/values';
import { live, medNote, medNoteBadge, medNoteXl, medWarns, noNotes, notesOf, badgeStatuses, type UserLists } from '../src/shared/ranks';
import type { AppState, Status } from '../src/shared/domain';

const NOTE = 'ΕΛ. ΞΥΡΙΣΜΑΤΟΣ', NOTE2 = 'ΞΥΡΙΣΜΑ ΑΝΑ 2 ΜΕΡΕΣ';
const LISTS: UserLists = { medKinds: { add: [{ name: NOTE, like: 'EY', note: true }, { name: NOTE2, like: 'EA', note: true, noteBadge: true }, { name: 'ΕΛ ΠΟΔ', like: 'EA' }] } };
const withLists = (s: AppState, lists: UserLists = LISTS): AppState => ({ ...s, settings: { ...s.settings, lists } });
// σημείωση σε κάθε ενεργό στρατιώτη σε όλο το εύρος (ΕΥ-όμοια, ο πιο αυστηρός τύπος) και μία χωρίς λήξη (ΕΑ-όμοια)
function withNotes(s: AppState): AppState {
  const ns: Status[] = []; const a = DAYS[0], z = DAYS[DAYS.length - 1];
  for (const p of activePeople(s)) {
    ns.push({ id: 'n' + p.id, pid: p.id, type: 'EY', kind: NOTE, from: '2026-10-01', to: z });
    ns.push({ id: 'o' + p.id, pid: p.id, type: 'EA', kind: NOTE2, from: a, to: a, open: true });
  }
  return { ...s, statuses: [...s.statuses, ...ns] };
}
const T = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', f));
async function digest(data: Buffer): Promise<string> {
  const wb = await Workbook.open(data); const out: unknown[] = [wb.sheetNames()];
  for (const n of wb.sheetNames()) { const ws = await wb.sheet(n); const d = ws.dump(); out.push([n, d, Object.keys(d.cells).map(k => ws.style(k))]); }
  return crypto.createHash('sha1').update(JSON.stringify(out)).digest('hex');
}
const TIMES = [8 * 60, 12 * 60 + 30, 17 * 60, 22 * 60];
const J = (x: unknown) => JSON.stringify(x);

// ό,τι βγάζει η εφαρμογή για μια μέρα από κανόνες, Δύναμη, ΗΚΑΙ, έξοδο, έντυπα
function battery(s: AppState, d: string): Record<string, string> {
  const people = activePeople(s); const lists = s.settings.lists;
  const out: Record<string, string> = {};
  out.hkai = J(hkaiCounts(s, d));
  out.strength = J(TIMES.map(t => [strengthOf(s, d, t), strengthView(s, d, t)]));
  out.statusesAt = J(TIMES.map(t => people.map(p => statusesAt(s, p.id, d, t).map(x => x.id))));
  out.outs = J([dayBook(s, d), outsAndStay(s, d), outsTables(s, d), returnsOn(s, d)]);
  out.fill = J(fillDay(s, d));
  out.block = J(people.map(p => [outBlock(s, d, p.id), statusWarn(s, d, p.id), absenceOfPerson(s, p, d), dayCode(s, p, d), statusesOn(noNotes(s.statuses, lists), p.id, d).map(x => x.id)]));
  out.duty = J(people.map(p => [dutyBlock(live(s), d, p.id, { armed: true, kind: 'sk' }, lists), dutyBlock(live(s), d, p.id, { armed: false, kind: 'mg' }, lists)]));
  out.pre = J((['froura', 'hkai', 'outs'] as const).map(k => preflight(k, s, d)));
  return out;
}

describe('μόνο σημείωση: καμία επίδραση σε κανόνες, Δύναμη, ΗΚΑΙ, έξοδο, έντυπα', () => {
  for (const seed of [11, 12, 13]) it('τυχαία κατάσταση ' + seed + ': ίδια αποτελέσματα με και χωρίς σημειώσεις σε όλους', () => {
    const base = withLists(genState(seed, seed % 2 === 1, 14)); const noted = withNotes(base);
    expect(noted.statuses.length).toBeGreaterThan(base.statuses.length);
    for (const d of DAYS) {
      const a = battery(base, d), b = battery(noted, d);
      for (const k of Object.keys(a)) expect(b[k], d + ' ' + k).toBe(a[k]);
    }
  }, 120000);

  it('Ημερολόγιο κωλυομένων και κωδικοί: ίδια', () => {
    const base = withLists(genState(14, true, 14)); const noted = withNotes(base);
    expect(J(imerGrid(noted, DAYS[0], DAYS[13], true, DAYS[3]))).toBe(J(imerGrid(base, DAYS[0], DAYS[13], true, DAYS[3])));
  });

  it('έντυπα: cat.med, st.* και όλες οι μετρήσεις (εκτός από το ρητό med.kind) ίδιες', () => {
    const base = withLists(genState(15, true, 14)); const noted = withNotes(base);
    const ids = metricsOf(base).map(m => m.id).filter(id => !id.startsWith('med.kind:'));
    expect(ids).toContain('cat.med'); expect(ids).toContain('st.EARV');
    for (const d of DAYS.slice(0, 10)) for (const t of [8 * 60, 17 * 60]) for (const id of ids)
      expect(evalValue(noted, d, t, [{ sign: '+', metric: id }]), d + ' ' + id).toBe(evalValue(base, d, t, [{ sign: '+', metric: id }]));
  }, 120000);

  it('έντυπα: το ρητό «Ιατρικό «<όνομα>»» μετρά τις σημειώσεις (opt-in)', () => {
    const base = withLists(genState(16, true, 14)); const noted = withNotes(base); const n = activePeople(base).length;
    const d = DAYS[2];
    expect(evalValue(noted, d, 8 * 60, [{ sign: '+', metric: 'med.kind:' + NOTE }])).toBe(n);
    expect(evalValue(base, d, 8 * 60, [{ sign: '+', metric: 'med.kind:' + NOTE }])).toBe(0);
    expect(evalValue(noted, d, 8 * 60, [{ sign: '+', metric: 'med.kind:' + NOTE2 }])).toBe(n);
    // ... και μόνο αυτό: οι άλλες μετρήσεις της ομάδας ιατρικών μένουν
    expect(evalValue(noted, d, 8 * 60, [{ sign: '+', metric: 'cat.med' }])).toBe(evalValue(base, d, 8 * 60, [{ sign: '+', metric: 'cat.med' }]));
  });

  it('Excel: ΗΚΑΙ, Φρουρά και Εξοδούχοι βγαίνουν ίδια κελί προς κελί', async () => {
    const base = withLists(genState(17, true, 14)); const noted = withNotes(base);
    for (const d of [DAYS[2], DAYS[5], DAYS[9]]) {
      expect(await digest((await fillOuts(T('exodouxoi.xlsx'), noted, d)).data), 'εξοδούχοι ' + d).toBe(await digest((await fillOuts(T('exodouxoi.xlsx'), base, d)).data));
      expect(await digest((await fillHkai(T('hkai.xlsx'), noted, d)).data), 'ΗΚΑΙ ' + d).toBe(await digest((await fillHkai(T('hkai.xlsx'), base, d)).data));
      expect(await digest((await fillFroura(T('froura.xlsx'), noted, d)).data), 'ΦΡΟΥΡΑ ' + d).toBe(await digest((await fillFroura(T('froura.xlsx'), base, d)).data));
    }
  }, 120000);
});

describe('μόνο σημείωση: δήλωση και επικαλύψεις', () => {
  let seq = 0; const ctx: Ctx = { today: '2026-10-20', newId: () => 'q' + ++seq };
  const s0 = withLists(genState(18, true, 14));
  const D1 = '2026-10-23', D2 = '2026-10-25';
  const guards = (s: AppState) => ({ ...s, guards: { ...s.guards, [D1]: { ...(s.guards[D1] || {}), th1: 3 } } });

  it('δηλώνεται πάνω σε υπηρεσία χωρίς σύγκρουση, χωρίς αρχεία και χωρίς ΗΚΑΙ', () => {
    const s = guards({ ...s0, statuses: s0.statuses.filter(x => x.pid !== 3) });
    const cmd = { type: 'EY' as const, kind: NOTE, pids: [3], from: D1, to: D2 };
    const plan = planStatusChange(s, cmd, ctx.today);
    expect(plan.conflicts).toEqual([]); expect(plan.cancels).toEqual([]); expect(plan.blocked).toEqual([]); expect(plan.files).toEqual([]);
    const r = apply(s, { t: 'declare', cmd }, ctx);
    expect(r.state.guards[D1].th1).toBe(3);
    expect(r.state.statuses.some(x => x.pid === 3 && x.kind === NOTE)).toBe(true);
    // το αντίστοιχο πραγματικό ΕΥ θα έβγαζε τον στρατιώτη από τη θέση και θα έγραφε στην ΗΚΑΙ
    const real = planStatusChange(s, { type: 'EY', pids: [3], from: D1, to: D2 }, ctx.today);
    expect(real.conflicts.length).toBeGreaterThan(0); expect(real.files.length).toBeGreaterThan(0);
  });
  it('δεν μπλοκάρει και δεν μπλοκάρεται από πραγματικά ιατρικά· το ίδιο είδος δύο φορές όμως ναι', () => {
    const s = { ...s0, statuses: s0.statuses.filter(x => x.pid !== 4) };
    const a = apply(s, { t: 'declare', cmd: { type: 'EY', pids: [4], from: D1, to: D2 } }, ctx).state;
    const note = { type: 'EY' as const, kind: NOTE, pids: [4], from: D1, to: D2 };
    const p1 = planStatusChange(a, note, ctx.today);
    expect(p1.overlaps).toEqual([]); expect(p1.alongside).toEqual([]);
    const b = apply(a, { t: 'declare', cmd: note }, ctx).state;
    // πραγματικό ΕΥ πάνω στη σημείωση: επικάλυψη μόνο με το προηγούμενο ΕΥ, όχι με τη σημείωση
    const p2 = planStatusChange(b, { type: 'EY', pids: [4], from: D1, to: D1 }, ctx.today);
    expect(p2.overlaps.map(o => o.status.kind ?? '')).toEqual(['']);
    expect(p2.alongside).toEqual([]);
    const p3 = planStatusChange(b, { ...note, from: D2, to: D2 }, ctx.today);
    expect(p3.overlaps.map(o => o.status.kind)).toEqual([NOTE]);
    expect(() => apply(b, { t: 'declare', cmd: note }, ctx)).toThrow(/έχει ήδη/);
    // άλλη σημείωση, ίδιες μέρες: περνά
    expect(planStatusChange(b, { type: 'EA', kind: NOTE2, pids: [4], from: D1, to: D2 }, ctx.today).overlaps).toEqual([]);
  });
  it('σημείωση χωρίς λήξη: δεν επηρεάζει την έξοδο', () => {
    const s = { ...s0, statuses: s0.statuses.filter(x => x.pid !== 5) };
    const r = apply(s, { t: 'declare', cmd: { type: 'EA', kind: NOTE2, pids: [5], from: D1, to: D1, open: true } }, ctx).state;
    expect(r.statuses.find(x => x.pid === 5 && x.kind === NOTE2)?.open).toBe(true);
    expect(outBlock(r, D2, 5)).toBe(outBlock(s, D2, 5));
  });
});

describe('μόνο σημείωση: βοηθητικές συναρτήσεις', () => {
  const lists: UserLists = { medKinds: { add: [{ name: NOTE, like: 'EY', note: true, noteBadge: true }, { name: NOTE2, like: 'EA', note: true, noteXl: true, warn: true }, { name: 'ΕΛ ΠΟΔ', like: 'EA', warn: true }] } };
  const st = (kind: string | undefined, type: Status['type'] = 'EY'): Status => ({ id: 'x' + kind, pid: 1, type, kind, from: '2026-10-01', to: '2026-10-09' });
  it('medNote, medNoteBadge, medNoteXl', () => {
    expect(medNote(st(NOTE), lists)).toBe(true); expect(medNote(st('ελ. ξυρισματοσ'), lists)).toBe(true);
    expect(medNoteBadge(st(NOTE), lists)).toBe(true); expect(medNoteXl(st(NOTE), lists)).toBe(false);
    expect(medNoteBadge(st(NOTE2, 'EA'), lists)).toBe(false); expect(medNoteXl(st(NOTE2, 'EA'), lists)).toBe(true);
    expect(medNote(st('ΕΛ ΠΟΔ', 'EA'), lists)).toBe(false); expect(medNote(st(undefined), lists)).toBe(false);
    expect(medNote(st(NOTE, 'LEAVE'), lists)).toBe(false); expect(medNote(st(NOTE), undefined)).toBe(false);
  });
  it('η σημείωση δεν προειδοποιεί, ακόμα κι αν είχε τικ «μόνο προειδοποίηση»', () => {
    expect(medWarns(st(NOTE2, 'EA'), lists)).toBe(false); expect(medWarns(st('ΕΛ ΠΟΔ', 'EA'), lists)).toBe(true);
  });
  it('noNotes: ίδιος πίνακας όταν δεν υπάρχει σημείωση· αλλιώς χωρίς αυτές, με cache', () => {
    const all = [st(NOTE), st('ΕΛ ΠΟΔ', 'EA'), st(undefined)];
    const none: UserLists = { medKinds: { add: [{ name: 'ΕΛ ΠΟΔ', like: 'EA' }] } };
    expect(noNotes(all, none)).toBe(all); expect(noNotes(all, undefined)).toBe(all);
    const r = noNotes(all, lists); expect(r).toHaveLength(2); expect(noNotes(all, lists)).toBe(r);
    expect(notesOf(all, lists)).toHaveLength(1); expect(notesOf(all, none)).toEqual([]);
    // σήματα: μόνο οι σημειώσεις με «σαν σήμα στις οθόνες»
    expect(badgeStatuses([st(NOTE), st(NOTE2, 'EA')], lists).map(x => x.kind)).toEqual([NOTE]);
  });
});

describe('μόνο σημείωση: καρτέλα στρατιώτη και Ιατρικά › Σημειώσεις', () => {
  const lists: UserLists = { medKinds: { add: [{ name: NOTE, like: 'EY', note: true }, { name: NOTE2, like: 'EA', note: true }, { name: 'ΕΛ ΠΟΔ', like: 'EA' }] } };
  const s: AppState = { ...withLists(genState(19, true, 6), lists), statuses: [
    { id: 'a', pid: 1, type: 'EY', kind: NOTE, from: '2026-11-01', to: '2026-11-20' },
    { id: 'b', pid: 1, type: 'EA', kind: NOTE2, from: '2026-10-01', to: '2026-10-01', open: true },
    { id: 'c', pid: 1, type: 'EA', kind: 'ΕΛ ΠΟΔ', from: '2026-11-01', to: '2026-11-09' },
    { id: 'd', pid: 1, type: 'EY', kind: NOTE, from: '2026-12-01', to: '2026-12-05' },
    { id: 'e', pid: 2, type: 'EY', kind: NOTE, from: '2026-09-01', to: '2026-09-05' }
  ] };
  it('σημειώσεις υγείας: μόνο όσες ισχύουν σήμερα, με «ως dd/mm» ή «χωρίς λήξη»', () => {
    const n = notesOn(s, 1, '2026-11-04');
    expect(n.map(x => x.id)).toEqual(['a', 'b']);
    expect(n.map(x => noteTxt(x, s.settings.lists)).join(' · ')).toBe('ΕΛ. ΞΥΡΙΣΜΑΤΟΣ ως 20/11 · ΞΥΡΙΣΜΑ ΑΝΑ 2 ΜΕΡΕΣ (χωρίς λήξη)');
    expect(notesOn(s, 2, '2026-11-04')).toEqual([]);
  });
  it('η καρτέλα Τώρα δεν μετρά σημειώσεις (ίδιος κανόνας με το RecordList: isMed χωρίς medNote)', () => {
    const real = s.statuses.filter(x => !medNote(x, s.settings.lists));
    expect(real.map(x => x.id)).toEqual(['c']);
    expect(notesOf(s.statuses, s.settings.lists).map(x => x.id)).toEqual(['a', 'b', 'd', 'e']);
  });
});
