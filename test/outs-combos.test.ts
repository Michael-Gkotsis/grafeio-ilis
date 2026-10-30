// Εξοδούχοι / Παραμένοντες σε όλους τους συνδυασμούς (Michael, 30/10: «να δοκιμάσεις όσους περισσότερους συνδυασμούς γίνεται… να
// βεβαιωθούμε ότι πάντα βγαίνουν σωστά»). Τυχαίες αλλά επαναλήψιμες δύο εβδομάδες (με την αργία της 28/10 και δύο ΣΚ): υπηρεσίες,
// έξοδοι, ΔΝ, ΔΝ ΣΚ, άδειες με και χωρίς ώρες, χωρίς λήξη, νοσοκομείο, ΣΤΕΠ, κωλυόμενοι, ποινές (και στέρηση εξόδου), ιατρικά,
// αλλαγές μιας μέρας (ώρες, εκπαίδευση), διορθώσεις επιστροφής, παρατηρήσεις. Μία φορά όπως τα αφήνει η οθόνη (όποιος δεν βγαίνει
// έξοδο δεν παίρνει έξοδο) και μία με «παρά τους κανόνες». Πάνω τους ελέγχονται οι κανόνες που πρέπει να ισχύουν πάντα. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fakeState } from './fixtures';
import { outsTables, outHeld, dayTimes, returnsOn, type OutsTables } from '../src/shared/returns';
import { outsAndStay } from '../src/shared/outsStay';
import { fillOuts, outsNote } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { activePeople, postOf, statusesOn, strengthOf } from '../src/shared/rules';
import { dayBook, whenList } from '../src/shared/outsDay';
import { addDays, type ISODate } from '../src/shared/dates';
import { mins } from '../src/shared/hours';
import { upper } from '../src/shared/text';
import { TYPES, type AppState, type Status, type TypeKey } from '../src/shared/domain';
import { genState, run, DAYS } from './outs-gen';
export { genState };

let seq = 0;

