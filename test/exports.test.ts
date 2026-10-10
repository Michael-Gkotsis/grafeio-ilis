import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'x' + ++seq };
const OUT = process.env.EXPORT_OUT; // προαιρετικά: φάκελος για να ανοίξεις τα αρχεία στο Excel

function busyState() {
  let s = fakeState(90);
  s = apply(s, { t: 'autofill', date: '2026-10-12' }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [20, 21, 22, 23, 24, 25, 26, 27], from: '2026-10-10', to: '2026-10-14' } }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'PUN', pids: [30], from: '2026-10-11', to: '2026-10-13', kind: 'Περιορισμός' } }, ctx).state;
  s = apply(s, { t: 'approvePun', id: s.statuses.find(x => x.type === 'PUN')!.id }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'PUN', pids: [31], from: '2026-10-12', to: '2026-10-16', kind: 'Κράτηση' } }, ctx).state;
  s = apply(s, { t: 'outs', date: '2026-10-12', changes: [40, 41, 42].map(pid => ({ pid, from: null, to: 'OUT' as const })) }, ctx).state;
  return s;
}
const save = (name: string, data: Buffer) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), data); } };

describe('εξαγωγή Excel', () => {
  it('ΦΡΟΥΡΑ: θέσεις, τιμωρημένοι και απόντες, με επιπλέον γραμμές όταν δεν χωράνε', async () => {
    const s = busyState();
    const r = await fillFroura(T('froura.xlsx'), s, '2026-10-12');
    save(r.name, r.data);
    const ws = await (await Workbook.open(r.data)).sheet(0);
    expect(ws.get('A5')).toBe('ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ 12 ΟΚΤ 2026');
    expect(ws.get('C13')).toMatch(/^ΣΤΡ|^ΔΝΕΑΣ/);
    expect(ws.get('F27')).toBeTruthy();
    expect(ws.get('B36')).toContain('ΣΤΡ');
    // 8 απόντες > 6 γραμμές: οι υπογραφές κατεβαίνουν 2 γραμμές
    expect(ws.get('I43')).toBeTruthy();
    expect(ws.get('B48')).toBe('ΑΛΧΙΑΣ ΙΛΗΣ');
    expect(r.warnings).toEqual([]);
  });
  it('ΗΚΑΙ: αριθμοί ανά βαθμό, οι τύποι μένουν, η ποινή αιτείται στις αποφάσεις', async () => {
    const s = busyState();
    const r = await fillHkai(T('hkai.xlsx'), s, '2026-10-12');
    save(r.name, r.data);
    const wb = await Workbook.open(r.data); const fr = await wb.sheet(0); const bk = await wb.sheet(1);
    expect(fr.get('A4')).toBe('ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ 4ης ΙΛΗΣ ΤΗΣ 12/10/26');
    expect(fr.get('C29')).toBe('89');
    expect(fr.get('C26')).toBe('1');
    expect(fr.get('O29')).toBe('8');
    expect(fr.formula('E29')).toBe('SUM(C29:D29)');
    expect(fr.formula('AA29')).toBe('E29-Z29');
    expect(bk.get('G11')).toContain('αιτείται κράτηση');
    expect(bk.get('L23')).toBe('Αυλώνας, 12 Οκτ 26');
  });
  it('Εξοδούχοι/Παραμένοντες: λίστες με αρίθμηση και υποσέλιδο κάτω από τη λίστα', async () => {
    const s = busyState();
    const r = await fillOuts(T('exodouxoi.xlsx'), s, '2026-10-12');
    save(r.name, r.data);
    const wb = await Workbook.open(r.data);
    const ex = await wb.sheet('ΕΞΟΔΟΥΧΟΙ'); const pa = await wb.sheet('ΠΑΡΑΜΕΝΟΝΤΕΣ');
    expect(ex.get('A5')).toBe('ΕΞΟΔΟΥΧΟΙ ΤΗΣ 12 ΟΚΤ 26');
    expect(ex.get('D9')).toBeTruthy();
    expect(ex.get('G11')).toBe('Αυλώνας, 12-10-2026');
    expect(ex.formula('A9')).toBe('ROW()-6');
    // 90 − 8 σε άδεια − 3 εξοδούχοι = 79 παραμένοντες → υποσέλιδο στη γραμμή 9+78
    expect(pa.get('D85')).toBeTruthy();
    expect(pa.get('G87')).toBe('Αυλώνας, 12-10-2026');
    expect(pa.get('D89')).toBe('ΑΛΧΙΑΣ ΙΛΗΣ');
  });
});
