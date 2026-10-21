// Πεδία ημερομηνίας με το χέρι (Michael, 21/10: ώρες και ημερομηνίες με λίστα, γράφονται και με το χέρι)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseDmy } from '../src/shared/dates';

describe('ημερομηνία γραμμένη με το χέρι', () => {
  it('δέχεται ηη/μμ, ηη.μμ.εε, ηη-μμ-εεεε', () => {
    expect(parseDmy('21/10', '2026-01-05')).toBe('2026-10-21');
    expect(parseDmy('1.2.27', '2026-01-05')).toBe('2027-02-01');
    expect(parseDmy(' 03-11-2026 ', '2025-01-01')).toBe('2026-11-03');
    expect(parseDmy('29/02/2028', '2026-01-01')).toBe('2028-02-29');
  });
  it('όχι μέρες που δεν υπάρχουν ή σκέτο κείμενο', () => {
    for (const s of ['31/02/2026', '29/02/2026', '0/1', '12/13', '2026-10-21', 'αύριο', '']) expect(parseDmy(s, '2026-10-21')).toBeNull();
  });
  it('καμία οθόνη δεν έχει δικό της <input type="date"> ή "month" (μόνο το DateField, για το ημερολόγιο)', () => {
    const dir = path.join(__dirname, '..', 'src', 'renderer');
    const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []));
    const hits = files(dir).flatMap(f => (fs.readFileSync(f, 'utf8').match(/type="(date|month|time)"/g) || []).map(() => path.relative(dir, f)));
    expect(hits).toEqual(['common.ts']);
  });
});
