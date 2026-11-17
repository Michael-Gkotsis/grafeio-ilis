// Πλέγμα μήνα (Πρόγραμμα αδειών στελεχών, Michael 17/11): γραμμές × μέρες με σκίαση ΣΚ και αργιών, κελί που το ζωγραφίζει ο καλών και επιλογή
// διαστήματος (σύρσιμο στην ίδια γραμμή, ή κλικ και Shift+κλικ). Χωρίς γνώση για στελέχη: η φάση 3 το ξαναχρησιμοποιεί για τις «Υπηρεσίες
// στελεχών». Οι γραμμές είναι memo: στο σύρσιμο ξαναζωγραφίζεται μόνο η γραμμή της επιλογής (και όχι οι 60 × 31 κελιά).
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { html, cx } from './ui';
import type { PlanDay } from '../shared/cadrePlan';

export interface GridCell { text?: string; cls?: string; tip?: string; mark?: boolean }
// head/tail: ό,τι μπαίνει στην πρώτη και στην τελευταία στήλη της γραμμής· κρατήστε το ίδιο αντικείμενο γραμμής όσο δεν αλλάζει (memo)
// tails: περισσότερες στήλες στο τέλος (Σ, Όριο, Μεταφορά)· band: γραμμή-επικεφαλίδα ομάδας (μία κελί σε όλο το πλάτος, χωρίς μέρες, δεν επιλέγεται)
export interface GridRow { id: string; head: any; tail?: any; tails?: any[]; cells: GridCell[]; cls?: string; band?: any }
export interface GridSel { row: string; from: number; to: number }   // from ≤ to: δείκτες μέρας (0 = 1η του μήνα)

interface RowProps { row: GridRow; days: PlanDay[]; lo: number; hi: number; wide: number }
const Row = memo(function Row({ row, days, lo, hi, wide }: RowProps) {
  if (row.band !== undefined) return html`<tr className=${cx('mg-band', row.cls)} data-band=${row.id}><th colSpan=${wide} scope="colgroup">${row.band}</th></tr>`;
  return html`<tr data-row=${row.id} className=${row.cls}><th className="mg-name" scope="row">${row.head}</th>
    ${days.map((d, i) => { const c = row.cells[i]; return html`<td key=${i} data-i=${i} data-tip=${c?.tip || undefined} className=${cx('mg-c', d.hol ? 'is-hol' : d.we && 'is-we', c?.cls, hi >= 0 && i >= lo && i <= hi && 'is-sel')}>${c?.text}${c?.mark && html`<i className="mg-x" aria-label="Δεν θέλει υπηρεσία">✕</i>`}</td>`; })}
    ${row.tail !== undefined && html`<td className="mg-tail">${row.tail}</td>`}${row.tails?.map((t, i) => html`<td key=${'t' + i} className="mg-tail mg-tail--n">${t}</td>`)}</tr>`;
});
const Head = memo(function Head({ days, headLabel, tailLabel, tailLabels }: { days: PlanDay[]; headLabel: string; tailLabel?: string; tailLabels?: string[] }) {
  return html`<thead><tr><th className="mg-name">${headLabel}</th>${days.map(d => html`<th key=${d.n} data-tip=${d.hol || undefined} className=${cx('mg-d', d.hol ? 'is-hol' : d.we && 'is-we')}><b>${d.n}</b><span>${d.dow}</span></th>`)}${tailLabel != null && html`<th className="mg-tail">${tailLabel}</th>`}${tailLabels?.map((t, i) => html`<th key=${'t' + i} className="mg-tail mg-tail--n">${t}</th>`)}</tr></thead>`;
});

