// Αρχεία Excel: για κάθε είδος από ποιο αρχείο, φύλλο και στήλες διαβάζει η εφαρμογή και πού γράφει τις αλλαγές της.
// Αναγνώριση μόνη της· ό,τι δεν βρεθεί ο χρήστης το δείχνει με κλικ στο κελί, με την πρόταση σημειωμένη.
import { useEffect, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Card, Dialog, Segmented, useToast } from '../ui';
import { useNav, useStore } from '../store';
import { PersonPicker } from '../common';
import { TYPES, CAP_ACC, KIND_NAME, type DutyKind, type TypeKey } from '../../shared/domain';
import { MONTHS, addDays, dm } from '../../shared/dates';
import {
  KINDS, KIND, DEFAULT_TYPE, HK_COLS, HK_RANKS, bestFor, bindingText, cellText, colLetter, defaultBinding, diffStatuses, fieldsOf, isStatusKind, missingFields,
  parseStatuses, suggestCols, tableRows, rowName, valueKey, CAP_COLS, capNo, dayColumns, dutyCode, planCaps, planDuties, planOutside, planPosts, sheetMonth,
  type SheetPerson, type FormBinding, type FormKind, type HkaiMap, type ListKind, type SourceBinding, type StatusKind
} from '../../shared/sources';
import type { FormInfo, FormOut, ImportPreview, SourceBook, SourceStatus, WritePreview } from '../../shared/api';
import type { Command } from '../../shared/commands';
type P = any;

const base = (f: string) => f.split(/[\\/]/).pop() || f;
// Διαβάζονται και μαζί με το προσωπικό (από το ίδιο Δυναμολόγιο), αλλά και μόνα τους με δική τους προεπισκόπηση
const WITH_PEOPLE: ListKind[] = ['posts', 'outside'];
const SHEET_KINDS: ListKind[] = ['posts', 'outside', 'caps', 'duties'];

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
  const why = (x: SourceStatus) => !x.exists ? 'δεν βρέθηκε' : x.hold ? 'περιμένει «Ανανέωση από Excel»' : x.changed ? 'άλλαξε εκτός εφαρμογής' : x.locked ? 'είναι ανοιχτό στο Excel, η αλλαγή περιμένει' : x.error || '';
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
  if (duties?.month && duties.month < now) lines.push('Ο έλεγχος υπηρεσιών δείχνει ακόμα ' + acc(duties.month) + '. Όρισε το φύλλο για τον ' + acc(now) + ' (Στήλες… ή Άλλο αρχείο…).');
  if (!lines.length) return state.people.length && !state.settings.sources?.people
    ? html`<div className="srcalert"><${Alert} tone="info"><span><b>Αρχεία Excel.</b> Οι διορθώσεις στα άτομα δεν γράφονται ακόμα σε κανένα Excel. <${Button} variant="link" onClick=${go}>Όρισε το Δυναμολόγιο<//></span><//></div>` : null;
  return html`<div className="srcalert"><${Alert} tone="warn"><span><b>Αρχεία Excel.</b> ${lines.length === 1 ? lines[0] : html`<ul className="srcalert__list">${lines.map(l => html`<li key=${l}>${l}</li>`)}</ul>`} <${Button} variant="link" onClick=${go}>Δες τα<//></span><//></div>`;
}

