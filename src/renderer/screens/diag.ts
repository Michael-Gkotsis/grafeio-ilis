// Κρυφή οθόνη «Διάγνωση» (Ctrl+Shift+D): μνήμη ανά διεργασία, χρόνος εκκίνησης, διακόπτης GPU (έρευνα §5)
import { useEffect, useState } from 'react';
import { html, Alert, Badge, Button, Card, PageHeader } from '../ui';
import { useNav, useStore } from '../store';
import type { Diag } from '../../shared/api';

// «Μέτρηση ταχύτητας»: ανοίγει κάθε οθόνη του μενού και κάθε καρτέλα της (μόνο κλικ σε μενού και καρτέλες,
// κανένα δεδομένο δεν αλλάζει) και μετρά ως την επόμενη εικόνα. Τρεις φορές το καθένα, κρατά τη μεσαία.
// Τρέχει έξω από την οθόνη (η Διάγνωση κλείνει όσο ανοίγουν οι άλλες) και στο τέλος γυρίζει εδώ.
type Timing = { name: string; ms: number; tab?: boolean };
let lastRun: { at: string; rows: Timing[] } | null = null;
const frame = () => new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 0)));
async function clickMs(el: Element | null | undefined) {
  if (!el) return -1;
  const a = performance.now(); (el as HTMLElement).click(); await frame();
  return performance.now() - a;
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)]); };
const navBtns = () => [...document.querySelectorAll('.sidenav .navbtn:not(.sidenav__toggle)')] as HTMLElement[];
const tabsOf = () => [...(document.querySelector('.main [role=tablist]')?.querySelectorAll('[role=tab]') || [])] as HTMLElement[];
const tabName = (el: Element) => (el.textContent || '').replace(/\s*\(?\d+\)?\s*$/, '').trim();
async function runSpeed(back: () => void, onStep: (s: string) => void) {
  const REPS = 3, rows: Timing[] = [];
  const names = navBtns().map(b => b.querySelector('.navbtn__lbl')?.textContent || '');
  for (let i = 0; i < names.length; i++) {
    onStep(names[i]);
    const xs: number[] = [];
    for (let r = 0; r < REPS; r++) { await clickMs(navBtns()[i === 0 ? 1 : 0]); xs.push(await clickMs(navBtns()[i])); }
    rows.push({ name: names[i], ms: median(xs) });
    // οι καρτέλες της οθόνης· στο τέλος ξαναδιαλέγεται η καρτέλα που ήταν ανοιχτή
    const tabs = tabsOf().map(tabName), was = tabsOf().findIndex(t => t.getAttribute('aria-selected') === 'true');
    if (tabs.length > 1) for (let j = 0; j < tabs.length; j++) {
      const ys: number[] = [];
      for (let r = 0; r < REPS; r++) { await clickMs(tabsOf()[(j + 1) % tabs.length]); ys.push(await clickMs(tabsOf()[j])); }
      rows.push({ name: names[i] + ' › ' + tabs[j], ms: median(ys), tab: true });
    }
    if (was >= 0) await clickMs(tabsOf()[was]);
  }
  const d = new Date();
  lastRun = { at: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), rows };
  back();
}
const tone = (ms: number) => (ms > 1000 ? 'bad' : ms > 400 ? 'warn' : 'ok');

