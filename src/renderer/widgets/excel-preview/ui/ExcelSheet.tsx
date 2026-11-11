// «Προεπισκόπηση»: draws a SheetModel like Excel and flashes the cells that changed.
// Purpose: `ExcelSheet`, used by the Υπηρεσίες (ΦΡΟΥΡΑ), ΗΚΑΙ and form previews.
// Does NOT: build the model (shared/lib/sheets does) or write Excel (main/exports does).
// Owner layer: renderer/widgets/excel-preview. Why: moved verbatim from common.ts (Phase 5.3c part 2).
// Covering test: test/screens-main.test.ts, test/excel-preview.test.ts.
import { memo } from 'react';
import type { SheetModel } from '../../../shared/lib/sheets/model';
import { useChunks } from '../model/useChunks';
import { useFitZoom } from '../model/useFitZoom';
import { useSheetFlash } from '../model/useSheetFlash';
import { CHUNK, columnLetters } from '../model/view';
import { XlChunk } from './XlChunk';
import { XlRow } from './XlRow';

/** Props of `ExcelSheet`. */
export interface ExcelSheetProps {
  model: SheetModel;
  fileName: string;
  sheetName: string;
  meta?: string;
  footer?: string;
}

export const ExcelSheet = memo(function ExcelSheet({ model, fileName, sheetName, meta, footer }: ExcelSheetProps) {
  const flash = useSheetFlash(model, fileName, sheetName);
  const letters = columnLetters(model.cols);
  const { fit, set, box, natural, z } = useFitZoom(model);
  const { vis, heights, io, big, nc, rowH } = useChunks(model);
  const body = big ? (
    Array.from({ length: nc }, (_, i) => {
      const rows = model.rows.slice(i * CHUNK, (i + 1) * CHUNK);
      return (
        <XlChunk
          // biome-ignore lint/suspicious/noArrayIndexKey: cells and rows have no identity: the position is the key (and the sheet is redrawn per model)
          key={i}
          i={i}
          rows={rows}
          start={i * CHUNK}
          show={vis.has(i)}
          h={Math.round(rows.length * rowH())}
          span={model.cols.length + 1}
          flash={flash.rows}
          gen={flash.gen}
          io={io}
          heights={heights}
        />
      );
    })
  ) : (
    <tbody>
      {model.rows.map((r, ri) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: cells and rows have no identity: the position is the key (and the sheet is redrawn per model)
        <XlRow key={ri} r={r} ri={ri} fl={flash.rows.get(ri)} gen={flash.gen} />
      ))}
    </tbody>
  );
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: frozen markup, the label names the preview region
    <div className="xl" aria-label={'Προεπισκόπηση ' + fileName}>
      <div className="xl__bar">
        <span className="xl__fn">{fileName}</span>
        <span>· φύλλο «{sheetName}»</span>
        <span className="xl__meta">{meta}</span>
        <button
          type="button"
          className="xl__zoom"
          aria-pressed={fit}
          data-tip={fit ? 'Σε πραγματικό μέγεθος (100%)' : 'Να χωρά όλο το πλάτος'}
          data-tip-side="left"
          onClick={() => set('xlZoom', fit ? '100' : 'fit')}
        >
          {fit ? 'Χωρά' + (z < 1 ? ' · ' + Math.round(z * 100) + '%' : '') : '100%'}
        </button>
      </div>
      <div className="xl__scroll" ref={box}>
        <table style={z < 1 ? { width: natural + 'px', minWidth: 0, zoom: z } : undefined}>
          <colgroup>
            <col style={{ width: '28px' }} />
            {model.cols.map((w, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cells and rows have no identity: the position is the key (and the sheet is redrawn per model)
              <col key={i} style={w ? { width: w + 'px' } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th />
              {model.cols.map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells and rows have no identity: the position is the key (and the sheet is redrawn per model)
                <th key={i}>{letters[i]}</th>
              ))}
            </tr>
          </thead>
          {body}
        </table>
      </div>
      {footer && <div className="xl__foot">{footer}</div>}
    </div>
  );
});
