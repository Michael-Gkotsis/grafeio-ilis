// The IPC handlers of the report preview and the layout preview.
//
// Purpose: `registerReportPreviewIpc` (`repPreview`) and `registerLayoutPreviewIpc` (`layoutPreview`, for reports and
//   for the forms of the layout editor).
// Does NOT: write a file, count outputs, or keep state; both only render.
// Owner layer: main (architecture), `features/reports`. Imports app/*, `ipc/handle`, `features/exports`, shared/*.
// Why: moved verbatim from main.ts (Phase 4.4), same channels in the same order. `layoutPreview` also serves the
//   forms (`produce`/`made` of `features/exports`) and the print engine; it stays with the report preview because the
//   report branch is the one that uses `savedSigs`.
// Covering test: test/ipc-contract.test.ts (channels); the Electron comparison in the PR description.
import type { Fail, LayoutPv, LayoutReq } from '../../../shared/api';
import type { ISODate } from '../../../shared/dates';
import type { LayoutSheet } from '../../../shared/layout';
import { PV_PAGES } from '../../../shared/repPage';
import { forBuild, withBuilt, type BuildOpts, type Report } from '../../../shared/reports';
import { xlLook } from '../../../shared/xlLook';
import type { MadeKind } from '../../app/tables';
import { tplBuf } from '../../app/paths';
import { store } from '../../app/state';
import { handle } from '../../ipc/handle';
import { off } from '../../offload';
import { renderBook } from '../../print';
import { buildTemplate, fillReport, previewReport, previewTemplate } from '../../reports';
import { Workbook } from '../../xlsx';
import { fail } from '../commands';
import { made, produce } from '../exports';
import { savedSigs } from './sheet';

/** Registers `repPreview`: the report preview (a saved template, or one built on the fly). */
export function registerReportPreviewIpc() {
  // opts.sample (creation page): how many rows each table shows; then also many pages. Only here, never in rep:run
  handle(
    'repPreview',
    async (
      _e,
      src: { file?: string; build?: BuildOpts },
      r: Report,
      ids: (number | string)[],
      date: ISODate,
      raw: boolean,
      opts?: { sample?: number },
    ) => {
      try {
        const s = store.state;
        const sample = typeof opts?.sample === 'number' ? opts.sample : undefined;
        const pages = sample == null ? 1 : PV_PAGES;
        if (src.build)
          return await off(
            'previewBuilt',
            [src.build, r, ids, date, pages, sample],
            async () => {
              const o = forBuild(src.build!, r);
              const b = await buildTemplate(o, r.kind, xlLook(s.settings));
              return previewReport(b.data, s, withBuilt(r, b, o), ids, date, pages, sample);
            },
            s,
          );
        const buf = await tplBuf(src.file || '');
        if (raw) return await off('previewTemplate', [buf, r.sheet], () => previewTemplate(buf, r.sheet));
        return await off(
          'previewReport',
          [buf, r, ids, date, pages, sample],
          () => previewReport(buf, s, r, ids, date, pages, sample),
          s,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
/** Registers `layoutPreview`: the positions on the paper of a report or a form, with a print-layout rendering. */
export function registerLayoutPreviewIpc() {
  // out 'sheet': a sheet inside the Δυναμολόγιο or another Excel (force: the user said to write over a sheet it did
  // not make);
  // print: always a new file in the Excel folder and a print preview of all its sheets
  // opts.quiet: does not open the Excel (Έντυπα ημέρας › «Τύπωσε όλα») · opts.again: «Ξαναβγάλε» from the history
  // (does not count the random picks again)
  // Positions on the paper: the report as it will come out (today), with 8 extra rows so that something can be
  // dragged down
  handle('layoutPreview', async (_e, q: LayoutReq): Promise<LayoutPv | Fail> => {
    try {
      const s = store.state;
      let out: { data: Buffer; warnings?: string[]; layout?: LayoutSheet[] };
      if ('report' in q) {
        // «Φτιάξ' το εδώ» inside the wizard: the template from the choices, no file yet (like the preview)
        const bo = q.build ? forBuild(q.build, q.report) : null;
        const b = bo ? await buildTemplate(bo, q.report.kind, xlLook(s.settings)) : null;
        const buf = b ? b.data : await tplBuf(q.file || '');
        const rep = b ? withBuilt(q.report, b, bo!) : savedSigs(q.report, q.file || '');
        out = await off(
          'fillReport',
          [buf, rep, q.ids.slice(0, 120), q.date],
          () => fillReport(buf, s, rep, q.ids.slice(0, 120), q.date),
          s,
        );
      } else {
        const s2 = q.layout
          ? { ...s, settings: { ...s.settings, layout: { ...s.settings.layout, [q.form]: q.layout } } }
          : s;
        const f = q.form;
        out =
          f === 'hkai' || f === 'froura' || f === 'outs' || f === 'check'
            ? await produce(f, q.date, s2, q.sigs)
            : await made((f === 'roster' ? 'rosterPreview' : f) as MadeKind, q.date, s2, q.sigs);
      }
      // sheets with the same layout (same key, e.g. one per filter): only the first is shown
      const ls = (out.layout || []).filter((l, i, a) => a.findIndex((x) => x.key === l.key) === i);
      const wb = await Workbook.open(out.data);
      for (const l of ls) {
        const r = wb.printLastRow(l.sheet);
        if (r) wb.printDownTo(l.sheet, r + 8);
      }
      const doc = await renderBook(await wb.save(), {
        file: 'προεπισκόπηση.xlsx',
        sheets: ls.map((l) => l.sheet),
        refs: true,
        maxPages: 2,
      });
      return {
        css: doc.css,
        warnings: out.warnings || [],
        sheets: ls.map((l) => {
          const sh = doc.sheets.find((x) => x.name === l.sheet);
          return { ...l, html: sh?.html || '', pages: sh?.pages || 0 };
        }),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
