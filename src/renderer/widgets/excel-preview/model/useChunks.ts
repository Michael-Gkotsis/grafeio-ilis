// Which chunks of a big sheet are drawn.
// Purpose: `useChunks`, the visibility set, the measured heights and the observer that feeds them.
// Does NOT: draw anything. Owner layer: renderer/widgets/excel-preview. Why: moved from common.ts (Phase 5.3c part 2).
// Covering test: test/screens-main.test.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SheetModel } from '../../../shared/lib/sheets/model';
import { CHUNK, ROW_H, chunked } from './view';

/** Chunks near the screen are drawn (with a margin, so no gap shows in fast scrolling); the others keep their height. */
export function useChunks(model: SheetModel) {
  const [vis, setVis] = useState(() => new Set([0, 1]));
  const heights = useRef<number[]>([]);
  const [io] = useState(
    () =>
      new IntersectionObserver(
        (es) =>
          setVis((v) => {
            const n = new Set(v);
            for (const e of es) {
              const i = +(e.target as HTMLElement).dataset.chunk!;
              if (e.isIntersecting) n.add(i);
              else n.delete(i);
            }
            return n.size === v.size && [...n].every((i) => v.has(i)) ? v : n;
          }),
        { rootMargin: '600px 0px' },
      ),
  );
  useEffect(() => () => io.disconnect(), [io]);
  const big = useMemo(() => chunked(model), [model]);
  const nc = Math.ceil(model.rows.length / CHUNK);
  /** Average measured row height in px (the fallback until a chunk is measured). */
  const rowH = () => {
    let h = 0,
      n = 0;
    for (const [i, x] of heights.current.entries()) {
      if (x && i < nc) {
        h += x;
        n += Math.min(CHUNK, model.rows.length - i * CHUNK);
      }
    }
    return n ? h / n : ROW_H;
  };
  return { vis, heights, io, big, nc, rowH };
}
