// The pure rules of the «Ιστορικό» screen (pages/history/model/view.ts): the search, the source filter and the page size.
import { describe, expect, it } from 'vitest';
import { HISTORY_PAGE, filterAudit } from '../src/renderer/pages/history/model/view';
import { SRC } from '../src/renderer/shared/lib/auditSource';
import type { AuditEntry } from '../src/shared/domain';

const entry = (id: number, text: string, source: string, files: string[] = []): AuditEntry =>
  ({ id, text, source, files, day: '2026-11-10', at: '08:00', undoable: true, undone: false }) as unknown as AuditEntry;

const log = [
  entry(1, 'Άδεια του Παπαδόπουλου', 'app', ['Δυναμολόγιο.xlsx']),
  entry(2, 'Εισαγωγή αρχείου', 'excel', ['ΦΡΟΥΡΑ.xlsx']),
  entry(3, 'Αυτόματη αλλαγή', 'auto'),
];

describe('history view', () => {
  it('shows 60 lines per page', () => {
    expect(HISTORY_PAGE).toBe(60);
  });

  it('no text and source "all" keep every entry', () => {
    expect(filterAudit(log, '', 'all')).toHaveLength(3);
    expect(filterAudit(log, '   ', 'all')).toHaveLength(3);
  });

  it('search ignores accents and case and also looks in the file names', () => {
    expect(filterAudit(log, 'παπαδοπουλου', 'all').map((e) => e.id)).toEqual([1]);
    expect(filterAudit(log, 'φρουρα', 'all').map((e) => e.id)).toEqual([2]);
  });

  it('source filter combines with the search', () => {
    expect(filterAudit(log, '', 'auto').map((e) => e.id)).toEqual([3]);
    expect(filterAudit(log, 'παπαδοπουλου', 'excel')).toEqual([]);
  });

  it('every audit source has a label and a tone', () => {
    expect(Object.keys(SRC)).toEqual(['app', 'excel', 'import', 'auto']);
  });
});