const TABS = ['dn', 'out', 'tonight', 'tomorrow'] as const;
const bad = (t: string) => /undefined|null|NaN|\(\)|,\s*,|,\s*$|^\s*,|\s\s/.test(t);
// όλα τα λάθη μιας μέρας (κενό = σωστά)
function check(s: AppState, d: ISODate, realistic: boolean): string[] {
  const errs: string[] = []; const E = (t: string) => errs.push(d + ' ' + t);
  const { outs, stay } = outsAndStay(s, d); const t = outsTables(s, d); const backs = returnsOn(s, d);
  const oi = new Set(outs.map(x => x.p.id)), si = new Set(stay.map(x => x.p.id));
  const inT = (k: typeof TABS[number], pid: number) => t[k].some(y => y.p.id === pid);
  const outM = mins(dayTimes(s, d).out), n = addDays(d, 1);
  for (const p of activePeople(s)) {
    if (oi.has(p.id) && si.has(p.id)) E('p' + p.id + ' και εξοδούχος και παραμένων');
    if (statusesOn(s.statuses, p.id, d).some(x => TYPES[x.type].cat === 'out') && !oi.has(p.id)) E('p' + p.id + ' έχει έξοδο/ΔΝ αλλά δεν είναι στους εξοδούχους');
    if ((['dn', 'out', 'tonight'] as const).filter(k => inT(k, p.id)).length > 1) E('p' + p.id + ' σε δύο από τους πίνακες 1, 2, 3');
  }
  // παραμένων = μέσα το βράδυ: όχι κάποιος που λείπει ακόμα από χθες (εκτός αν έχει υπηρεσία σήμερα)
  for (const x of stay) {
    if (outHeld(s, x.p.id, d, outM) && !postOf(s, d, x.p.id)) E('p' + x.p.id + ' παραμένων ενώ λείπει ακόμα');
    const po = postOf(s, d, x.p.id); if (po && !upper(x.note).includes(upper(po.label))) E('p' + x.p.id + ' παραμένων χωρίς την υπηρεσία του: ' + x.note);
    if (bad(x.note)) E('κείμενο παραμένοντα: «' + x.note + '»');
  }
  // κάθε εξοδούχος λέει πότε γυρνά (ή ότι δεν ξέρουμε / δεν γυρνά), με τις λέξεις της οθόνης
  for (const x of outs) {
    const note = outsNote(s, d, x.p.id, x.st);
    if (!/ΓΥΡΝΑ|ΔΗΛΩΘΕΙ/.test(note)) E('p' + x.p.id + ' εξοδούχος χωρίς «ΓΥΡΝΑ»: «' + note + '»');
    if (bad(note)) E('κείμενο εξοδούχου: «' + note + '»');
  }
  for (const k of TABS) {
    const ids = t[k].map(y => y.p.id); if (new Set(ids).size !== ids.length) E('δύο φορές στον πίνακα ' + k);
    for (const row of t[k]) if (!row.why || bad(row.why) || bad(row.when)) E('Πότε/Γιατί: «' + row.when + '» «' + row.why + '»');
  }
  // «Όλη η δύναμη» (outsDay.ts), όπως στο σχέδιο 30/10. P1: κάθε ενεργό άτομο μία φορά· P2: οι εξοδούχοι της Τωρινής μορφής στο Α ∪ Β και οι
  // παραμένοντες στο Γ· P3: Α και Β απόντες στη Δύναμη στην ώρα εξόδου, Γ1, Γ2, Γ3, Γ5 παρόντες· P4: Α, Β, Γ4 έχουν επιστροφή, ίδια με την οθόνη· Δ = Α + Β + Γ4.
  // Η μόνη επιτρεπτή διαφορά: υπηρεσία ενώ η διόρθωση λέει έξω (Γ1 με ΠΡΟΣΟΧΗ), και υπηρεσία μαζί με έξοδο/ΔΝ (Α1/Α2 με ΠΡΟΣΟΧΗ).
  const book = dayBook(s, d), grp = new Map(book.map(r => [r.p.id, r.g])), pres = new Set(strengthOf(s, d, outM).lists.present.map(p => p.id));
  const people = activePeople(s);
  if (book.length !== people.length || new Set(book.map(r => r.p.id)).size !== people.length) E('P1 δεν είναι ο καθένας μία φορά');
  for (const x of outs) if (!/^[AB]/.test(grp.get(x.p.id)!)) E('P2 p' + x.p.id + ' εξοδούχος στο ' + grp.get(x.p.id));
  for (const x of stay) if (!/^G/.test(grp.get(x.p.id)!)) E('P2 p' + x.p.id + ' παραμένων στο ' + grp.get(x.p.id));
  for (const r of book) {
    if (/^[AB]/.test(r.g) && pres.has(r.p.id)) E('P3 p' + r.p.id + ' ' + r.g + ' παρών στην ώρα εξόδου');
    if (/^G[1235]/.test(r.g) && !pres.has(r.p.id) && !(r.g === 'G1' && r.warn?.includes('ΔΙΟΡΘΩΣΗ'))) E('P3 p' + r.p.id + ' ' + r.g + ' απών στην ώρα εξόδου');
    if (r.warn && !(r.g === 'G1' ? r.warn.includes('ΔΙΟΡΘΩΣΗ') : /^A[12]$/.test(r.g) && r.warn.includes('ΥΠΗΡΕΣΙΑ'))) E('P1 p' + r.p.id + ' ΠΡΟΣΟΧΗ εκτός των δύο γνωστών: ' + r.warn);
    if (/^[AB]|^G4/.test(r.g)) {
      const o = backs.find(b => b.p.id === r.p.id);
      if (!r.r) { E('P4 p' + r.p.id + ' ' + r.g + ' χωρίς επιστροφή'); continue; }
      if (o && (o.r.day !== r.r.day || (o.r.time || '') !== (r.r.time || '') || !!o.r.open !== !!r.r.open)) E('P4 p' + r.p.id + ' ' + r.g + ' άλλη επιστροφή από την οθόνη');
      if (/^[AB]/.test(r.g) && !r.r.open && !r.r.pending && r.r.day < d) E('P4 p' + r.p.id + ' ' + r.g + ' γύρισε ήδη');
    }
  }
  const dl = whenList(book).flatMap(w => w.rows.map(r => r.p.id)).sort((a, b) => a - b), want = book.filter(r => /^[AB]|^G4/.test(r.g) && r.r).map(r => r.p.id).sort((a, b) => a - b);
  if (dl.join() !== want.join()) E('Δ δεν είναι Α + Β + Γ4');
  if (realistic) {
    // όσοι έχουν έξοδο/ΔΝ σήμερα: όχι και υπηρεσία (η οθόνη δεν το αφήνει χωρίς επιβεβαίωση)
    for (const x of outs) if (statusesOn(s.statuses, x.p.id, d).some(y => TYPES[y.type].cat === 'out') && postOf(s, d, x.p.id)) E('p' + x.p.id + ' εξοδούχος με υπηρεσία');
    // η οθόνη «Ποιοι γυρίζουν και πότε» και οι πίνακες 2–4 λένε το ίδιο για σήμερα και αύριο
    for (const b of backs) {
      if (b.r.open || b.r.pending) continue;
      const k = b.r.day === d ? 'tonight' : b.r.day === n ? 'tomorrow' : null; if (!k) continue;
      const row = t[k].find(y => y.p.id === b.p.id) || (k === 'tonight' ? t.out.find(y => y.p.id === b.p.id) : undefined);
      if (!row) E('p' + b.p.id + ' γυρνά ' + (k === 'tonight' ? 'σήμερα' : 'αύριο') + ' στην οθόνη αλλά λείπει από τους πίνακες');
      else if (row.r.day !== b.r.day || (row.r.time || '') !== (b.r.time || '')) E('p' + b.p.id + ' οθόνη και πίνακας με άλλη ώρα');
    }
    // ο 4 είναι μόνο για αύριο
    for (const row of t.tomorrow) if (row.r.day !== n) E('p' + row.p.id + ' στο «Γυρίζουν αύριο» με άλλη μέρα');
  }
  return errs;
}

