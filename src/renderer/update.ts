// Αυτόματη ενημέρωση (UI): κουμπί «Νέα έκδοση» πάνω δεξιά, το παράθυρο με τα βήματα και η κάρτα Ρυθμίσεις › Ενημερώσεις.
// Την κατάσταση την κρατά ο main (updater.ts)· εδώ μόνο φαίνεται και στέλνονται εντολές. Αν λείπει ή αποτύχει, δεν φαίνεται τίποτα.
import { useEffect, useState } from 'react';
import { html, Alert, Button, Card, Dialog, useToast } from './ui';
import { dmy, today as todayISO } from '../shared/dates';
import type { UpdInfo } from '../shared/api';

let cur: UpdInfo | null = null, started = false;
const subs = new Set<() => void>();
const set = (i: UpdInfo | null) => { if (!i) return; cur = i; subs.forEach(f => f()); };
function init() {
  if (started) return; started = true;
  try { window.api.updInfo?.().then(set, () => {}); window.api.onUpdate?.(set); } catch { /* χωρίς ενημερώσεις */ }
}
export function useUpd(): UpdInfo | null {
  const [, force] = useState(0);
  useEffect(() => { init(); const f = () => force(x => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return cur;
}
const mb = (n: number) => (n / 1048576).toFixed(1).replace('.', ',');
const hmOf = (t: number) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const dayOf = (t: number) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

export function UpdateChip({ u, onOpen }: { u: UpdInfo | null; onOpen: () => void }) {
  if (!u || (!u.avail && u.phase === 'idle')) return null;
  const ready = u.phase === 'ready', work = u.phase === 'working';
  return html`<${Button} variant="outline" size="sm" className="updchip" data-tip=${ready ? 'Η ενημέρωση είναι έτοιμη' : work ? 'Γίνεται ενημέρωση…' : 'Υπάρχει νέα έκδοση (' + u.avail!.version + ')'} data-tip-side="bottom" onClick=${onOpen}>↑ <span className="updchip__long">${ready ? 'Έτοιμη ενημέρωση' : work ? 'Ενημέρωση…' : 'Νέα έκδοση'}</span><span className="updchip__short">${ready ? 'Έτοιμη' : work ? '…' : 'Νέα'}</span><//>`;
}

// Το παράθυρο ανοίγει μόνο του όταν ο main το ζητά (offer) ή όταν ξεκινά ενημέρωση από τις Ρυθμίσεις
export function useUpdDialog(u: UpdInfo | null): [boolean, (b: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (u?.offer) { setOpen(true); window.api.updSeen(true).catch(() => {}); } }, [u?.offer]);
  useEffect(() => { if (u?.phase === 'working') setOpen(true); }, [u?.phase]);
  return [open, setOpen];
}

export function UpdateDialog({ u, onClose }: { u: UpdInfo; onClose: () => void }) {
  const [skip, setSkip] = useState(false);
  const a = u.avail;
  const later = () => { if (skip) window.api.updSkip(); onClose(); };
  if (u.phase === 'ready') {
    return html`<${Dialog} title="Η ενημέρωση είναι έτοιμη" description=${'Κατέβηκε και ελέγχθηκε η ' + (u.readyVersion || u.target)} onClose=${onClose}
      footer=${html`<${Button} variant="outline" onClick=${onClose}>Στο κλείσιμο<//><${Button} data-autofocus="" onClick=${() => window.api.updRestart()}>Επανεκκίνηση τώρα<//>`}>
      <p style=${{ marginTop: 0 }}>Η εφαρμογή θα κλείσει και θα ανοίξει ξανά με τη νέα έκδοση. Ό,τι δεν έχεις αποθηκεύσει, αποθήκευσέ το πρώτα.</p>
      <p className="muted" style=${{ marginBottom: 0 }}>Αν πατήσεις «Στο κλείσιμο», η αλλαγή γίνεται όταν κλείσεις την εφαρμογή.</p>
    <//>`;
  }
  if (u.phase === 'working') {
    const pct = u.total > 0 ? Math.min(100, Math.round(u.got * 100 / u.total)) : 0;
    const st = (n: number, text: string) => html`<li key=${n} className=${u.step === n ? '' : u.step > n ? '' : 'muted'}>${u.step > n ? '✓ ' : u.step === n ? '… ' : ''}${text}</li>`;
    return html`<${Dialog} title=${'Ενημέρωση σε ' + u.target} description="Μπορείς να συνεχίσεις να δουλεύεις όσο κατεβαίνει" onClose=${onClose}
      footer=${html`<${Button} variant="outline" disabled=${u.step > 2} onClick=${() => window.api.updCancel()}>Ακύρωση<//>`}>
      <p style=${{ marginTop: 0 }}>${u.step === 2 && u.total > 0 ? 'Κατέβασμα… ' + mb(u.got) + ' από ' + mb(u.total) + ' MB' : u.step === 1 ? 'Αντίγραφο της βάσης…' : u.step === 3 ? 'Αποσυμπίεση και έλεγχος…' : 'Κατέβασμα…'}</p>
      <div className="updbar" role="progressbar" aria-valuemin=${0} aria-valuemax=${100} aria-valuenow=${pct}><i style=${{ width: pct + '%' }}></i></div>
      <ol className="updsteps">${st(1, 'Αντίγραφο βάσης' + (u.backup ? ': ' + u.backup : ''))}${st(2, 'Κατέβασμα και έλεγχος (SHA-256)')}${st(3, 'Αποσυμπίεση και έτοιμη επανεκκίνηση')}</ol>
    <//>`;
  }
  if (!a) return html`<${Dialog} title="Ενημέρωση" onClose=${onClose} footer=${html`<${Button} onClick=${onClose}>Εντάξει<//>`}>
    ${u.error ? html`<${Alert} tone="bad"><span>${u.error}</span><//>` : html`<p style=${{ margin: 0 }}>Έχεις την τελευταία έκδοση (${u.version}).</p>`}<//>`;
  const mayApply = u.canApply && !a.setup;
  return html`<${Dialog} title="Υπάρχει νέα έκδοση" description=${'Έχεις ' + u.version + ' · νέα ' + a.version + (a.date ? ' (' + dmy(a.date) + ')' : '') + ' · ' + mb(a.size) + ' MB'} onClose=${later}
    footer=${html`<${Button} variant="outline" onClick=${later}>Αργότερα<//>${mayApply ? html`<${Button} data-autofocus="" onClick=${() => window.api.updStart()}>Ενημέρωση τώρα<//>` : html`<${Button} data-autofocus="" onClick=${() => window.api.updOpenReleases()}>Άνοιξε τα Releases<//>`}`}>
    <div className="stack">
      ${a.setup ? html`<${Alert} tone="warn"><span>Αυτή η έκδοση χρειάζεται νέο Setup.exe (αλλάζει το Electron). Κατέβασέ το από τα Releases και τρέξε το· τα δεδομένα σου μένουν.</span><//>`
        : !u.canApply ? html`<${Alert} tone="info"><span>Σε αυτό το σύστημα η ενημέρωση γίνεται από τα Releases (κατέβασμα και εγκατάσταση).</span><//>`
        : html`<${Alert} tone="info"><span>Τα δεδομένα σου (data\\, templates\\, ρυθμίσεις) δεν πειράζονται. Πριν την αλλαγή κρατιέται αντίγραφο της βάσης στην Επαναφορά.</span><//>`}
      ${u.error && html`<${Alert} tone="bad"><span>${u.error}</span><//>`}
      ${a.notes.length > 0 && html`<div><b>Τι άλλαξε</b><ul className="updnotes">${a.notes.map((n, i) => html`<li key=${i}>${n}</li>`)}</ul></div>`}
      <label className="rule"><input type="checkbox" className="ui-check" checked=${skip} onChange=${(e: any) => setSkip(e.target.checked)}/><span>Να μη με ξαναρωτήσει για την ${a.version}</span></label>
    </div>
  <//>`;
}

export function UpdatesCard() {
  const u = useUpd(); const toast = useToast(); const [ask, setAsk] = useState(false);
  if (!u) return html`<${Card} title="Ενημερώσεις"><p className="note" style=${{ margin: 0 }}>Η ενημέρωση δεν είναι διαθέσιμη σε αυτή την έκδοση.</p><//>`;
  const when = !u.lastCheck ? 'ποτέ' : (dayOf(u.lastCheck) === todayISO() ? 'σήμερα' : dmy(dayOf(u.lastCheck))) + ' ' + hmOf(u.lastCheck);
  const file = async () => { const r = await window.api.updFile(); if (r && !r.ok) toast({ text: r.error }); };
  const back = async () => { setAsk(false); const r = await window.api.updRollback(); if (!r.ok) toast({ text: r.error }); };
  return html`<${Card} title="Ενημερώσεις">
    <p style=${{ marginTop: 0 }}>Έκδοση <b>${u.version}</b> · τελευταίος έλεγχος ${when}${u.lastCheck && !u.lastOk ? html` <span className="txt-bad">(απέτυχε)</span>` : ''}</p>
    ${u.lastCheck > 0 && !u.lastOk && html`<p className="note">Δεν έγινε ο έλεγχος: ${u.lastError}. Δεν χρειάζεται να κάνεις κάτι· η εφαρμογή δουλεύει κανονικά.</p>`}
    ${u.lastOk && u.lastCheck > 0 && !u.avail && html`<p className="note">Έχεις την τελευταία έκδοση.</p>`}
    ${u.avail && html`<${Alert} tone="info"><span>Υπάρχει νέα έκδοση: <b>${u.avail.version}</b>. Πάτα «Νέα έκδοση» πάνω δεξιά.</span><//>`}
    <label className="rule" style=${{ margin: '10px 0' }}><input type="checkbox" className="ui-check" checked=${u.auto} onChange=${(e: any) => window.api.updAuto(e.target.checked)}/><span>Έλεγχος για νέα έκδοση όταν ανοίγει η εφαρμογή (μία φορά τη μέρα)</span></label>
    <div className="toolbar">
      <${Button} variant="outline" disabled=${u.checking || u.phase !== 'idle'} onClick=${() => window.api.updCheck()}>${u.checking ? 'Έλεγχος…' : 'Έλεγχος τώρα'}<//>
      <${Button} variant="outline" disabled=${u.phase !== 'idle'} onClick=${file}>Ενημέρωση από αρχείο (USB)…<//>
      ${u.prev && html`<${Button} variant="outline" disabled=${u.phase !== 'idle'} onClick=${() => setAsk(true)}>Επιστροφή στην ${u.prev}<//>`}
    </div>
    <p className="note">Χωρίς internet: κατέβασε από άλλο PC το GrafeioIlis-app-${'<έκδοση>'}.zip από τα Releases, βάλ' το σε USB και διάλεξέ το εδώ.</p>
    ${!u.canApply && html`<p className="note">Σε αυτό το σύστημα η εφαρμογή μόνο ελέγχει· την εγκατάσταση τη νέας έκδοσης την κάνεις από τα Releases. <${Button} variant="link" onClick=${() => window.api.updOpenReleases()}>Άνοιξε τα Releases<//></p>`}
    <${Alert}><span>Χωρίς internet ή αν αποτύχει ο έλεγχος, η εφαρμογή ανοίγει κανονικά· απλώς δεν βρίσκει νέα έκδοση.</span><//>
    ${ask && html`<${Dialog} role="alertdialog" title=${'Επιστροφή στην ' + u.prev} onClose=${() => setAsk(false)}
      footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${() => setAsk(false)}>Άκυρο<//><${Button} variant="destructive" onClick=${back}>Επιστροφή και επανεκκίνηση<//>`}>
      <p style=${{ margin: 0 }}>Η εφαρμογή θα ξανανοίξει με την προηγούμενη έκδοση. Τα δεδομένα σου δεν αλλάζουν.</p><//>`}
  <//>`;
}
