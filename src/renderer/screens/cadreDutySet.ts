// Ρυθμίσεις › Υπηρεσίες στελεχών (Michael, 17/11, πρόταση λοχία): ομάδες και υπηρεσίες των στελεχών, όρια, ανάπαυση, μεταφορά.
// Όλα είναι δεδομένα που αλλάζει ο χρήστης (όχι κώδικας): οι κανόνες της Ταξιαρχίας μπαίνουν εδώ, ανά ομάδα και ανά άτομο.
// Τα μέλη μπαίνουν ανά άτομο («Στοιχεία υπηρεσιών» στην καρτέλα του στελέχους). Δεν αγγίζει τις υπηρεσίες των στρατιωτών.
import { useMemo, useState } from 'react';
import { html, Alert, Button, Card, Segmented, useToast, Badge } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { usePending } from '../pending';
import { OWN_COL_TAG, cadreAbsKinds, hkColShortOf, hkColsOf } from '../../shared/ranks';
import { colShort } from '../../shared/cadre';
import { HK } from '../../shared/unit';
import { DOW_INI, DOW_ORDER, dutyCfgOf, newDutyId } from '../../shared/cadreDuty';
import type { CadreDutyGroup, CadreService } from '../../shared/domain';

const nz = (v: string, d: number) => { const x = Number(String(v).replace(',', '.')); return isFinite(x) && x >= 0 ? Math.floor(x) : d; };