describe('Εξοδούχοι σε όλους τους συνδυασμούς', () => {
  it('300 τυχαίες εβδομάδες × 10 μέρες: τίποτα δεν χάνεται, τίποτα δεν βγαίνει δύο φορές, η οθόνη και το Excel λένε το ίδιο', () => {
    const errs: string[] = [];
    for (let seed = 1; seed <= 300; seed++) {
      const realistic = seed % 2 === 0, s = genState(seed, realistic);
      for (const d of DAYS.slice(2, 12)) errs.push(...check(s, d, realistic).map(e => 'seed ' + seed + ': ' + e));
    }
    expect(errs.slice(0, 20)).toEqual([]);
  });
  it('το Excel («Τωρινή» και «Όλη η δύναμη»): γράφεται, και έχει όλους όσους λένε οι λίστες', async () => {
    const T = fs.readFileSync(path.join(__dirname, '..', 'templates', 'exodouxoi.xlsx'));
    const text = async (data: Buffer) => { const wb = await Workbook.open(data); const all: string[] = []; for (const n of wb.sheetNames()) for (const r of await wb.values(n, 400, 30)) all.push(r.map(v => String(v ?? '')).join('|')); return all.join('\n'); };
    for (let seed = 1; seed <= 24; seed++) {
      const s0 = genState(1000 + seed, seed % 2 === 0, 10);
      for (const d of ['2026-10-24', '2026-10-25', '2026-10-28', '2026-10-30']) {
        const cur = await text((await fillOuts(T, s0, d)).data);
        const { outs, stay } = outsAndStay(s0, d);
        for (const x of [...outs, ...stay]) expect(cur, 'seed ' + seed + ' ' + d + ' ' + x.p.last).toContain(upper(x.p.last));
        const sa = { ...s0, settings: { ...s0.settings, outsFmt: 'all' as const } };
        const ta = await text((await fillOuts(T, sa, d)).data);
        for (const p of activePeople(s0)) expect(ta, 'seed ' + seed + ' ' + d + ' ' + p.last + ' (όλη η δύναμη)').toContain(upper(p.last));
      }
    }
  }, 120000);
});

