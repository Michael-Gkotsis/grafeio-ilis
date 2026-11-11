// «Χωρά» zoom of the Excel preview.
// Purpose: `useFitZoom`, the CSS zoom that makes the whole width of a sheet visible.
// Does NOT: draw anything. Owner layer: renderer/widgets/excel-preview. Why: moved from common.ts (Phase 5.3c part 2).
// Covering test: test/screens-main.test.ts.
import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../../../prefs';
import type { SheetModel } from '../../../shared/lib/sheets/model';

/** The sheet shrinks so that the whole width shows (CSS zoom, measured only when the width changes). */
export function useFitZoom(model: SheetModel) {
  const { prefs, set } = usePrefs();
  const fit = prefs.xlZoom === 'fit';
  const box = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || !fit) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, [fit]);
  const natural = 28 + model.cols.reduce((a, w) => a + (w || 64), 0);
  const z = fit && cw > 0 && natural > cw ? Math.max(0.4, (cw - 2) / natural) : 1;
  return { fit, set, box, natural, z };
}
