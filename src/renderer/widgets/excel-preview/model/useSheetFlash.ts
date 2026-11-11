// Flash of changed cells in the Excel preview.
// Purpose: `useSheetFlash`, the state and the two effects that mark cells that changed in the same document.
// Does NOT: draw anything. Owner layer: renderer/widgets/excel-preview. Why: moved from common.ts (Phase 5.3c part 2).
// Covering test: test/screens-main.test.ts.
import { useEffect, useRef, useState } from 'react';
import type { SheetModel } from '../../../shared/lib/sheets/model';
import { changedCells } from './view';

/**
 * Highlights cells only when cells of the same form change (e.g. an assignment), not on another day, month or search,
 * where everything changes and flashing thousands of cells would freeze the screen without saying anything.
 */
export function useSheetFlash(model: SheetModel, fileName: string, sheetName: string) {
  const prev = useRef<{ model: SheetModel; doc: string } | null>(null);
  const [flash, setFlash] = useState({ rows: new Map<number, Set<number>>(), gen: 0 });
  useEffect(() => {
    const p = prev.current;
    const doc = fileName + '|' + sheetName;
    if (
      p &&
      p.model !== model &&
      p.doc === doc &&
      p.model.rows.length === model.rows.length &&
      p.model.cols.length === model.cols.length
    ) {
      const ch = changedCells(p.model, model);
      if (ch.size) setFlash((f) => ({ rows: ch, gen: f.gen + 1 }));
    }
    prev.current = { model, doc };
  }, [model]);
  useEffect(() => {
    if (!flash.rows.size) return;
    const t = setTimeout(() => setFlash((f) => ({ rows: new Map(), gen: f.gen })), 1900);
    return () => clearTimeout(t);
  }, [flash]);
  return flash;
}
