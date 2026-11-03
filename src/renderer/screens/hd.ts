// ΗΚΑΙ › Ημερήσια Διαταγή (Michael, 3/11): γεμίζει από τις υπηρεσίες και τις μεταβολές της μέρας, γράφεις μόνο ό,τι δεν ξέρει η εφαρμογή.
// Βγαίνει σε Word (έτοιμο ή δικό σου πρότυπο) ή σε εκτύπωση. Κάθε γραμμή αλλάζει ή σβήνεται μόνο εδώ· η ΗΚΑΙ δεν αλλάζει.
import { useMemo, useState } from 'react';
import { html, cx, Alert, Button, Card, Dialog, PageHeader, useMedia, useToast } from '../ui';
import { Combo } from '../select';
import { useNav, useStore } from '../store';
import { DateBar } from '../common';
import { SigsDialog } from '../sigs';
import { addDays, dayName, dm, type ISODate } from '../../shared/dates';
import { HD_SECTIONS, hdAuto, hdCadreNames, hdDefaultDay, hdPageHtml, hdTags, type HdDoc } from '../../shared/hd';
import { sigsSaved, sigsText, type Sig } from '../../shared/sigs';
import { HK } from '../../shared/unit';
type P = any;

// οι γραμμές μιας ενότητας: καθεμία με το ✎ (γράφεις πάνω της) και το × (φεύγει μόνο από αυτή την ΗΔ)
function Lines({ lines, onChange, from, label }: { lines: string[]; onChange: (l: string[]) => void; from?: string; label: string }) {
  return html`<div className="hd__sec"><span className="hd__lab">${label}${from && html`<small> · ${from}</small>`}</span><div className="hd__lines">
    ${lines.length === 0 && html`<span className="muted hd__zero">Ø</span>`}
    ${lines.map((l, i) => html`<div key=${i} className="hd__line"><textarea className="ui-input" rows=${l.length > 70 ? 2 : 1} aria-label=${label + ' γραμμή ' + (i + 1)} value=${l} onChange=${(e: any) => onChange(lines.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))}/>
      <button type="button" className="hd__x" aria-label="Σβήσιμο γραμμής" data-tip="Φεύγει μόνο από αυτή την Ημερήσια Διαταγή" onClick=${() => onChange(lines.filter((_, j) => j !== i))}>×</button></div>`)}
    <button type="button" className="hd__add" onClick=${() => onChange([...lines, ''])}>+ γραμμή</button></div></div>`;
}
function Preview({ html: h }: { html: string }) { return html`<div className="hd__page" dangerouslySetInnerHTML=${{ __html: h }}/>`; }

