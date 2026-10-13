// Εγγραφή χωρίς λήξη (π.χ. ΣΤΕΠ με κενό «έως»): ισχύει και αύριο και μεθαύριο, όχι μόνο ως σήμερα. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { dutyBlock, fillDay, guardUnavailable, nextFor, outBlock, planStatusChange, postsOf, statusesOn } from '../src/shared/rules';
import { absentOn, punishedOn } from '../src/main/exports';
import { addDays } from '../src/shared/dates';
import { TYPE_KEYS, TYPES, type Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const TODAY = '2026-10-13'; const TOM = addDays(TODAY, 1); const LATER = addDays(TODAY, 20);
const f0 = fakeState(40); const s0 = { ...f0, settings: { ...f0.settings, phase: 'spen' as const } }; const pid = 3;
// όπως έρχεται από το Excel: «έως» = σήμερα, και κάθε μέρα πάει μαζί με τη σημερινή
const open = (type: Status['type'], extra: Partial<Status> = {}): Status => ({ id: 'o1', pid, type, from: addDays(TODAY, -5), to: TODAY, open: true, ...extra });

describe('χωρίς λήξη: ισχύει και τις επόμενες μέρες', () => {
  it('ΣΤΕΠ χωρίς λήξη: όχι σε ένοπλη θέση αύριο ούτε σε 20 μέρες', () => {
    const s = { ...s0, statuses: [open('STEP')] };
    const armed = postsOf(s.settings).find(x => x.armed && x.kind !== 'ly');
    for (const d of [TODAY, TOM, LATER]) {
      expect(statusesOn(s.statuses, pid, d)).toHaveLength(1);
      expect(dutyBlock(s.statuses, d, pid, armed || null)).toMatch(/ΣΤΕΠ \(χωρίς λήξη\)/);
    }
  });
  it('η αυτόματη συμπλήρωση και το «Επόμενος» δεν τον βάζουν αύριο σε ένοπλη θέση', () => {
    // πρώτα χωρίς ΣΤΕΠ: ποιος θα έμπαινε αύριο σε ένοπλη θέση
    const armed = postsOf(s0.settings).filter(x => x.armed && x.kind !== 'ly');
    const before = fillDay(s0, TOM).guards[TOM]; const who = armed.map(x => before[x.k]).find(Boolean)!;
    expect(who).toBeTruthy();
    const s = { ...s0, statuses: [{ ...open('STEP'), pid: who }] };
    const g = fillDay(s, TOM).guards[TOM];
    for (const x of armed) expect(g[x.k]).not.toBe(who);
    for (const x of armed) { const skip: number[] = []; for (let i = 0; i < 40; i++) { const n = nextFor(s, TOM, x.k, skip); if (n == null) break; expect(n).not.toBe(who); skip.push(n); } }
  });
  it('κάθε είδος κατάστασης χωρίς λήξη μετρά αύριο ακριβώς όπως σήμερα', () => {
    for (const type of TYPE_KEYS) {
      const s = { ...s0, statuses: [open(type, type === 'PUN' ? { kind: 'Περιορισμός' } : {})] };
      for (const x of postsOf(s.settings)) expect(guardUnavailable(s, TOM, pid, x.k)).toBe(guardUnavailable(s, TODAY, pid, x.k));
      expect(outBlock(s, TOM, pid)).toBe(outBlock(s, TODAY, pid));
      if (TYPES[type].away && TYPES[type].cat !== 'out') expect(absentOn(s, TOM)).toHaveLength(1);
      if (type === 'PUN') expect(punishedOn(s, TOM)).toHaveLength(1);
    }
  });
  it('ποινή που αιτείται χωρίς λήξη: δεν βγαίνει έξοδο ούτε αύριο', () => {
    const s = { ...s0, statuses: [open('PUN', { pending: true, kind: 'Περιορισμός' })] };
    expect(outBlock(s, TOM, pid)).toMatch(/αιτείται/); expect(outBlock(s, LATER, pid)).toMatch(/αιτείται/);
  });
  it('νέα δήλωση την επόμενη εβδομάδα επικαλύπτει την ανοιχτή εγγραφή', () => {
    const s = { ...s0, statuses: [open('EY')] };
    const plan = planStatusChange(s, { type: 'EY', pids: [pid], from: addDays(TODAY, 7), to: addDays(TODAY, 9) }, TODAY);
    expect(plan.overlaps).toHaveLength(1);
  });
});
