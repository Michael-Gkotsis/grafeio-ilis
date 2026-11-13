// Ρυθμίσεις › Επικεφαλίδες εγγράφων (Michael, 13/11): οι επικεφαλίδες σου, το σχέδιο της καθεμιάς (τρία κουτιά με γραμμές κειμένου,
// εικόνες, τόπο και ημερομηνία) και ο πίνακας «Πού μπαίνει». Κάθε αλλαγή γράφεται αμέσως (setSettings), άρα αναιρείται από το Ιστορικό.
import { useEffect, useRef, useState } from 'react';
import { html, Alert, Badge, Button, Card, Dialog, Segmented, Tabs, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { dmy } from '../../shared/dates';
import { HK } from '../../shared/unit';
import { SIG_FORMS, sigLabel, type SigForm } from '../../shared/sigs';
import {
  HEAD_MAX, IMG_H, PRESETS, TEXT_SZ, TODAY, TODAY_NAME, ZONE_NAMES, addHead, canAddItem, cloneZones, copyHead, formsDefaulting, formsUsing, freeHeadName, headById, headName, headUseOf,
  headsOf, moveItem, presetZones, removeHead, renameHead, setDefault, setZones, toggleUse, type DocHead, type HeadAl, type HeadItem, type HeadZones, type PresetId
} from '../../shared/docHead';
type P = any;

const label = (f: SigForm) => sigLabel(f, HK());
// Η σειρά του πίνακα «Πού μπαίνει»: πρώτα τα επίσημα (δεν αλλάζουν), μετά τα υπόλοιπα
const ORDER: SigForm[] = ['hkai', 'froura', 'outs', 'hd', 'roster', 'cadre', 'weapons', 'check', 'imer', 'reports'];
const FORMS: SigForm[] = [...ORDER.filter(f => SIG_FORMS.includes(f)), ...SIG_FORMS.filter(f => !ORDER.includes(f))];
const AL: { value: HeadAl; label: string }[] = [{ value: 'l', label: 'Αρ.' }, { value: 'c', label: 'Μέση' }, { value: 'r', label: 'Δεξ.' }];
const cm = (n: number) => String(n).replace('.', ',') + ' εκ.';

// Οι εικόνες διαβάζονται μία φορά από το main (data URL) και μένουν στη μνήμη
const imgCache = new Map<string, string | null>();
function useImg(id: string): string | null | undefined {
  const [u, setU] = useState<string | null | undefined>(() => imgCache.get(id));
  useEffect(() => {
    if (!id) { setU(undefined); return; }
    if (imgCache.has(id)) { setU(imgCache.get(id)); return; }
    let on = true; setU(undefined);
    window.api.readImage(id).then(v => { imgCache.set(id, v); if (on) setU(v); }).catch(() => { if (on) setU(null); });
    return () => { on = false; };
  }, [id]);
  return u;
}

// Πεδίο που γράφεται μόνο όταν τελειώσεις (Enter ή αλλού): μία εγγραφή στο Ιστορικό, όχι μία ανά γράμμα
function Commit({ value, onCommit, className = 'ui-input', ...rest }: P) {
  const [v, setV] = useState<string>(value); useEffect(() => setV(value), [value]);
  return html`<input className=${className} value=${v} onChange=${(e: any) => setV(e.target.value)} onBlur=${() => v !== value && onCommit(v)}
    onKeyDown=${(e: any) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(value); e.currentTarget.blur(); } }} ...${rest}/>`;
}

// ——— ένα κομμάτι πάνω στο χαρτί ———
function ItemView({ it, sel, onText }: { it: HeadItem; sel?: boolean; onText?: (t: string) => void }) {
  const { state, today } = useStore();
  const src = useImg(it.k === 'img' ? it.id : '');
  if (it.k === 'gap') return html`<div className="hd-gap" aria-label="Κενή γραμμή"/>`;
  if (it.k === 'date') return html`<div className="hd-t">${state.settings.place || 'Τόπος'}, ${dmy(today)}</div>`;
  if (it.k === 'img') {
    const style: P = { '--ih': it.h, textAlign: it.al === 'c' ? 'center' : it.al === 'r' ? 'right' : 'left' };
    if (it.side) { style.float = it.al === 'r' ? 'right' : 'left'; style.margin = '0 6px 2px'; }
    const img = src ? html`<img className="hd-img" src=${src} alt="" draggable="false" style=${{ filter: it.gray ? 'grayscale(1)' : undefined }}/>`
      : html`<span className="hd-img hd-img--none" style=${{ width: 'calc(var(--ih) * 100cqw / 21)' }}>${id0(it.id) ? (src === null ? 'λείπει το αρχείο' : '…') : 'εικόνα'}</span>`;
    return html`<div style=${style}>${img}</div>`;
  }
  const style: P = { textAlign: it.al === 'c' ? 'center' : it.al === 'r' ? 'right' : 'left', fontWeight: it.b ? 700 : undefined, fontStyle: it.i ? 'italic' : undefined, textDecoration: it.u ? 'underline' : undefined };
  if (it.sz) style['--sz'] = it.sz;
  if (sel && onText) return html`<${Commit} className=${'hd-t hd-inl'} style=${style} value=${it.t} onCommit=${onText} placeholder="γράψε εδώ" autoFocus=${!it.t} aria-label="Κείμενο της γραμμής"/>`;
  return html`<div className=${'hd-t' + (it.t ? '' : ' hd-t--empty')} style=${style}>${it.t || '(κενή γραμμή κειμένου)'}</div>`;
}
const id0 = (id: string) => !!id;

// Δείγμα κάτω από την επικεφαλίδα: μόνο για να φαίνεται πώς κάθεται στο έγγραφο (ξεθωριασμένο)
function Sample({ form }: { form: SigForm }) {
  return html`<div className="hd-sample" aria-hidden="true"><div className="hd-sample__t">${label(form).toLocaleUpperCase('el-GR')}</div>
    <table><tbody><tr><th>Α/Α</th><th>ΒΑΘΜΟΣ</th><th>ΕΠΩΝΥΜΟ</th><th>ΟΝΟΜΑ</th></tr><tr><td>1</td><td>ΣΤΡ</td><td>ΠΑΠΑΔΟΠΟΥΛΟΣ</td><td>ΓΕΩΡΓΙΟΣ</td></tr><tr><td>2</td><td>ΣΤΡ</td><td>ΝΙΚΟΛΑΟΥ</td><td>ΔΗΜΗΤΡΙΟΣ</td></tr></tbody></table></div>`;
}

function NameDialog({ title, name, presets, ok, onOk, onClose }: { title: string; name: string; presets: boolean; ok: string; onOk: (n: string, p: PresetId) => void; onClose: () => void }) {
  const [n, setN] = useState(name); const [p, setP] = useState<PresetId>('today');
  const go = () => n.trim() && onOk(n, p);
  return html`<${Dialog} title=${title} size="sm" onClose=${onClose} footer=${html`<${Button} variant="ghost" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!n.trim()} why=${!n.trim() && 'Γράψε όνομα'} onClick=${go}>${ok}<//>`}>
    <div className="field"><label className="field__label" htmlFor="hd-nm">Όνομα</label>
      <input id="hd-nm" className="ui-input" value=${n} maxLength=${60} data-autofocus="" onChange=${(e: any) => setN(e.target.value)} onKeyDown=${(e: any) => e.key === 'Enter' && go()}/></div>
    ${presets && html`<div className="field" role="radiogroup" aria-label="Ξεκίνα από" style=${{ marginTop: '14px' }}><span className="field__label">Ξεκίνα από</span>
      ${PRESETS.map(x => html`<label key=${x.id} className="ui-checkrow hd-preset"><input type="radio" name="hd-preset" checked=${p === x.id} onChange=${() => setP(x.id)}/><span><b>${x.name}</b><small className="muted"> ${x.help}</small></span></label>`)}</div>`}
  <//>`;
}

