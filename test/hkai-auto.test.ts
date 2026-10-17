// ΗΚΑΙ (Michael, 17/10): «1.», ίδια ποινή σε πολλούς σε μία πρόταση, ποινές χωρίς έγκριση, αιτιατική του τιμωρήσαντος,
// ημερομηνίες «15 ΟΚΤ 26», 3. ΑΔΕΙΕΣ αριθμημένες. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fillHkai } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { hkaiLeaveLines, hkaiPunLines, hkRange, leaveName, linesText } from '../src/shared/hkaiText';
import { accusative, genitive } from '../src/shared/greek';
import { hkDate, hkDay } from '../src/shared/dates';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const D = '2026-10-16';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'a' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const pun = (s: AppState, pids: number[], extra: Record<string, unknown> = {}) =>
  run(s, { t: 'declare', cmd: { type: 'PUN', pids, from: D, to: '2026-10-17', kind: 'Κράτηση', by: 'ΛΧΙΑΣ ΔΟΚΙΜΙΟΣ', reason: 'άργησε στο προσκλητήριο', ...extra } as any });

describe('ημερομηνίες της ΗΚΑΙ', () => {
  it('«15 ΟΚΤ 26» και «ΠΑΡ 16 ΟΚΤ 26», ΜΑΙ χωρίς διαλυτικά', () => {
    expect(hkDate('2026-10-15')).toBe('15 ΟΚΤ 26');
    expect(hkDay(D)).toBe('ΠΑΡ 16 ΟΚΤ 26');
    expect(hkDate('2027-05-03')).toBe('03 ΜΑΙ 27');
    expect(hkDay('2026-12-27')).toBe('ΚΥΡ 27 ΔΕΚ 26');
  });
});

describe('κλίση', () => {
  it('αιτιατική με άρθρο, χωρίς να κλίνει γενικές και ό,τι είναι ήδη σε αιτιατική', () => {
    expect(accusative('ΛΧΙΑΣ ΔΟΚΙΜΙΟΣ')).toBe('ΤΟΝ ΛΧΙΑ ΔΟΚΙΜΙΟ');
    expect(accusative('Ανθυπασπιστής Παραδειγματάκης')).toBe('ΤΟΝ ΑΝΘΥΠΑΣΠΙΣΤΗ ΠΑΡΑΔΕΙΓΜΑΤΑΚΗ');
    expect(accusative('ΔΚΤΗΣ ΙΛΗΣ')).toBe('ΤΟΝ ΔΚΤΗ ΙΛΗΣ');
    expect(accusative('ΔΚΤΗΣ ΕΠΧΙΑΣ')).toBe('ΤΟΝ ΔΚΤΗ ΕΠΧΙΑΣ');
    expect(accusative('ΑΞΚΟΣ ΥΠΗΡΕΣΙΑΣ')).toBe('ΤΟΝ ΑΞΚΟ ΥΠΗΡΕΣΙΑΣ');
    expect(accusative('ΛΧΙΑ ΔΟΚΙΜΙΟ')).toBe('ΤΟΝ ΛΧΙΑ ΔΟΚΙΜΙΟ');
    expect(accusative('ΕΠΧΙΑΣ ΔΕΙΓΜΑΤΑΣ')).toBe('ΤΟΝ ΕΠΧΙΑ ΔΕΙΓΜΑΤΑ');
    expect(accusative('την ΛΧΙΑ ΔΟΚΙΜΙΟΥ')).toBe('ΤΗΝ ΛΧΙΑ ΔΟΚΙΜΙΟΥ');
    expect(accusative('')).toBe('');
  });
  it('γενική πατρωνύμου', () => {
    expect(genitive('Γεώργιος')).toBe('ΓΕΩΡΓΙΟΥ');
    expect(genitive('ΙΩΑΝΝΗΣ')).toBe('ΙΩΑΝΝΗ');
    expect(genitive('ΑΝΔΡΕΑΣ')).toBe('ΑΝΔΡΕΑ');
    expect(genitive('ΓΕΩΡΓΙΟΥ')).toBe('ΓΕΩΡΓΙΟΥ');
  });
});

