// State and effects of the «Θέσεις στο χαρτί» dialog.
// Purpose: `useLayoutDialog` keeps the layout being edited, asks the main process for the preview each time it changes,
// owns the shadow-DOM host and redraws the boxes. The hooks run in the order they did in the single component.
// Does NOT: draw the dialog (ui/LayoutDialog.tsx) or touch the boxes' DOM (model/drawBlocks.ts).
// Owner layer: renderer/features/layout-edit. Why: moved verbatim from renderer/layout.ts (Phase 5.3b).
// Covering test: test/layout.test.ts.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutPv, LayoutReq } from '../../../../shared/api';
import type { Layout, LayoutForm, Move } from '../../../../shared/layout';
import type { Sig } from '../../../../shared/sigs';
import { PAGE_CSS } from '../../../shared/lib/pageCss';
import { LAY_CSS, drawBlocks } from './drawBlocks';

/** What the dialog is given. `req` builds the preview request for a layout. */
export interface LayoutDialogProps {
  title: string;
  req: (l: Layout) => LayoutReq;
  initial?: Layout;
  sigs?: Sig[];
  form?: LayoutForm;
  onSave: (l: Layout | undefined) => unknown;
  onClose: () => void;
}

/** The layout, the preview and the sheet tab; the first part of the hooks (up to the preview request). */
function usePreview(req: LayoutDialogProps['req'], initial: Layout | undefined) {
  // a deep copy: the dialog edits it and the caller's object must stay as it was
  const [layout, setLayout] = useState<Layout>(() => JSON.parse(JSON.stringify(initial || {})));
  const [pv, setPv] = useState<LayoutPv | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('');
  const sel = useRef(''); // το κουτάκι που διάλεξες (μένει διαλεγμένο μετά την ανανέωση)
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<ShadowRoot | null>(null);
  const seq = useRef(0);
  const reqRef = useRef(req);
  reqRef.current = req;
  useEffect(() => {
    const n = ++seq.current;
    setBusy(true);
    window.api.layoutPreview(reqRef.current(layout)).then(
      (x) => {
        if (n !== seq.current) return;
        if ('ok' in x) {
          setErr(x.error);
          setBusy(false);
          return;
        }
        setErr('');
        setPv(x);
        setBusy(false);
        setTab((t) => (x.sheets.some((s) => s.key === t) ? t : x.sheets[0]?.key || ''));
      },
      (e) => {
        if (n === seq.current) {
          setErr(String(e));
          setBusy(false);
        }
      },
    );
  }, [layout]);
  return { layout, setLayout, pv, busy, err, tab, setTab, sel, host, root };
}

/** The dialog's whole state: the preview, the move handler and the effects that keep the boxes on the page. */
export function useLayoutDialog({ req, initial, sigs }: LayoutDialogProps) {
  const { layout, setLayout, pv, busy, err, tab, setTab, sel, host, root } = usePreview(req, initial);
  const sheet = pv?.sheets.find((s) => s.key === tab);
  const moveBy = useCallback(
    (id: string, dr: number, dc: number) => {
      if (!dr && !dc) return;
      setLayout((l) => {
        const ms = { ...(l[tab] || {}) };
        const m: Move = ms[id] || [0, 0];
        ms[id] = [m[0] + dr, m[1] + dc];
        return { ...l, [tab]: ms };
      });
    },
    [tab],
  );
  const moveRef = useRef(moveBy);
  moveRef.current = moveBy;
  const draw = useCallback(() => drawBlocks(root.current, host.current, sheet, sigs, { sel, moveRef }), [sheet, sigs]);
  useEffect(() => {
    const el = host.current;
    if (el && !root.current) root.current = el.attachShadow({ mode: 'open' });
  }, []);
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    r.innerHTML =
      '<style>' + PAGE_CSS + (pv?.css || '') + LAY_CSS + '</style><div class="wrap">' + (sheet?.html || '') + '</div>';
  }, [pv, sheet]);
  useEffect(draw, [draw]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el.parentElement || el);
    return () => ro.disconnect();
  }, [draw]);
  return { layout, setLayout, pv, busy, err, tab, setTab, sel, host, sheet };
}