// Τα λάθη που βρήκαν οι συνδυασμοί (30/10), ένα ένα
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 's' + ++seq, pid, type, from, to: extra.to || from, ...extra });
const with_ = (...ss: Status[]): AppState => ({ ...fakeState(10), statuses: ss });
const FRI = '2026-10-23', SAT = '2026-10-24', SUN = '2026-10-25', MON = '2026-10-26', TUE = '2026-10-27';
const ids = (t: OutsTables) => Object.fromEntries(TABS.map(k => [k, t[k].map(x => x.p.id)]));
describe('Εξοδούχοι: οι διορθώσεις της 30/10', () => {
  it('άδεια που τελειώνει σήμερα και απόψε έξοδος/ΔΝ: οι Παρατηρήσεις λένε πότε γυρνά (πριν: κενό ή σκέτο «ΔΝ»)', () => {
    const s = with_(st(2, 'LEAVE', FRI, { to: MON, toTime: '12:00', kind: 'Κανονική' }), st(2, 'OUT', MON), st(3, 'HON', FRI, { to: MON, toTime: '10:00' }), st(3, 'DN', MON));
    const { outs } = outsAndStay(s, MON); const note = (pid: number) => outsNote(s, MON, pid, outs.find(x => x.p.id === pid)!.st);
    expect(note(2)).toBe('ΓΥΡΝΑ ΔΕΥΤΕΡΑ 26/10 22:00 (ΤΕΛΟΣ ΑΔΕΙΑΣ, ΕΞΟΔΟΣ)');
    expect(note(3)).toBe('ΔΝ, ΓΥΡΝΑ ΤΡΙΤΗ 27/10 06:00 (ΤΕΛΟΣ ΑΔΕΙΑΣ, ΔΝ)');
  });
  it('διόρθωση «γυρνά αργότερα» / «δεν γυρνά»: την επόμενη μέρα δεν είναι παραμένων, είναι στους εξοδούχους', () => {
    let s = with_(st(2, 'OUT', SAT), st(3, 'DN', SAT), st(9, 'OUT', SUN));
    s = run(s, { t: 'setBackFix', pid: 2, day: SAT, at: { day: MON, time: '12:00' }, why: 'ΕΞΕΤΑΣΕΙΣ' });
    s = run(s, { t: 'setBackFix', pid: 3, day: SAT, stay: true, why: 'ΕΙΠΕ Ο ΛΟΧΑΓΟΣ' });
    const { outs, stay } = outsAndStay(s, SUN);
    expect(stay.map(x => x.p.id)).not.toContain(2); expect(stay.map(x => x.p.id)).not.toContain(3);
    const o2 = outs.find(x => x.p.id === 2)!; expect(outsNote(s, SUN, 2, o2.st)).toBe('ΓΥΡΝΑ ΔΕΥΤΕΡΑ 26/10 12:00 (ΔΙΟΡΘΩΣΗ: ΕΞΕΤΑΣΕΙΣ)');
    const o3 = outs.find(x => x.p.id === 3)!; expect(outsNote(s, SUN, 3, o3.st)).toBe('ΔΝ, ΔΕΝ ΓΥΡΝΑ (ΔΙΟΡΘΩΣΗ: ΕΙΠΕ Ο ΛΟΧΑΓΟΣ)');
    // στους 4 πίνακες των τιμών: γυρνά αύριο
    expect(outsTables(s, SUN).tomorrow.map(x => [x.p.id, x.when, x.why])).toEqual([[2, 'αύριο 12:00', 'Εξοδούχος, διόρθωση: ΕΞΕΤΑΣΕΙΣ']]);
    // με υπηρεσία εκείνη τη μέρα είναι μέσα: παραμένων με την υπηρεσία του
    const s2 = run(s, { t: 'assign', date: SUN, k: 'ly', pid: 3, force: 'x' });
    expect(outsAndStay(s2, SUN).stay.find(x => x.p.id === 3)?.note).toBe('Λ/Υ');
  });
  it('άδεια που τελείωσε χθες με ΔΝ ΣΚ: την Κυριακή μόνο στο «Γυρίζουν αύριο», όχι και στο «Βγαίνουν σήμερα ΔΝ»', () => {
    const s = run(with_(st(4, 'LEAVE', '2026-10-21', { to: SAT, toTime: '06:00', kind: 'Ειδική' }), st(9, 'OUT', MON)), { t: 'outs', date: SAT, changes: [{ pid: 4, from: null, to: 'DN', wk: true }], force: true });
    expect(ids(outsTables(s, SUN))).toEqual({ dn: [], out: [], tonight: [], tomorrow: [4] });
  });
  it('άδεια που τελείωσε χθες με ΔΝ, σήμερα έξοδος: στο «Γυρίζουν απόψε» (δεν γύρισε), όχι στο «Βγαίνουν εξοδούχοι»', () => {
    const s = with_(st(5, 'SICK', FRI, { to: MON, toTime: '06:00' }), st(5, 'DN', MON), st(5, 'OUT', TUE));
    expect(ids(outsTables(s, TUE))).toEqual({ dn: [], out: [], tonight: [5], tomorrow: [] });
  });
  it('ΔΝ χθες, σήμερα έξοδος και διόρθωση «γυρνά αύριο»: μόνο στο «Γυρίζουν αύριο», όχι και στο «απόψε»', () => {
    let s = with_(st(4, 'DN', MON), st(4, 'OUT', TUE));
    s = run(s, { t: 'setBackFix', pid: 4, day: TUE, at: { day: '2026-10-28', time: '09:00' }, why: 'ΕΞΕΤΑΣΕΙΣ' });
    expect(ids(outsTables(s, TUE))).toEqual({ dn: [], out: [], tonight: [], tomorrow: [4] });
  });
  it('άδεια ως σήμερα 14:00 και ΔΝ αύριο: «Ποιοι γυρίζουν» λέει σήμερα 14:00 (πριν: μεθαύριο 06:00, μετά τη ΔΝ)', () => {
    const s = with_(st(2, 'LEAVE', FRI, { to: MON, toTime: '14:00', kind: 'Κανονική' }), st(2, 'DN', TUE), st(9, 'OUT', MON));
    expect(returnsOn(s, MON).find(b => b.p.id === 2)!.r).toMatchObject({ day: MON, time: '14:00' });
  });
  it('άδεια ως σήμερα 12:00, ΔΝ σήμερα, νέα άδεια από αύριο: γυρνά με τον κανόνα της ΔΝ μετά τη νέα άδεια', () => {
    const s = with_(st(3, 'LEAVE', FRI, { to: MON, toTime: '12:00', kind: 'Κανονική' }), st(3, 'DN', MON), st(3, 'LEAVE', TUE, { to: '2026-10-28', kind: 'Ειδική' }), st(9, 'OUT', MON));
    expect(returnsOn(s, MON).find(b => b.p.id === 3)!.r).toMatchObject({ day: '2026-10-29', time: '06:00', base: 'τέλος άδειας, ΔΝ' });
  });
  it('δύο καταστάσεις του ίδιου είδους την ίδια μέρα: μία φορά στους Παραμένοντες', () => {
    const s = with_(st(2, 'STEP', FRI, { to: MON }), st(2, 'STEP', SUN, { to: TUE }), st(9, 'OUT', MON));
    expect(outsAndStay(s, MON).stay.find(x => x.p.id === 2)!.note).toBe('ΣΤΕΠ');
  });
});
