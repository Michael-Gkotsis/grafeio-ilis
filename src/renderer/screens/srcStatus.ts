// Η κατάσταση των αρχείων Excel και η ειδοποίηση του «Σήμερα». Χωριστά από την οθόνη Αρχεία Excel (sources.ts), που
// φορτώνεται μόνο με τις Ρυθμίσεις.
import { html, Alert, Button } from '../ui';
import { useNav, useStore } from '../store';
import { MONTHS } from '../../shared/dates';
import { KIND } from '../../shared/sources';
import type { FormOut, SourceStatus } from '../../shared/api';
import { useEffect, useState } from 'react';

export const base = (f: string) => f.split(/[\\/]/).pop() || f;

// Κατάσταση των αρχείων: φρεσκάρεται όταν γράφει ο main, όταν γυρνάς στο παράθυρο και κάθε φορά που ανοίγει η οθόνη
export function useSourceStatus() {
  const { state, sync } = useStore();
  const key = JSON.stringify([state.settings.sources || {}, state.settings.forms || {}]);
  const [st, setSt] = useState<{ sources: SourceStatus[]; forms: FormOut[] }>({ sources: [], forms: [] });
  useEffect(() => {
    let on = true;
    // ο main μπορεί να άλλαξε και την κατάσταση (π.χ. πίνακας που μετακινήθηκε μέσα στο φύλλο): φέρνουμε ό,τι άλλαξε
    const load = () => window.api.srcStatus().then(x => { if (on) { setSt(x); sync(); } });
    load(); const off = window.api.onSources(x => { setSt(x); sync(); }); window.addEventListener('focus', load);
    return () => { on = false; off(); window.removeEventListener('focus', load); };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}
// Για το «Σήμερα»: τι θέλει προσοχή στα αρχεία, ανά αρχείο (το Δυναμολόγιο έχει συνήθως πολλά είδη)
export function SourcesAlert() {
  const { state, today } = useStore(); const st = useSourceStatus(); const nav = useNav();
  const go = () => nav.go('templates', { tab: 'files' });
  const why = (x: SourceStatus) => !x.exists ? 'δεν βρέθηκε' : x.remap ? 'περιμένει αντιστοίχιση (Στήλες…): ' + x.remap : x.hold ? 'περιμένει «Ανανέωση από Excel»' : x.changed ? 'άλλαξε εκτός εφαρμογής' : x.locked ? 'είναι ανοιχτό στο Excel, η αλλαγή περιμένει' : x.error || '';
  const files = new Map<string, Map<string, string[]>>();
  for (const x of st.sources) {
    const w = why(x); if (!w) continue;
    const f = files.get(x.file) || new Map<string, string[]>(); files.set(x.file, f);
    f.set(w, [...(f.get(w) || []), KIND[x.kind].label]);
  }
  const lines: string[] = [...files].map(([f, m]) => base(f) + ': ' + [...m].map(([w, ks]) => ks.join(', ') + ' · ' + w).join('; '));
  for (const x of st.forms) if (x.error) lines.push(base(x.file) + ': ' + x.error);
  // έλεγχος υπηρεσιών: από την 1η του μήνα, αν το φύλλο είναι ακόμα του προηγούμενου
  const duties = st.sources.find(x => x.kind === 'duties'); const now = today.slice(0, 7);
  const acc = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1].replace(/ς$/, '');
  if (duties?.month && duties.month < now) lines.push('Ο έλεγχος υπηρεσιών δείχνει ακόμα ' + acc(duties.month) + '. Πάτα «Νέος μήνας» για να μπει φύλλο για τον ' + acc(now) + ' στο ίδιο αρχείο (ή Στήλες… / Άλλο αρχείο… αν το έχεις ήδη).');
  if (!lines.length) return state.people.length && !state.settings.sources?.people
    ? html`<div className="srcalert"><${Alert} tone="info"><span><b>Αρχεία Excel.</b> Οι διορθώσεις στα άτομα δεν γράφονται ακόμα σε κανένα Excel. <${Button} variant="link" onClick=${go}>Όρισε το Δυναμολόγιο<//></span><//></div>` : null;
  return html`<div className="srcalert"><${Alert} tone="warn"><span><b>Αρχεία Excel.</b> ${lines.length === 1 ? lines[0] : html`<ul className="srcalert__list">${lines.map(l => html`<li key=${l}>${l}</li>`)}</ul>`} <${Button} variant="link" onClick=${go}>Δες τα<//></span><//></div>`;
}