export function SourcesView() {
  const { state, refresh } = useStore(); const toast = useToast();
  const st = useSourceStatus();
  const [layer, setLayer] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const sources = state.settings.sources || {};
  const close = () => setLayer(null);
  const pick = async (kind: ListKind | null) => {
    setBusy(kind || 'new');
    try {
      const r = await window.api.srcPick(kind); if (!r) return;
      if (!r.ok) { toast({ text: r.error }); return; }
      if (kind) {
        const best = bestFor(kind, r.sheets);
        setLayer({ kind: 'map', list: kind, book: r, b: best ? { file: r.file, sheet: best.sheet, header: best.header, cols: best.cols, write: true, scope: 'all' } : defaultBinding(kind, r.file, r.sheets[0]?.name) });
      } else setLayer({ kind: 'match', book: r });
    } finally { setBusy(''); }
  };
  const edit = async (kind: ListKind) => {
    const r = await window.api.srcRead(kind); if (!r.ok) { toast({ text: r.error }); return; }
    setLayer({ kind: 'map', list: kind, book: r, b: r.binding || sources[kind] });
  };
  // fresh: η αντιστοίχιση που μόλις αποθηκεύτηκε (το «sources» αυτής της απόδοσης έχει ακόμα την παλιά)
  const read = async (kind: ListKind, fresh?: SourceBinding, book?: SourceBook) => {
    const b0 = fresh || sources[kind]; if (!b0) return;
    if (kind === 'people') { const r = await window.api.srcPeople(b0); if (!r.ok) { toast({ text: r.error }); return; } setLayer({ kind: 'people', pv: r }); return; }
    const r = book || await window.api.srcRead(kind); if (!r.ok) { toast({ text: r.error }); return; }
    // ο πίνακας μπορεί να μετακινήθηκε μέσα στο φύλλο: ο main επιστρέφει πού είναι τώρα
    const b = !fresh && r.binding ? r.binding : b0;
    if (b.header !== sources[kind]?.header) await refresh();
    setLayer({ kind: SHEET_KINDS.includes(kind) ? 'sheet' : 'import', list: kind, book: r, b });
  };
  const newFile = async (kind: StatusKind) => {
    const r = await window.api.srcNewFile(kind); if (!r) return;
    if (!r.ok) { toast({ text: r.error }); return; }
    await refresh(); toast({ text: 'Φτιάχτηκε το ' + base(r.file) + '. Από εδώ και πέρα κάθε αλλαγή γράφεται εκεί.', actions: [{ label: 'Άνοιξε', fn: () => window.api.openPath(r.file) }] });
  };
  const remove = async (kind: ListKind) => { await window.api.srcSave(kind, null); await refresh(); toast({ text: KIND[kind].label + ': η εφαρμογή δεν διαβάζει ούτε γράφει πια σε Excel. Το αρχείο δεν άλλαξε.' }); };
  const toggleWrite = async (kind: ListKind, on: boolean) => { await window.api.srcSave(kind, { ...sources[kind]!, write: on }); await refresh(); };
  const toggleAuto = async (kind: ListKind, on: boolean) => { await window.api.srcSave(kind, { ...sources[kind]!, autoRead: on }); await refresh(); };
  return html`<div className="stack">
    <${Card} title="Αρχεία Excel ανά είδος" actions=${html`<${Button} disabled=${!!busy} onClick=${() => pick(null)}>${busy === 'new' ? 'Ανάγνωση…' : 'Εισαγωγή νέου Excel…'}<//>`}>
      <p className="note" style=${{ marginTop: 0 }}>Για κάθε είδος: από ποιο Excel, φύλλο και πίνακα διαβάζει η εφαρμογή, και πού γράφει τις αλλαγές σου. Αλλάζεις κάτι εδώ (π.χ. το Σ.Ι. κάποιου, μια ποινή) και γράφεται στο κελί του στο Excel. Η προηγούμενη έκδοση του αρχείου μένει στο <b>_προηγούμενα</b> δίπλα του.</p>
      <ul className="srclist">${KINDS.map(k => html`<${SourceRow} key=${k.id} kind=${k.id} b=${sources[k.id]} st=${st.sources.find(x => x.kind === k.id)} busy=${busy === k.id}
        onPick=${() => pick(k.id)} onEdit=${() => edit(k.id)} onRead=${() => read(k.id)} onWrite=${() => setLayer({ kind: 'write', list: k.id })} onNew=${() => newFile(k.id as StatusKind)}
        onRemove=${() => remove(k.id)} onToggle=${(on: boolean) => toggleWrite(k.id, on)} onAuto=${(on: boolean) => toggleAuto(k.id, on)}/>`)}</ul>
    <//>
    <${FormsCard} outs=${st.forms}/>
    ${layer?.kind === 'match' && html`<${MatchDialog} book=${layer.book} onClose=${close} onMap=${(list: ListKind, b: SourceBinding) => setLayer({ kind: 'map', list, book: layer.book, b, back: layer })}/>`}
    ${layer?.kind === 'map' && html`<${MapDialog} list=${layer.list} book=${layer.book} initial=${layer.b} onClose=${() => setLayer(layer.back || null)}
      onSaved=${(b: SourceBinding, andRead: boolean) => { if (andRead) read(layer.list, b, layer.list === 'people' ? undefined : layer.book); else if (layer.list === 'people' && !layer.back) setLayer({ kind: 'write', list: 'people' }); else setLayer(layer.back || null); }}/>`}
    ${layer?.kind === 'import' && html`<${ImportDialog} list=${layer.list} book=${layer.book} b=${layer.b} onClose=${close}/>`}
    ${layer?.kind === 'sheet' && html`<${SheetImportDialog} list=${layer.list} book=${layer.book} b=${layer.b} onClose=${close}/>`}
    ${layer?.kind === 'people' && html`<${Dialog} size="lg" title="Ανάγνωση προσωπικού από το Excel" onClose=${close}><${RosterPreview} pv=${layer.pv} onDone=${close} onCancel=${close}/><//>`}
    ${layer?.kind === 'write' && html`<${WriteDialog} list=${layer.list} onClose=${close}/>`}
  </div>`;
}

function SourceRow({ kind, b, st, busy, onPick, onEdit, onRead, onWrite, onNew, onRemove, onToggle, onAuto }: P) {
  const k = KIND[kind as ListKind]; const canWrite = true; const withPeople = WITH_PEOPLE.includes(kind);
  const s: SourceStatus | undefined = st;
  const badge = !b ? null : !s ? html`<${Badge}>…<//>` : !s.exists ? (isStatusKind(kind) ? html`<${Badge} tone="warn" data-tip="Θα φτιαχτεί με την πρώτη ενημέρωση">Δεν υπάρχει ακόμα<//>` : html`<${Badge} tone="bad">Δεν βρέθηκε<//>`)
    : s.hold ? html`<${Badge} tone="warn" data-tip=${s.hold}>Περιμένει ανανέωση<//>`
    : s.changed ? html`<${Badge} tone="warn" data-tip="Κάποιος το άλλαξε στο Excel. Πάτα «Ανανέωση από Excel» για να περάσουν οι αλλαγές.">Άλλαξε στο Excel<//>`
    : s.locked ? html`<${Badge} tone="warn" data-tip=${s.error}>Ανοιχτό στο Excel · περιμένει<//>`
    : s.error ? html`<${Badge} tone="bad" data-tip=${s.error}>Δεν γράφτηκε<//>`
    : s.synced ? html`<${Badge} tone="ok" data-tip=${'Τελευταία ανάγνωση/εγγραφή ' + s.at}>✓ ${s.at.slice(11)}<//>`
    : html`<${Badge} tone="info" data-tip=${canWrite ? 'Δεν γράφει ακόμα μόνη της: πάτα μία φορά «Ενημέρωση Excel» για να δεις τι θα γραφτεί, ή «Ανανέωση από Excel»' : 'Δεν έχει διαβαστεί ακόμα'}>Νέο<//>`;
  return html`<li className="srcrow">
    <div className="srcrow__main"><b>${k.label}</b> ${badge}
      <small>${b ? html`<span className="plan__fn" title=${b.file}>${bindingText(b)}</span>${b.write === false ? ' · δεν γράφει μόνη της' : ''}` : k.help + ' · δεν έχει οριστεί αρχείο'}</small>
      ${s?.error && !s.locked && html`<small className="txt-bad">${s.error}</small>`}</div>
    <div className="srcrow__act">
      ${!b ? html`<${Button} size="sm" variant="outline" disabled=${busy} onClick=${onPick}>${busy ? 'Ανάγνωση…' : 'Διάλεξε Excel…'}<//>${isStatusKind(kind) && html`<${Button} size="sm" variant="ghost" data-tip="Η εφαρμογή φτιάχνει καινούργιο Excel με τις εγγραφές της και το κρατά ενημερωμένο" onClick=${onNew}>Νέο αρχείο…<//>`}`
      : html`<${Button} size="sm" variant=${s?.changed ? 'default' : 'outline'} onClick=${onRead} data-tip=${'Διάβασε το Excel και δες τι αλλάζει πριν περάσει στην εφαρμογή' + (withPeople ? ' (διαβάζεται και μαζί με το προσωπικό)' : '')}>Ανανέωση από Excel<//>
        ${canWrite && html`<${Button} size="sm" variant=${s?.error ? 'default' : 'outline'} onClick=${onWrite} data-tip="Γράψε στο Excel ό,τι έχει η εφαρμογή (με προεπισκόπηση)">Ενημέρωση Excel<//>`}
        <${Button} size="sm" variant="ghost" onClick=${onEdit}>Στήλες…<//>
        <${Button} size="sm" variant="ghost" onClick=${onPick}>Άλλο αρχείο…<//>
        ${s?.exists && html`<${Button} size="sm" variant="ghost" onClick=${() => window.api.openPath(b.file)}>Άνοιξε<//>`}
        <${Button} size="sm" variant="ghost" aria-label=${'Αφαίρεση: ' + k.label} data-tip="Να μη διαβάζει ούτε να γράφει πια σε αυτό το αρχείο (το αρχείο μένει όπως είναι)" onClick=${onRemove}>✕<//>`}
    </div>
    ${b && canWrite && html`<label className="srcrow__opt"><input type="checkbox" className="ui-check" checked=${b.write !== false} onChange=${(e: any) => onToggle(e.target.checked)}/><span>Γράφει μόνη της κάθε αλλαγή εδώ</span></label>`}
    ${b && isStatusKind(kind) && html`<label className="srcrow__opt" data-tip="Νέες εγγραφές και αλλαγές ημερομηνιών με γνωστά άτομα περνούν χωρίς κλικ και γράφονται στο Ιστορικό. Ό,τι άλλο (σβησμένα, άγνωστα άτομα, αλλαγές και στις δύο πλευρές) περιμένει την «Ανανέωση από Excel»."><input type="checkbox" className="ui-check" checked=${b.autoRead !== false} onChange=${(e: any) => onAuto(e.target.checked)}/><span>Διαβάζει μόνη της τις απλές αλλαγές του Excel</span></label>`}
  </li>`;
}

// Νέο Excel: ποιοι πίνακες βρέθηκαν και σε ποιο είδος πάει ο καθένας (με την πρόταση της αναγνώρισης)
function MatchDialog({ book, onClose, onMap }: { book: SourceBook; onClose: () => void; onMap: (k: ListKind, b: SourceBinding) => void }) {
  const { state, refresh } = useStore(); const toast = useToast();
  const [pick, setPick] = useState<Record<number, ListKind | ''>>(() => Object.fromEntries(book.hits.map((h, i) => [i, h.best || ''])));
  const chosen = Object.entries(pick).filter(([, k]) => k) as [string, ListKind][];
  const dupe = chosen.map(([, k]) => k).find((k, i, a) => a.indexOf(k) !== i);
  const bindingFor = (i: number, k: ListKind): SourceBinding => {
    const h = book.hits[i]; const sh = book.sheets.find(s => s.name === h.sheet);
    return { file: book.file, sheet: h.sheet, header: h.header, cols: suggestCols(k, sh, h.header), write: true, scope: 'all' };
  };
  const save = async () => {
    for (const [i, k] of chosen) await window.api.srcSave(k, bindingFor(+i, k));
    await refresh(); onClose();
    toast({ text: 'Ορίστηκαν ' + chosen.length + ' είδη από το ' + book.name + '. Πάτα «Ανανέωση από Excel» σε όποιο θέλεις να διαβαστεί τώρα.' });
  };
  return html`<${Dialog} size="lg" title=${'Τι έχει το ' + book.name} description="Η εφαρμογή βρήκε αυτούς τους πίνακες. Διάλεξε σε ποιο είδος πάει ο καθένας· η πρόταση της αναγνώρισης είναι ήδη επιλεγμένη." onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!chosen.length || !!dupe} onClick=${save}>Αποθήκευση (${chosen.length})<//>`}>
    ${!book.hits.length && html`<${Alert} tone="warn"><span>Δεν βρέθηκε πίνακας με επικεφαλίδες ατόμων (Επώνυμο, Όνομα, ΑΣΜ). Διάλεξε είδος και δείξε τις στήλες με το χέρι:</span><//>
      <div className="toolbar" style=${{ flexWrap: 'wrap' }}>${KINDS.map(k => html`<${Button} key=${k.id} size="sm" variant="outline" onClick=${() => onMap(k.id, defaultBinding(k.id, book.file, book.sheets[0]?.name || k.title))}>${k.label}<//>`)}</div>`}
    <ul className="srclist">${book.hits.map((h, i) => {
      const k = pick[i]; const cur = k ? state.settings.sources?.[k] : undefined;
      const sh = book.sheets.find(s => s.name === h.sheet)!;
      const n = k ? tableRows(sh, h.header, suggestCols(k, sh, h.header)).records.length : h.rows;
      return html`<li key=${i} className="srcrow">
        <div className="srcrow__main"><b>${h.sheet}${h.title && h.title !== h.sheet ? ' › ' + h.title : ''}</b><small>γραμμή ${h.header + 1} · ${n} ${n === 1 ? 'εγγραφή' : 'εγγραφές'}${cur && k ? ' · αντικαθιστά: ' + bindingText(cur) : ''}</small></div>
        <div className="srcrow__act">
          <select className="ui-select" aria-label=${'Είδος για ' + h.sheet} value=${k} onChange=${(e: any) => setPick({ ...pick, [i]: e.target.value })}>
            <option value="">Δεν χρειάζεται</option>
            ${[...KINDS].sort((a, b) => (h.score[b.id] || 0) - (h.score[a.id] || 0)).map(x => html`<option key=${x.id} value=${x.id}>${x.label}${x.id === h.best ? ' (προτείνεται)' : ''}</option>`)}
          </select>
          ${k && html`<${Button} size="sm" variant="ghost" onClick=${() => onMap(k, bindingFor(i, k))}>Στήλες…<//>`}
        </div></li>`;
    })}</ul>
    ${dupe && html`<${Alert} tone="bad"><span>Το «${KIND[dupe].label}» διαλέχτηκε σε δύο πίνακες. Κράτα έναν.</span><//>`}
  <//>`;
}

// Αντιστοίχιση: φύλλο, γραμμή επικεφαλίδων και στήλη ανά πεδίο. Κλικ σε πεδίο και μετά κλικ σε κελί του πίνακα.
const NEW_SHEET = '\u0000new';
function MapDialog({ list, book, initial, onClose, onSaved }: { list: ListKind; book: SourceBook; initial: SourceBinding; onClose: () => void; onSaved: (b: SourceBinding, andRead: boolean) => void }) {
  const { state, refresh, today } = useStore(); const toast = useToast();
  const [b, setB] = useState<SourceBinding>(() => ({ ...initial, cols: { ...initial.cols } }));
  const [active, setActive] = useState<string | null>(null);
  const [extra, setExtra] = useState(0);
  const fields = fieldsOf(list);
  const isNew = !book.sheets.some(s => s.name === b.sheet);
  const sheet = book.sheets.find(s => s.name === b.sheet) || { name: b.sheet, rows: [] };
  const sugg = useMemo(() => suggestCols(list, sheet, b.header), [list, sheet, b.header]);
  const miss = missingFields(list, b.cols);
  const maxCol = Math.max(8, ...Object.values(b.cols), ...sheet.rows.slice(b.header, b.header + 30).map(r => (r || []).length - 1));
  const from = Math.max(0, b.header - 2), to = Math.min(Math.max(sheet.rows.length, b.header + 1), b.header + 16 + extra);
  const setCol = (k: string, c: number | null) => setB(x => { const cols = { ...x.cols }; for (const kk in cols) if (cols[kk] === c && kk !== k) delete cols[kk]; if (c == null) delete cols[k]; else cols[k] = c; return { ...x, cols }; });
  const setSheet = (name: string) => {
    if (name === NEW_SHEET) { setB({ ...defaultBinding(list, book.file), write: b.write, scope: b.scope }); return; }
    const sh = book.sheets.find(s => s.name === name)!; const best = bestFor(list, [sh]);
    setB({ ...b, sheet: name, header: best ? best.header : 0, cols: best ? best.cols : {} });
  };
  const setHeader = (r: number) => setB({ ...b, header: r, cols: suggestCols(list, sheet, r) });
  const clickCell = (r: number, c: number) => {
    if (active) { setCol(active, c); const next = fields.find(f => f.k !== active && b.cols[f.k] == null && (f.req || ['last', 'first'].includes(f.k))); setActive(next ? next.k : null); return; }
    if (r === b.header) return;
  };
  const sample = useMemo(() => {
    if (isNew || miss.length) return [];
    if (isStatusKind(list)) return parseStatuses(list, sheet, b, state.people, today).cands.slice(0, 5).map(c => c.who + ' · ' + TYPES[c.type || DEFAULT_TYPE[list]].label + (c.kind && c.kind !== TYPES[c.type || DEFAULT_TYPE[list]].label ? ' (' + c.kind + ')' : '') + ' · ' + dm(c.from) + '–' + dm(c.to) + (c.pid == null ? ' · ⚠ δεν βρέθηκε στην εφαρμογή' : ''));
    if (list === 'duties') { const cols = dayColumns(sheet.rows[b.header], b.cols.d1); return [(sheetMonth(sheet, b.header, today) ? 'Μήνας ' + sheetMonth(sheet, b.header, today) + ' · ' : '') + cols.length + ' στήλες ημερών', ...tableRows(sheet, b.header, b.cols).records.slice(0, 4).map(r => rowName(r.v) + ' · ' + cols.map(c => cellText((sheet.rows[r.r] || [])[c])).filter(x => dutyCode(x)).join(' ') || '—')]; }
    if (list === 'caps') return tableRows(sheet, b.header, b.cols).records.slice(0, 5).map(r => rowName(r.v) + ' · ' + (CAP_COLS.filter(k => b.cols[k] != null && capNo(cellText(r.v[k]))).map(k => 'όχι ' + CAP_ACC[k]).join(', ') || 'κάνει όλες'));
    return tableRows(sheet, b.header, b.cols).records.slice(0, 5).map(r => rowName(r.v) + (list === 'posts' ? ' · ' + cellText(r.v.post) : list === 'outside' && cellText(r.v.remarks) ? ' · ' + cellText(r.v.remarks) : ''));
  }, [b, sheet, list, isNew, miss.length]);
  const count = useMemo(() => (isNew ? 0 : tableRows(sheet, b.header, b.cols).records.length), [b, sheet, isNew]);
  const save = async (andRead: boolean) => {
    const r = await window.api.srcSave(list, b); if (!r.ok) { toast({ text: r.error }); return; }
    await refresh(); toast({ text: KIND[list].label + ': ' + bindingText(b) }); onSaved(b, andRead);
  };
  const colName = (c: number) => colLetter(c) + (cellText((sheet.rows[b.header] || [])[c]) ? ' · ' + cellText((sheet.rows[b.header] || [])[c]).slice(0, 24) : '');
  const fieldAt = (c: number) => fields.find(f => b.cols[f.k] === c);
  return html`<${Dialog} size="xl" title=${KIND[list].label + ': πού βρίσκεται στο Excel'} description=${book.name} onClose=${onClose}
    footer=${html`<span className="note" style=${{ marginRight: 'auto' }}>${isNew ? 'Το φύλλο θα φτιαχτεί με την πρώτη ενημέρωση.' : count + ' ' + (count === 1 ? 'εγγραφή' : 'εγγραφές') + ' στον πίνακα'}</span>
      <${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} variant="outline" disabled=${miss.length > 0} onClick=${() => save(false)}>Αποθήκευση<//>
      ${!isNew && html`<${Button} disabled=${miss.length > 0} onClick=${() => save(true)}>Αποθήκευση και ανάγνωση<//>`}`}>
    <div className="field-row" style=${{ alignItems: 'flex-end' }}>
      <div className="field"><label className="field__label" htmlFor="mp-sh">Φύλλο</label>
        <select id="mp-sh" className="ui-input" value=${isNew ? NEW_SHEET : b.sheet} onChange=${(e: any) => setSheet(e.target.value)}>
          ${book.sheets.map(s => html`<option key=${s.name} value=${s.name}>${s.name}</option>`)}
          ${isStatusKind(list) && html`<option value=${NEW_SHEET}>+ Νέο φύλλο «${KIND[list].title.slice(0, 31)}»</option>`}
        </select></div>
      ${!isNew && html`<div className="field" style=${{ maxWidth: '170px' }}><label className="field__label" htmlFor="mp-hd">Γραμμή επικεφαλίδων</label>
        <input id="mp-hd" type="number" min="1" className="ui-input" value=${b.header + 1} onChange=${(e: any) => setHeader(Math.max(0, (+e.target.value || 1) - 1))}/></div>`}
      ${isStatusKind(list) && html`<div className="field"><span className="field__label">Τι γράφει η εφαρμογή</span>
        <select className="ui-input" aria-label="Ποιες εγγραφές γράφονται" value=${b.scope || 'all'} onChange=${(e: any) => setB({ ...b, scope: e.target.value })}>
          <option value="all">Όλες τις εγγραφές</option><option value="active">Μόνο όσες ισχύουν από σήμερα και μετά</option></select></div>`}
    </div>
    ${miss.length > 0 && html`<${Alert} tone="bad"><span>Λείπει: <b>${miss.join(', ')}</b>. Πάτα το πεδίο αριστερά και μετά ένα κελί της στήλης του στον πίνακα.</span><//>`}
    <div className="mapper">
      <ul className="mapper__fields" aria-label="Πεδία">${fields.map(f => {
        const c = b.cols[f.k]; const rec = sugg[f.k];
        const tag = c == null ? (f.req ? html`<${Badge} tone="bad">λείπει<//>` : null) : c === rec ? html`<${Badge} tone="ok" data-tip="Βρέθηκε από την επικεφαλίδα">αναγνωρίστηκε<//>` : html`<${Badge} tone="info">δική σου επιλογή<//>`;
        return html`<li key=${f.k} className=${cx('mapper__f', active === f.k && 'is-active')}>
          <button type="button" className="mapper__fb" aria-pressed=${active === f.k} onClick=${() => setActive(active === f.k ? null : f.k)}><b>${f.label}</b>${tag}</button>
          <select className="ui-select" aria-label=${'Στήλη για ' + f.label} value=${c == null ? '' : String(c)} onChange=${(e: any) => setCol(f.k, e.target.value === '' ? null : +e.target.value)}>
            <option value="">—</option>
            ${Array.from({ length: maxCol + 1 }, (_, i) => html`<option key=${i} value=${String(i)}>${colName(i)}${i === rec ? ' (προτείνεται)' : ''}</option>`)}
          </select></li>`;
      })}</ul>
      <div className="mapper__grid">
        ${active && html`<div className="mapper__hint">Κάνε κλικ σε ένα κελί της στήλης για «${fields.find(f => f.k === active)?.label}»</div>`}
        ${isNew ? html`<p className="note">Νέο φύλλο: η εφαρμογή γράφει τίτλο στη γραμμή 1, επικεφαλίδες στη γραμμή 2 και από κάτω τις εγγραφές, με τις στήλες που βλέπεις αριστερά.</p>` : html`<div className="xl__scroll mapper__scroll"><table className="mapgrid">
          <thead><tr><th></th>${Array.from({ length: maxCol + 1 }, (_, c) => html`<th key=${c} className=${cx(fieldAt(c) && 'is-mapped')}>${colLetter(c)}${fieldAt(c) && html`<span className="mapgrid__tag">${fieldAt(c)!.label.replace(/ \(.*\)$/, '')}</span>`}</th>`)}</tr></thead>
          <tbody>${Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i).map(r => html`<tr key=${r} className=${cx(r === b.header && 'is-head')}>
            <th><button type="button" className="mapgrid__rn" data-tip="Αυτή είναι η γραμμή των επικεφαλίδων" onClick=${() => setHeader(r)}>${r + 1}</button></th>
            ${Array.from({ length: maxCol + 1 }, (_, c) => { const v = cellText((sheet.rows[r] || [])[c]); return html`<td key=${c} className=${cx(fieldAt(c) && 'is-mapped', active && 'is-pick', active && b.cols[active] === c && 'is-col')} title=${v} onClick=${() => clickCell(r, c)}>${v.length > 18 ? v.slice(0, 17) + '…' : v}</td>`; })}
          </tr>`)}</tbody></table></div>
          ${to < sheet.rows.length && html`<${Button} size="sm" variant="ghost" onClick=${() => setExtra(x => x + 30)}>Δείξε κι άλλες γραμμές<//>`}`}
        ${sample.length > 0 && html`<div className="mapper__sample"><b>Έτσι διαβάζει η εφαρμογή τις πρώτες γραμμές:</b><ul>${sample.map((t, i) => html`<li key=${i}>${t}</li>`)}</ul></div>`}
      </div>
    </div>
  <//>`;
}

// Ανανέωση από Excel: τι είναι νέο, τι αλλάζει, ποιοι δεν βρέθηκαν και άγνωστα είδη, πριν περάσει οτιδήποτε
function ImportDialog({ list, book, b: initial, onClose }: { list: StatusKind; book: SourceBook; b: SourceBinding; onClose: () => void }) {
  const { state, today, refresh } = useStore(); const toast = useToast();
  const [b, setB] = useState<SourceBinding>(initial);
  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(true);
  // ποιες εγγραφές είχε το Excel την προηγούμενη φορά (για όσες σβήστηκαν ή άλλαξαν «από» εκεί)
  // και πώς ήταν οι εγγραφές τότε (base), για όσες άλλαξαν και στις δύο πλευρές
  const [prev, setPrev] = useState<{ keys: string[]; base: Record<string, string> }>({ keys: [], base: {} });
  const [keepApp, setKeepApp] = useState<Set<string>>(new Set());
  const cur = state.settings.sources?.[list];
  const same = !!cur && cur.file === b.file && cur.sheet === b.sheet && cur.header === b.header;
  useEffect(() => { if (same) window.api.srcKeys(list).then(setPrev); else setPrev({ keys: [], base: {} }); }, [list, same]);
  const sheet = book.sheets.find(s => s.name === b.sheet);
  const parsed = useMemo(() => (sheet ? parseStatuses(list, sheet, b, state.people, today) : null), [sheet, b, state.people, today, list]);
  const d = useMemo(() => (parsed ? diffStatuses(list, state, parsed, b, choices, prev.keys, prev.base) : null), [parsed, state, b, choices, list, prev]);
  const all = useMemo(() => (parsed ? parsed.cands.filter(c => c.pid == null) : []), [parsed]);
  if (!sheet || !parsed || !d) return html`<${Dialog} title="Ανανέωση από Excel" onClose=${onClose}><${Alert} tone="bad"><span>Δεν υπάρχει φύλλο «${b.sheet}» στο ${book.name}. Πάτα «Στήλες…» και διάλεξε άλλο.</span><//><//>`;
  const types = KIND[list].types!;
  const go = async () => {
    setBusy(true);
    try {
      const r = await window.api.srcImport(list, b, choices, !del, [...keepApp]);
      if (!r.ok) { toast({ text: r.error }); return; }
      await refresh(); onClose(); toast({ text: r.text });
    } finally { setBusy(false); }
  };
  const pm = new Map(state.people.map(p => [p.id, p]));
  const both = d.update.filter(u => u.conflict); const plain = d.update.filter(u => !u.conflict);
  const n = d.add.length + d.update.filter(u => !keepApp.has(u.id)).length + (del ? d.removed.length : 0);
  const toggleKeep = (id: string, on: boolean) => { const x = new Set(keepApp); if (on) x.add(id); else x.delete(id); setKeepApp(x); };
  return html`<${Dialog} size="lg" title=${KIND[list].label + ': ανανέωση από Excel'} description=${bindingText(b)} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} data-autofocus="" disabled=${busy} onClick=${go}>${n ? 'Πέρασε ' + n + (n === 1 ? ' αλλαγή' : ' αλλαγές') : 'Εντάξει'}<//>`}>
    <div className="tiles"><div className="tile tile--main"><span className="tile__n">${d.add.length}</span><span className="tile__l">Νέες</span></div><div className="tile"><span className="tile__n">${d.update.length}</span><span className="tile__l">Αλλάζουν</span></div>
      <div className="tile"><span className="tile__n">${d.same}</span><span className="tile__l">Ίδιες</span></div><div className="tile"><span className="tile__n">${d.unmatched.length}</span><span className="tile__l">Χωρίς άτομο</span></div></div>
    ${parsed.unknown.length > 0 && html`<div className="field"><span className="field__label">Είδη που δεν αναγνωρίστηκαν: τι είναι το καθένα;</span>
      ${parsed.unknown.map(u => html`<div key=${u} className="field-row" style=${{ alignItems: 'center' }}><span className="plan__fn" style=${{ minWidth: '160px' }}>${u}</span>
        <select className="ui-select" aria-label=${'Είδος για ' + u} value=${b.values?.[valueKey(u)] || DEFAULT_TYPE[list]} onChange=${(e: any) => setB({ ...b, values: { ...(b.values || {}), [valueKey(u)]: e.target.value as TypeKey } })}>
          ${types.map(t => html`<option key=${t} value=${t}>${TYPES[t].label}: ${TYPES[t].long}${t === DEFAULT_TYPE[list] ? ' (προτείνεται)' : ''}</option>`)}</select></div>`)}
      <span className="field__help">Το κείμενο του Excel κρατιέται ως «είδος» (π.χ. ΕΛ ΑΡΒ). Η επιλογή αποθηκεύεται για την επόμενη φορά.</span></div>`}
    ${all.length > 0 && html`<div className="field"><span className="field__label">Δεν βρέθηκαν στην εφαρμογή: ποιος είναι;</span>
      ${all.map(c => html`<div key=${c.r} className="unm"><span><b>${c.who}</b><small>γραμμή ${c.r + 1} · ${dm(c.from)}–${dm(c.to)}</small></span>
        ${choices[c.r] != null ? html`<span>${pm.get(choices[c.r]!)?.last} ${pm.get(choices[c.r]!)?.first} <${Button} size="sm" variant="ghost" onClick=${() => { const x = { ...choices }; delete x[c.r]; setChoices(x); }}>Αλλαγή<//></span>`
        : html`<div className="unm__pick">${c.cands.map(p => html`<${Button} key=${p.id} size="sm" variant="outline" onClick=${() => setChoices({ ...choices, [c.r]: p.id })}>${p.last} ${p.first}${p.father ? ' του ' + p.father : ''}<//>`)}
          <div style=${{ minWidth: '200px' }}><${PersonPicker} placeholder="Άλλος…" onChange=${(pid: number) => setChoices({ ...choices, [c.r]: pid })}/></div>
          ${c.r in choices ? html`<${Badge}>παραλείπεται<//>` : html`<${Button} size="sm" variant="ghost" onClick=${() => setChoices({ ...choices, [c.r]: null })}>Παράλειψη<//>`}</div>`}</div>`)}</div>`}
    ${d.add.length > 0 && html`<details className="note" open=${d.add.length <= 8}><summary>Νέες (${d.add.length})</summary><ul>${d.add.slice(0, 60).map((a, i) => html`<li key=${i}>${pm.get(a.pid)?.last} ${pm.get(a.pid)?.first} · ${TYPES[a.type].label}${a.kind && a.kind !== TYPES[a.type].label ? ' (' + a.kind + ')' : ''} · ${dm(a.from)}–${dm(a.to)}</li>`)}</ul></details>`}
    ${both.length > 0 && html`<div className="field"><span className="field__label">Άλλαξαν και στο Excel και στην εφαρμογή (${both.length}): ποιο κρατάς;</span>
      ${both.map(u => html`<div key=${u.id} className="unm"><span><b>${u.who}</b><small>Excel: ${u.what} · Εφαρμογή: ${u.conflict}</small></span>
        <${Segmented} small=${true} value=${keepApp.has(u.id) ? 'app' : 'excel'} onChange=${(v: string) => toggleKeep(u.id, v === 'app')} items=${[{ value: 'excel', label: 'Του Excel' }, { value: 'app', label: 'Της εφαρμογής' }]}/></div>`)}
      <span className="field__help">Ό,τι κρατήσεις από την εφαρμογή γράφεται μετά στο Excel.</span></div>`}
    ${plain.length > 0 && html`<details className="note" open=${plain.length <= 8}><summary>Αλλάζουν (${plain.length})</summary><ul>${plain.slice(0, 60).map(u => html`<li key=${u.id}>${u.who}: ${u.what}</li>`)}</ul></details>`}
    ${d.removed.length > 0 && html`<div className="field"><span className="field__label">Σβήστηκαν από το Excel (${d.removed.length})</span><ul className="note" style=${{ margin: 0 }}>${d.removed.slice(0, 40).map(x => html`<li key=${x.id}>${pm.get(x.pid)?.last} ${pm.get(x.pid)?.first} · ${TYPES[x.type].label}${x.kind && x.kind !== TYPES[x.type].label ? ' (' + x.kind + ')' : ''} · ${dm(x.from)}–${dm(x.to)}</li>`)}</ul>
      <label className="rule"><input type="checkbox" className="ui-check" checked=${del} onChange=${(e: any) => setDel(e.target.checked)}/><span><b>Σβήσε τες και από την εφαρμογή</b><small>Αλλιώς μένουν στην εφαρμογή και ξαναγράφονται στο Excel.</small></span></label></div>`}
    ${parsed.skipped.length > 0 && html`<details className="note"><summary>Παραλείπονται ${parsed.skipped.length} γραμμές</summary><ul>${parsed.skipped.map(x => html`<li key=${x.r}>Γραμμή ${x.r + 1} · ${x.who}: ${x.why}</li>`)}</ul></details>`}
    ${parsed.cands.some(c => c.noEnd) && html`<p className="note">Όσοι δεν έχουν «έως» μπαίνουν ως σήμερα· αλλάζει από την εφαρμογή.</p>`}
    ${d.appOnly.length > 0 && html`<p className="note">${d.appOnly.length} ${d.appOnly.length === 1 ? 'εγγραφή της εφαρμογής δεν είναι' : 'εγγραφές της εφαρμογής δεν είναι'} στο Excel. Δεν σβήνονται· ${b.write !== false ? 'γράφονται στο Excel μόνες τους μόλις περάσει η ανανέωση' : 'γράφονται στο Excel με την «Ενημέρωση Excel»'}.</p>`}
    ${d.kept.length > 0 && html`<p className="note">${d.kept.length === 1 ? '1 εγγραφή άλλαξε' : d.kept.length + ' εγγραφές άλλαξαν'} μόνο στην εφαρμογή (το Excel έχει ό,τι είχε): μένουν όπως είναι και γράφονται στο Excel.</p>`}
    ${d.dup.length > 0 && html`<p className="note">${d.dup.length === 1 ? '1 γραμμή είναι διπλή' : d.dup.length + ' γραμμές είναι διπλές'} (ίδιο άτομο, ίδια έναρξη) και κρατήθηκε η πρώτη.</p>`}
  <//>`;
}

// Γραμμές που δεν ταίριαξαν με άτομο: ποιος είναι (ή παράλειψη)
function Unmatched({ rows, choices, setChoices, detail }: { rows: SheetPerson[]; choices: Record<number, number | null>; setChoices: (c: Record<number, number | null>) => void; detail?: (r: SheetPerson) => string }) {
  const { state } = useStore(); const pm = new Map(state.people.map(p => [p.id, p]));
  if (!rows.length) return null;
  return html`<div className="field"><span className="field__label">Δεν βρέθηκαν στην εφαρμογή: ποιος είναι;</span>
    ${rows.map(c => html`<div key=${c.r} className="unm"><span><b>${c.who}</b><small>γραμμή ${c.r + 1}${detail ? ' · ' + detail(c) : ''}</small></span>
      ${choices[c.r] != null ? html`<span>${pm.get(choices[c.r]!)?.last} ${pm.get(choices[c.r]!)?.first} <${Button} size="sm" variant="ghost" onClick=${() => { const x = { ...choices }; delete x[c.r]; setChoices(x); }}>Αλλαγή<//></span>`
      : html`<div className="unm__pick">${c.cands.map(p => html`<${Button} key=${p.id} size="sm" variant="outline" onClick=${() => setChoices({ ...choices, [c.r]: p.id })}>${p.last} ${p.first}${p.father ? ' του ' + p.father : ''}<//>`)}
        <div style=${{ minWidth: '200px' }}><${PersonPicker} placeholder="Άλλος…" onChange=${(pid: number) => setChoices({ ...choices, [c.r]: pid })}/></div>
        <${Button} size="sm" variant="ghost" onClick=${() => setChoices({ ...choices, [c.r]: null })}>Παράλειψη<//></div>`}</div>`)}</div>`;
}
const Tiles = ({ items }: { items: [number, string][] }) => html`<div className="tiles">${items.map(([n, l], i) => html`<div key=${l} className=${cx('tile', i === 0 && 'tile--main')}><span className="tile__n">${n}</span><span className="tile__l">${l}</span></div>`)}</div>`;
const List = ({ title, items, open }: { title: string; items: string[]; open?: boolean }) => (items.length ? html`<details className="note" open=${open ?? items.length <= 10}><summary>${title} (${items.length})</summary><ul>${items.slice(0, 150).map((t, i) => html`<li key=${i}>${t}</li>`)}</ul>${items.length > 150 && html`<p>… και ${items.length - 150} ακόμα</p>`}</details>` : null);
const prevMonth = (today: string) => addDays(today.slice(0, 8) + '01', -1).slice(0, 7);

// Πόστα, εκτός δύναμης, δυνατότητες, έλεγχος υπηρεσιών: τι διαβάζεται από αυτό το φύλλο, με τα δικά του νούμερα
function SheetImportDialog({ list, book, b, onClose }: { list: ListKind; book: SourceBook; b: SourceBinding; onClose: () => void }) {
  const { state, today, refresh } = useStore(); const toast = useToast();
  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState(false);
  const sheet = book.sheets.find(x => x.name === b.sheet);
  const [month, setMonth] = useState(() => (sheet && list === 'duties' && sheetMonth(sheet, b.header, today)) || b.month || prevMonth(today));
  const res = useMemo(() => {
    if (!sheet) return null;
    if (list === 'posts' || list === 'outside') {
      const p = (list === 'posts' ? planPosts : planOutside)(sheet, b, state, choices);
      const cmd: Command = { t: 'setPeopleFields', changes: p.changes.map(c => ({ pid: c.pid, patch: c.patch })), source: book.name, what: KIND[list].label.toLowerCase() };
      return { sp: p.sp, n: p.changes.length, cmd, tiles: [[p.changes.length, 'Αλλάζουν'], [p.same, 'Ίδιοι'], [p.listed, 'Στο φύλλο'], [p.sp.unmatched.length, 'Χωρίς άτομο']] as [number, string][],
        lists: [{ title: 'Τι αλλάζει', items: p.changes.map(c => c.who + ': ' + c.what) }], notes: [] as string[] };
    }
    if (list === 'caps') {
      const p = planCaps(sheet, b, state, choices);
      const cmd: Command = { t: 'importCaps', changes: p.changes.map(c => ({ pid: c.pid, kind: c.kind, reason: c.reason })), source: book.name };
      const by = new Map<string, string[]>(); for (const c of p.changes) by.set(c.who, [...(by.get(c.who) || []), (c.reason ? 'δεν κάνει ' : 'κάνει ') + CAP_ACC[c.kind] + (c.reason && c.reason !== 'Από Excel' ? ' (' + c.reason.replace(/^Από Excel:\s*/, '') + ')' : '')]);
      return { sp: p.sp, n: p.changes.length, cmd, tiles: [[p.changes.length, 'Αλλαγές'], [p.listed, 'Στο φύλλο'], [p.same, 'Ίδιοι'], [p.sp.unmatched.length, 'Χωρίς άτομο']] as [number, string][],
        lists: [{ title: 'Τι αλλάζει', items: [...by].map(([w, l]) => w + ': ' + l.join(', ')) }], notes: ['Όσοι δεν είναι στο φύλλο δεν αλλάζουν. Τα αυτόματα (πόστο, Σ.Ι. Ι4 ή άοπλος) ισχύουν πάντα.'] };
    }
    const p = planDuties(sheet, b, state, month, today, choices);
    const cmd: Command = { t: 'importDuties', guards: p.guards, baseline: p.base, source: book.name };
    const notes = [
      p.busy.length ? 'Δεν περνούν ' + p.busy.length + (p.busy.length === 1 ? ' μέρα που έχει' : ' μέρες που έχουν') + ' ήδη υπηρεσίες στην εφαρμογή (' + p.busy.map(dm).join(', ') + '): εκεί κρατιέται ό,τι έχει η εφαρμογή και γράφεται στο Excel.' : '',
      p.future ? p.future + (p.future === 1 ? ' μέρα είναι' : ' μέρες είναι') + ' μετά από σήμερα και δεν περνούν.' : '',
      p.extra ? p.extra + ' υπηρεσίες δεν χωρούσαν στις θέσεις της μέρας και μετρούν στις «προηγούμενες υπηρεσίες» του καθενός.' : '',
      p.unknown.length ? 'Κωδικοί που δεν αναγνωρίστηκαν και παραλείπονται: ' + p.unknown.join(', ') + '.' : ''
    ].filter(Boolean);
    const kinds = (Object.entries(p.byKind) as [DutyKind, number][]).map(([k, n]) => KIND_NAME[k] + ' ' + n);
    return { sp: p.sp, n: p.entries, cmd, keep: p.extraCells, tiles: [[p.entries, 'Υπηρεσίες'], [p.days, 'Μέρες'], [p.sp.rows.length, 'Άτομα'], [p.sp.unmatched.length, 'Χωρίς άτομο']] as [number, string][],
      lists: [{ title: 'Ανά είδος', items: kinds }], notes };
  }, [sheet, list, b, state, choices, month, today, book.name]);
  if (!sheet || !res) return html`<${Dialog} title="Ανανέωση από Excel" onClose=${onClose}><${Alert} tone="bad"><span>Δεν υπάρχει φύλλο «${b.sheet}» στο ${book.name}. Πάτα «Στήλες…» και διάλεξε άλλο.</span><//><//>`;
  const go = async () => {
    setBusy(true);
    try { const r = await window.api.srcApply(list, list === 'duties' && month !== sheetMonth(sheet!, b.header, today) ? { ...b, month } : b, res.cmd, 'keep' in res ? res.keep : undefined); if (!r.ok) { toast({ text: r.error }); return; } await refresh(); onClose(); toast({ text: r.text }); }
    finally { setBusy(false); }
  };
  return html`<${Dialog} size="lg" title=${KIND[list].label + ': ανανέωση από Excel'} description=${bindingText(b)} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} data-autofocus="" disabled=${busy} onClick=${go}>${res.n ? 'Πέρασε ' + res.n + (list === 'duties' ? (res.n === 1 ? ' υπηρεσία' : ' υπηρεσίες') : res.n === 1 ? ' αλλαγή' : ' αλλαγές') : 'Εντάξει'}<//>`}>
    ${list === 'duties' && html`<div className="field" style=${{ maxWidth: '220px' }}><label className="field__label" htmlFor="sd-m">Μήνας του φύλλου</label><input id="sd-m" type="month" className="ui-input" value=${month} onChange=${(e: any) => e.target.value && setMonth(e.target.value)}/></div>`}
    <${Tiles} items=${res.tiles}/>
    ${!res.n && !res.sp.unmatched.length && html`<${Alert} tone="ok"><span>✓ Η εφαρμογή έχει ήδη ό,τι γράφει αυτό το φύλλο.</span><//>`}
    <${Unmatched} rows=${res.sp.unmatched} choices=${choices} setChoices=${setChoices}/>
    ${res.lists.map(l => html`<${List} key=${l.title} title=${l.title} items=${l.items}/>`)}
    ${res.notes.map(t => html`<p key=${t} className="note">${t}</p>`)}
    ${res.sp.dup > 0 && html`<p className="note">${res.sp.dup === 1 ? '1 άτομο είναι' : res.sp.dup + ' άτομα είναι'} δύο φορές στο φύλλο· κρατήθηκε η πρώτη γραμμή.</p>`}
    <p className="note">Από εκεί και πέρα ό,τι αλλάζεις στην εφαρμογή γράφεται και σε αυτό το φύλλο${b.write === false ? ' με την «Ενημέρωση Excel»' : ''}.</p>
  <//>`;
}

// Ενημέρωση Excel: τι θα γραφτεί, γραμμή-γραμμή, πριν γραφτεί
function WriteDialog({ list, onClose }: { list: ListKind; onClose: () => void }) {
  const toast = useToast();
  const [pv, setPv] = useState<WritePreview | { ok: false; error: string } | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { window.api.srcPlan(list).then(setPv); }, [list]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await window.api.srcWrite(list);
      if (!r.ok) { toast({ text: r.error }); return; }
      onClose(); toast({ text: r.text, actions: [{ label: 'Άνοιξε', fn: () => window.api.openPath(r.file) }] });
    } finally { setBusy(false); }
  };
  return html`<${Dialog} size="lg" title=${KIND[list].label + ': ενημέρωση Excel'} description=${pv && pv.ok ? base(pv.file) : ''} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${busy || !pv || !pv.ok || (!pv.total && !pv.create)} onClick=${go}>${busy ? 'Γράφεται…' : 'Γράψε στο Excel'}<//>`}>
    ${!pv ? html`<p>Ανάγνωση…</p>` : !pv.ok ? html`<${Alert} tone="bad"><span>${pv.error}</span><//>` : html`<div>
      ${pv.create && html`<${Alert} tone="info"><span>Δεν υπάρχει ακόμα· θα φτιαχτεί με τίτλο και επικεφαλίδες στο ${base(pv.file)}.</span><//>`}
      ${!pv.total && !pv.create ? html`<${Alert} tone="ok"><span>✓ Το Excel έχει ήδη ό,τι έχει η εφαρμογή.</span><//>` : html`<p style=${{ marginTop: 0 }}><b>${pv.total}</b> ${pv.total === 1 ? 'αλλαγή θα γραφτεί' : 'αλλαγές θα γραφτούν'}. Η προηγούμενη έκδοση μένει στο _προηγούμενα.</p>
        <ul className="hist">${pv.lines.slice(0, 80).map((l, i) => html`<li key=${i}><span className="nw">Γρ. ${l.r + 1}</span> <b>${l.who}</b> ${l.text}</li>`)}</ul>${pv.lines.length > 80 && html`<p className="note">… και ${pv.lines.length - 80} ακόμα</p>`}`}
      ${pv.foreign > 0 && html`<p className="note">${pv.foreign === 1 ? '1 γραμμή του Excel δεν είναι' : pv.foreign + ' γραμμές του Excel δεν είναι'} στην εφαρμογή (γράφτηκαν με το χέρι): δεν αγγίζονται. Πάτα «Ανανέωση από Excel» για να περάσουν.</p>`}
      ${pv.notFound.length > 0 && html`<${Alert} tone="warn"><span>Δεν βρέθηκαν στο φύλλο: ${pv.notFound.slice(0, 10).join(', ')}${pv.notFound.length > 10 ? ' …' : ''}</span><//>`}
    </div>`}
  <//>`;
}

// Εισαγωγή προσωπικού: η ίδια προεπισκόπηση για το κουμπί του Δυναμολογίου και για τα Αρχεία Excel
export function RosterPreview({ pv, onDone, onCancel }: { pv: ImportPreview; onDone: () => void; onCancel: () => void }) {
  const { refresh } = useStore(); const toast = useToast();
  const [deact, setDeact] = useState(true); const [okd, setOkd] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const doubt = (pv.declared != null && pv.declared !== pv.found) || pv.suspicious.length > 0;
  const go = async () => {
    setBusy(true);
    try { const r = await window.api.applyRoster(pv.token, deact); if (!r.ok) { setErr(r.error); return; } await refresh(); toast({ text: r.text }); onDone(); }
    finally { setBusy(false); }
  };
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <div><span className="plan__fn">${pv.file}</span>${pv.essos && html` <${Badge} tone="info">ΕΣΣΟ ${pv.essos}<//>`}</div>
    <div className="tiles"><div className="tile tile--main"><span className="tile__n">${pv.active}</span><span className="tile__l">Σε δύναμη</span></div><div className="tile"><span className="tile__n">${pv.added}</span><span className="tile__l">Νέοι</span></div><div className="tile"><span className="tile__n">${pv.changes.length}</span><span className="tile__l">Αλλάζουν</span></div><div className="tile"><span className="tile__n">${pv.same}</span><span className="tile__l">Ίδιοι</span></div><div className="tile"><span className="tile__n">${pv.total - pv.active}</span><span className="tile__l">Εκτός δύναμης</span></div></div>
    ${pv.declared != null && pv.declared === pv.found && html`<${Alert} tone="ok"><span>✓ Το Δυναμολόγιο γράφει <b>ΣΥΝΟΛΟ ${pv.declared}</b> και βρέθηκαν <b>${pv.found}</b> άτομα. Ταιριάζουν.</span><//>`}
    ${pv.changes.length > 0 && html`<details className="note" open=${pv.changes.length <= 12}><summary>Τι αλλάζει (${pv.changes.length})</summary><ul>${pv.changes.slice(0, 120).map((c, i) => html`<li key=${i}><b>${c.who}</b>: ${c.what}</li>`)}</ul>${pv.changes.length > 120 && html`<p>… και ${pv.changes.length - 120} ακόμα</p>`}</details>`}
    ${!pv.changes.length && !pv.added && html`<${Alert} tone="ok"><span>✓ Η εφαρμογή έχει ήδη ό,τι γράφει το Excel για όσους υπάρχουν.</span><//>`}
    ${pv.warnings.map(w => html`<${Alert} key=${w} tone="warn"><span>${w}</span><//>`)}
    ${pv.skipped.length > 0 && html`<details className="note"><summary>Αγνοήθηκαν ${pv.skipped.length} γραμμές που δεν είναι άτομα (σύνολα, επικεφαλίδες)</summary><p>${[...new Set(pv.skipped)].join(' · ')}</p></details>`}
    ${pv.suspicious.length > 0 && html`<${Alert} tone="warn"><span>${pv.suspicious.length} γραμμές δεν έχουν ούτε ΑΣΜ, ούτε τηλέφωνο, ούτε θάλαμο. Είναι σίγουρα άτομα; ${pv.suspicious.slice(0, 12).join(' · ')}${pv.suspicious.length > 12 ? ' …' : ''}</span><//>`}
    ${doubt && html`<label className="rule"><input type="checkbox" className="ui-check" checked=${okd} onChange=${(e: any) => setOkd(e.target.checked)}/><span><b>Το έλεγξα, συνέχισε</b><small>Χρειάζεται επειδή κάτι δεν ταιριάζει παραπάνω.</small></span></label>`}
    <label className="rule"><input type="checkbox" className="ui-check" checked=${deact} onChange=${(e: any) => setDeact(e.target.checked)}/><span><b>Όσοι δεν είναι στο αρχείο → εκτός δύναμης</b><small>${pv.missing ? pv.missing + ' άτομα της εφαρμογής δεν βρέθηκαν στο αρχείο.' : 'Όλοι της εφαρμογής βρέθηκαν στο αρχείο.'} Όσοι έχουν ιστορικό κρατιούνται· όσοι δεν έχουν καμία καταχώρηση (π.χ. λάθος γραμμές παλιάς εισαγωγής) σβήνονται.</small></span></label>
    <div style=${{ display: 'flex', gap: '8px' }}><${Button} variant="outline" onClick=${onCancel}>Άκυρο<//><${Button} disabled=${busy || (doubt && !okd)} onClick=${go}>Εισαγωγή ${pv.total} ατόμων<//></div>
    <span className="note">Πριν την εισαγωγή κρατιέται αντίγραφο της βάσης. Αναιρείται από το Ιστορικό. Από εκεί και πέρα οι διορθώσεις σου στα άτομα γράφονται και στο ίδιο αρχείο (ρυθμίζεται στα «Αρχεία Excel»).</span>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  </div>`;
}

// ------------------------------------------------------------------ έντυπα: template, φύλλο, φάκελος
const FORMS: [FormKind, string][] = [['froura', 'ΦΡΟΥΡΑ ΣΒΕΝ'], ['frouraSpen', 'ΦΡΟΥΡΑ ΣΠΕΝ'], ['hkai', 'ΗΚΑΙ'], ['outs', 'Εξοδούχοι / Παραμένοντες'], ['check', 'Έλεγχος υπηρεσιών (μηνιαίο)']];
function FormsCard({ outs }: { outs: FormOut[] }) {
  const { state, boot, refresh } = useStore(); const toast = useToast();
  const [dlg, setDlg] = useState<{ form: FormKind; info: FormInfo } | null>(null);
  const forms = state.settings.forms || {};
  const save = async (f: FormKind, b: FormBinding | null, text: string) => { const r = await window.api.formSave(f, b); if (!r.ok) { toast({ text: r.error }); return false; } await refresh(); toast({ text }); return true; };
  const pickTpl = async (f: FormKind) => { const r = await window.api.formPick(f); if (!r) return; if (!r.ok) { toast({ text: r.error }); return; } setDlg({ form: f, info: r }); };
  const editTpl = async (f: FormKind) => { const r = await window.api.formInfo(f); if (!r.ok) { toast({ text: r.error }); return; } setDlg({ form: f, info: r }); };
  const pickDir = async (f: FormKind) => { const d = await window.api.formDir(f); if (d) await save(f, { ...(forms[f] || {}), dir: d }, 'Το έντυπο θα βγαίνει στο ' + d); };
  return html`<${Card} title="Έντυπα: template και φάκελος">
    <p className="note" style=${{ marginTop: 0 }}>Κάθε έντυπο μπορεί να βγαίνει από δικό σου template (αρχείο και φύλλο) σε δικό του φάκελο. Ό,τι έχει ήδη βγει για σήμερα ή επόμενη μέρα <b>ενημερώνεται μόνο του</b> όταν αλλάξεις κάτι στην εφαρμογή.</p>
    <ul className="srclist">${FORMS.map(([f, label]) => {
      const b = forms[f] || {}; const out = outs.filter(o => o.form === f);
      return html`<li key=${f} className="srcrow">
        <div className="srcrow__main"><b>${label}</b>${b.file && html` <${Badge} tone="info">δικό σου<//>`}
          <small>${f === 'check' ? 'Φτιάχνεται από την εφαρμογή' : b.file ? html`<span className="plan__fn" title=${b.file}>${base(b.file)}${b.sheet ? ' › ' + b.sheet : ''}</span>` : 'Template της εφαρμογής'} · φάκελος: ${b.dir ? b.dir + (b.monthly === false ? '' : '\\ΕΕΕΕ-ΜΜ') : (state.settings.outputDir || boot.outputDir) + '\\ΕΕΕΕ-ΜΜ'}</small>
          ${out.map(o => html`<small key=${o.file} className=${o.error ? 'txt-bad' : ''}>${base(o.file)}: ${o.error ? o.error : o.pending ? 'περιμένει (ανοιχτό στο Excel)' : 'ενημερωμένο ' + o.at}</small>`)}</div>
        <div className="srcrow__act">
          ${f !== 'check' && html`<${Button} size="sm" variant="outline" onClick=${() => pickTpl(f)}>Template…<//>`}
          ${f !== 'check' && (b.file || f === 'hkai' || f === 'outs') && html`<${Button} size="sm" variant="ghost" onClick=${() => editTpl(f)}>${f === 'hkai' ? 'Κελιά…' : 'Φύλλα…'}<//>`}
          <${Button} size="sm" variant="ghost" onClick=${() => pickDir(f)}>Φάκελος…<//>
          ${(b.file || b.dir) && html`<${Button} size="sm" variant="ghost" data-tip="Template και φάκελος της εφαρμογής" onClick=${() => save(f, null, label + ': ξανά με το template και τον φάκελο της εφαρμογής')}>Προεπιλογή<//>`}
        </div>
        ${b.dir && html`<label className="srcrow__opt"><input type="checkbox" className="ui-check" checked=${b.monthly !== false} onChange=${(e: any) => save(f, { ...b, monthly: e.target.checked }, e.target.checked ? 'Υποφάκελος ανά μήνα' : 'Χωρίς υποφάκελο ανά μήνα')}/><span>Υποφάκελος ανά μήνα (ΕΕΕΕ-ΜΜ)</span></label>`}
      </li>`;
    })}</ul>
    ${dlg && html`<${FormDialog} form=${dlg.form} info=${dlg.info} current=${forms[dlg.form] || {}} onClose=${() => setDlg(null)} onSave=${async (b: FormBinding) => { if (await save(dlg.form, b, FORMS.find(x => x[0] === dlg.form)![1] + ': ' + (b.file ? base(b.file) : 'template της εφαρμογής') + (b.sheet ? ' › ' + b.sheet : ''))) setDlg(null); }}/>`}
  <//>`;
}
function FormDialog({ form, info, current, onClose, onSave }: P) {
  const i: FormInfo = info;
  const [sheet, setSheet] = useState(i.sheet); const [sheet2, setSheet2] = useState(i.sheet2 || '');
  const [map, setMap] = useState<HkaiMap | null>(i.hkai ? i.hkai.map : null);
  const hk = i.hkai;
  const two = form === 'hkai' || form === 'outs';
  const save = () => {
    const b: FormBinding = { ...current, file: i.custom ? i.file : undefined, sheet, sheet2: two ? sheet2 : undefined };
    if (form === 'hkai' && map && hk) {
      // κρατιούνται μόνο όσα άλλαξε ο χρήστης σε σχέση με την αναγνώριση
      const cells: Partial<HkaiMap> = {}; const rows: Record<string, number> = {}; const cols: Record<string, string> = {};
      for (const r of HK_RANKS) if (map.rows[r] !== hk.map.rows[r]) rows[r] = map.rows[r];
      for (const [k] of HK_COLS) if (map.cols[k] !== hk.map.cols[k]) cols[k] = map.cols[k];
      if (map.title !== hk.map.title) cells.title = map.title; if (map.date !== hk.map.date) cells.date = map.date;
      if (Object.keys(rows).length) cells.rows = rows; if (Object.keys(cols).length) cells.cols = cols;
      b.cells = Object.keys(cells).length ? cells : undefined;
    }
    onSave(b);
  };
  return html`<${Dialog} size=${form === 'hkai' ? 'xl' : 'lg'} title=${'Template: ' + base(i.file)} description=${i.file} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="fd-s1">${form === 'hkai' ? 'Μπροστινή σελίδα' : form === 'outs' ? 'Φύλλο εξοδούχων' : 'Φύλλο του εντύπου'}</label>
        <select id="fd-s1" className="ui-input" value=${sheet} onChange=${(e: any) => setSheet(e.target.value)}>${i.sheets.map(s => html`<option key=${s} value=${s}>${s}</option>`)}</select></div>
      ${two && html`<div className="field"><label className="field__label" htmlFor="fd-s2">${form === 'hkai' ? 'Πίσω σελίδα' : 'Φύλλο παραμενόντων'}</label>
        <select id="fd-s2" className="ui-input" value=${sheet2} onChange=${(e: any) => setSheet2(e.target.value)}>${i.sheets.map(s => html`<option key=${s} value=${s}>${s}</option>`)}</select></div>`}
    </div>
    ${form === 'froura' || form === 'frouraSpen' ? html`<p className="note">Η εφαρμογή γράφει στα ίδια κελιά με το έντυπο της μονάδας (θέσεις, Λ/Υ, Δ/Υ, τιμωρημένοι, απόντες). Κράτα τη διάταξη ίδια· άλλαξε ελεύθερα κεφαλίδες, γραμματοσειρές και περιθώρια.</p>` : null}
    ${form === 'outs' ? html`<p className="note">Η λίστα ξεκινά στη γραμμή 7 με στήλες Βαθμός, Ο-Σ, Επίθετο, Όνομα, Θάλαμος, Τηλέφωνο, Παρατηρήσεις (B έως H), όπως στο έντυπο της μονάδας.</p>` : null}
    ${form === 'hkai' && hk && map && html`<div>
      ${hk.missing.length ? html`<${Alert} tone="warn"><span>Βρέθηκαν ${hk.found} από ${hk.total}. Δεν βρέθηκαν: <b>${hk.missing.join(', ')}</b>. Γράψε τη γραμμή ή τη στήλη τους παρακάτω.</span><//>` : html`<${Alert} tone="ok"><span>✓ Βρέθηκαν όλες οι γραμμές και οι στήλες (${hk.found} από ${hk.total}) από τα κείμενα του εντύπου.</span><//>`}
      <div className="hkmap">
        <div><h3>Γραμμή ανά βαθμό</h3>${HK_RANKS.map(r => html`<label key=${r} className="hkmap__row"><span>${r}</span><input className="ui-input" type="number" min="1" value=${map.rows[r] || ''} onChange=${(e: any) => setMap({ ...map, rows: { ...map.rows, [r]: +e.target.value || 0 } })}/></label>`)}
          <h3>Κελιά</h3>
          <label className="hkmap__row"><span>Τίτλος (ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ…)</span><input className="ui-input" value=${map.title} onChange=${(e: any) => setMap({ ...map, title: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}/></label>
          <label className="hkmap__row"><span>Τόπος και ημερομηνία</span><input className="ui-input" value=${map.date} onChange=${(e: any) => setMap({ ...map, date: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}/></label></div>
        <div><h3>Στήλη ανά είδος</h3>${HK_COLS.map(([k, label]) => html`<label key=${k} className="hkmap__row"><span>${label}</span><input className="ui-input" value=${map.cols[k] || ''} onChange=${(e: any) => setMap({ ...map, cols: { ...map.cols, [k]: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') } })}/></label>`)}</div>
      </div></div>`}
  <//>`;
}
