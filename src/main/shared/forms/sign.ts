// Signatures and moves on the sheets of a form.
//
// Purpose: `sigsOf` (which signatures a form gets), `signSheets` (signatures, letters and moves on every sheet),
//   `signMade` (the same for the Excel files the app makes itself) and the private `restyle`.
// Does NOT: fill a form; it only works on the finished sheets.
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: every form ends with the same step: signatures, the letters of the heading, date on the left and the positions
//   the user dragged (layout.ts). It moved verbatim (Phase 4.9a).
// Covering test: test/sigs.test.ts, test/sigs-all-forms.test.ts, test/head-date-swap.test.ts and test/layout.test.ts.
import type { AppState } from '../../../shared/domain';
import { Workbook, colName, type Sheet } from '../excel/xlsx';
import { sigsCustom, sigsFor, sigsSaved, type Sig, type SigForm } from '../../../shared/sigs';
import { SIG_TAG, placeSigs } from '../../sigs';
import { formPart, xlLook, type XlPart } from '../../../shared/xlLook';
import { applyMoves, blockOf, swapHeadDate } from '../../layout';
import type { Block, LayoutForm, LayoutSheet, Moves } from '../../../shared/layout';
import type { SheetPart, MadeMark } from './types';

/**
 * The signatures of a form: those given at the moment it is made (`over`), else the user's own from the Settings;
 * without either, the ones the form has itself stay (`sigs` is null). `def`: for the cell {ΥΠΟΓΡΑΦΕΣ} of a template of
 * the user, when nothing was changed.
 * @decision Michael 20/10: signatures per form.
 */
export function sigsOf(s: AppState, form: SigForm, over?: Sig[] | null): { sigs: Sig[] | null; def: Sig[] } {
  const def = sigsFor(s.settings, sigsSaved(s.settings, form));
  return { sigs: over ? sigsFor(s.settings, over) : sigsCustom(s.settings, form) ? def : null, def };
}

/**
 * Signatures on every sheet, and then whatever the user moved on the paper (heading, date, signatures: layout.ts).
 * Returns the layout of every sheet (the blocks and where they are now).
 */
export async function signSheets(
  wb: Workbook,
  sheets: SheetPart[],
  s: AppState,
  form: SigForm,
  over: Sig[] | null | undefined,
  warnings: string[],
  moves?: (key: string) => Moves | undefined,
): Promise<LayoutSheet[]> {
  const g = sigsOf(s, form, over);
  const out: LayoutSheet[] = [];
  const mv =
    moves || ((key: string) => (form === 'reports' ? undefined : s.settings.layout?.[form as LayoutForm]?.[key]));
  const L = xlLook(s.settings);
  const hdr = formPart(L, 'hdr'),
    sig = formPart(L, 'sig');
  for (const x of sheets) {
    const mine = x.sigs ?? g;
    const sg = await placeSigs(wb, x.ws, mine.sigs, mine.def, warnings, {
      tagOnly: x.tagOnly,
      after: x.after,
      names: x.names,
    });
    const blocks = [...x.more.filter((b): b is Block => !!b), ...sg];
    // letters of the heading and of the signatures (Settings > Γράμματα Excel), before they are moved
    for (const b of blocks) {
      const o = b.id === 'head' ? hdr : /^s\d/.test(b.id) ? sig : null;
      if (o) await restyle(wb, x.ws, b, o);
    }
    // date on the left and heading on the right (unless hdLeft); the positions the user dragged count AFTER, from the
    // new place (Michael, 29/10 22:04: the ΗΚΑΙ keeps the heading on the left)
    const sw = s.settings.hdLeft || form === 'hkai' ? blocks : await swapHeadDate(wb, x.ws, blocks);
    out.push({ key: x.key, sheet: x.ws.name, blocks: applyMoves(wb, x.ws, sw, mv(x.key)) });
  }
  return out;
}

/**
 * The Excel files the app makes itself (excel.ts: Έλεγχος υπηρεσιών, Δυναμολόγιο, Στελέχη, Οπλισμός) like all forms:
 * the signatures of their list one empty row under each sheet, over its whole width, and then whatever the user moved
 * (heading, date, title, signatures). Without signatures and moves the sheet stays as it was.
 * @decision Michael 22/10: the made Excel files get signatures and moves like the forms.
 */
export async function signMade(
  data: Buffer,
  s: AppState,
  form: SigForm,
  marks: MadeMark[],
  over?: Sig[] | null,
): Promise<{ data: Buffer; warnings: string[]; layout: LayoutSheet[] }> {
  const wb = await Workbook.open(data);
  wb.widen = true;
  const warnings: string[] = [];
  const g = sigsOf(s, form, over);
  const list = g.sigs ?? g.def;
  const L = xlLook(s.settings);
  const st = list.length ? await wb.style({ font: L.font, sz: L.sz, b: true, h: 'center', v: 'center' }) : 0;
  const parts: SheetPart[] = [];
  for (const m of marks) {
    if (!wb.hasSheet(m.sheet)) continue;
    const ws = await wb.sheet(m.sheet);
    if (list.length) {
      const r = m.foot + 2;
      ws.set('A' + r, SIG_TAG).setStyle('A' + r, st);
      if (m.cols > 1) {
        for (let c = 2; c <= m.cols; c++) ws.setStyle(colName(c) + r, st);
        ws.addMerge('A' + r + ':' + colName(m.cols) + r);
      }
    }
    parts.push({
      ws,
      key: m.key,
      tagOnly: true,
      more: [blockOf(ws, 'head', m.head), blockOf(ws, 'date', m.date), blockOf(ws, 'title', m.title)],
    });
  }
  const layout = await signSheets(wb, parts, s, form, over, warnings);
  for (const p of parts) p.ws.markAll();
  return { data: await wb.save(), warnings, layout };
}

/**
 * The text cells of a piece with another size, bold, italic or underline; in texts with formatting per run the size of
 * the runs changes too.
 */
export async function restyle(wb: Workbook, ws: Sheet, b: Block, o: XlPart) {
  for (let r = b.r1; r <= b.r2; r++)
    for (let c = b.c1; c <= b.c2; c++) {
      const ref = colName(c) + r;
      const x = ws.raw(ref);
      if (!x) continue;
      ws.setStyle(ref, await wb.partStyle(x.s, o));
      if (o.sz && x.inner.includes('<r>')) ws.sizeRuns(ref, o.sz);
    }
}