interface Props { days: PlanDay[]; rows: GridRow[]; headLabel: string; tailLabel?: string; tailLabels?: string[]; label?: string; menu: (sel: GridSel, close: () => void) => any }
export function MonthGrid({ days, rows, headLabel, tailLabel, tailLabels, label, menu }: Props) {
  const [sel, setSel] = useState<(GridSel & { a: number }) | null>(null);   // a: από πού ξεκίνησε το σύρσιμο
  const [at, setAt] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const drag = useRef(false); const boxRef = useRef<HTMLDivElement>(null); const menuRef = useRef<HTMLDivElement>(null); const selRef = useRef(sel); selRef.current = sel;
  const close = useCallback(() => { setAt(null); setSel(null); drag.current = false; }, []);
  const cellOf = (t: EventTarget | null) => { const td = (t as Element | null)?.closest?.('td[data-i]') as HTMLElement | null; const tr = td?.parentElement as HTMLElement | null; return td && tr?.dataset.row != null ? { td, row: tr.dataset.row, i: +td.dataset.i! } : null; };
  const down = (e: any) => {
    if (e.button !== 0) return; const c = cellOf(e.target); if (!c) return;
    e.preventDefault(); setAt(null);
    const cur = selRef.current;
    // Shift+κλικ: επεκτείνει από το κελί που διάλεξες πριν, στην ίδια γραμμή
    const a = e.shiftKey && cur && cur.row === c.row ? cur.a : c.i;
    drag.current = true; setSel({ row: c.row, a, from: Math.min(a, c.i), to: Math.max(a, c.i) });
  };
  const over = (e: any) => {
    if (!drag.current) return; const c = cellOf(e.target); const cur = selRef.current; if (!c || !cur || c.row !== cur.row) return;
    const from = Math.min(cur.a, c.i), to = Math.max(cur.a, c.i);
    if (from !== cur.from || to !== cur.to) setSel({ ...cur, from, to });
  };
  useEffect(() => {
    const up = (e: MouseEvent) => {
      if (!drag.current) return; drag.current = false;
      const cur = selRef.current; if (!cur) return;
      const c = cellOf(e.target); const box = boxRef.current;
      const td = (c && c.row === cur.row ? c.td : box?.querySelector(`tr[data-row="${CSS.escape(cur.row)}"] td[data-i="${cur.to}"]`)) as HTMLElement | null; if (!td) return;
      const r = td.getBoundingClientRect(); const up2 = r.bottom + 260 > window.innerHeight && r.top > 280;
      setAt({ x: Math.max(8, Math.min(r.left, window.innerWidth - 268)), y: up2 ? r.top - 4 : r.bottom + 4, up: up2 });
    };
    document.addEventListener('mouseup', up); return () => document.removeEventListener('mouseup', up);
  }, []);
  // κλικ έξω από το μενού και το πλέγμα, ή Esc: κλείνει
  useEffect(() => {
    if (!sel) return;
    const md = (e: MouseEvent) => { const t = e.target as Node; if (menuRef.current?.contains(t) || boxRef.current?.querySelector('tbody')?.contains(t)) return; close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('mousedown', md); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', md); document.removeEventListener('keydown', key, true); };
  }, [!!sel, close]);
  return html`<div className="mg" ref=${boxRef}><div className="mg__scroll"><table className="mg-table" aria-label=${label}>
    <${Head} days=${days} headLabel=${headLabel} tailLabel=${tailLabel} tailLabels=${tailLabels}/>
    <tbody onMouseDown=${down} onMouseOver=${over}>${rows.map(r => html`<${Row} key=${r.id} row=${r} days=${days} wide=${days.length + 1 + (tailLabel != null ? 1 : 0) + (tailLabels?.length || 0)} lo=${sel && sel.row === r.id ? sel.from : -1} hi=${sel && sel.row === r.id ? sel.to : -1}/>`)}</tbody></table></div>
    ${sel && at && html`<div className="mg-menu" ref=${menuRef} style=${{ left: at.x, top: at.y, transform: at.up ? 'translateY(-100%)' : undefined }} role="menu">${menu({ row: sel.row, from: sel.from, to: sel.to }, close)}</div>`}</div>`;
}