export function HdTab() {
  const { state, today, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast(); const narrow = useMedia('(max-width: 1279px)');
  const date: ISODate = nav.params.hdDate || hdDefaultDay(today);
  const [edit, setEdit] = useState<{ date: ISODate; doc: HdDoc } | null>(null); const [busy, setBusy] = useState(false); const [prev, setPrev] = useState(false); const [sigs, setSigs] = useState(false);
  const saved = state.hd?.[date];
  const auto = useMemo(() => hdAuto(state, date), [state.people, state.statuses, state.cadreList, state.cadreAbs, state.hkaiManual, state.settings, state.hd, date]);   // eslint-disable-line react-hooks/exhaustive-deps
  const doc: HdDoc = edit && edit.date === date ? edit.doc : saved || auto;
  const set = (p: Partial<HdDoc>) => setEdit({ date, doc: { ...doc, ...p } });
  const setSec = (k: 'ax' | 'op', i: number, l: string[]) => set({ [k]: doc[k].map((x, j) => (j === i ? l : x)) } as P);
  const names = useMemo(() => hdCadreNames(state), [state.cadreList]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sigList = sigsSaved(state.settings, 'hd');
  const tags = hdTags(state.settings, date, doc, sigList);
  const days = [0, 1, 2, 3, 4].map(i => addDays(today, i)); if (!days.includes(date)) days.push(date);
  const go = async (print: boolean, over?: Sig[]) => {
    setBusy(true);
    try {
      if (!(await run({ t: 'setHd', date, doc }, false))) return;   // κρατιέται όπως βγήκε: ξαναβγαίνει ίδια ακόμα κι αν αλλάξουν τα δεδομένα
      setEdit(null);
      const r = await window.api.exportHd({ date, doc, print, ...(over ? { sigs: over } : {}) });
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() });
    } finally { setBusy(false); }
  };
  const again = async () => { setEdit(null); if (saved && await run({ t: 'setHd', date, doc: null }, false)) toast({ text: 'Ξανά από τα δεδομένα.', actions: [undoMark()] }); };
  const pickTpl = async () => {
    const r = await window.api.pickHdTpl(); if (!r) return;
    if (!r.ok) { toast({ text: html`<span><b>Δεν μπήκε.</b> ${r.error}</span>` }); return; }
    if (await run({ t: 'setSettings', settings: { hdTpl: { file: r.file, name: r.name } }, text: 'πρότυπο Word Ημερήσιας Διαταγής: ' + r.name }, false)) toast({ text: 'Πρότυπο: ' + r.name });
  };
  const tpl = state.settings.hdTpl;
  const pageHtml = (fs: number) => hdPageHtml(tags, fs);
  const dirty = !!edit && edit.date === date;
  return html`<div>
    <${PageHeader} title=${'Ημερήσια Διαταγή της ' + dm(date) + '/' + date.slice(0, 4)} sub="Γεμίζει μόνη της από τις υπηρεσίες και τις μεταβολές της μέρας. Γράφεις μόνο ό,τι δεν ξέρει η εφαρμογή.">
      <${Button} disabled=${busy} onClick=${() => go(false)} data-tip="Βγαίνει .docx και ανοίγει στο Word. Κρατιέται όπως βγήκε">${busy ? 'Δημιουργία…' : 'Βγάλε Word'}<//>
      <${Button} variant="outline" disabled=${busy} onClick=${() => go(true)} data-tip="Εκτύπωση της σελίδας χωρίς να ανοίξεις Word">Εκτύπωση<//>
      <${Button} variant="outline" onClick=${() => setSigs(true)} data-tip=${'Υπογραφή: ' + sigsText(sigList)}>Υπογραφή…<//>
      ${narrow && html`<${Button} variant="outline" onClick=${() => setPrev(true)}>Προεπισκόπηση<//>`}<//>
    <div className="toolbar"><${DateBar} value=${date} onChange=${(d: string) => { setEdit(null); nav.set({ hdDate: d === hdDefaultDay(today) ? undefined : d }); }} days=${days}/>
      <span className="muted">${dayName(date, today)} · μεταβολές της μέρας</span></div>
    ${saved && !dirty && html`<${Alert} tone="info">Αυτή η Ημερήσια Διαταγή έχει βγει και κρατιέται όπως βγήκε, ακόμα κι αν αλλάξουν τα δεδομένα. <${Button} variant="link" onClick=${again}>Ξανά από τα δεδομένα<//><//>`}
    ${dirty && html`<${Alert} tone="warn">Αλλαγές που δεν έχουν βγει ακόμα (μόνο εδώ, η ${HK()} δεν αλλάζει). <${Button} variant="link" onClick=${again}>Άκυρο, ξανά από τα δεδομένα<//><//>`}
    <div className=${cx('hd', !narrow && 'hd--wide')}><div className="hd__left">
      <${Card} title="Όργανα υπηρεσίας">
        <label className="hd__f"><span>ΑΥΔΜ <small>· διάλεξε στέλεχος ή γράψε</small></span><${Combo} className="ui-input" options=${names} value=${doc.aydm} onChange=${(e: any) => set({ aydm: e.target.value.toUpperCase() })} placeholder="π.χ. από άλλη μονάδα"/></label>
        <label className="hd__f"><span>Δ/Ν ${state.settings.unitName ? state.settings.unitName.toUpperCase() : ''} <small>· ${doc.dn && doc.dn === auto.dn ? 'από Υπηρεσίες στελεχών' : 'γράψε αν δεν βρέθηκε'}</small></span><${Combo} className="ui-input" options=${names} value=${doc.dn} onChange=${(e: any) => set({ dn: e.target.value.toUpperCase() })}/></label>
        <label className="hd__f"><span>ΙΛΧΟΣ ΕΒΔΟΜΑΔΟΣ <small>· κρατιέται όλη την εβδομάδα</small></span><${Combo} className="ui-input" options=${names} value=${doc.ilxos} onChange=${(e: any) => set({ ilxos: e.target.value.toUpperCase() })}/></label>
      <//>
      <${Card} title="Μεταβολές αξιωματικών">${HD_SECTIONS.map((n, i) => html`<${Lines} key=${n} label=${(i + 1) + '. ' + n} lines=${doc.ax[i] || []} from=${i === 2 ? 'από Στελέχη' : undefined} onChange=${(l: string[]) => setSec('ax', i, l)}/>`)}<//>
      <${Card} title="Μεταβολές οπλιτών">${HD_SECTIONS.map((n, i) => html`<${Lines} key=${n} label=${(i + 1) + '. ' + n} lines=${doc.op[i] || []} from=${i < 4 ? 'από ' + HK() : undefined} onChange=${(l: string[]) => setSec('op', i, l)}/>`)}<//>
      <${Card} title="Τμήμα 2 · Καταλογισμός δημόσιου υλικού"><textarea className="ui-input hd__ta" rows="3" aria-label="Τμήμα 2" value=${doc.t2} placeholder="Ø" onChange=${(e: any) => set({ t2: e.target.value.toUpperCase() })}/><//>
      <${Card} title="Τμήμα 3 · Μισθοδοσία"><textarea className="ui-input hd__ta" rows="3" aria-label="Τμήμα 3" value=${doc.t3} placeholder="Ø" onChange=${(e: any) => set({ t3: e.target.value.toUpperCase() })}/>
        <p className="note" style=${{ marginBottom: 0 }}>Τα Τμήματα 2 και 3 ξεκινούν από την προηγούμενη Ημερήσια Διαταγή.</p><//>
      <${Card} title="Πρότυπο Word"><p className="note" style=${{ marginTop: 0 }}>${tpl ? html`Δικό σου πρότυπο: <b>${tpl.name}</b>.` : 'Χρησιμοποιείται το έτοιμο πρότυπο της εφαρμογής (όπως το έγγραφό σου).'}
        ${' '}Δικό σου .docx με ετικέτες, π.χ. <code>{ΗΜΕΡΟΜΗΝΙΑ}</code>, <code>{ΟΠ3}</code>: δες τη λίστα στον Οδηγό.</p>
        <${Button} variant="outline" size="sm" onClick=${pickTpl}>Δικό μου πρότυπο Word…<//> ${tpl && html`<${Button} variant="ghost" size="sm" onClick=${() => run({ t: 'setSettings', settings: { hdTpl: undefined }, text: 'πρότυπο Ημερήσιας Διαταγής: πίσω στο έτοιμο' }, false)}>Πίσω στο έτοιμο<//>`}<//>
    </div>${!narrow && html`<div className="hd__right"><${Preview} html=${pageHtml(5)}/></div>`}</div>
    ${prev && html`<${Dialog} size="lg" title="Προεπισκόπηση" onClose=${() => setPrev(false)}><${Preview} html=${pageHtml(9)}/><//>`}
    ${sigs && html`<${SigsDialog} title="Ημερήσια Διαταγή" initial=${sigList} keepText="Να μείνουν έτσι και για τις επόμενες φορές (Ρυθμίσεις › Υπογραφές)" onClose=${() => setSigs(false)}
      onGo=${async (l: Sig[], keep: boolean, pr: boolean) => { if (keep) await run({ t: 'setSettings', settings: { sigs: { ...(state.settings.sigs || {}), hd: l } }, text: 'υπογραφή Ημερήσιας Διαταγής: ' + sigsText(l) }, false); go(pr, keep ? undefined : l); }}/>`}
  </div>`;
}