export function CadreDutyCard() {
  const { state, run } = useStore(); const toast = useToast();
  const fromState = (st = state.settings) => { const c = dutyCfgOf(st); return { groups: c.groups.map(g => ({ ...g, services: g.services.map(v => ({ ...v, ...(v.days ? { days: [...v.days] } : {}) })) })), offBase: String(c.limits.off.base), offExtra: String(c.limits.off.extra), ncoBase: String(c.limits.nco.base), ncoExtra: String(c.limits.nco.extra), rest: String(c.rest), carry: c.carry, fairHol: c.fairHol }; };
  const [f, setF] = useState(fromState);
  const dirty = JSON.stringify(f) !== JSON.stringify(fromState());
  // οι στήλες της ΗΚΑΙ που παίρνουν οι καταστάσεις στελεχών (μία φορά η κάθε στήλη)
  const cols = useMemo(() => { const seen = new Map<string, string>(); for (const k of cadreAbsKinds(state.settings.lists)) if (k[2] && !seen.has(k[2])) seen.set(k[2], colShort(k[2], state.settings.lists) || k[1]);
    for (const o of hkColsOf(state.settings.lists)) if (!seen.has(o.key)) seen.set(o.key, hkColShortOf(o.key, state.settings.lists) + OWN_COL_TAG);   // δικές σου στήλες: πάντα διαθέσιμες
    return [...seen]; }, [state.settings.lists]);
  const members = (id: string) => Object.values(state.cadreDutyOf || {}).filter(p => p.group === id).length;
  const ids = (k: 'g' | 's') => f.groups.flatMap(g => (k === 'g' ? [g.id] : g.services.map(v => v.id)));
  const bad = f.groups.some(g => !g.name.trim() || g.services.some(v => !v.name.trim() || !v.short.trim() || !(v.perDay >= 1))) || [f.offBase, f.offExtra, f.ncoBase, f.ncoExtra, f.rest].some(v => isNaN(Number(String(v).replace(',', '.'))) || Number(String(v).replace(',', '.')) < 0);
  const setG = (id: string, patch: Partial<CadreDutyGroup>) => setF({ ...f, groups: f.groups.map(g => (g.id === id ? { ...g, ...patch } : g)) });
  const setS = (gid: string, sid: string, patch: Partial<CadreService>) => setG(gid, { services: f.groups.find(g => g.id === gid)!.services.map(v => (v.id === sid ? { ...v, ...patch } : v)) });
  const save = async () => {
    if (bad) return false;
    const cfg = {
      groups: f.groups.map(g => ({ ...g, name: g.name.trim(), services: g.services.map(v => ({ ...v, name: v.name.trim(), short: v.short.trim().toUpperCase() })) })),
      limits: { off: { base: nz(f.offBase, 3), extra: nz(f.offExtra, 1) }, nco: { base: nz(f.ncoBase, 4), extra: nz(f.ncoExtra, 1) } }, rest: nz(f.rest, 1), carry: f.carry, fairHol: f.fairHol
    };
    const ok = await run({ t: 'setSettings', settings: { cadreDuty: cfg }, text: 'υπηρεσίες στελεχών (' + (cfg.groups.map(g => g.name).join(', ') || 'χωρίς ομάδες') + ')' }, false);
    if (ok) { setF(fromState(ok.settings)); toast({ text: 'Αποθηκεύτηκαν οι υπηρεσίες των στελεχών' }); }   // η φόρμα ξαναγίνεται όπως αποθηκεύτηκε (κεφαλαία, κενά): αλλιώς μένει η μπάρα «Δεν αποθηκεύτηκαν»
    return ok;
  };
  usePending(dirty, { label: 'Υπηρεσίες στελεχών', save, discard: () => setF(fromState()) });
  const svcRow = (g: CadreDutyGroup, v: CadreService) => html`<div className="cdset__svc" key=${v.id}>
    <div className="field-row">
      <div className="field" style=${{ flex: 2 }}><label className="field__label" htmlFor=${'sv-n-' + v.id}>Υπηρεσία</label><input id=${'sv-n-' + v.id} className="ui-input" placeholder="π.χ. Αξ/κός Κεντρικής Πύλης" value=${v.name} onChange=${(e: any) => setS(g.id, v.id, { name: e.target.value })}/></div>
      <div className="field"><label className="field__label" htmlFor=${'sv-s-' + v.id}>Κωδικός στο κελί</label><input id=${'sv-s-' + v.id} className="ui-input" style=${{ maxWidth: '90px' }} maxLength="4" placeholder="ΑΥΔΜ" value=${v.short} onChange=${(e: any) => setS(g.id, v.id, { short: e.target.value })}/></div>
      <div className="field"><label className="field__label" htmlFor=${'sv-p-' + v.id}>Άτομα τη μέρα</label><input id=${'sv-p-' + v.id} className="ui-input" type="number" min="1" max="9" style=${{ maxWidth: '80px' }} value=${v.perDay} onChange=${(e: any) => setS(g.id, v.id, { perDay: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}/></div>
      <div className="field"><label className="field__label" htmlFor=${'sv-c-' + v.id}>Στήλη ${HK()}</label><${Select} id=${'sv-c-' + v.id} className="ui-input" value=${v.hkCol} onChange=${(e: any) => setS(g.id, v.id, { hkCol: e.target.value })}><option value="">Καμία</option>${cols.map(([c, l]) => html`<option key=${c} value=${c}>${l}</option>`)}<//></div></div>
    <div className="duty__row">
      <label className="check"><input type="checkbox" checked=${v.h24} onChange=${(e: any) => setS(g.id, v.id, { h24: e.target.checked })}/><span>24ωρη (μετά ακολουθεί ανάπαυση)</span></label>
      <label className="check"><input type="checkbox" checked=${!!v.offOnly} onChange=${(e: any) => setS(g.id, v.id, e.target.checked ? { offOnly: true } : { offOnly: undefined })}/><span>Μόνο αξιωματικοί</span></label>
      <span className="muted" style=${{ fontSize: '12px' }}>Γίνεται:</span>
      <span className="duty__chips">${DOW_ORDER.map(d => html`<button key=${d} type="button" className="ui-chip duty__dow" aria-pressed=${!v.days?.length || v.days.includes(d)} aria-label=${['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'][d]}
        onClick=${() => { const cur = v.days?.length ? v.days : [0, 1, 2, 3, 4, 5, 6]; const nx = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort(); setS(g.id, v.id, { days: nx.length === 7 || !nx.length ? undefined : nx }); }}>${DOW_INI[d]}</button>`)}</span>
      <span style=${{ flex: 1 }}></span>
      <${Button} size="sm" variant="ghost" onClick=${() => setG(g.id, { services: g.services.filter(x => x.id !== v.id) })} data-tip="Οι υπηρεσίες που έχουν ήδη μπει στο πρόγραμμα δεν σβήνονται, αλλά δεν θα φαίνονται">Διαγραφή υπηρεσίας<//></div></div>`;
  return html`<div className="stack" data-cadre-duty-set="">
    <p className="note" style=${{ margin: 0 }}>Ομάδες υπηρεσιών και υπηρεσίες των στελεχών, όρια και περιορισμοί. Δεν αγγίζει τις υπηρεσίες των στρατιωτών. Τα στελέχη μπαίνουν σε ομάδα ένα-ένα, από τα «Στοιχεία υπηρεσιών» στην καρτέλα τους.</p>
    ${f.groups.map(g => html`<${Card} key=${g.id} title=${html`${g.name || 'Νέα ομάδα'} <${Badge} tone="ok">${members(g.id)} στελέχη<//>`} actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => setF({ ...f, groups: f.groups.filter(x => x.id !== g.id) })} data-tip=${members(g.id) ? 'Έχει μέλη: μένουν χωρίς ομάδα' : undefined}>Διαγραφή ομάδας<//>`}>
      <div className="field"><label className="field__label" htmlFor=${'g-n-' + g.id}>Όνομα ομάδας</label><input id=${'g-n-' + g.id} className="ui-input" style=${{ maxWidth: '320px' }} placeholder="π.χ. ΑΥΔΜ, Πύλη, Φυλάκιο ποταμού" value=${g.name} onChange=${(e: any) => setG(g.id, { name: e.target.value })}/></div>
      ${g.services.map(v => svcRow(g, v))}
      <div><${Button} size="sm" variant="outline" onClick=${() => setG(g.id, { services: [...g.services, { id: newDutyId(ids('s'), 's'), name: '', short: '', perDay: 1, h24: true, hkCol: '' }] })}>+ Υπηρεσία<//></div><//>`)}
    <div><${Button} variant="outline" onClick=${() => setF({ ...f, groups: [...f.groups, { id: newDutyId(ids('g'), 'g'), name: '', services: [{ id: newDutyId(ids('s'), 's'), name: '', short: '', perDay: 1, h24: true, hkCol: 'yp' }] }] })}>+ Νέα ομάδα…<//> <${Button} disabled=${!dirty || bad} why=${bad ? 'Έλεγξε τα πεδία' : 'Καμία αλλαγή'} onClick=${save}>Αποθήκευση<//></div>
    <${Card} title="Όρια και κανόνες για όλους" actions=${html`<${Button} size="sm" disabled=${!dirty || bad} why=${bad ? 'Έλεγξε τα πεδία' : 'Καμία αλλαγή'} onClick=${save}>Αποθήκευση<//>`}>
      <div className="pref"><div><b>Αξιωματικοί, τον μήνα</b><small>Βασικό όριο + έξτρα όταν δεν φτάνουν. Αξιωματικοί είναι οι γραμμές «αξιωματικών» της ΗΚΑΙ.</small></div>
        <span className="duty__row"><input className="ui-input" aria-label="Αξιωματικοί: βασικό όριο" type="number" min="0" style=${{ maxWidth: '70px' }} value=${f.offBase} onChange=${(e: any) => setF({ ...f, offBase: e.target.value })}/>+<input className="ui-input" aria-label="Αξιωματικοί: έξτρα" type="number" min="0" style=${{ maxWidth: '70px' }} value=${f.offExtra} onChange=${(e: any) => setF({ ...f, offExtra: e.target.value })}/></span></div>
      <div className="pref"><div><b>Υπαξιωματικοί, τον μήνα</b><small>Όλοι οι άλλοι. Οι ΕΠΟΠ/ΟΒΑ κρατούν το δικό τους όριο από τα «Στοιχεία». Δικό του όριο ανά άτομο: «Στοιχεία υπηρεσιών».</small></div>
        <span className="duty__row"><input className="ui-input" aria-label="Υπαξιωματικοί: βασικό όριο" type="number" min="0" style=${{ maxWidth: '70px' }} value=${f.ncoBase} onChange=${(e: any) => setF({ ...f, ncoBase: e.target.value })}/>+<input className="ui-input" aria-label="Υπαξιωματικοί: έξτρα" type="number" min="0" style=${{ maxWidth: '70px' }} value=${f.ncoExtra} onChange=${(e: any) => setF({ ...f, ncoExtra: e.target.value })}/></span></div>
      <div className="pref"><div><b>Ανάπαυση μετά από 24ωρη</b><small>Πόσες μέρες δεν μπαίνει σε άλλη υπηρεσία πριν και μετά. 0 = καμία.</small></div>
        <input className="ui-input" aria-label="Μέρες ανάπαυσης" type="number" min="0" style=${{ maxWidth: '80px' }} value=${f.rest} onChange=${(e: any) => setF({ ...f, rest: e.target.value })}/></div>
      <div className="pref"><div><b>Ό,τι έκανε πάνω ή κάτω από το όριο περνά στον επόμενο μήνα</b><small>4 από 3 → τον άλλο μήνα 2· 2 από 3 → τον άλλο μήνα 4. Μόνο από τον προηγούμενο μήνα.</small></div>
        <${Segmented} small=${true} value=${f.carry ? 'on' : 'off'} onChange=${(v: string) => setF({ ...f, carry: v === 'on' })} items=${[{ value: 'on', label: 'Ναι' }, { value: 'off', label: 'Όχι' }]}/></div>
      <div className="pref"><div><b>Δίκαιες ΣΚ και αργίες ανάμεσά τους</b><small>Η αυτόματη συμπλήρωση του μήνα (επόμενη φάση) θα μοιράζει δίκαια Σάββατα, Κυριακές και αργίες.</small></div>
        <${Segmented} small=${true} value=${f.fairHol ? 'on' : 'off'} onChange=${(v: string) => setF({ ...f, fairHol: v === 'on' })} items=${[{ value: 'on', label: 'Ναι' }, { value: 'off', label: 'Όχι' }]}/></div>
      ${bad && html`<${Alert} tone="warn"><span>Κάθε ομάδα και υπηρεσία θέλει όνομα (και κωδικό για την υπηρεσία), και τα όρια αριθμό 0 ή περισσότερο.</span><//>`}
      <p className="note" style=${{ marginBottom: 0 }}>Οι ημέρες άδειας τον χρόνο (Κανονική, ΑΜΔ) αλλάζουν στις Ρυθμίσεις › Μονάδα και έντυπα.</p><//>
  </div>`;
}
