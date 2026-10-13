// Ό,τι γράφει η εφαρμογή στο Excel μπαίνει με κεφαλαία χωρίς τόνους (Michael, 13/10), και όταν ξαναδιαβάζεται
// δεν μετράει ως αλλαγή (το κείμενο της εφαρμογής μένει όπως το έγραψες).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { diffStatuses, defaultBinding, parseStatuses } from '../src/shared/sources';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource } from '../src/main/sources';
import type { Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
describe('Excel με κεφαλαία', () => {
  it('κελί, κείμενο με μορφή και λίστα επιλογής', async () => {
    const wb = await Workbook.blank('Φ'); const ws = await wb.sheet('Φ');
    ws.set('A1', 'Αυλώνας, 12 Οκτ 26').set('A2', 7).addListValidation('B1:B5', ['Κανονική', 'Ειδική']);
    await wb.setRich(ws, 'C1', [[{ t: 'με ' }, { t: 'δύο ημέρες', u: true }]]);
    const back = await Workbook.open(await wb.save()); const rows = await back.values('Φ');
    expect(rows[0][0]).toBe('ΑΥΛΩΝΑΣ, 12 ΟΚΤ 26'); expect(rows[1][0]).toBe(7); expect(rows[0][2]).toBe('ΜΕ ΔΥΟ ΗΜΕΡΕΣ');
    expect((await back.sheet('Φ')).ownList(2, 1, 5)?.items).toEqual(['ΚΑΝΟΝΙΚΗ', 'ΕΙΔΙΚΗ']);
  });
  it('ποινή με πεζά στην εφαρμογή: γράφεται με κεφαλαία και ξαναδιαβάζεται χωρίς αλλαγές', async () => {
    const s0 = fakeState(5); const p = s0.people[1];
    const st: Status = { id: 'p1', pid: p.id, type: 'PUN', from: '2026-10-12', to: '2026-10-13', kind: 'Κράτηση', by: 'Λχίας Δοκίμιος', reason: 'άργησε στο προσκλητήριο', note: 'διαταγή 12' };
    const s = { ...s0, statuses: [st] };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-caps-')); const b = defaultBinding('punish', path.join(dir, 'ΠΟΙΝΕΣ.xlsx'));
    const w = await writeSource('punish', b, s, undefined, TODAY); expect(w.ok).toBe(true); if (!w.ok) return;
    const rows = (await readBook(w.file)).sheets[0].rows; const flat = rows.flat().map(String);
    expect(flat).toContain('ΚΡΑΤΗΣΗ'); expect(flat).toContain('ΑΡΓΗΣΕ ΣΤΟ ΠΡΟΣΚΛΗΤΗΡΙΟ'); expect(flat).toContain('ΔΙΑΤΑΓΗ 12');
    const bb = w.binding || b;
    const d = diffStatuses('punish', s, parseStatuses('punish', { name: bb.sheet, rows }, bb, s.people, TODAY), bb);
    expect(d.update).toEqual([]); expect(d.add).toEqual([]); expect(d.same).toBe(1);
  });
});