describe('4. ΠΟΙΝΕΣ', () => {
  it('ίδια ποινή σε δύο: μία πρόταση με τους δύο, στον πληθυντικό', () => {
    const s = pun(fakeState(10), [3, 2]);
    expect(s.statuses.every(x => !x.pending)).toBe(true);
    expect(linesText(hkaiPunLines(s, D))).toBe('1. ΟΙ ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ ΚΑΙ ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ ΤΙΜΩΡΗΘΗΚΑΝ ΤΗΝ 16 ΟΚΤ 26 ΑΠΟ ΤΟΝ ΛΧΙΑ ΔΟΚΙΜΙΟ ΜΕ ΔΥΟ (02) ΗΜΕΡΕΣ ΚΡΑΤΗΣΗ, ΔΙΟΤΙ ΑΡΓΗΣΕ ΣΤΟ ΠΡΟΣΚΛΗΤΗΡΙΟ.');
  });
  it('και χωριστές δηλώσεις με τα ίδια στοιχεία ενώνονται· διαφορετικός λόγος ή ημέρες όχι', () => {
    let s = pun(fakeState(10), [4]);
    s = pun(s, [5], { reason: 'Άργησε στο προσκλητήριο.' });
    s = pun(s, [6], { reason: 'άλλος λόγος' });
    s = pun(s, [7], { to: D });
    const ls = hkaiPunLines(s, D).map(l => l.map(r => r.t).join(''));
    expect(ls).toHaveLength(3);
    expect(ls.find(l => l.includes('ΤΙΜΩΡΗΘΗΚΑΝ'))).toMatch(/^\d\. ΟΙ ΣΤΡ \(ΠΖ\) ΠΛΑΣΜΑΤΙΚΟΣ ΕΨΙΛΟΝ ΚΑΙ ΣΤΡ \(ΠΖ\) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ ΤΙΜΩΡΗΘΗΚΑΝ/);
    // τρεις: «Α, Β και Γ»
    const three = hkaiPunLines(pun(fakeState(10), [2, 3, 4]), D)[0].map(r => r.t).join('');
    expect(three).toContain('ΟΙ ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ, ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ ΚΑΙ ΣΤΡ (ΠΖ) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ ΤΙΜΩΡΗΘΗΚΑΝ');
  });
  it('στο Excel: μία γραμμή για την ομάδα, υπογραμμισμένη η διάρκεια', async () => {
    const s = pun(fakeState(10), [3, 2]);
    const bk = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(1);
    expect(bk.get('G11')!.split('\n')).toHaveLength(1);
    expect(bk.get('G11')).toMatch(/^1\. ΟΙ ΣΤΡ/);
    expect(bk.get('L23')).toBe('ΑΥΛΩΝΑΣ, 16 ΟΚΤ 26');
  });
});

describe('3. ΑΔΕΙΕΣ', () => {
  it('αριθμημένες, μία ανά γραμμή, «ΓΙΑ ΤΗΝ …» για μία μέρα και «ΑΠΟ … ΕΩΣ …» για πολλές', async () => {
    let s = fakeState(10);
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [3], from: D, to: '2026-10-18', kind: 'Κανονική' } });
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [2], from: D, to: D, kind: 'ΑΜΔ' } });
    s = run(s, { t: 'declare', cmd: { type: 'HON', pids: [4], from: D, to: '2026-10-17', fromTime: '14:00', toTime: '22:00' } });
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [5], from: '2026-10-17', to: '2026-10-18', kind: 'Κανονική' } });
    expect(linesText(hkaiLeaveLines(s, D))).toBe([
      '1. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΑΔΕΙΑ ΑΜΔ ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26.',
      '2. ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 ΕΩΣ ΚΥΡ 18 ΟΚΤ 26.',
      '3. ΣΤΡ (ΠΖ) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ: ΤΙΜΗΤΙΚΗ ΑΔΕΙΑ ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 14:00 ΕΩΣ ΣΑΒ 17 ΟΚΤ 26 22:00.'].join('\n'));
    const bk = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(1);
    expect(bk.get('G10')!.split('\n')).toHaveLength(3);
  });
  it('ονόματα ειδών και διαστήματα', () => {
    expect(leaveName({ type: 'LEAVE', kind: 'Ειδική' })).toBe('ΕΙΔΙΚΗ ΑΔΕΙΑ');
    expect(leaveName({ type: 'LEAVE', kind: 'ΥΕΘΑ' })).toBe('ΑΔΕΙΑ ΥΕΘΑ');
    expect(leaveName({ type: 'SICK' })).toBe('ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ');
    expect(hkRange({ from: D, to: D, fromTime: '08:00', toTime: '14:00' })).toBe('ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 08:00 ΕΩΣ 14:00');
    expect(hkRange({ from: D, to: D, open: true })).toBe('ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 (ΧΩΡΙΣ ΛΗΞΗ)');
  });
});
