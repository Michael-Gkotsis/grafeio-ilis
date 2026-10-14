// addDays με αριθμητική (χωρίς Date): ίδιο αποτέλεσμα με το Date σε δίσεκτα, αλλαγή ώρας και αλλαγή αιώνα
import { it, expect } from 'vitest';
import { addDays, iso } from '../src/shared/dates';
it('addDays όπως με Date', () => {
  for (const s of ['1999-12-31', '2000-02-28', '2024-02-28', '2026-03-29', '2026-10-25', '2100-02-28', '2026-12-31']) for (const n of [-400, -366, -30, -1, 0, 1, 2, 30, 365, 1000]) {
    const x = new Date(s + 'T12:00:00'); x.setDate(x.getDate() + n); expect(addDays(s, n), s + ' ' + n).toBe(iso(x));
  }
});