const mb = (kb: number) => (kb / 1024).toFixed(0) + ' MB';
export function DiagScreen() {
  const { boot } = useStore();
  const nav = useNav();
  const [d, setD] = useState<Diag | null>(null);
  const [step, setStep] = useState('');
  const load = () => window.api.diag().then(setD);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);
  if (!d) return html`<div className="boot">Φόρτωση…</div>`;
  const total = d.procs.reduce((a, p) => a + p.kb, 0);
  return html`<div>
    <${PageHeader} title="Διάγνωση" sub="Για τον έλεγχο στο μηχάνημα του γραφείου: μνήμη, ταχύτητα, έκδοση. Ενημερώνεται κάθε 3 δευτερόλεπτα."/>
    ${total > 250 * 1024 && html`<${Alert} tone="warn"><span>Η μνήμη ξεπερνά τα 250 MB. Δοκίμασε να κλείσεις την επιτάχυνση γραφικών.</span><//>`}
    <div className="settings-grid" style=${{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
      <${Card} title="Μνήμη">
        <table className="kv"><tbody>
          ${d.procs.map((p, i) => html`<tr key=${i}><th>${p.type}</th><td>${mb(p.kb)}</td><td className="muted">${p.cpu}% CPU</td></tr>`)}
          <tr><th><b>Σύνολο</b></th><td><b>${mb(total)}</b></td><td></td></tr>
        </tbody></table>
      <//>
      <${Card} title="Εκκίνηση και δεδομένα">
        <table className="kv"><tbody>
          <tr><th>Εκκίνηση ως το παράθυρο</th><td>${(d.startupMs / 1000).toFixed(1)} δευτ.</td></tr>
          <tr><th>Βάση</th><td>${d.dbKb} KB</td></tr>
          <tr><th>Άτομα / καταστάσεις / μέρες υπηρεσιών</th><td>${d.people} / ${d.statuses} / ${d.guardDays}</td></tr>
          <tr><th>Αντίγραφα ασφαλείας</th><td>${d.backups}</td></tr>
          <tr><th>Φάκελος δεδομένων</th><td className="mono">${d.dataDir}</td></tr>
          <tr><th>Έκδοση</th><td>${boot.version} · Electron ${d.versions.electron} · Chromium ${d.versions.chrome}</td></tr>
        </tbody></table>
      <//>
      <${Card} title="Εγγραφές στο Excel">
        <p className="note" style=${{ marginTop: 0 }}>Οι τελευταίες εγγραφές που έκανε μόνη της η εφαρμογή. ${d.worker ? 'Γίνονται σε ξεχωριστό νήμα, οπότε η οθόνη δεν κολλάει όσο γράφει.' : 'Γίνονται στο κύριο νήμα.'}</p>
        ${d.writes.length ? html`<table className="kv"><tbody>
          ${d.writes.map((w, i) => html`<tr key=${i}><th>${w.at} ${w.what}</th><td>${w.error ? html`<${Badge} tone="bad">δεν έγινε<//>` : (w.ms / 1000).toFixed(1).replace('.', ',') + ' δευτ.'}</td></tr>`)}
        </tbody></table>` : html`<p className="muted">Καμία εγγραφή από τότε που άνοιξε η εφαρμογή.</p>`}
      <//>
      <${Card} title="Επιτάχυνση γραφικών (GPU)">
        <p className="note" style=${{ marginTop: 0 }}>Σε παλιές κάρτες γραφικών με Windows 7 η επιτάχυνση μπορεί να τρώει μνήμη ή να δίνει μαύρη οθόνη. Δοκίμασε και τα δύο και κράτα ό,τι δείχνει λιγότερη μνήμη. Η εφαρμογή ξανανοίγει.</p>
        <p>Τώρα: <b>${d.gpuDisabled ? 'κλειστή' : 'ανοιχτή'}</b></p>
        <${Button} variant="outline" onClick=${() => window.api.setGpu(!d.gpuDisabled)}>${d.gpuDisabled ? 'Άνοιξε την επιτάχυνση' : 'Κλείσε την επιτάχυνση'}<//>
      <//>
    </div>
    <div style=${{ marginTop: '16px', maxWidth: '640px' }}>
      <${Card} title="Μέτρηση ταχύτητας">
        <p className="note" style=${{ marginTop: 0 }}>Ανοίγει μία μία τις οθόνες του μενού και τις καρτέλες τους και μετρά πόσο αργεί η καθεμία να εμφανιστεί. Δεν αλλάζει κανένα στοιχείο. Στο τέλος γυρίζει εδώ με τον πίνακα.</p>
        <${Button} disabled=${!!step} onClick=${() => { setStep('…'); runSpeed(() => nav.go('diag'), setStep); }}>${step ? 'Μετράει: ' + step : lastRun ? 'Μέτρησε ξανά' : 'Μέτρηση ταχύτητας'}<//>
        ${lastRun && html`<table className="kv" style=${{ marginTop: '12px' }}><caption className="muted" style=${{ textAlign: 'left', paddingBottom: '6px' }}>Μέτρηση στις ${lastRun.at} (κάτω από 0,4 δευτ. είναι καλά)</caption><tbody>
          ${lastRun.rows.map(r => html`<tr key=${r.name}><th style=${r.tab ? { paddingLeft: '18px', fontWeight: 400 } : undefined}>${r.name}</th><td><${Badge} tone=${tone(r.ms)}>${r.ms < 0 ? '—' : (r.ms / 1000).toFixed(2).replace('.', ',') + ' δευτ.'}<//></td></tr>`)}
        </tbody></table>`}
      <//>
    </div>
  </div>`;
}
