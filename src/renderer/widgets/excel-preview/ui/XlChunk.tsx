// One chunk of rows of a big Excel preview. Purpose: `XlChunk`, a <tbody> that draws its rows or only a gap of its height.
// Does NOT: decide which chunks show (model/useChunks does). Owner layer: renderer/widgets/excel-preview.
// Why: moved from common.ts (Phase 5.3c part 2). Covering test: test/screens-main.test.ts.
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import type { Cell } from '../../../shared/lib/sheets/model';
import { XlRow } from './XlRow';

/** Props of `XlChunk`. */
export interface XlChunkProps {
  i: number;
  rows: (Cell | null)[][];
  /** Index of the first row of the chunk. */
  start: number;
  show: boolean;
  /** Height in px of the gap drawn while the chunk is not shown. */
  h: number;
  /** Column span of the gap. */
  span: number;
  flash: Map<number, Set<number>>;
  gen: number;
  io: IntersectionObserver;
  heights: MutableRefObject<number[]>;
}

export function XlChunk({ i, rows, start, show, h, span, flash, gen, io, heights }: XlChunkProps) {
  const ref = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    const el = ref.current!;
    io.observe(el);
    return () => io.unobserve(el);
  }, [io]);
  useLayoutEffect(() => {
    if (show) heights.current[i] = ref.current!.offsetHeight;
  });
  return (
    <tbody ref={ref} data-chunk={i}>
      {show ? (
        rows.map((r, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: cells and rows have no identity: the position is the key (and the sheet is redrawn per model)
          <XlRow key={start + k} r={r} ri={start + k} fl={flash.get(start + k)} gen={gen} />
        ))
      ) : (
        <tr className="xl__gap" style={{ height: h + 'px' }}>
          <td colSpan={span} />
        </tr>
      )}
    </tbody>
  );
}
