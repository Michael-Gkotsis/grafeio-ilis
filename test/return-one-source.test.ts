// Μία πηγή για το «πότε γυρνά» (Michael, 26/10): άδεια που τελειώνει σήμερα + ΔΝ/έξοδος σήμερα δίνει την ίδια μέρα/ώρα/λόγο
// στους 4 πίνακες του Excel (outsTables) και στην οθόνη (returnsOn, retLine). Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { fakeState } from './fixtures';
import { outsTables, retLine, retDay, returnsOn, type OutRow } from '../src/shared/returns';
import type { Status, TypeKey } from '../src/shared/domain';

let seq = 0;
const FRI = '2026-10-23', MON = '2026-10-26', TUE = '2026-10-27';
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 'r' + ++seq, pid, type, from, to: extra.to || from, ...extra });
const with_ = (...ss: Status[]) => ({ ...fakeState(10), statuses: ss });
const rowOf = (s: ReturnType<typeof with_>, pid: number): OutRow => { const t = outsTables(s, MON); return [...t.dn, ...t.out, ...t.tonight, ...t.tomorrow].find(x => x.p.id === pid)!; };

describe('άδεια που τελειώνει σήμερα: οθόνη = Excel', () => {
  for (const toTime of [undefined, '14:00']) {
    const lv = () => st(5, 'LEAVE', FRI, { to: MON, kind: 'Κανονική', ...(toTime ? { toTime } : {}) });
    const T = toTime ? ' με ώρα ' + toTime : ' χωρίς ώρα';
    for (const [name, extra, day, time, when, why, line] of [
      ['τίποτα άλλο', [], toTime ? MON : TUE, toTime || '', toTime ? 'σήμερα 14:00' : 'αύριο πρωί', 'Κανονική άδεια', toTime ? 'Γυρνά Δευτέρα 26/10 14:00 (τέλος ΚΑ)' : 'Γυρνά Τρίτη 27/10 πρωί (τέλος ΚΑ)'],
      ['ΔΝ σήμερα', [st(5, 'DN', MON)], TUE, '06:00', 'αύριο 06:00', 'τέλος άδειας, ΔΝ', 'Γυρνά Τρίτη 27/10 06:00 (τέλος άδειας, ΔΝ)'],
      ['έξοδος σήμερα', [st(5, 'OUT', MON)], MON, '22:00', 'απόψε 22:00', 'τέλος άδειας, έξοδος', 'Γυρνά Δευτέρα 26/10 22:00 (τέλος άδειας, έξοδος)']
    ] as [string, Status[], string, string, string, string, string][]) {
      it('ΚΑ' + T + ' + ' + name, () => {
        const s = with_(lv(), ...extra);
        const b = returnsOn(s, MON).find(x => x.p.id === 5)!.r, x = rowOf(s, 5);
        expect([b.day, b.time]).toEqual([day, time]);
        expect([x.r.day, x.r.time]).toEqual([day, time]);
        expect([x.when, x.why]).toEqual([when, why]);
        expect(retLine(b)).toBe(line);
        expect(retLine(b)).toBe(retLine(x.r));
        // ο λόγος της οθόνης = ο λόγος του Excel (εκτός από τη λέξη «Κανονική άδεια»: εκεί η οθόνη λέει «τέλος ΚΑ»)
        if (extra.length) expect(retLine(b)).toContain(x.why);
        expect(retDay(b)).toBe(retDay(x.r));
      });
    }
  }
  it('ΔΝ σήμερα και άλλη ώρα ΔΝ αύριο: ίδια ώρα στην οθόνη και στο Excel', () => {
    const s = with_(st(5, 'LEAVE', FRI, { to: MON }), st(5, 'DN', MON));
    s.dayPlan = { [TUE]: { backDn: '07:15' } };
    expect(returnsOn(s, MON)[0].r.time).toBe('07:15');
    expect(rowOf(s, 5).when).toBe('αύριο 07:15');
  });
  it('η άδεια συνεχίζει αύριο: όπως πριν (τέλος της άδειας)', () => {
    const s = with_(st(5, 'LEAVE', FRI, { to: TUE, toTime: '14:00' }), st(5, 'OUT', MON));
    const r = returnsOn(s, MON)[0].r;
    expect([r.day, r.time, r.why, r.base]).toEqual([TUE, '14:00', 'τέλος ΚΑ', undefined]);
  });
});