// ——— Σχέδιο ———
function DesignTab({ sel, setSel }: { sel: string; setSel: (id: string) => void }) {
  const { state, run } = useStore(); const toast = useToast(); const st = state.settings;
  const all = headsOf(st); const head: DocHead = headById(st, sel) || all[0]; const isToday = head.id === TODAY;
  const [pick, setPick] = useState<[number, number] | null>(null);   // το κομμάτι που διάλεξες: [κουτί, θέση]
  const [dlg, setDlg] = useState<'new' | 'name' | 'del' | null>(null);
  const [sample, setSample] = useState<SigForm>('roster');
  const [drop, setDrop] = useState<[number, number] | null>(null);
  const drag = useRef<[number, number] | null>(null);
  useEffect(() => setPick(null), [head.id]);
  const item = !isToday && pick ? head.z[pick[0]]?.[pick[1]] : undefined;

  const save = (heads: DocHead[], text: string) => run({ t: 'setSettings', settings: { heads }, text }, false);
  const commit = (z: HeadZones, what: string) => save(setZones(st, head.id, z), 'επικεφαλίδα «' + head.name + '»: ' + what);
  const edit = (patch: Partial<HeadItem>, what: string) => { if (!pick || !item) return; const z = cloneZones(head.z); z[pick[0]][pick[1]] = { ...item, ...patch } as HeadItem; return commit(z, what); };
  const add = (it: HeadItem, what: string) => {
    const zi = pick ? pick[0] : 0; if (!canAddItem(head.z, zi)) { toast({ text: 'Το κουτί «' + ZONE_NAMES[zi] + '» είναι γεμάτο' }); return; }
    const z = cloneZones(head.z); z[zi].push(it); setPick([zi, z[zi].length - 1]); return commit(z, what);
  };
  const addImg = async () => {
    const r = await window.api.pickImage(); if (!r) return; if (!r.ok) { toast({ text: r.error }); return; }
    add({ k: 'img', id: r.id, h: IMG_H.def, al: 'c' }, 'νέα εικόνα');
  };
  const otherImg = async () => {
    const r = await window.api.pickImage(); if (!r) return; if (!r.ok) { toast({ text: r.error }); return; }
    edit({ id: r.id } as P, 'άλλη εικόνα');
  };
  const del = () => { if (!pick) return; const z = cloneZones(head.z); z[pick[0]].splice(pick[1], 1); setPick(null); commit(z, 'σβήστηκε κομμάτι'); };
  const move = (from: [number, number], to: [number, number]) => {
    const z = moveItem(head.z, from, to); if (z === head.z) return;
    const at = Math.min(z[to[0]].length - 1, from[0] === to[0] && to[1] > from[1] ? to[1] - 1 : to[1]); setPick([to[0], Math.max(0, at)]); commit(z, 'μετακινήθηκε κομμάτι');
  };
  const step = (d: 'u' | 'd' | 'l' | 'r') => {
    if (!pick) return; const [z, i] = pick;
    if (d === 'u') move(pick, [z, i - 1]); else if (d === 'd') move(pick, [z, i + 2]);
    else { const nz = z + (d === 'l' ? -1 : 1); if (nz >= 0 && nz <= 2) move(pick, [nz, head.z[nz].length]); }
  };

  const create = async (name: string, preset: PresetId) => {
    setDlg(null); const z = presetZones(preset, st);
    const hasImg = z.some(a => a.some(x => x.k === 'img'));
    if (hasImg) { const r = await window.api.pickImage(); if (r && !r.ok) toast({ text: r.error }); if (r?.ok) z.forEach(a => a.forEach(x => { if (x.k === 'img') x.id = r.id; })); }
    const n = addHead(st, name, z);
    if (await save(n.heads, 'νέα επικεφαλίδα «' + freeHeadName(st, name) + '»')) { setSel(n.id); toast({ text: 'Φτιάχτηκε η επικεφαλίδα «' + freeHeadName(st, name) + '»' }); }
  };
  const copy = async () => { const n = copyHead(st, head.id); if (await save(n.heads, 'αντίγραφο της επικεφαλίδας «' + head.name + '»')) setSel(n.id); };
  const rename = (name: string) => { setDlg(null); const h = renameHead(st, head.id, name); if (h.find(x => x.id === head.id)!.name !== head.name) save(h, 'επικεφαλίδα «' + head.name + '» → «' + name.trim() + '»'); };
  const remove = async () => {
    setDlg(null); const r = removeHead(st, head.id);
    if (await run({ t: 'setSettings', settings: r, text: 'σβήστηκε η επικεφαλίδα «' + head.name + '»' }, false)) { setSel(TODAY); toast({ text: 'Σβήστηκε η επικεφαλίδα «' + head.name + '»' }); }
  };
  const users = formsUsing(st, head.id), defs = formsDefaulting(st, head.id);

  // πού θα πέσει ό,τι σέρνεις: πριν από το κομμάτι που είναι πιο κάτω από το ποντίκι
  const over = (zi: number) => (e: any) => {
    if (!drag.current) return; e.preventDefault();
    const kids: HTMLElement[] = [...e.currentTarget.querySelectorAll(':scope > .hd-it')];
    const i = kids.findIndex(k => { const r = k.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    const at: [number, number] = [zi, i < 0 ? kids.length : i]; if (!drop || drop[0] !== at[0] || drop[1] !== at[1]) setDrop(at);
  };
  const drops = (e: any) => { e.preventDefault(); const from = drag.current, to = drop; drag.current = null; setDrop(null); if (from && to) move(from, to); };
  const zoneView = (zi: number) => html`<div key=${zi} className=${'hd-zone' + (drop && drop[0] === zi ? ' is-over' : '')} data-zone=${zi} onDragOver=${isToday ? undefined : over(zi)} onDrop=${isToday ? undefined : drops}
      onDragLeave=${(e: any) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrop(d => (d && d[0] === zi ? null : d)); }} onClick=${() => setPick(null)}>
    <span className="hd-zone__lbl">${ZONE_NAMES[zi].toLocaleUpperCase('el-GR')}</span>
    ${head.z[zi].map((it, i) => {
      const on = !!pick && pick[0] === zi && pick[1] === i; const inl = on && it.k === 'text';
      return html`<div key=${i} className="hd-fx">${drop && drop[0] === zi && drop[1] === i && html`<div className="hd-drop"/>`}
        <div className=${'hd-it' + (on ? ' is-sel' : '')} draggable=${!isToday && !inl} tabIndex=${isToday ? undefined : 0} role=${isToday ? undefined : 'button'} aria-pressed=${isToday ? undefined : on}
          aria-label=${isToday ? undefined : 'Κομμάτι ' + (i + 1) + ' στο κουτί ' + ZONE_NAMES[zi]}
          onClick=${(e: any) => { e.stopPropagation(); if (!isToday) setPick([zi, i]); }} onKeyDown=${(e: any) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setPick([zi, i]); } }}
          onDragStart=${(e: any) => { drag.current = [zi, i]; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ''); } catch { /* παλιό Chromium */ } }} onDragEnd=${() => { drag.current = null; setDrop(null); }}>
          ${inl && html`<span className="hd-grip" draggable="true" aria-hidden="true" data-tip="Σύρε" onDragStart=${(e: any) => { drag.current = [zi, i]; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ''); const it = e.currentTarget.parentElement; e.dataTransfer.setDragImage(it, 8, 8); } catch { /* */ } }} onDragEnd=${() => { drag.current = null; setDrop(null); }}>⠿</span>`}
          <${ItemView} it=${it} sel=${on} onText=${(t: string) => edit({ t } as P, 'κείμενο')}/></div></div>`;
    })}
    ${drop && drop[0] === zi && drop[1] === head.z[zi].length && html`<div className="hd-drop"/>`}
    ${!head.z[zi].length && html`<span className="hd-zone__empty">${isToday ? '' : 'σύρε κάτι εδώ'}</span>`}
  </div>`;

  const sw = (on: boolean | undefined, key: 'b' | 'i' | 'u', text: string, tip: string, style: P) => html`<${Button} size="sm" variant=${on ? 'default' : 'outline'} aria-pressed=${!!on} aria-label=${tip} data-tip=${tip} style=${style} onClick=${() => edit({ [key]: on ? undefined : true } as P, tip.toLowerCase())}>${text}<//>`;
  const nudge = html`<div className="hd-nudge"><span className="muted">Μετακίνηση</span>
    <${Button} size="sm" variant="outline" aria-label="Στο προηγούμενο κουτί" data-tip="Στο κουτί αριστερά" disabled=${!pick || pick[0] === 0} onClick=${() => step('l')}>←<//>
    <${Button} size="sm" variant="outline" aria-label="Πάνω" data-tip="Πιο πάνω" disabled=${!pick || pick[1] === 0} onClick=${() => step('u')}>↑<//>
    <${Button} size="sm" variant="outline" aria-label="Κάτω" data-tip="Πιο κάτω" disabled=${!pick || pick[1] >= head.z[pick[0]].length - 1} onClick=${() => step('d')}>↓<//>
    <${Button} size="sm" variant="outline" aria-label="Στο επόμενο κουτί" data-tip="Στο κουτί δεξιά" disabled=${!pick || pick[0] === 2} onClick=${() => step('r')}>→<//></div>`;
  const panel = !item ? html`<p className="note" style=${{ margin: 0 }}>Πάτα ένα κομμάτι για να το αλλάξεις εδώ. Σύρε τα κομμάτια από κουτί σε κουτί ή πάνω-κάτω.</p>`
    : item.k === 'text' ? html`<div className="stack" style=${{ gap: '10px' }}>
        <div className="hd-row"><span className="hd-row__l">Μέγεθος</span><${Select} className="ui-select" aria-label="Μέγεθος γραμμάτων" value=${item.sz ? String(item.sz) : ''} onChange=${(e: any) => edit({ sz: e.target.value ? +e.target.value : undefined } as P, 'μέγεθος')}>
          <option value="">Αρχικό</option>${TEXT_SZ.map(n => html`<option key=${n} value=${String(n)}>${n}</option>`)}<//>
          <span className="hd-sty">${sw(item.b, 'b', 'Β', 'Έντονα', { fontWeight: 800 })}${sw(item.i, 'i', 'Π', 'Πλάγια', { fontStyle: 'italic', fontFamily: 'Georgia,serif' })}${sw(item.u, 'u', 'Υ', 'Υπογράμμιση', { textDecoration: 'underline' })}</span></div>
        <div className="hd-row"><span className="hd-row__l">Στοίχιση</span><${Segmented} small=${true} label="Στοίχιση" value=${item.al || 'l'} onChange=${(v: HeadAl) => edit({ al: v } as P, 'στοίχιση')} items=${AL}/></div>
        ${nudge}<div><${Button} size="sm" variant="outline" onClick=${del}>Σβήσε τη γραμμή<//></div></div>`
    : item.k === 'img' ? html`<div className="stack" style=${{ gap: '10px' }}>
        <div className="hd-imgrow"><${Thumb} id=${item.id}/><div><b>${item.id ? 'Εικόνα' : 'Δεν έχεις διαλέξει εικόνα'}</b><small className="muted" style=${{ display: 'block' }}>${item.id ? 'μικραίνει μόνη της στο αποθήκευμα' : 'PNG ή JPG'}</small></div></div>
        <div className="toolbar" style=${{ margin: 0 }}><${Button} size="sm" variant="outline" onClick=${otherImg}>${item.id ? 'Άλλη εικόνα…' : 'Διάλεξε εικόνα…'}<//><${Button} size="sm" variant="outline" onClick=${del}>Σβήσε<//></div>
        <div className="hd-row"><span className="hd-row__l">Ύψος</span><${HeightCtl} value=${item.h} onCommit=${(h: number) => edit({ h } as P, 'ύψος εικόνας ' + cm(h))}/></div>
        <div className="hd-row"><span className="hd-row__l">Στοίχιση</span><${Segmented} small=${true} label="Στοίχιση" value=${item.al || 'l'} onChange=${(v: HeadAl) => edit({ al: v } as P, 'στοίχιση εικόνας')} items=${AL}/></div>
        <div className="hd-row"><span className="hd-row__l">Θέση</span><${Segmented} small=${true} label="Θέση" value=${item.side ? 'side' : 'top'} onChange=${(v: string) => edit({ side: v === 'side' ? true : undefined } as P, 'θέση εικόνας')} items=${[{ value: 'top', label: 'Πάνω' }, { value: 'side', label: 'Δίπλα' }]}/></div>
        <div className="hd-row"><span className="hd-row__l">Χρώμα</span><${Segmented} small=${true} label="Χρώμα" value=${item.gray ? 'gray' : 'same'} onChange=${(v: string) => edit({ gray: v === 'gray' ? true : undefined } as P, 'χρώμα εικόνας')} items=${[{ value: 'same', label: 'Ίδια' }, { value: 'gray', label: 'Ασπρόμαυρη' }]}/></div>
        ${nudge}</div>`
    : item.k === 'date' ? html`<div className="stack" style=${{ gap: '10px' }}><p className="note" style=${{ margin: 0 }}>Βγαίνει ο τόπος και η ημερομηνία του κάθε εγγράφου, όπως έχει το καθένα. Δεν έχει επιλογές.</p>${nudge}<div><${Button} size="sm" variant="outline" onClick=${del}>Σβήσε<//></div></div>`
    : html`<div className="stack" style=${{ gap: '10px' }}><p className="note" style=${{ margin: 0 }}>Κενή γραμμή: αφήνει λίγο χώρο.</p>${nudge}<div><${Button} size="sm" variant="outline" onClick=${del}>Σβήσε<//></div></div>`;

  return html`<div className="hd">
    <div className="hd-list">
      <b className="hd-list__t">Οι επικεφαλίδες σου</b>
      <ul role="listbox" aria-label="Οι επικεφαλίδες σου">${all.map(h => {
        const u = formsUsing(st, h.id); const names = u.map(label).join(', ');
        return html`<li key=${h.id}><button type="button" role="option" aria-selected=${h.id === head.id} className="hd-li" onClick=${() => setSel(h.id)}>
          <b>${h.name}</b><small>${h.id === TODAY ? 'η σημερινή, δεν αλλάζει' + (u.length ? ' · ' + (u.length === FORMS.length ? 'σε όλα τα έγγραφα' : names) : '') : u.length ? names : 'σε κανένα έγγραφο ακόμα'}</small></button></li>`; })}</ul>
      <${Button} variant="outline" disabled=${(st.heads?.length || 0) >= HEAD_MAX} why=${(st.heads?.length || 0) >= HEAD_MAX && 'Έφτασες το όριο των ' + HEAD_MAX + ' επικεφαλίδων'} onClick=${() => setDlg('new')}>+ Νέα επικεφαλίδα…<//>
      <div className="toolbar" style=${{ margin: 0 }}><${Button} size="sm" variant="outline" onClick=${copy}>Αντίγραφο<//>
        <${Button} size="sm" variant="outline" disabled=${isToday} why=${isToday && 'Η «Όπως σήμερα» δεν αλλάζει'} onClick=${() => setDlg('name')}>Όνομα…<//>
        <${Button} size="sm" variant="outline" disabled=${isToday} why=${isToday && 'Η «Όπως σήμερα» δεν σβήνεται'} onClick=${() => setDlg('del')}>Σβήσε<//></div>
      <p className="note" style=${{ margin: 0 }}>«${TODAY_NAME}» δεν σβήνεται ούτε αλλάζει.</p>
    </div>
    <div className="hd-main">
      <div className="hd-bar">
        <div className="hd-name"><label htmlFor="hd-name" className="field__label">Όνομα</label>
          ${isToday ? html`<input id="hd-name" className="ui-input ui-input--static" value=${TODAY_NAME} readOnly=${true}/>`
            : html`<${Commit} id="hd-name" value=${head.name} maxLength=${60} onCommit=${(n: string) => rename(n)}/>`}</div>
        <label className="hd-smp"><span className="muted">Δείγμα σε:</span><${Select} className="ui-select" value=${sample} aria-label="Δείγμα σε" onChange=${(e: any) => setSample(e.target.value)}>${FORMS.map(f => html`<option key=${f} value=${f}>${label(f)}</option>`)}<//></label>
      </div>
      ${isToday ? html`<${Alert}><span>Αυτή είναι η σημερινή επικεφαλίδα των εγγράφων και δεν αλλάζει (οι 3 γραμμές της μονάδας από τα «Μονάδα και έντυπα»). Για να τη φτιάξεις αλλιώς, πάτα <b>Αντίγραφο</b> και άλλαξε το αντίγραφο.</span><//>`
        : html`<div className="toolbar hd-tools"><${Button} variant="outline" onClick=${() => add({ k: 'text', t: '', al: 'c' }, 'νέα γραμμή κειμένου')}>+ Γραμμή κειμένου<//><${Button} variant="outline" onClick=${addImg}>+ Εικόνα…<//>
          <${Button} variant="outline" onClick=${() => add({ k: 'date' }, 'τόπος και ημερομηνία')}>+ Τόπος και ημερομηνία<//><${Button} variant="outline" onClick=${() => add({ k: 'gap' }, 'κενή γραμμή')}>+ Κενή γραμμή<//></div>`}
      <div className="hd-work"><div className="hd-stage"><div className=${'hd-paper' + (isToday ? ' is-ro' : '')}>
          <div className="hd-zones">${[0, 1, 2].map(zoneView)}</div><${Sample} form=${sample}/></div>
          <p className="note hd-hint">${isToday ? 'Έτσι βγαίνει σήμερα.' : 'Σύρε τα κομμάτια από κουτί σε κουτί ή πάνω-κάτω. Πάτα ένα για να το αλλάξεις.'}</p></div>
        ${!isToday && html`<aside className="hd-panel" aria-label="Επιλεγμένο κομμάτι"><b className="hd-panel__t">${item ? 'Επιλεγμένο: ' + (item.k === 'text' ? 'Γραμμή κειμένου' : item.k === 'img' ? 'Εικόνα' : item.k === 'date' ? 'Τόπος και ημερομηνία' : 'Κενή γραμμή') : 'Επιλεγμένο: τίποτα'}</b>${panel}</aside>`}</div>
    </div>
    ${dlg === 'new' && html`<${NameDialog} title="Νέα επικεφαλίδα" name="" presets=${true} ok="Φτιάξε" onOk=${create} onClose=${() => setDlg(null)}/>`}
    ${dlg === 'name' && html`<${NameDialog} title="Όνομα επικεφαλίδας" name=${head.name} presets=${false} ok="Αποθήκευση" onOk=${rename} onClose=${() => setDlg(null)}/>`}
    ${dlg === 'del' && html`<${Dialog} title=${'Σβήσιμο: ' + head.name} size="sm" role="alertdialog" onClose=${() => setDlg(null)}
      footer=${html`<${Button} variant="ghost" onClick=${() => setDlg(null)}>Άκυρο<//><${Button} variant="destructive" onClick=${remove}>Σβήσε την επικεφαλίδα<//>`}>
      <p style=${{ marginTop: 0 }}>Η επικεφαλίδα <b>${head.name}</b> θα σβηστεί${users.length ? ' και θα φύγει από: ' + users.map(label).join(', ') + '.' : '. Δεν τη χρησιμοποιεί κανένα έγγραφο.'}</p>
      ${defs.length > 0 && html`<p style=${{ marginBottom: 0 }}>Τα έγγραφα που την είχαν αρχική (<b>${defs.map(label).join(', ')}</b>) γυρνούν στην «${TODAY_NAME}».</p>`}<//>`}
  </div>`;
}

function Thumb({ id }: { id: string }) {
  const src = useImg(id);
  return html`<span className="hd-thumb">${src ? html`<img src=${src} alt=""/>` : ''}</span>`;
}
// Ύψος εικόνας σε εκατοστά: ρυθμιστικό και αριθμός· γράφεται όταν αφήσεις το ρυθμιστικό ή τελειώσεις τον αριθμό
function HeightCtl({ value, onCommit }: { value: number; onCommit: (h: number) => void }) {
  const [v, setV] = useState(value); useEffect(() => setV(value), [value]);
  const ok = (n: number) => Math.round(Math.min(IMG_H.max, Math.max(IMG_H.min, isFinite(n) ? n : IMG_H.def)) * 10) / 10;
  const done = (n: number) => { const h = ok(n); setV(h); if (h !== value) onCommit(h); };
  const [txt, setTxt] = useState<string | null>(null);
  return html`<span className="hd-hgt"><input type="range" aria-label="Ύψος σε εκατοστά" min=${IMG_H.min} max=${IMG_H.max} step="0.1" value=${v} onChange=${(e: any) => setV(+e.target.value)}
      onPointerUp=${() => done(v)} onKeyUp=${() => done(v)} onBlur=${() => done(v)}/>
    <input className="ui-input hd-hgt__n" inputMode="decimal" aria-label="Ύψος (εκ.)" value=${txt ?? cm(v)} onFocus=${(e: any) => { setTxt(String(v).replace('.', ',')); e.target.select(); }}
      onChange=${(e: any) => setTxt(e.target.value)} onBlur=${() => { if (txt !== null) done(parseFloat(txt.replace(',', '.'))); setTxt(null); }} onKeyDown=${(e: any) => e.key === 'Enter' && e.currentTarget.blur()}/></span>`;
}

// ——— Πού μπαίνει ———
function WhereTab() {
  const { state, run } = useStore(); const st = state.settings; const all = headsOf(st);
  const save = (headUse: typeof st.headUse, text: string) => { if (headUse === st.headUse) return; run({ t: 'setSettings', settings: { headUse }, text }, false); };
  return html`<div className="hd-where">
    <p className="note" style=${{ margin: '0 0 10px' }}>Τσέκαρε <b>✓</b> ποιες επικεφαλίδες μπορεί να πάρει κάθε έγγραφο. Το αστέρι <b className="hd-star-on">★</b> είναι η αρχική: με αυτήν βγαίνει αν δεν διαλέξεις άλλη τη στιγμή που το βγάζεις.</p>
    <div className="hd-tbl-wrap"><table className="hd-tbl"><thead><tr><th scope="col">Έγγραφο</th>${all.map(h => html`<th key=${h.id} scope="col" className="hd-tbl__h">${h.name}</th>`)}<th scope="col" className="hd-tbl__def">Αρχική</th></tr></thead>
      <tbody>${FORMS.map(f => {
        const u = headUseOf(st, f);
        return html`<tr key=${f}><th scope="row"><span className="hd-doc">${label(f)}</span> <${Badge} tone=${f === 'hd' ? 'info' : 'ok'}>${f === 'hd' ? 'Word' : 'Excel'}<//>${f === 'reports' && html`<small className="muted" style=${{ display: 'block', fontWeight: 400 }}>αρχική για νέα έντυπα</small>`}</th>
          ${all.map(h => {
            const on = u.on.includes(h.id), def = u.def === h.id, only = on && u.on.length === 1;
            return html`<td key=${h.id} className=${def ? 'is-def' : ''}><span className="hd-cell">
              <input type="checkbox" className="ui-check" checked=${on} disabled=${only} data-tip=${only ? 'Κάθε έγγραφο χρειάζεται τουλάχιστον μία επικεφαλίδα' : undefined} aria-label=${label(f) + ': επιτρέπεται η «' + h.name + '»'}
                onChange=${() => save(toggleUse(st, f, h.id), label(f) + ': επικεφαλίδες')}/>
              ${on ? html`<button type="button" className=${'hd-star' + (def ? ' is-on' : '')} aria-pressed=${def} aria-label=${label(f) + ': αρχική η «' + h.name + '»'} data-tip=${def ? 'Η αρχική' : 'Κάν’ τη αρχική'}
                onClick=${() => save(setDefault(st, f, h.id), label(f) + ': αρχική επικεφαλίδα «' + h.name + '»')}>${def ? '★' : '☆'}</button>` : html`<span className="hd-star hd-star--off" aria-hidden="true">☆</span>`}</span></td>`; })}
          <td className="hd-tbl__def">${headName(st, u.def)}</td></tr>`; })}</tbody></table></div>
    <p className="note" style=${{ margin: '10px 0 0' }}>Νέα επικεφαλίδα δεν μπαίνει πουθενά μόνη της· την τσεκάρεις εδώ. Τα έγγραφα με αστέρι στην «${TODAY_NAME}» βγαίνουν ακριβώς όπως τώρα.</p>
  </div>`;
}

export function HeadsSection() {
  const { state } = useStore(); const [tab, setTab] = useState<'design' | 'where'>('design'); const [sel, setSel] = useState<string>(TODAY);
  const cur = headById(state.settings, sel) ? sel : TODAY;
  return html`<${Card} title=${html`<span style=${{ display: 'inline-flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>Επικεφαλίδες εγγράφων <${Badge} tone="ok">Νέο<//></span>`}>
    <${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'design', label: 'Σχέδιο' }, { value: 'where', label: 'Πού μπαίνει' }]}/>
    <div style=${{ marginTop: '14px' }}>
      <${Alert} tone="warn"><span>Προς το παρόν σχεδιάζεις και αποθηκεύεις τις επικεφαλίδες· τα αρχεία Excel και Word δεν αλλάζουν ακόμα και βγαίνουν όπως πάντα.</span><//>
    </div>
    <div style=${{ marginTop: '14px' }}>${tab === 'design' ? html`<${DesignTab} sel=${cur} setSel=${setSel}/>` : html`<${WhereTab}/>`}</div>
  <//>`;
}
