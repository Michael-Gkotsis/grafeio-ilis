// Γρήγορη εισαγωγή στρατιωτών (Michael, 19/10): στη Νέα ΕΣΣΟ γράφεις τον έναν μετά τον άλλον σε πίνακα σαν το Excel,
// με Enter στον επόμενο, και στο τέλος μία προσθήκη για όλους (μία αναίρεση, μία εγγραφή στο Δυναμολόγιο).
// Ό,τι γράφεις κρατιέται σε πρόχειρο, αν κλείσει το παράθυρο πριν από την προσθήκη.
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Alert, Button, Dialog, Icon, useToast } from '../ui';
import { useNav, useStore } from '../store';
import { listOf, optionsOf } from '../../shared/ranks';
import { roomCfg, type Person } from '../../shared/domain';
import { essoPersonTxt } from '../../shared/esso';
import { currentEssos } from '../../shared/rosterLists';
import { CARRY, QA_COLS, carryOf, checkRows, emptyRow, isFilled, parsePaste, toNewPerson, type QaKey, type QaRow } from '../../shared/quickAdd';
type P = any;

const DRAFT = 'grafeio.quickAdd';
const LABEL: Record<QaKey, string> = { rank: 'Βαθμός', spec: 'Ο/Σ', last: 'Επώνυμο *', first: 'Όνομα *', father: 'Πατρώνυμο', asm: 'ΑΣΜ', phone: 'Τηλέφωνο', room: 'Θάλαμος' };
const LIST: Partial<Record<QaKey, string>> = { rank: 'qa-ranks', spec: 'qa-specs', room: 'qa-rooms' };
const INPUT_MODE: Partial<Record<QaKey, string>> = { asm: 'numeric', phone: 'tel', room: 'numeric' };
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function loadDraft(): { rows: QaRow[]; essos: string } | null {
  try { const v = JSON.parse(localStorage.getItem(DRAFT) || 'null'); return v && Array.isArray(v.rows) && v.rows.some(isFilled) ? { rows: v.rows.map((r: P) => emptyRow(r)), essos: String(v.essos || '') } : null; } catch { return null; }
}
function saveDraft(rows: QaRow[], essos: string) {
  try { if (rows.some(isFilled)) localStorage.setItem(DRAFT, JSON.stringify({ rows: rows.filter(isFilled), essos })); else localStorage.removeItem(DRAFT); } catch { /* χωρίς πρόχειρο */ }
}
// η τελευταία γραμμή μένει πάντα κενή, με βαθμό, Ο/Σ και θάλαμο από την από πάνω
function withTail(rows: QaRow[]): QaRow[] {
  const last = rows[rows.length - 1];
  return !last ? [emptyRow({ rank: 'ΣΤΡ' })] : isFilled(last) ? [...rows, emptyRow(carryOf(last))] : rows;
}

const Row = memo(function Row({ r, i, err, onCell, onKey, onPaste, onDel, tail, af }: P) {
  return html`<tr className=${cx(err && 'is-err', tail && 'is-tail')}>
    <td className="qa__n">${i + 1}</td>
    ${QA_COLS.map((k, c) => html`<td key=${k}><input className="qa__in" data-r=${i} data-c=${c} aria-label=${LABEL[k] + ', γραμμή ' + (i + 1)} list=${LIST[k]} data-autofocus=${af && k === 'last' ? '' : undefined} inputMode=${INPUT_MODE[k]} autoComplete="off" spellCheck=${false}
      value=${r[k]} onChange=${(e: any) => onCell(i, k, e.target.value)} onKeyDown=${(e: any) => onKey(e, i, c)} onPaste=${(e: any) => onPaste(e, i, c)}/></td>`)}
    <td className="qa__st">${err ? html`<span className="qa__err">${err}</span>` : isFilled(r) ? html`<span className="qa__ok" aria-label="εντάξει">✓</span>` : ''}</td>
    <td>${!tail && html`<button type="button" className="qa__del" tabIndex=${-1} aria-label=${'Σβήσε τη γραμμή ' + (i + 1)} data-tip="Σβήσε τη γραμμή" onClick=${() => onDel(i)}>${Icon.x}</button>`}</td>
  </tr>`;
});

