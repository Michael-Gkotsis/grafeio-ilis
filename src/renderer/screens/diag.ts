// Κρυφή οθόνη «Διάγνωση» (Ctrl+Shift+D): μνήμη ανά διεργασία, χρόνος εκκίνησης, διακόπτης GPU (έρευνα §5)
import { useEffect, useState } from 'react';
import { html, Alert, Button, Card, PageHeader } from '../ui';
import { useStore } from '../store';
import type { Diag } from '../../shared/api';

const mb = (kb: number) => (kb / 1024).toFixed(0) + ' MB';
export function DiagScreen() {
  const { boot } = useStore();
  const [d, setD] = useState<Diag | null>(null);
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
      <${Card} title="Επιτάχυνση γραφικών (GPU)">
        <p className="note" style=${{ marginTop: 0 }}>Σε παλιές κάρτες γραφικών με Windows 7 η επιτάχυνση μπορεί να τρώει μνήμη ή να δίνει μαύρη οθόνη. Δοκίμασε και τα δύο και κράτα ό,τι δείχνει λιγότερη μνήμη. Η εφαρμογή ξανανοίγει.</p>
        <p>Τώρα: <b>${d.gpuDisabled ? 'κλειστή' : 'ανοιχτή'}</b></p>
        <${Button} variant="outline" onClick=${() => window.api.setGpu(!d.gpuDisabled)}>${d.gpuDisabled ? 'Άνοιξε την επιτάχυνση' : 'Κλείσε την επιτάχυνση'}<//>
      <//>
    </div>
  </div>`;
}
