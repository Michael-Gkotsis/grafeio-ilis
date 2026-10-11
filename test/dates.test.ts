// Οι γρήγορες εκδοχές (μνήμη στο addDays, αριθμητική στο weekday) δίνουν ό,τι και το Date, και γύρω από θερινή ώρα και δίσεκτα
import { describe, expect, it } from 'vitest';
import { addDays, isWeekend, iso, parseD, weekday } from '../src/shared/dates';

describe('ημερομηνίες', () => {
  it('weekday και isWeekend ίδια με το Date για 6 χρόνια', () => {
    for (let i = 0; i < 6 * 366; i++) {
      const d = iso(new Date(2024, 0, 1 + i, 12));
      expect(weekday(d)).toBe(parseD(d).getDay());
      expect(isWeekend(d)).toBe([0, 6].includes(parseD(d).getDay()));
    }
  });
  it('addDays ίδιο και τη δεύτερη φορά (από τη μνήμη), και πάνω από αλλαγή ώρας', () => {
    for (const [d, n, r] of [['2026-03-28', 1, '2026-03-29'], ['2026-03-29', 1, '2026-03-30'], ['2026-10-25', -1, '2026-10-24'], ['2028-02-28', 1, '2028-02-29'], ['2026-12-31', 1, '2027-01-01']] as const) {
      expect(addDays(d, n)).toBe(r); expect(addDays(d, n)).toBe(r);
    }
  });
});