export function QuickAddDialog({ onClose }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const defEssos = useMemo(() => (state.settings.essos ? essoPersonTxt(state.settings.essos) : currentEssos(state.people)), [state.settings.essos, state.people]);
  const [draft] = useState(loadDraft);
  const [rows, setRows] = useState<QaRow[]>(() => withTail(draft?.rows || []));
  const [essos, setEssos] = useState(draft?.essos || defEssos);
  const [busy, setBusy] = useState(false);
  const focus = useRef<{ r: number; c: number } | null>(null);
  const ranks = useMemo(() => optionsOf(listOf(state.settings.lists, 'soldierRanks'), state.people.map((y: Person) => y.rank)), [state.people, state.settings.lists]);
  const specs = useMemo(() => optionsOf(listOf(state.settings.lists, 'specs'), state.people.map((y: Person) => y.spec)), [state.people, state.settings.lists]);
  const rooms = range(roomCfg(state.settings).n);
  // ο έλεγχος λίγο πίσω από το πληκτρολόγιο, για να μη βαραίνει το γράψιμο με πολλές γραμμές
  const dRows = useDeferredValue(rows);
  const errs = useMemo(() => checkRows(state.people, dRows), [state.people, dRows]);
  const n = rows.filter(isFilled).length; const bad = errs.filter(Boolean).length;
  useEffect(() => { saveDraft(rows, essos); }, [rows, essos]);
  useEffect(() => {
    const f = focus.current; if (!f) return; focus.current = null;
    const el = document.querySelector(`.qa [data-r="${f.r}"][data-c="${f.c}"]`) as HTMLInputElement | null;
    if (el) { el.focus(); el.select(); el.scrollIntoView({ block: 'nearest' }); }
  });

  const onCell = useCallback((i: number, k: QaKey, v: string) => {
    setRows(rs => {
      const out = rs.slice(); out[i] = { ...rs[i], [k]: v };
      // άλλαξε βαθμό, Ο/Σ ή θάλαμο: η κενή γραμμή από κάτω παίρνει τα ίδια
      if ((CARRY as string[]).includes(k) && out[i + 1] && !isFilled(out[i + 1]) && i + 1 === out.length - 1) out[i + 1] = { ...out[i + 1], [k]: v };
      return withTail(out);
    });
  }, []);
  const onDel = useCallback((i: number) => { setRows(rs => withTail(rs.filter((_, j) => j !== i))); focus.current = { r: i, c: 2 }; }, []);
  const save = async () => {
    const list = rows.filter(isFilled);
    if (!list.length || bad || busy) return;
    setBusy(true);
    try {
      const next = await run({ t: 'addPeople', people: list.map(r => toNewPerson(r, essos)) }, false);
      if (!next) return;
      saveDraft([], essos); onClose(); nav.go('people');
      const b = state.settings.sources?.people;
      toast({ text: (list.length === 1 ? 'Προστέθηκε 1 στρατιώτης' : 'Προστέθηκαν ' + list.length + ' στρατιώτες') + (b && b.write !== false ? '. Γράφονται και στο Δυναμολόγιο.' : '.'), actions: [undoMark()] });
    } finally { setBusy(false); }
  };
  const saveRef = useRef(save); saveRef.current = save;
  const onKey = useCallback((e: KeyboardEvent, i: number, c: number) => {
    const go = (r: number, col: number) => { e.preventDefault(); focus.current = { r, c: col }; setRows(rs => rs.slice()); };
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveRef.current(); return; }
    // Enter: στο επώνυμο του επόμενου (βαθμός, Ο/Σ, θάλαμος έρχονται από πάνω)
    if (e.key === 'Enter') { go(i + 1, QA_COLS.indexOf('last')); return; }
    // ↑↓ σε άλλη γραμμή, ίδια στήλη (όχι στις στήλες με λίστα, όπου τα βέλη διαλέγουν από τη λίστα)
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !LIST[QA_COLS[c]]) { const r = i + (e.key === 'ArrowDown' ? 1 : -1); if (r >= 0) go(r, c); }
  }, []);
  const onPaste = useCallback((e: ClipboardEvent, i: number, c: number) => {
    const got = parsePaste(e.clipboardData?.getData('text/plain') || '', c); if (!got) return;
    e.preventDefault();
    setRows(rs => {
      const out = rs.slice(); let carry = i > 0 ? carryOf(rs[i - 1]) : { rank: 'ΣΤΡ' };
      got.forEach((g, j) => {
        const cur = out[i + j]; const base = cur && isFilled(cur) ? cur : emptyRow(cur ? carryOf(cur) : carry);
        out[i + j] = { ...base, ...Object.fromEntries(Object.entries(g).filter(([, v]) => v !== '')) }; carry = carryOf(out[i + j]);
      });
      return withTail(out);
    });
    toast({ text: 'Επικολλήθηκαν ' + got.length + (got.length === 1 ? ' γραμμή' : ' γραμμές') + '. Έλεγξε τις στήλες πριν από την προσθήκη.' });
  }, [toast]);
  const clear = () => { setRows(withTail([])); focus.current = { r: 0, c: 2 }; };

  const foot = html`<span className="qa__sum">${bad ? html`<span className="qa__err">${bad === 1 ? '1 γραμμή θέλει διόρθωση' : bad + ' γραμμές θέλουν διόρθωση'}</span>` : n ? n + (n === 1 ? ' στρατιώτης' : ' στρατιώτες') : ''}</span>
    ${n > 0 && html`<${Button} variant="ghost" disabled=${busy} onClick=${clear}>Καθάρισμα<//>`}
    <${Button} variant="outline" disabled=${busy} onClick=${onClose}>Κλείσιμο<//>
    <${Button} disabled=${!n || bad > 0 || busy} onClick=${save} data-tip="Ctrl+Enter">${busy ? 'Γίνεται…' : n ? 'Πρόσθεσε ' + (n === 1 ? '1 στρατιώτη' : n + ' στρατιώτες') : 'Πρόσθεσε'}<//>`;
  return html`<${Dialog} title="Γρήγορη εισαγωγή στρατιωτών" size="xl" closeOnOverlay=${false} onClose=${busy ? () => {} : onClose} footer=${foot}
    description="Γράψε τον έναν κάτω από τον άλλον, σαν στο Excel. Στο τέλος μία προσθήκη για όλους.">
    <div className="qa__top">
      <div className="field" style=${{ width: '150px', flex: 'none' }}><label className="field__label" htmlFor="qa-essos">ΕΣΣΟ για όλους</label><input id="qa-essos" className="ui-input" placeholder="π.χ. 2026 Γ΄" value=${essos} onChange=${(e: any) => setEssos(e.target.value)}/></div>
      <ul className="qa__keys"><li><kbd className="ui-kbd">Tab</kbd> επόμενο κελί</li><li><kbd className="ui-kbd">Enter</kbd> επόμενος στρατιώτης</li><li><kbd className="ui-kbd">↑</kbd><kbd className="ui-kbd">↓</kbd> πάνω, κάτω</li><li><kbd className="ui-kbd">Ctrl</kbd>+<kbd className="ui-kbd">V</kbd> πολλές γραμμές από Excel ή Word</li><li><kbd className="ui-kbd">Ctrl</kbd>+<kbd className="ui-kbd">Enter</kbd> προσθήκη όλων</li></ul>
    </div>
    ${draft && html`<${Alert} tone="info"><span>Συνεχίζεις από εκεί που είχες μείνει: ${draft.rows.length} ${draft.rows.length === 1 ? 'γραμμή' : 'γραμμές'} από το πρόχειρο. <${Button} variant="link" onClick=${clear}>Ξεκίνα από την αρχή<//></span><//>`}
    <div className="qa">
      <table><thead><tr><th className="qa__n">#</th>${QA_COLS.map(k => html`<th key=${k} className=${'qa__' + k}>${LABEL[k]}</th>`)}<th className="qa__st"></th><th></th></tr></thead>
        <tbody>${rows.map((r, i) => html`<${Row} key=${i} r=${r} i=${i} err=${errs[i] || null} tail=${i === rows.length - 1 && !isFilled(r)} af=${i === rows.length - 1} onCell=${onCell} onKey=${onKey} onPaste=${onPaste} onDel=${onDel}/>`)}</tbody></table>
    </div>
    <datalist id="qa-ranks">${ranks.map((o: string) => html`<option key=${o} value=${o}/>`)}</datalist>
    <datalist id="qa-specs">${specs.map((o: string) => html`<option key=${o} value=${o}/>`)}</datalist>
    <datalist id="qa-rooms">${rooms.map(r => html`<option key=${r} value=${String(r)}/>`)}</datalist>
    <p className="note">Πατρώνυμο, ΑΣΜ, τηλέφωνο και θάλαμος δεν είναι υποχρεωτικά. Σ.Ι., πόστο, ρόλος και όπλο μπαίνουν μετά από την καρτέλα του καθενός ή από τις οθόνες Σ.Ι. και Οπλισμός. ${state.settings.sources?.people && state.settings.sources.people.write !== false ? 'Γράφονται όλοι μαζί στο Δυναμολόγιο, ο καθένας στον θάλαμό του.' : ''}</p>
  <//>`;
}
