// Προεπισκόπηση του ΙΔΙΟΥ αρχείου που γράφει η εξαγωγή (Michael, 24/11: «πάντα να αντικατοπτρίζεται το σωστό έντυπο»):
// το main φτιάχνει το Excel όπως στο «Βγάλε το Excel» και το γυρίζει σε σελίδες (form:preview)· εδώ φαίνονται όπως θα τυπωθούν.
// Ξαναφτιάχνεται μόνη της μετά από κάθε αλλαγή (watch), με το προηγούμενο να μένει στην οθόνη ως τότε.
import { useCallback, useEffect, useRef, useState } from 'react';
import { html, cx, Alert, Button, Segmented } from './ui';
import { PAGE_CSS } from './pageCss';
import type { FormPv, FormPvReq } from '../shared/api';

const WAIT = 500;   // ms μετά την τελευταία αλλαγή (το Atom φτιάχνει ένα xlsx κάθε φορά)
// μόνο στην οθόνη: ροζ πάνω στα κελιά των κενών θέσεων (το αρχείο και η εκτύπωση μένουν όπως είναι)
const markCss = (marks: string[]) => (marks.length ? marks.map(a => 'td[data-a="' + a + '"]').join(',') + '{background-image:linear-gradient(rgba(255,64,110,.34),rgba(255,64,110,.34))}' : '');
const pagesIn = (h: string) => (h.match(/<div class="pg[ "]/g) || []).length;

// req: τι αρχείο (kind, date…)· watch: ό,τι αλλάζει όταν αλλάζουν τα δεδομένα (π.χ. state)· sheet: ποιο φύλλο (αλλιώς καρτέλες εδώ)
// initial: έτοιμη προεπισκόπηση (δοκιμές), χωρίς αίτηση
export interface RealPreviewProps { req: FormPvReq; watch?: unknown; sheet?: number; initial?: FormPv; onLoad?: (pv: FormPv) => void; className?: string }
export function RealPreview({ req, watch, sheet, initial, onLoad, className }: RealPreviewProps) {
  const [pv, setPv] = useState<FormPv | null>(initial || null); const [busy, setBusy] = useState(!initial); const [err, setErr] = useState('');
  const [tab, setTab] = useState(0); const [page, setPage] = useState(1); const [retry, setRetry] = useState(0);
  const seq = useRef(0); const last = useRef(''); const now = useRef(false); const onLoadRef = useRef(onLoad); onLoadRef.current = onLoad;
  const key = JSON.stringify(req); useEffect(() => () => { seq.current++; }, []);
  const [vis, setVis] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => { const f = () => setVis(document.visibilityState !== 'hidden'); document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, []);
  useEffect(() => {
    if (initial || !vis) return;
    const n = ++seq.current; setBusy(true);
    const t = setTimeout(() => {
      window.api.formPreview(JSON.parse(key)).then(x => {
        if (n !== seq.current) return;   // πιο νέα αίτηση έχει ξεκινήσει: αυτή η απάντηση είναι παλιά
        setBusy(false);
        if ('ok' in x) { setErr(x.error); return; }
        setErr(''); setPv(x); onLoadRef.current?.(x);
      }, e => { if (n === seq.current) { setBusy(false); setErr(String(e)); } });
    }, last.current === key && !now.current ? WAIT : 0); now.current = false;   // άλλο αρχείο ή ημέρα: αμέσως· αλλαγή δεδομένων: μετά από λίγο
    last.current = key;
    return () => clearTimeout(t);
  }, [key, watch, retry, vis]);   // eslint-disable-line react-hooks/exhaustive-deps
  const i = Math.min(sheet ?? tab, Math.max(0, (pv?.sheets.length || 1) - 1)); const cur = pv?.sheets[i];
  const pages = cur ? pagesIn(cur.html) : 0; const pg = Math.max(1, Math.min(page, pages || 1));
  useEffect(() => { setPage(1); }, [i, key]);
  const host = useRef<HTMLDivElement>(null); const root = useRef<ShadowRoot | null>(null);
  // η σελίδα σε όλο το πλάτος του πλαισίου· οι αριθμοί του renderBook είναι σε px της σελίδας
  const fit = useCallback(() => {
    const r = root.current, el = host.current; if (!r || !el) return;
    const w = r.querySelector('.wrap') as HTMLElement | null, p = r.querySelector('.pg:not([hidden])') as HTMLElement | null;
    if (w) (w.style as unknown as { zoom: string }).zoom = p ? String(Math.min(1, (el.clientWidth - 4) / p.offsetWidth)) : '1';
  }, []);
  useEffect(() => {
    const el = host.current; if (!el) return; if (!root.current) root.current = el.attachShadow({ mode: 'open' });
    root.current.innerHTML = '<style>' + PAGE_CSS + (pv?.css || '') + markCss(pv?.marks || []) + '</style><div class="wrap">' + (cur?.html || '') + '</div>';
    root.current.querySelectorAll('.pg').forEach((p, k, all) => { (p as HTMLElement).hidden = all.length > 1 && k !== pg - 1; });
    fit();
  }, [pv, i, pg, fit]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = host.current; if (!el || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect(); }, [fit]);
  return html`<div className=${cx('realpv', className)}>
    <div className="rep-pvbar">
      ${sheet == null && pv && pv.sheets.length > 1 && html`<${Segmented} small=${true} value=${String(i)} onChange=${(v: string) => setTab(+v)} items=${pv.sheets.map((s, k) => ({ value: String(k), label: s.name }))}/>`}
      ${busy && pv && html`<span className="realpv__busy" role="status">Ενημερώνεται…</span>`}
      ${pages > 1 && html`<span className="rep-pvbar__pg"><${Button} size="icon" variant="ghost" aria-label="Προηγούμενη σελίδα" data-tip="Προηγούμενη σελίδα" disabled=${pg <= 1} onClick=${() => setPage(pg - 1)}>‹<//><span role="status">${'Σελίδα ' + pg + ' από ' + pages}</span><${Button} size="icon" variant="ghost" aria-label="Επόμενη σελίδα" data-tip="Επόμενη σελίδα" disabled=${pg >= pages} onClick=${() => setPage(pg + 1)}>›<//></span>`}
    </div>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><${Button} size="sm" variant="outline" onClick=${() => { now.current = true; setRetry(n => n + 1); }}>Ξαναδοκίμασε<//><//>`}
    <div className=${cx('rep-pv', busy && 'is-busy')}>
      <div ref=${host} className="rep-pv__page"></div>
      ${!pv && !err && html`<div className="empty">Φτιάχνεται η προεπισκόπηση…</div>`}
    </div>
    ${pv && pv.warnings.length > 0 && html`<ul className="realpv__warn">${pv.warnings.map((w, k) => html`<li key=${k}>${w}</li>`)}</ul>`}
  </div>`;
}
