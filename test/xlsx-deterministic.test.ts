// Το ίδιο βιβλίο βγαίνει ίδιο byte προς byte όποτε κι αν αποθηκευτεί (31/10: το report-blank-src απέτυχε στο CI όταν οι δύο αποθηκεύσεις έπεσαν σε άλλο δευτερόλεπτο)
import { it, expect, vi } from 'vitest';
import { Workbook } from '../src/main/xlsx';
it('δύο αποθηκεύσεις με 5 δευτερόλεπτα διαφορά δίνουν το ίδιο αρχείο', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T09:00:00'));
  const mk = async () => { const wb = await Workbook.blank('Α'); (await wb.sheet(0)).set('A1', 'Χ'); return wb.save(); };
  const a = await mk(); vi.setSystemTime(new Date('2026-10-31T09:00:05')); const b = await mk(); vi.useRealTimers();
  expect(Buffer.compare(a, b)).toBe(0);
});
