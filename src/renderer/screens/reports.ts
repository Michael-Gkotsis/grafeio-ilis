// features/reports · «Έντυπα» (Michael, 19/10): δικά σου πρότυπα Excel (ανεβασμένα ή φτιαγμένα εδώ) που γεμίζουν με
// στοιχεία της εφαρμογής. Ένα έντυπο το στήνεις μία φορά (σελίδα με 5 βήματα) και μετά βγαίνει με ένα κλικ.
// Η τυχαία επιλογή γίνεται εδώ, ώστε να βγει ακριβώς ό,τι είδες· ο main παίρνει μόνο τη λίστα των ατόμων.
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Alert, Button, Dialog, DiscardAsk, Icon, PageHeader, Segmented, Tabs, VirtualList, useEscape, useToast, useViewportHeight } from '../ui';
import { usePending } from '../pending';
import { Select } from '../select';
import { useNav, useStore } from '../store';
import { DayFormsDialog } from './dayForms';
import { HK } from '../../shared/unit';
import { DateField, GoLink, PersonPicker, usePrintFile } from '../common';
import { PAGE_CSS } from '../pageCss';
import { SigEditor, SigsDialog } from '../sigs';
import { LayoutDialog } from '../layout';
import { ValueTableEditor, alignSeg } from './valueEditor';
import { hasVals, newValueTable, noPeople, tagId, tagsOf, valsUsed, type TAlign, type ValueTable } from '../../shared/values';
import { MAIN, bandsOf, keepBands } from '../../shared/repBands';
import { BandsPanel } from './repBands';
import { dropSigMoves, type Layout } from '../../shared/layout';
import { sigsClean, sigsCustom, sigsSaved, sigsText, type Sig } from '../../shared/sigs';
import { addDays, dayName, dm } from '../../shared/dates';
import { siCombos } from '../../shared/si';
import { rankTxt, statusLbl } from '../../shared/ranks';
import { blocksOf, type AppState, type Person, type Status } from '../../shared/domain';
import { WEAPON_FILTERS } from '../../shared/weapons';
import { PV_MAX, PV_SAMPLES, autoName, clampPage, editForm, formOpen, formSnap, getSample, isFormDirty, newForm, noForm, pageText, sampleName, sampleLabel, setSample, shownPages } from '../../shared/repPage';
import type { RepHistEntry, RepPreview, RepSource, TplInspect } from '../../shared/api';
import {
  BLANK_MAX, BLANK_ROWS, CELLS, FIELDS, PRESETS, REP_CONDS, groupsOf, alwaysOf, drawRows, manualKind, recentIds, refillDraw, REP_KINDS, SPLITS, ST_CATS, ST_FMTS, ST_TAGS, condVal, condsOf, outPlan, setCond, SPLIT_NOUN, blankBuild, candidates, cellOf, dailyOk, defaultPick, fieldOf, isLinked, keepDraw, rowNoun, pickText, replaceOne, repDate, roomList, rowsOf, sortRows,
  DEF_COMBO, TAB_WIDTHS, comboFields, comboFmts, comboHead, comboOf, isStatusField, forBuild, moreRows, newTable, pickForKind, sigsNone, sortsOf, splitOk, stText, subPick, tagKey, withBuilt, blankN, regrid,
  type BuildCol, type BuildOpts, type BuildTable, type TabLay, type ColOpts, type RepCol, type RepKind, type RepPick, type RepSort, type RepSplit, type RepTable, type RepTpl, type Report, type Row, type StCat
} from '../../shared/reports';
type P = any;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
// στήλες που μπαίνουν μόνες τους όταν διαλέγεις είδος σε «Φτιάξ' το εδώ»
const KIND_COLS: Partial<Record<RepKind, string[]>> = { status: ['stype', 'from', 'to'], duty: ['seat', 'hours'], weapon: ['weapon', 'wtype', 'rack', 'inout'], wmove: ['weapon', 'mreason', 'mout', 'min'] };
const fileName = (f?: string) => (f || '').split(/[\\/]/).pop() || '';
// «Φτιάξ' το εδώ», άλλαξε το είδος: φεύγουν οι στήλες που δεν υπάρχουν σε αυτό (π.χ. ΑΣΜ στα στελέχη) και μπαίνουν οι βασικές του
// (Καταστάσεις: είδος, από, έως· Υπηρεσίες: θέση πρώτη, μετά το Α/Α)· ο συνδυασμός κρατά όσα στοιχεία υπάρχουν
function colsForKind(cs: BuildCol[], kind: RepKind): BuildCol[] {
  if (kind === 'blank') { const aa = cs.find(c => c.f === 'aa'); const col = cs.filter(c => c.f === 'col'); return [...(aa ? [aa] : [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }]), ...(col.length ? col : [1, 2].map(n => ({ f: 'col', h: 'ΣΤΗΛΗ ' + n, w: 'auto' as const })))]; }
  const cols = cs.filter(c => fieldOf(kind, c.f) && !Object.values(KIND_COLS).some(l => l!.includes(c.f) && !fieldOf('people', c.f)))
    .map(c => (c.f === 'combo' && c.o?.parts ? { ...c, o: { ...c.o, parts: c.o.parts.filter(k => fieldOf(kind, k)) } } : c));
  for (const f of KIND_COLS[kind] || []) if (!cols.some(c => c.f === f)) cols.push({ f, h: fieldOf(kind, f)!.head, w: ['stype', 'seat', 'inout', 'mreason'].includes(f) ? 'auto' : 'narrow' });
  if (kind === 'duty') { const i = cols.findIndex(c => c.f === 'seat'); const [x] = cols.splice(i, 1); cols.splice(cols[0]?.f === 'aa' ? 1 : 0, 0, x); }
  return cols;
}
// πού βγαίνει, για τη λίστα: «φύλλο ΑΓΓΑΡΕΙΑ στο Δυναμολόγιο»
const splitText = (r: Report) => (splitOk(r.kind) && r.split && r.split !== 'none' ? ', ' + (SPLITS.find(x => x.value === r.split)?.label.toLowerCase() || '') : '');
const outText = (r: Report) => r.out === 'print' ? 'εκτύπωση' + splitText(r) : r.out !== 'sheet' ? 'Excel' + splitText(r) :
  'φύλλο ' + (r.target?.sheet || r.name).toUpperCase() + splitText(r) + ' στο ' + (r.target?.to === 'file' ? fileName(r.target.file) : 'Δυναμολόγιο') + (r.target?.auto ? ', ενημερώνεται μόνο του' : '');
const STEPS = ['Πρότυπο', 'Τι αφορά', 'Η σελίδα και οι πίνακες', 'Ποιοι μπαίνουν', 'Πού βγαίνει'];
const needsAsk = (r: Report) => (r.pick.mode === 'random' && !noPeople(r)) || r.day === 'ask';
const nameOf = (x: Row) => [x.last, x.first].filter(Boolean).join(' ');
const tplsOf = (s: AppState) => s.settings.reportTpls || [];
const repsOf = (s: AppState) => s.settings.reports || [];
const lastTxt = (v?: string, today?: string) => { if (!v) return 'Δεν έχει βγει'; const [d, t] = v.split(' '); return (d === today ? 'Σήμερα' : dm(d)) + ' ' + (t || ''); };
// το φτιαγμένο πρότυπο άλλαξε στο Excel (αποθηκεύτηκε μετά από εμάς): από εκεί και πέρα αντιστοιχίζεται σαν ανεβασμένο
const editedInExcel = (t: RepTpl, mtime?: number) => !!t.built && !!mtime && !!t.mtime && Math.abs(mtime - t.mtime) > 2000;

// ------------------------------------------------------------------ βγάλσιμο
function useRunReport() {
  const toast = useToast(); const printFile = usePrintFile();
  const busy = useRef(false);
  const go = useCallback(async (s: AppState, r: Report, ids: (number | string)[], d: string, print: boolean, force = false, again = false): Promise<boolean> => {
    const tpl = tplsOf(s).find(t => t.id === r.tpl);
    if (!tpl) { toast({ text: html`<span><b>Δεν βγήκε «${r.name}».</b> Το πρότυπό του δεν υπάρχει πια. Άνοιξέ το με «Αλλαγή» και διάλεξε άλλο.</span>` }); return false; }
    if (!ids.length && !hasVals(r)) { toast({ text: html`<span><b>Δεν βγήκε «${r.name}».</b> Κανείς δεν περνά τα φίλτρα του για ${dayName(d).toLowerCase()} ${dm(d)}.</span>` }); return false; }
    if (busy.current) return false; busy.current = true;
    let res: Awaited<ReturnType<typeof window.api.repRun>>;
    try { res = await window.api.repRun(r, tpl.file, ids, d, print, force, { again }); } catch (e) { res = { ok: false, error: String(e) }; } finally { busy.current = false; }
    if (!res.ok) {
      // φύλλο με ίδιο όνομα που δεν έφτιαξε το έντυπο: γράφεται από πάνω μόνο αν το πεις
      if (res.confirm) { toast({ text: html`<span><b>Δεν γράφτηκε «${r.name}».</b> ${res.error} Να γραφτεί από πάνω; Ό,τι έχει χάνεται (μένει αντίγραφο στον φάκελο «_προηγούμενα»).</span>`, actions: [{ label: 'Γράψε από πάνω', fn: () => { go(s, r, ids, d, print, true, again); } }] }); return false; }
      toast({ text: html`<span><b>Δεν βγήκε «${r.name}».</b> ${res.error}</span>`, actions: res.locked ? [{ label: 'Ξανά', fn: () => { go(s, r, ids, d, print, force, again); } }] : undefined });
      return false;
    }
    const file = res.file; const n = noPeople(r) ? 'πίνακες τιμών' : ids.length + ' ' + rowNoun(r.kind);
    const warn = res.warnings.length ? html`<br/>⚠ ${res.warnings.join(' · ')}` : '';
    if (r.out === 'sheet' && !print) {
      const sh = res.sheets || [];
      toast({ text: html`<span>Γράφτηκε ${sh.length > 1 ? sh.length + ' φύλλα' : 'το φύλλο «' + (sh[0] || '') + '»'} στο <b>${fileName(file)}</b> (${n})${warn}</span>`, actions: [{ label: 'Άνοιξέ το', fn: () => { window.api.openPath(file); } }, { label: 'Εκτύπωση', fn: () => { printFile(file, sh); } }] });
      return true;
    }
    toast({ text: html`<span>Βγήκε: <b>${fileName(file)}</b> (${n})${warn}</span>`, actions: [...(print ? [] : [{ label: 'Εκτύπωση', fn: () => { printFile(file); } }]), { label: 'Φάκελος', fn: () => window.api.openFolder('output') }] });
    return true;
  }, [toast, printFile]);
  return go;
}

// Ποιοι μπαίνουν: όσοι περνούν τα φίλτρα, και αν είναι τυχαίοι, η τωρινή κλήρωση (⟳ ξανά όλοι ή ένας, ✕ βγάλ' τον,
// και όποιον θέλεις με το όνομα). init: η κλήρωση που ήδη είδε (από τον οδηγό), αντί για νέα. Αν αλλάξουν τα φίλτρα ή
// το πόσοι, η κλήρωση κρατά όσους περνούν ακόμα· από την αρχή γίνεται μόνο με «⟳ Ξανά τυχαία».
function usePick(r: Report, d: string, init?: (number | string)[] | null) {
  const { state } = useStore(); const toast = useToast();
  const pk = JSON.stringify(r.pick);
  const random = r.pick.mode === 'random'; const fair = random && !!r.pick.fair; const gap = random ? r.pick.gap || 0 : 0;
  const manual = manualKind(r.kind);
  // «όχι όσοι βγήκαν τις τελευταίες Ν μέρες»: από το Ιστορικό του εντύπου
  const [hist, setHist] = useState<RepHistEntry[] | null>(null);
  useEffect(() => { if (!gap) { setHist(null); return; } let live = true; window.api.repHist(r.id).then(h => { if (live) setHist(h || []); }, () => { if (live) setHist([]); }); return () => { live = false; }; }, [gap, r.id]);
  const recent = useMemo(() => (gap && hist ? recentIds(hist, d, gap) : null), [gap, hist, d]);
  const always = useMemo(() => alwaysOf(state, r), [state, r.kind, pk]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pool = useMemo(() => { const c = candidates(state, r, d); return recent ? c.filter(x => !recent.has(x.id)) : c; }, [state, r.kind, pk, d, recent]);   // eslint-disable-line react-hooks/exhaustive-deps
  const poolKey = useMemo(() => pool.map(x => x.id).join() + '|' + always.map(x => x.id).join(), [pool, always]);
  const [seed, setSeed] = useState(0); const [rand, setRand] = useState<Row[]>([]);
  const initRef = useRef(init && init.length ? init : null); const seedRef = useRef(-1);
  const added = useRef(new Set<number | string>());   // όσοι μπήκαν με το όνομα: μένουν όταν αλλάζουν τα φίλτρα
  // «Πρώτα όσοι βγήκαν λιγότερες φορές»: πόσες φορές βγήκε ο καθένας σε αυτό το έντυπο (από τον main, ανά ΕΣΣΟ)
  const [times, setTimes] = useState<Record<string, number> | null>(null);
  useEffect(() => { if (!fair) { setTimes(null); return; } let live = true; window.api.repTimes(r.id).then(t => { if (live) setTimes(t || {}); }, () => { if (live) setTimes({}); }); return () => { live = false; }; }, [fair, r.id]);
  const ready = (!fair || !!times) && (!gap || !!hist);
  useEffect(() => {
    if (!random || !ready) return;
    const keep = initRef.current; initRef.current = null;
    const got = keep && keepDraw(pool, keep, manual ? state.people : []); if (got) { setRand(got); seedRef.current = seed; return; }
    const tm = fair ? times! : undefined; const n = r.pick.n || 0;
    if (seedRef.current === seed) {
      const nv = new Set(r.pick.never || []);
      setRand(prev => refillDraw(prev, [...always, ...prev.filter(x => added.current.has(x.id) && !nv.has(x.id as number) && !always.some(a => a.id === x.id))], pool, n, !!r.pick.even, Math.random, tm));
    } else { seedRef.current = seed; added.current.clear(); setRand(drawRows(always, pool, n, !!r.pick.even, Math.random, tm)); }
  }, [poolKey, random, r.pick.n, r.pick.even, seed, ready, times]);   // eslint-disable-line react-hooks/exhaustive-deps
  // όχι τυχαίοι: όσοι πρόσθεσες ή έβγαλες αυτή τη φορά
  const [extra, setExtra] = useState<number[]>([]); const [drop, setDrop] = useState<(number | string)[]>([]);
  // οι τυχαίοι με τα τωρινά τους στοιχεία (η κλήρωση κρατά μόνο ποιοι)
  const rows = useMemo(() => {
    const pm = new Map<number | string, Row>([...state.people, ...pool].map(x => [x.id, x]));
    if (!random) {
      const base = rowsOf(state, r, d).filter(x => !drop.includes(x.id)); const have = new Set(base.map(x => x.id));
      const add = extra.filter(id => !have.has(id)).map(id => pm.get(id)).filter((x): x is Row => !!x);
      return add.length ? sortRows([...base, ...add], r.sort, state, r.kind) : base;
    }
    return sortRows(rand.map(x => pm.get(x.id) || x), r.sort, state, r.kind);
  }, [random, rand, pool, r.sort, state, r.kind, pk, d, extra, drop]);   // eslint-disable-line react-hooks/exhaustive-deps
  const replace = (id: number | string) => {
    const i = rand.findIndex(x => x.id === id); if (i < 0) return;
    const nx = replaceOne(rand, i, pool, Math.random, fair && times ? times : undefined);
    if (nx) setRand(nx); else toast({ text: 'Δεν υπάρχει άλλος που να περνά τα φίλτρα.' });
  };
  const remove = (id: number | string) => { if (random) setRand(x => x.filter(y => y.id !== id)); else { setDrop(x => [...x, id]); setExtra(x => x.filter(y => y !== id)); } };
  const add = (id: number) => {
    const p = state.people.find(x => x.id === id); if (!p) return;
    if (random) { added.current.add(id); setRand(x => (x.some(y => y.id === id) ? x : [...x, p])); } else { setExtra(x => [...x, id]); setDrop(x => x.filter(y => y !== id)); }
  };
  return { pool, rows, random, manual, times: fair ? times : null, recent: recent ? recent.size : 0, reroll: () => setSeed(x => x + 1), replace, remove, add };
}

const PickRow = memo(function PickRow({ x, i, kind, onSwap, onX, onNever, times, style }: P) {
  const t = times ? times[x.id] || 0 : -1; const nm = nameOf(x);
  const info = [rankTxt(x), kind !== 'cadre' && x.room != null ? 'Θ' + x.room : '', kind === 'status' && x.st ? statusLbl(x.st) + ' ' + dm(x.st.from) + '–' + (x.st.open ? '…' : dm(x.st.to)) : '',
    kind === 'duty' && x.seat ? x.seat.label : '', kind === 'weapon' ? x.weapon || '' : '', kind === 'wmove' && x.m ? x.m.weapon + ' · ' + x.m.reason + ' ' + x.m.outTime : '', t >= 0 ? (t ? 'βγήκε ' + t + (t === 1 ? ' φορά' : ' φορές') : 'πρώτη φορά') : ''].filter(Boolean).join(' · ');
  return html`<div role="listitem" className="rep-picks__row" style=${style}><span className="rep-picks__n">${i + 1}</span><b>${nm || '(κενή θέση)'}</b><small data-tip=${info.length > 40 ? info : undefined}>${info}</small>
    <span className="rep-picks__acts">
      ${onNever && html`<button type="button" className="rep-picks__never" aria-label=${'Ποτέ ο ' + nm} data-tip="Να μη μπαίνει ποτέ σε αυτό το έντυπο" onClick=${() => onNever(x.id)}>Ποτέ</button>`}
      ${onSwap && html`<button type="button" className="rep-picks__x" aria-label=${'Άλλος τυχαίος αντί για ' + nm} data-tip="Άλλος τυχαίος στη θέση του" onClick=${() => onSwap(x.id)}>⟳</button>`}
      ${onX && html`<button type="button" className="rep-picks__x" aria-label=${'Βγάλε τον ' + nm} data-tip="Βγάλ' τον (αυτή τη φορά)" onClick=${() => onX(x.id)}>${Icon.x}</button>`}</span></div>`;
});
const PICK_H = 30;   // ύψος γραμμής της λίστας (σταθερό: μόνο όσες φαίνονται ζωγραφίζονται)
// onNever: «Ποτέ σε αυτό το έντυπο» (ο οδηγός ή το «Βγάλε…» το κρατούν στο έντυπο)
function PickList({ p, kind, onNever }: P) {
  const who = rowNoun(kind);
  const inList = useMemo(() => new Set(p.rows.map((x: Row) => x.id)), [p.rows]);
  const na = useCallback((x: Person) => (inList.has(x.id) ? 'Είναι ήδη μέσα' : null), [inList]);
  // σταθερά κουμπιά για κάθε γραμμή: όταν αλλάζει ένα φίλτρο ξαναζωγραφίζονται μόνο οι γραμμές που άλλαξαν
  const cb = useRef({ p, onNever }); cb.current = { p, onNever };
  const swap = useCallback((id: number | string) => cb.current.p.replace(id), []);
  const out = useCallback((id: number | string) => cb.current.p.remove(id), []);
  const never = useCallback((id: number) => cb.current.onNever?.(id), []);
  const height = Math.round(useViewportHeight(0) * 0.46);
  return html`<div className="rep-picks">
    <div className="rep-picks__head"><b>${p.rows.length} ${who}</b><span className="muted">${p.random ? 'τυχαία από ' + p.pool.length + ' που περνούν τα φίλτρα' : p.rows.length < p.pool.length ? 'από ' + p.pool.length + ' που περνούν τα φίλτρα' : ''}${p.recent ? ' (εκτός ' + p.recent + ' που βγήκαν πρόσφατα)' : ''}</span>
      ${p.random && html`<${Button} size="sm" variant="outline" disabled=${!p.pool.length} onClick=${p.reroll} data-tip="Νέα κλήρωση για όλους">⟳ Ξανά τυχαία<//>`}</div>
    ${p.rows.length ? html`<div role="list" aria-label=${'Μπαίνουν: ' + p.rows.length}><${VirtualList} className="rep-picks__list" items=${p.rows} rowHeight=${PICK_H} height=${height}
      renderRow=${(x: Row, i: number, style: P) => html`<${PickRow} key=${x.id} x=${x} i=${i} kind=${kind} times=${p.times} style=${style}
        onSwap=${p.random ? swap : null} onX=${p.random || p.manual ? out : null} onNever=${p.manual && onNever ? never : null}/>`}/></div>` : html`<div className="empty">Κανείς δεν περνά τα φίλτρα.</div>`}
    ${p.manual && html`<div className="rep-picks__add"><${PersonPicker} placeholder="Βάλε συγκεκριμένο: επώνυμο, όνομα ή ΑΣΜ…" unavailable=${na} onChange=${(id: number) => p.add(id)}/></div>`}
  </div>`;
}

// ------------------------------------------------------------------ προεπισκόπηση (σελίδα όπως θα τυπωθεί, κελιά με κλικ)
function Preview({ pv, busy, picking, marks, heads, onPick, page = 1, none }: P) {
  const host = useRef<HTMLDivElement>(null); const root = useRef<ShadowRoot | null>(null);
  const pick = useRef(onPick); pick.current = onPick;
  useEffect(() => {
    const el = host.current; if (!el || root.current) return;
    root.current = el.attachShadow({ mode: 'open' });
    root.current.addEventListener('click', (e: Event) => { const td = (e.target as HTMLElement).closest?.('td[data-a]'); if (td && pick.current) pick.current(td.getAttribute('data-a')); });
  }, []);
  // η σελίδα σε όλο το πλάτος του πλαισίου (zoom): οι αριθμοί του renderBook είναι σε px της σελίδας
  const fit = useCallback(() => {
    const r = root.current; const el = host.current; if (!r || !el) return;
    const w = r.querySelector('.wrap') as HTMLElement | null; const pg = r.querySelector('.pg:not([hidden])') as HTMLElement | null;
    if (w) (w.style as P).zoom = pg ? String(Math.min(1, (el.clientWidth - 4) / pg.offsetWidth)) : '1';
  }, []);
  useEffect(() => {
    const r = root.current; if (!r) return;
    r.innerHTML = '<style>' + PAGE_CSS + (pv?.css || '') + '</style><div class="wrap' + (picking ? ' picking' : '') + '">' + (pv?.html || '') + '</div>';
    (marks || []).forEach((a: string) => r.querySelectorAll('td[data-a="' + a + '"]').forEach(td => td.classList.add('on')));
    const hs = new Set((heads || []).map(String));
    if (hs.size) r.querySelectorAll('td[data-a]').forEach(td => { if (hs.has((td.getAttribute('data-a') || '').replace(/^[A-Z]+/, ''))) td.classList.add('hd'); });
    // μία σελίδα τη φορά (όλες ήρθαν μαζί): οι άλλες κρύβονται
    r.querySelectorAll('.pg').forEach((pg, i, all) => { (pg as HTMLElement).hidden = all.length > 1 && i !== clampPage(page, all.length) - 1; });
    fit();
  }, [pv, picking, page, (marks || []).join(), (heads || []).join(), fit]);
  useEffect(() => { const el = host.current; if (!el) return; const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect(); }, [fit]);
  return html`<div className=${cx('rep-pv', busy && 'is-busy')}>
    <div ref=${host} className="rep-pv__page"></div>
    ${!pv && html`<div className="empty">${busy ? 'Φτιάχνεται η προεπισκόπηση…' : none || 'Η προεπισκόπηση φαίνεται εδώ.'}</div>`}
    ${pv && pv.pages > shownPages(pv.pages) && html`<div className="note rep-pv__more">Φαίνονται οι πρώτες ${shownPages(pv.pages)} σελίδες από ${pv.pages}.</div>`}
  </div>`;
}
// ζητά προεπισκόπηση λίγο μετά την τελευταία αλλαγή (όχι σε κάθε πλήκτρο: το Atom φτιάχνει ένα xlsx κάθε φορά)
// sample: πόσες γραμμές δείχνει κάθε πίνακας (0: όλοι)· χωρίς αυτό (undefined) όπως πριν
function usePreview(src: RepSource | null, r: Report, ids: (number | string)[], d: string, raw: boolean, sample?: number) {
  const [pv, setPv] = useState<RepPreview | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const key = JSON.stringify([src, r.sheet, r.head, r.cols, r.cells, r.title, r.name, r.trim, r.split, r.kind, r.sigs, r.layout, r.more, r.vals, r.bands, r.at, ids.length, ids.slice(0, sample == null ? 120 : sample || PV_MAX), d, raw, sample]);
  // μία προεπισκόπηση τη φορά: όσες αλλαγές γίνουν όσο φτιάχνεται μία, ζητείται μόνο η τελευταία (στο Atom κάθε μία θέλει χρόνο)
  const inflight = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    if (!src) { setPv(null); return; }
    let live = true; setBusy(true);
    const t = setTimeout(async () => {
      try {
        while (inflight.current) { await inflight.current.catch(() => {}); if (!live) return; }
        const req = window.api.repPreview(src, r, sample == null ? ids.slice(0, 120) : ids, d, raw, sample == null ? undefined : { sample });
        inflight.current = req; req.finally(() => { if (inflight.current === req) inflight.current = null; }).catch(() => {});
        const x = await req;
        if (!live) return;
        if ('ok' in x && !x.ok) { setErr(x.error); setPv(null); } else { setErr(''); setPv(x as RepPreview); }
      } catch (e) { if (live) setErr(String(e)); } finally { if (live) setBusy(false); }
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { pv, busy, err };
}

// ------------------------------------------------------------------ οθόνη
export function ReportsScreen() {
  const { state, today, tomorrow, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast(); const runReport = useRunReport();
  const tab: string = nav.params.repTab || 'ready';
  const reports = repsOf(state); const tpls = tplsOf(state);
  const [last, setLast] = useState<Record<string, string>>({});
  const loadLast = useCallback(() => { window.api.repLast().then(setLast, () => {}); }, []);
  useEffect(loadLast, [loadLast]);
  const [dayForms, setDayForms] = useState(false);
  // η σελίδα δημιουργίας (Νέο / Αλλαγή εντύπου) είναι διαδρομή της οθόνης: param repForm (shared/repPage)
  const form = formOpen(nav.params, reports); const openForm = (p: Record<string, any>) => nav.set(p);
  const [ask, setAsk] = useState<{ r: Report; print: boolean; init?: { ids: (number | string)[]; d: string } } | null>(null);
  const [hist, setHist] = useState<Report | null>(null);
  const [sigFor, setSigFor] = useState<Report | null>(null);
  const [layFor, setLayFor] = useState<{ r: Report; sigs: Sig[] } | null>(null);
  const go = async (r: Report, print = r.out === 'print', s = state) => {
    if (needsAsk(r)) { setAsk({ r, print }); return; }
    const d = repDate(r, today);
    if (await runReport(s, r, rowsOf(s, r, d).map(x => x.id), d, print)) loadLast();
  };
  // «Αποθήκευση και Βγάλε»: βγαίνουν αυτοί που έδειχνε ο οδηγός (με τις αλλαγές με ✕), όχι νέα κλήρωση.
  // Αν ρωτά μέρα, ανοίγει το «Βγάλε…» για τη μέρα, με την ίδια κλήρωση.
  const fromWizard = async (r: Report, s: AppState, ids: (number | string)[], d: string) => {
    const print = r.out === 'print';
    if (r.day === 'ask') { setAsk({ r, print, init: r.pick.mode === 'random' ? { ids, d } : undefined }); return; }
    if (await runReport(s, r, ids, d, print)) loadLast();
  };
  // από την αναζήτηση (Ctrl+K): «Βγάλε: …»
  useEffect(() => {
    const id = nav.params.repRun; if (!id) return; nav.set({ repRun: undefined });
    const r = reports.find(x => x.id === id); if (r) go(r);
  }, [nav.params.repRun]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = (settings: { reports?: Report[]; reportTpls?: RepTpl[] }, text: string) => run({ t: 'setSettings', settings, text }, false);
  const del = async (r: Report) => { if (await save({ reports: reports.filter(x => x.id !== r.id) }, 'Διαγραφή εντύπου «' + r.name + '»')) toast({ text: 'Σβήστηκε το έντυπο «' + r.name + '».', actions: [undoMark()] }); };
  const copy = async (r: Report) => { const c = { ...r, id: uid(), name: r.name + ' (αντίγραφο)' }; if (await save({ reports: [...reports, c] }, 'Αντίγραφο εντύπου «' + r.name + '»')) openForm(editForm(c.id)); };
  const delTpl = async (t: RepTpl) => { if (await save({ reportTpls: tpls.filter(x => x.id !== t.id) }, 'Διαγραφή προτύπου «' + t.name + '»')) toast({ text: 'Σβήστηκε το πρότυπο «' + t.name + '».', actions: [undoMark()] }); };
  const usedBy = (t: RepTpl) => reports.filter(r => r.tpl === t.id);
  // «Υπογραφές…»: άλλες για αυτή τη φορά, ή (keep) για αυτό το έντυπο από εδώ και πέρα
  const sigsGo = async (r0: Report, sigs: Sig[], keep: boolean, print: boolean) => {
    let s = state; let r = reports.find(x => x.id === r0.id) || r0;   // με ό,τι άλλαξε στο μεταξύ (π.χ. θέσεις στο χαρτί)
    if (keep) {
      // άλλο πλήθος υπογραφών: οι θέσεις που είχες σύρει για τις υπογραφές δεν ταιριάζουν πια
      if (r.layout && sigs.length !== (r.sigs ?? sigsSaved(state.settings, 'reports')).length) { const { layout: _, ...rest } = r; const l = dropSigMoves({ main: r.layout })?.main; r = l ? { ...rest, layout: l } : rest; }
      const next = await save({ reports: reports.map(x => (x.id === r.id ? { ...r, sigs } : x)) }, 'Υπογραφές εντύπου «' + r.name + '»'); if (!next) return; s = next;
    }
    go({ ...r, sigs }, print, s);
  };
  // θέσεις πάνω στο χαρτί: για όλα τα φύλλα του εντύπου (το πρότυπο είναι ένα)
  const layoutSave = async (r: Report, l: Layout | undefined) => {
    const { layout: _, ...rest } = r; const next = l?.main ? { ...rest, layout: l.main } : rest;
    if (await save({ reports: reports.map(x => (x.id === r.id ? next : x)) }, 'Θέσεις στο χαρτί: «' + r.name + '»')) toast({ text: 'Αποθηκεύτηκαν οι θέσεις του «' + r.name + '».' });
  };
  const sigsReset = async (r: Report) => { const { sigs: _, ...rest } = r; if (await save({ reports: reports.map(x => (x.id === r.id ? rest : x)) }, 'Υπογραφές εντύπου «' + r.name + '»')) toast({ text: 'Το «' + r.name + '» παίρνει ξανά τις υπογραφές των Ρυθμίσεων.' }); };
  if (form) return html`<${ReportPage} key=${form.key} r=${form.r} start=${form.arg.start} preset=${form.arg.preset} tpl=${form.arg.tpl} onClose=${() => openForm(noForm())} onRun=${fromWizard}/>`;
  return html`<div>
    <${PageHeader} title="Έντυπα" sub="Δικά σου έντυπα Excel που γεμίζουν με στοιχεία της εφαρμογής. Το στήνεις μία φορά και μετά βγαίνει με ένα κλικ.">
      <div className="page-head__acts"><${Button} variant="outline" onClick=${() => openForm(newForm({ start: 'upload' }))} data-tip="Ένα Excel που ήδη έχεις (.xlsx) γίνεται πρότυπο: κρατά τη μορφή του">Ανέβασε Excel…<//>
      <${Button} onClick=${() => openForm(newForm())}>+ Νέο έντυπο<//></div><//>
    <div className="dayrow" role="group" aria-label="Έντυπα της μέρας"><span className="dayrow__lbl">Της μέρας (βγαίνουν από την οθόνη τους):</span>
      <${Button} size="sm" variant="outline" onClick=${() => nav.go('guard', { guardDate: tomorrow })}>ΦΡΟΥΡΑ αύριο<//>
      <${Button} size="sm" variant="outline" onClick=${() => nav.go('hkai', { hkaiDate: today, hkTab: undefined })}>${HK()} σήμερα<//>
      <${Button} size="sm" variant="outline" onClick=${() => nav.go('outs', { outDate: today })}>Εξοδούχοι<//>
      <${Button} size="sm" variant="outline" onClick=${() => setDayForms(true)} data-tip="Αυριανή ΦΡΟΥΡΑ, σημερινή ${HK()} και Εξοδούχοι: ένας έλεγχος για όλα">${Icon.print}Έντυπα ημέρας<//></div>
    ${dayForms && html`<${DayFormsDialog} onClose=${() => setDayForms(false)}/>`}
    <${Tabs} value=${tab} onChange=${(v: string) => nav.set({ repTab: v === 'ready' ? undefined : v })} items=${[{ value: 'ready', label: 'Τα έντυπά μου (' + reports.length + ')' }, { value: 'tpls', label: 'Πρότυπα (' + tpls.length + ')' }]}/>
    ${tab === 'ready' && (reports.length ? html`<div className="ui-card"><table className="rep-table"><thead><tr><th>Έντυπο</th><th>Ποιοι μπαίνουν</th><th>Τελευταία φορά</th><th></th></tr></thead><tbody>
      ${reports.map(r => html`<tr key=${r.id}>
        <td><b>${r.name}</b><small>${tpls.find(t => t.id === r.tpl)?.name || 'χωρίς πρότυπο'} · ${outText(r)}${r.day === 'tomorrow' ? ' · για αύριο' : r.day === 'ask' ? ' · ρωτά μέρα' : ''}</small></td>
        <td>${noPeople(r) ? 'Χωρίς άτομα' : pickText(r, state)}${r.vals?.length && hasVals(r) ? html`<small>${noPeople(r) ? 'Μόνο ' : 'Και '}${r.vals.length === 1 ? '1 πίνακας τιμών' : r.vals.length + ' πίνακες τιμών'}</small>` : ''}${r.more?.length ? html`<small>${'Και ' + (r.more.length === 1 ? '1 πίνακας ακόμα: ' : r.more.length + ' πίνακες ακόμα: ') + r.more.map(t => t.title || kindLbl(t.kind).toLowerCase()).join(', ')}</small>` : ''}</td><td className="nw muted">${lastTxt(last[r.id], today)}</td>
        <td className="rep-table__acts"><${Button} size="sm" onClick=${() => go(r)} data-tip=${needsAsk(r) ? 'Δείχνει πρώτα ποιοι μπαίνουν' : 'Βγαίνει τώρα, για ' + (r.day === 'tomorrow' ? 'αύριο' : 'σήμερα')}>${needsAsk(r) ? 'Βγάλε…' : 'Βγάλε'}<//>
          <${Button} size="sm" variant="ghost" onClick=${() => go(r, true)} data-tip="Βγαίνει και ανοίγει η προεπισκόπηση εκτύπωσης">${Icon.print}Τύπωσε<//>
          <${Button} size="sm" variant="ghost" onClick=${() => setSigFor(r)} data-tip=${'Υπογραφές' + (r.sigs ? ' (δικές του)' : '') + ': ' + sigsText(r.sigs ?? sigsSaved(state.settings, 'reports')) + '. Αλλάζεις, προσθέτεις ή αλλάζεις σειρά πριν βγει, ή σέρνεις κεφαλίδα, τίτλο και υπογραφές αλλού («Θέσεις στο χαρτί…»).'}>Υπογραφές…<//>
          <${Button} size="sm" variant="ghost" onClick=${() => setHist(r)} data-tip="Πότε βγήκε και ποιοι μπήκαν· ξαναβγαίνει ίδιο αν χαθεί το χαρτί">Ιστορικό<//>
          <${Button} size="sm" variant="ghost" onClick=${() => openForm(editForm(r.id))}>Αλλαγή<//>
          <${Button} size="sm" variant="ghost" onClick=${() => copy(r)} data-tip="Ίδιο έντυπο με άλλο όνομα, για να αλλάξεις κάτι">Αντίγραφο<//>
          <${Button} size="sm" variant="ghost" aria-label=${'Διαγραφή ' + r.name} data-tip="Διαγραφή (με αναίρεση)" onClick=${() => del(r)}>${Icon.x}<//></td>
      </tr>`)}</tbody></table></div>` : html`<div className="ui-card"><div className="rep-empty">
        <h2>Ξεκίνα από ένα υπόδειγμα</h2><p className="muted">Φτιάχνεται εδώ, με την κεφαλίδα και τις υπογραφές από τις Ρυθμίσεις. Αλλάζεις ό,τι θέλεις πριν το αποθηκεύσεις.</p>
        <div className="rep-presets">${PRESETS.map(p => html`<button key=${p.id} type="button" className="rep-preset" onClick=${() => openForm(newForm({ start: 'build', preset: p.id }))}><b>${p.name}</b><small>${p.help}</small></button>`)}
          <button type="button" className="rep-preset rep-preset--up" onClick=${() => openForm(newForm({ start: 'upload' }))}><b>Δικό σου Excel</b><small>Ανέβασε ένα έντυπο που ήδη έχεις. Η εφαρμογή βρίσκει μόνη της τις στήλες.</small></button></div>
      </div></div>`)}
    ${tab === 'tpls' && (tpls.length ? html`<div className="ui-card"><table className="rep-table"><thead><tr><th>Πρότυπο</th><th>Από πού</th><th>Έντυπα</th><th></th></tr></thead><tbody>
      ${tpls.map(t => { const u = usedBy(t); return html`<tr key=${t.id}><td><b>${t.name}</b></td><td>${t.built ? 'Φτιαγμένο εδώ' : 'Ανεβασμένο Excel'}</td><td>${u.length ? u.map(r => r.name).join(', ') : html`<span className="muted">κανένα</span>`}</td>
        <td className="rep-table__acts"><${Button} size="sm" variant="outline" onClick=${() => openForm(newForm({ start: 'tpl', tpl: t.id }))}>Νέο έντυπο από αυτό<//>
          <${Button} size="sm" variant="ghost" onClick=${() => window.api.repOpenTpl(t.file)} data-tip="Άλλαξε μορφή, λογότυπο, στήλες στο Excel. Οι αλλαγές ισχύουν από το επόμενο έντυπο.">Άνοιξέ το στο Excel<//>
          <${Button} size="sm" variant="ghost" disabled=${u.length > 0} aria-label=${'Διαγραφή ' + t.name} data-tip=${u.length ? 'Το χρησιμοποιούν έντυπα: σβήσε πρώτα εκείνα' : 'Διαγραφή (με αναίρεση)'} onClick=${() => delTpl(t)}>${Icon.x}<//></td></tr>`; })}
    </tbody></table></div>` : html`<div className="ui-card empty">Δεν υπάρχουν πρότυπα ακόμα. Φτιάχνονται μόνα τους όταν ανεβάζεις Excel ή φτιάχνεις έντυπο εδώ.</div>`)}
    ${sigFor && html`<${SigsDialog} title=${sigFor.name} initial=${sigsNone(sigFor, tpls).sigs ?? sigsSaved(state.settings, 'reports')} keepText="Να μείνουν για αυτό το έντυπο" onceText="Αλλιώς ισχύουν μόνο αυτή τη φορά." onClose=${() => setSigFor(null)}
      onGo=${(sigs: Sig[], keep: boolean, print: boolean) => sigsGo(sigFor, sigs, keep, print)} onLayout=${(sigs: Sig[]) => setLayFor({ r: sigFor, sigs })} reset=${sigFor.sigs ? { text: 'Όπως οι Ρυθμίσεις', onClick: () => sigsReset(sigFor) } : undefined}/>`}
    ${layFor && html`<${LayoutDialog} title=${layFor.r.name} sigs=${layFor.sigs} initial=${layFor.r.layout ? { main: layFor.r.layout } : undefined} onClose=${() => setLayFor(null)} onSave=${(l: Layout | undefined) => layoutSave(layFor.r, l)}
      req=${(l: Layout) => { const d = repDate(layFor.r, today); return { report: { ...layFor.r, sigs: layFor.sigs, layout: l.main }, file: tpls.find(t => t.id === layFor.r.tpl)?.file || '', ids: rowsOf(state, layFor.r, d).map(x => x.id), date: d }; }}/>`}
    ${hist && html`<${HistDialog} r=${hist} onClose=${() => { setHist(null); loadLast(); }}/>`}
    ${ask && html`<${RunDialog} r=${ask.r} print=${ask.print} init=${ask.init} onClose=${() => setAsk(null)} onDone=${() => { setAsk(null); loadLast(); }}/>`}
  </div>`;
}

// Πριν βγει: ποια μέρα (αν ρωτά) και ποιοι τυχαίοι (με ✕ και «Ξανά τυχαία»)
function RunDialog({ r, print, init, onClose, onDone }: P) {
  const { state, today, tomorrow, run } = useStore(); const runReport = useRunReport(); const toast = useToast();
  const [d, setD] = useState(init?.d || repDate(r, today));
  const [n, setN] = useState(r.pick.n || 10);
  const [never, setNever] = useState<number[]>(r.pick.never || []);
  const rr = useMemo(() => ({ ...r, pick: { ...r.pick, n, never } }), [r, n, never]);
  // «Ποτέ»: φεύγει τώρα και μένει στο έντυπο για τις επόμενες φορές
  const onNever = async (id: number) => {
    const nv = [...never, id]; setNever(nv);
    const reps = repsOf(state); const cur = reps.find(x => x.id === r.id); if (!cur) return;
    const who = state.people.find(x => x.id === id);
    if (await run({ t: 'setSettings', settings: { reports: reps.map(x => (x.id === r.id ? { ...x, pick: { ...x.pick, never: nv, always: (x.pick.always || []).filter(y => y !== id) } } : x)) }, text: 'Ποτέ στο έντυπο «' + r.name + '»' }, false))
      toast({ text: (who ? who.last + ' ' + who.first : 'Αυτός') + ': δεν θα μπαίνει ποτέ στο «' + r.name + '». Το αλλάζεις από «Αλλαγή» › Ποιοι μπαίνουν.' });
  };
  const p = usePick(rr, d, init?.ids);
  const out = async (pr: boolean) => { if (await runReport(state, rr, p.rows.map(x => x.id), d, pr)) onDone(); };
  return html`<${Dialog} size="lg" title=${r.name} description=${pickText(rr, state)} onClose=${onClose} footer=${html`
    <${Button} variant="outline" onClick=${onClose}>Άκυρο<//>
    <${Button} variant=${print ? 'default' : 'outline'} disabled=${!p.rows.length && !hasVals(r)} why="Δεν μπαίνει κανείς με αυτές τις επιλογές" onClick=${() => out(true)}>${Icon.print}Τύπωσε<//>
    ${!print && html`<${Button} disabled=${!p.rows.length && !hasVals(r)} why="Δεν μπαίνει κανείς με αυτές τις επιλογές" onClick=${() => out(false)}>Βγάλε το Excel<//>`}`}>
    <div className="field-row">
      <div className="field"><span className="field__label">Για ποια μέρα</span><div className="rep-inline">
        <${Segmented} small=${true} value=${d === today ? 't' : d === tomorrow ? 'm' : 'x'} onChange=${(v: string) => setD(v === 't' ? today : v === 'm' ? tomorrow : d)} items=${[{ value: 't', label: 'Σήμερα' }, { value: 'm', label: 'Αύριο' }, { value: 'x', label: 'Άλλη' }]}/>
        <${DateField} className="ui-input rep-date" aria-label="Ημερομηνία" value=${d} onChange=${(e: any) => e.target.value && setD(e.target.value)}/></div></div>
      ${r.pick.mode !== 'all' && html`<div className="field" style=${{ flex: 'none', width: '120px' }}><label className="field__label" htmlFor="run-n">Πόσοι</label><input id="run-n" type="number" min="1" className="ui-input" value=${n} onChange=${(e: any) => setN(Math.max(1, +e.target.value || 1))}/></div>`}
    </div>
    ${!noPeople(r) && html`<${PickList} p=${p} kind=${r.kind} onNever=${onNever}/>`}
    <p className="note">${p.random || p.manual ? 'Βγαίνουν ακριβώς αυτοί που βλέπεις. ' : ''}${outPlan(state, { ...rr, out: print ? 'print' : rr.out }, p.rows, d).text}</p>
  <//>`;
}

// Ιστορικό εκδόσεων: οι 30 τελευταίες φορές, με «Ξαναβγάλε» (ίδιοι, ίδια μέρα, με τα τωρινά στοιχεία τους)
function HistDialog({ r, onClose }: P) {
  const { state, today } = useStore(); const runReport = useRunReport(); const printFile = usePrintFile();
  const [list, setList] = useState<RepHistEntry[] | null>(null);
  useEffect(() => { window.api.repHist(r.id).then(setList, () => setList([])); }, [r.id]);
  const again = async (h: RepHistEntry) => { if (await runReport(state, r, h.ids, h.date, false, false, true)) onClose(); };
  return html`<${Dialog} size="lg" title=${'Ιστορικό: ' + r.name} description="Οι τελευταίες φορές που βγήκε (έως 30). «Ξαναβγάλε» φτιάχνει ξανά το έντυπο με τους ίδιους και για την ίδια μέρα, με τα τωρινά τους στοιχεία." onClose=${onClose}
    footer=${html`<${Button} data-autofocus="" onClick=${onClose}>Κλείσιμο<//>`}>
    ${!list ? html`<div className="empty">Φορτώνει…</div>` : !list.length ? html`<div className="empty">Δεν έχει βγει ακόμα.</div>`
      : html`<table className="rep-table"><thead><tr><th>Πότε</th><th>Για</th><th>Πόσοι</th><th>Αρχείο</th><th></th></tr></thead><tbody>${list.map((h, i) => html`<tr key=${i}>
        <td className="nw">${lastTxt(h.at, today)}</td><td className="nw">${dayName(h.date, today)} ${dm(h.date)}</td><td>${h.n} ${rowNoun(r.kind)}</td>
        <td>${fileName(h.file)}${h.sheets?.length ? html`<small>${h.sheets.length > 1 ? h.sheets.length + ' φύλλα' : 'φύλλο ' + h.sheets[0]}</small>` : ''}${!h.exists ? html`<small className="muted">δεν υπάρχει πια</small>` : ''}</td>
        <td className="rep-table__acts">${h.exists && html`<${Button} size="sm" variant="ghost" onClick=${() => window.api.openPath(h.file)}>Άνοιξε<//><${Button} size="sm" variant="ghost" onClick=${() => printFile(h.file, h.sheets)}>${Icon.print}Τύπωσε<//>`}
          <${Button} size="sm" variant="outline" onClick=${() => again(h)} data-tip="Ίδιοι, ίδια μέρα, με τα τωρινά στοιχεία">Ξαναβγάλε<//></td></tr>`)}</tbody></table>`}
  <//>`;
}

// ------------------------------------------------------------------ οδηγός
type Mode = 'upload' | 'build';
const blankReport = (): Report => ({ id: uid(), name: '', tpl: '', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file' });
const colsFrom = (insp: TplInspect): RepCol[] => insp.headers.filter(h => h.f).map(h => ({ c: h.c, f: h.f!, h: h.text }));
// «Φτιάξ' το εδώ»: οι πίνακες 2, 3… του εντύπου (ποιοι, σειρά) όπως οι πίνακες του προτύπου (είδος, τίτλος)
const syncMore = (more: RepTable[] | undefined, bm: BuildTable[] | undefined): RepTable[] | undefined => {
  const out = (bm || []).map(t => { const x = more?.find(m => m.id === t.id); return x ? { ...x, title: t.title, kind: t.kind } : { ...newTable(t.kind, t.id), title: t.title }; });
  return out.length ? out : undefined;
};

// Η σελίδα δημιουργίας (Νέο / Αλλαγή εντύπου): όλη η οθόνη, αριστερά τα 5 βήματα ως καρτέλες, δεξιά η προεπισκόπηση πάντα ορατή
function ReportPage({ r: initial, start, preset, tpl: tplId, onClose, onRun }: P) {
  const { state, today, run } = useStore(); const toast = useToast();
  const tpls = tplsOf(state); const editing = !!initial && repsOf(state).some(x => x.id === initial.id);
  const [step, setStep] = useState(initial ? 3 : 1);
  const [r, setR] = useState<Report>(() => initial ? { ...initial } : blankReport());
  const upd = (x: Partial<Report>) => setR(o => ({ ...o, ...x }));
  const [mode, setMode] = useState<Mode | null>(null);
  const [tpl, setTpl] = useState<RepTpl | null>(null);
  const [build, setBuild] = useState<BuildOpts | null>(null);
  const [insp, setInsp] = useState<TplInspect | null>(null);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState<string | null>(null);   // '#head' ή κλειδί στοιχείου (CELLS) που περιμένει κλικ σε κελί
  const [view, setView] = useState<'filled' | 'tpl'>('filled');
  const [signers, setSigners] = useState(state.settings.signers || { sergeant: '', commander: '' });
  const [busy, setBusy] = useState(false);
  // «Θέσεις στο χαρτί…» μέσα στον οδηγό· layN: για πόσες υπογραφές είναι οι θέσεις που έσυρες (άλλο πλήθος: δεν ταιριάζουν πια)
  const [lay, setLay] = useState(false);
  const sigN = (x?: Report) => (x?.sigs ? sigsClean(x.sigs) : sigsSaved(state.settings, 'reports')).length;
  const layN = useRef(initial ? sigN(initial) : 0);
  const [ti, setTi] = useState(0);   // ποιος πίνακας φαίνεται στα βήματα 3 και 4 (0: ο πρώτος, 1…: r.more)
  const [vi, setVi] = useState(-1);   // βήμα 3: ποιος πίνακας τιμών ανοιχτός (-1: κανένας, φαίνονται οι πίνακες ατόμων)
  const [folds, setFolds] = useState<Record<string, boolean>>({});   // βήμα 3: ποιες κάρτες που ανοιγοκλείνουν είναι ανοιχτές (μόνο όσο είναι ανοιχτή η σελίδα)
  const fold = { open: folds, toggle: (k: string) => setFolds(o => ({ ...o, [k]: !o[k] })) };
  const vals: ValueTable[] = r.vals || []; const vsel = Math.min(vi, vals.length - 1);
  const setVals = (v: ValueTable[]) => upd({ vals: v.length ? v : undefined });
  const addVal = () => { setVals([...vals, newValueTable(uid())]); setVi(vals.length); };
  // Σβήσε τον πίνακα τιμών: με «Αναίρεση» που τον βάζει πίσω στη θέση του (οι θέσεις του στη διάταξη δεν σβήνονται, μένουν όπως ήταν)
  const delVal = (i: number) => {
    const v = vals[i]; setVals(vals.filter((_, j) => j !== i)); setVi(-1);
    if (v) toast({ text: 'Σβήστηκε ο πίνακας τιμών', actions: [{ label: 'Αναίρεση', fn: () => { setR(o => { const a = [...(o.vals || [])]; if (!a.some(y => y.id === v.id)) a.splice(Math.min(i, a.length), 0, v); return { ...o, vals: a }; }); setVi(i); } }] });
  };
  const valEd = vsel >= 0 && vals[vsel] ? html`<${ValueTableEditor} key=${vals[vsel].id} t=${vals[vsel]} n=${vsel + 1} set=${(x: ValueTable) => setVals(vals.map((y, j) => (j === vsel ? x : y)))} del=${() => delVal(vsel)} at=${r.at} setAt=${(at?: string) => upd({ at })} all=${vals} upload=${mode === 'upload'}
    lay=${mode === 'build' ? html`<${Fold} id="lay" fold=${fold} title="Μέγεθος και θέση στο χαρτί" sum=${layText(vals[vsel].lay)}><${LayEditor} n=${'v' + (vsel + 1)} noEven lay=${vals[vsel].lay} set=${(lay?: TabLay) => setVals(vals.map((y, j) => (j === vsel ? { ...y, lay } : y)))}/><//>` : null}/>` : null;
  // Διάταξη πινάκων (Φάση 3): ο 1ος, οι 2, 3… και οι πίνακες τιμών σε ζώνες· οι ανεβασμένοι δεν αλλάζουν (έχουν τις θέσεις του προτύπου τους)
  const bandItems = useMemo(() => [{ id: MAIN, name: '1 · ' + (build?.t1?.trim() ? build.t1.trim().slice(0, 24) : kindLbl(r.kind)) }, ...(build?.more || []).map((t, i) => ({ id: t.id, name: i + 2 + ' · ' + (t.title?.trim().slice(0, 24) || kindLbl(t.kind)) })), ...valsUsed(r.vals).map(v => ({ id: v.id, name: 'Τιμές · ' + (v.title?.trim().slice(0, 24) || v.rows[0]?.label?.slice(0, 24) || 'πίνακας') }))], [build, r.kind, r.vals]);
  const bandIds = bandItems.map(x => x.id); const bands = bandsOf(bandIds, r.bands);
  const nop = hasVals(r) && (mode === 'build' ? !!build?.nopeople && !(build.more || []).length : false);   // έντυπο μόνο με πίνακες τιμών (φτιαγμένο εδώ)
  const [subInsp, setSubInsp] = useState<Record<string, TplInspect>>({});   // ανεβασμένο: οι επικεφαλίδες των πινάκων 2, 3…
  // κάτι άλλαξε από τότε που άνοιξε η σελίδα (σε υπάρχον έντυπο: αφού διαβαστεί το πρότυπό του): πίσω, Esc και αλλαγή οθόνης ρωτούν πριν πεταχτεί
  // Η αφετηρία παίρνεται όταν τελειώσει η αρχικοποίηση από τη διαδρομή (υπάρχον έντυπο, προεπιλογή, πρότυπο, Excel): ό,τι μπαίνει από εκεί δεν το άλλαξε ο χρήστης. Βήμα, δείγμα και σελίδα δεν είναι περιεχόμενο (repPage.formSnap).
  const [ready, setReady] = useState(!initial && !start); const [base, setBase] = useState<string | null>(null);
  const snap = formSnap(r, build, mode, signers);   // το πρότυπο (tpl) μπαίνει με καθυστέρηση στο άνοιγμα υπάρχοντος εντύπου: αλλάζοντάς το αλλάζουν και τα mode/build/r
  useEffect(() => { if (ready && base == null) setBase(snap); }, [ready, base, snap]);
  const dirty = isFormDirty(base, snap, busy);
  // δείγμα και σελίδα της προεπισκόπησης (το δείγμα το θυμάται η συνεδρία ανά έντυπο, δεν μπαίνει στο έντυπο)
  const [sample, setSampleS] = useState(() => getSample(r.id)); const [page, setPage] = useState(1);
  const pickSample = (n: number) => { setSampleS(n); setSample(r.id, n); setPage(1); };
  const d = repDate(r, today);
  const inspect = async (t: RepTpl, kind: RepKind, sheet?: string, head?: number, keepCols = false) => {
    const x = await window.api.repInspect(t.file, kind, sheet, head);
    if ('ok' in x && !x.ok) { toast({ text: html`<span><b>Δεν διαβάστηκε το πρότυπο.</b> ${x.error}</span>` }); return null; }
    const i = x as TplInspect; setInsp(i);
    // άλλο φύλλο: οι πίνακες 2, 3… ήταν στο προηγούμενο
    setR(o => { const { more, ...rest } = o; return { ...rest, sheet: i.sheet, head: i.head, cols: keepCols ? o.cols : colsFrom(i), ...(more && i.sheet === o.sheet ? { more } : {}) }; });
    if (i.sheet !== r.sheet) { setSubInsp({}); setTi(0); }
    return i;
  };
  // ανεβασμένο: ένας πίνακας 2, 3… (id) με επικεφαλίδες στη γραμμή head· keepCols: κρατά την αντιστοίχιση που είχε
  const inspectSub = async (t: RepTpl, id: string, kind: RepKind, head: number, keepCols: boolean) => {
    const x = await window.api.repInspect(t.file, kind, r.sheet || undefined, head);
    if ('ok' in x && !x.ok) { toast({ text: html`<span><b>Δεν διαβάστηκε ο πίνακας.</b> ${x.error}</span>` }); return; }
    const i = x as TplInspect; setSubInsp(o => ({ ...o, [id]: i }));
    setR(o => { const more = o.more || []; const cur = more.find(m => m.id === id) || newTable(kind, id);
      const next = { ...cur, kind, head: i.head, cols: keepCols ? cur.cols : colsFrom(i) };
      return { ...o, more: (more.some(m => m.id === id) ? more.map(m => (m.id === id ? next : m)) : [...more, next]).sort((a, b) => a.head - b.head) }; });
  };
  const useTpl = async (t: RepTpl, kind: RepKind, keepCols: boolean) => {
    setTpl(t); setNote('');
    const f = (await window.api.repFiles([t.file]))[t.file];
    if (!f || !f.exists) { setNote('Το αρχείο του προτύπου λείπει από τον φάκελο «Πρότυπα εντύπων». Ανέβασέ το ξανά ή διάλεξε άλλο.'); setMode(null); return; }
    if (t.built && !editedInExcel(t, f.mtime)) { const b: BuildOpts = JSON.parse(JSON.stringify(t.built)); setMode('build'); setBuild(b); setInsp(null); setR(o => ({ ...o, more: syncMore(o.more, b.more), ...(b.nrows != null && o.kind !== 'blank' ? { kind: 'blank' as const, pick: { from: 'all' as const, mode: 'all' as const, n: blankN(b.nrows) }, sort: 'pick' as const, split: 'none' as const } : {}) })); return; }   // πρότυπο «Κενό»: το είδος το ακολουθεί
    if (t.built) setNote('Το πρότυπο άλλαξε στο Excel, οπότε οι στήλες διαβάζονται από το αρχείο.');
    const k0: RepKind = !keepCols && kind === 'blank' ? 'people' : kind;
    setMode('upload'); setBuild(null); if (!keepCols) { upd({ more: undefined, ...(k0 !== kind ? { kind: k0, ...pickForKind(kind, r.pick, r.sort, k0) } : {}) }); setSubInsp({}); }
    await inspect(t, k0, keepCols ? r.sheet : undefined, keepCols ? r.head : undefined, keepCols);
    if (keepCols) for (const m of r.more || []) await inspectSub(t, m.id, m.kind, m.head, true);
  };
  // το «Κενό» είναι μόνο για «Φτιάξ' το εδώ»: με ανεβασμένο Excel το είδος γυρίζει στους στρατιώτες
  const noBlank = () => (r.kind === 'blank' ? 'people' : r.kind);
  const upload = async () => {
    const x = await window.api.repUpload(noBlank()); if (!x) return;
    if (!x.ok) { toast({ text: html`<span><b>Δεν ανέβηκε.</b> ${x.error}</span>` }); return; }
    setTpl(x.tpl); setMode('upload'); setBuild(null); setInsp(x.insp); setNote('');
    upd({ sheet: x.insp.sheet, head: x.insp.head, cols: colsFrom(x.insp), cells: [], name: r.name || x.tpl.name, more: undefined, ...(r.kind === 'blank' ? { kind: 'people', ...pickForKind('blank', r.pick, r.sort, 'people') } : {}) }); setSubInsp({}); setTi(0);
    setStep(2);
  };
  // έτοιμο έντυπο: στήλες και είδος είναι έτοιμα, οπότε ανοίγει κατευθείαν στο «Ποιοι μπαίνουν» (τα βήματα 2-3 μένουν από πάνω)
  const [quick, setQuick] = useState(false);
  const startBuild = (o: BuildOpts, name: string, jump = false) => { const b: BuildOpts = JSON.parse(JSON.stringify(o)); setMode('build'); setTpl(null); setInsp(null); setBuild(b); setNote(''); upd({ name: r.name || name, title: undefined, cells: [], more: syncMore(undefined, b.more), ...(r.kind === 'blank' ? { kind: 'people', ...pickForKind('blank', r.pick, r.sort, 'people') } : {}) }); setTi(0); setQuick(jump); setStep(jump ? 4 : 2); };
  useEffect(() => {
    if (initial) { const t = tpls.find(x => x.id === initial.tpl); if (t) useTpl(t, initial.kind, true).finally(() => setReady(true)); else { setStep(1); setReady(true); } }
    else if (start === 'upload') upload().finally(() => setReady(true));
    else if (start === 'build') { const p = PRESETS.find(x => x.id === preset); startBuild(p ? p.opts : blankBuild(), p ? p.name : '', !!p); setReady(true); }
    else if (start === 'tpl') { const t = tpls.find(x => x.id === tplId); if (t) { upd({ name: t.name }); useTpl(t, 'people', false).then(() => setStep(2)).finally(() => setReady(true)); } else setReady(true); }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // άλλαξε «Τι αφορά»: οι στήλες ξαναμαντεύονται (ανεβασμένο) ή φεύγουν όσες δεν υπάρχουν στο νέο είδος (φτιαγμένο)
  const setKind = async (kind: RepKind) => {
    if (kind === r.kind) return;
    upd({ kind, ...pickForKind(r.kind, r.pick, r.sort, kind), split: splitOk(kind) ? r.split : 'none' });
    if (mode === 'upload' && tpl) await inspect(tpl, kind, r.sheet, r.head);
    if (mode === 'build' && build) {
      const { grid: _g, nrows: _n, ...o } = build; let cols = colsForKind(build.cols, kind);
      if (r.kind === 'blank' && !cols.some(c => c.f !== 'aa')) cols = [...cols, ...['rank', 'name'].filter(f => fieldOf(kind, f)).map(f => ({ f, h: fieldOf(kind, f)!.head, w: 'auto' as const }))];   // από το «Κενό» πίσω: χωρίς στήλες δεν γίνεται πίνακας
      setBuild({ ...o, cols, ...(kind === 'blank' ? { nrows: BLANK_ROWS } : {}) });
    }
  };
  const p = usePick(r, d);
  const ids = useMemo(() => p.rows.map(x => x.id), [p.rows]);
  const raw = step === 3 && mode === 'upload' && (view === 'tpl' || !!picking);
  const src: RepSource | null = mode === 'build' && build ? { build } : mode === 'upload' && tpl ? { file: tpl.file } : null;
  // χωρισμένο ανά θάλαμο/ουλαμό/Σ.Ι.: η προεπισκόπηση δείχνει την ομάδα που διαλέγεις
  const groups = useMemo(() => (splitOk(r.kind) && r.split && r.split !== 'none' ? groupsOf(state, r.kind, p.rows, r.split) : []), [state, r.kind, r.split, p.rows]);
  const [pvG, setPvG] = useState('');
  const g = groups.find(x => x.key === pvG) || groups[0];
  const pvIds = useMemo(() => (g ? g.rows.map(x => x.id) : ids), [g, ids]);
  const prev = usePreview(src, r, pvIds, d, raw, raw ? undefined : sample);
  const pages = prev.pv ? shownPages(prev.pv.pages) : 1; const pg = clampPage(page, pages);
  const onPick = async (ref: string) => {
    if (!picking || !tpl) return;
    const row = +ref.replace(/^[A-Z]+/, '');
    if (picking === '#head') { setPicking(null); await inspect(tpl, r.kind, r.sheet, row); return; }
    // πίνακας 2, 3…: νέος (#head:+) ή άλλη γραμμή επικεφαλίδων για έναν που υπάρχει· πάντα κάτω από τον πρώτο
    if (picking.startsWith('#head:')) {
      setPicking(null);
      if (row <= r.head) { toast({ text: 'Οι πίνακες 2, 3… είναι κάτω από τον πρώτο (επικεφαλίδες στη γραμμή ' + r.head + '). Κάνε κλικ σε γραμμή πιο κάτω.' }); return; }
      const id = picking.slice(6); const cur = (r.more || []).find(m => m.id === id);
      const nid = cur ? cur.id : uid(); await inspectSub(tpl, nid, cur ? cur.kind : r.kind, row, false);
      if (!cur) setTi((r.more || []).filter(m => m.head < row).length + 1);
      return;
    }
    upd({ cells: [...r.cells.filter(c => c.ref !== ref && c.k !== picking), { ref, k: picking }] }); setPicking(null);
  };
  // τι λείπει για να προχωρήσει κάθε βήμα
  const missing = (i: number): string => {
    if (i >= 1 && !mode) return 'Διάλεξε πρότυπο.';
    if (i >= 3 && mode === 'build' && !build?.cols.length && !nop) return 'Βάλε τουλάχιστον μία στήλη.';
    if (i >= 3 && mode === 'upload' && !r.cols.length && !hasVals(r)) return 'Δείξε ποια στήλη παίρνει τι (τουλάχιστον μία).';
    if (i >= 3) { const n = (mode === 'build' ? (build?.more || []).map(t => t.cols.length) : (r.more || []).map(t => t.cols.length)).findIndex(x => !x); if (n >= 0) return 'Ο πίνακας ' + (n + 2) + ' δεν έχει στήλες.'; }
    return '';
  };
  // χωρίς όνομα (π.χ. από το «Κενό»): παίρνει τον τίτλο ή το όνομα του προτύπου, ώστε η αποθήκευση να μη μένει κλειστή ως το βήμα 5 (Michael, 29/10: «δεν μου αποθήκευσε»)
  const nameOf = () => r.name.trim() || autoName(mode === 'build' ? build?.title : tpl?.name);
  const save = async (andRun: boolean) => {
    const why = missing(6); if (why) { toast({ text: why }); return false; }
    setBusy(true);
    try {
      let rr: Report = { ...r, name: nameOf() }; let list = [...tpls];
      // δικές του υπογραφές (καθαρές)· άλλο πλήθος από πριν: οι θέσεις που είχες σύρει για τις υπογραφές δεν ταιριάζουν πια
      if (rr.sigs) rr.sigs = sigsClean(rr.sigs); else delete rr.sigs;
      if (rr.layout && sigN(rr) !== layN.current) { const l = dropSigMoves({ main: rr.layout })?.main; if (l) rr.layout = l; else delete rr.layout; }
      if (mode === 'build' && build) {
        const shared = tpl && repsOf(state).some(x => x.id !== r.id && x.tpl === tpl.id);
        const file = tpl && !shared ? tpl.file : undefined;
        const bo = forBuild(build, rr); const b = await window.api.repBuild(bo, r.kind, file);
        if (!b.ok) { toast({ text: html`<span><b>Δεν αποθηκεύτηκε.</b> ${b.error}</span>` }); return false; }
        const t: RepTpl = { id: file && tpl ? tpl.id : uid(), name: rr.name, file: b.file, built: build, mtime: b.mtime };
        list = [...list.filter(x => x.id !== t.id), t];
        rr = { ...withBuilt(rr, b, bo), tpl: t.id };
      } else if (tpl) { if (!list.some(x => x.id === tpl.id)) list.push(tpl); rr = { ...rr, tpl: tpl.id }; }
      const reps = repsOf(state); const exists = reps.some(x => x.id === rr.id);
      const sg = state.settings.signers || { sergeant: '', commander: '' };
      const sChanged = sg.sergeant !== signers.sergeant || sg.commander !== signers.commander;
      const next = await run({ t: 'setSettings', settings: { reportTpls: list, reports: exists ? reps.map(x => (x.id === rr.id ? rr : x)) : [...reps, rr], ...(sChanged ? { signers: { sergeant: signers.sergeant.trim(), commander: signers.commander.trim() } } : {}) }, text: (exists ? 'Αλλαγή' : 'Νέο') + ' έντυπο «' + rr.name + '»' }, (exists ? 'Αποθηκεύτηκε' : 'Έτοιμο') + ' το έντυπο «' + rr.name + '».');
      if (!next) return false;
      onClose(); if (andRun) onRun(rr, next, ids, d);
      return true;
    } finally { setBusy(false); }
  };
  const canGo = (i: number) => !missing(i);
  // μη αποθηκευμένες αλλαγές: η μπάρα κάτω και η ερώτηση σε αλλαγή οθόνης (pending.ts)· «Πέτα» κλείνει τη σελίδα
  const [leaving, setLeaving] = useState(false);
  usePending(dirty, { label: 'Έντυπο «' + nameOf() + '»', save: () => save(false), discard: onClose, bar: false });
  const back = () => { if (dirty) setLeaving(true); else onClose(); };
  useEscape(() => { if (picking) setPicking(null); else back(); });
  const goStep = (i: number) => { setPicking(null); setStep(i); };
  const tname = (i: number) => (i === 0 ? (mode === 'build' && build?.t1?.trim() ? build.t1.trim().slice(0, 18) : kindLbl(r.kind)) : (r.more?.[i - 1]?.title || '').slice(0, 18) || kindLbl(r.more?.[i - 1]?.kind || r.kind));
  const lbls = (prev.pv?.counts || []).map((c, i) => ({ i, t: sampleLabel(c) })).filter(x => x.t);
  const why6 = missing(6);
  return html`<div className="rep-page" data-dirty=${dirty ? 'true' : undefined}>
    <div className="rep-page__bar">
      <${Button} variant="ghost" onClick=${back} data-tip="Πίσω στη λίστα των εντύπων (Esc)">← Έντυπα<//>
      <label className="rep-page__nm"><span className="field__label">Όνομα</span><input className="ui-input" aria-label="Όνομα εντύπου" placeholder=${autoName(mode === 'build' ? build?.title : tpl?.name)} value=${r.name} onChange=${(e: any) => upd({ name: e.target.value })}/></label>
      <span className="rep-wiz__why rep-page__why" data-tip=${why6 || undefined}>${why6}</span>
      <${Button} variant="ghost" onClick=${back} data-tip="Κλείνει χωρίς αποθήκευση (ρωτά αν άλλαξες κάτι)">Άκυρο<//>
      <${Button} variant="outline" disabled=${busy || !!why6} why=${why6} data-tip=${'Αποθήκευση χωρίς να βγει. Πού βγαίνει: ' + outText(r)} onClick=${() => save(false)}>Αποθήκευση<//>
      <${Button} disabled=${busy || !!why6} why=${why6} onClick=${() => save(true)}>${busy ? 'Γίνεται…' : 'Αποθήκευση και Βγάλε'}<//>
    </div>
    <ol className="rep-steps">${STEPS.map((s, i) => html`<li key=${s}><button type="button" aria-current=${step === i + 1 ? 'step' : undefined} className=${cx(step > i + 1 && 'is-done')} disabled=${!canGo(i + 1) && step < i + 1} data-tip=${!canGo(i + 1) && step < i + 1 ? missing(i + 1) : undefined} onClick=${() => goStep(i + 1)}><span>${i + 1}</span>${s}</button></li>`)}</ol>
    ${note && html`<${Alert} tone="warn">${note}<//>`}
    <div className="rep-page__cols">
      <div className="rep-page__main">
      <div className="rep-wiz__main">
        ${step === 1 && html`<${StepTpl} mode=${mode} tpl=${tpl} build=${build} tpls=${tpls} upload=${upload} onBuild=${startBuild} onTpl=${(t: RepTpl) => { upd({ name: r.name || t.name }); useTpl(t, r.kind, false).then(() => setStep(2)); }}/>`}
        ${step === 2 && html`<${StepKind} r=${r} setKind=${setKind} mode=${mode} tpl=${tpl} build=${build}/>`}
        ${step === 3 && mode === 'build' && build && html`<${Builder} fold=${fold} o=${build} setO=${setBuild} kind=${r.kind} signers=${signers} setSigners=${setSigners} r=${r} upd=${upd} setR=${setR} onLayout=${() => setLay(true)} ti=${Math.min(ti, (build.more || []).length)} setTi=${setTi}
          vals=${vals} vi=${vsel} setVi=${setVi} onAddVal=${addVal} onDelVal=${delVal} valEd=${valEd}
          onExcel=${async () => {
            const shared = tpl && repsOf(state).some(x => x.id !== r.id && x.tpl === tpl.id);
            const bo = forBuild(build, r); const b = await window.api.repBuild(bo, r.kind, tpl && !shared ? tpl.file : undefined);
            if (!b.ok) { toast({ text: html`<span><b>Δεν έγινε.</b> ${b.error}</span>` }); return; }
            const t: RepTpl = { id: tpl && !shared ? tpl.id : uid(), name: r.name || build.title, file: b.file };   // χωρίς built: από εδώ και πέρα το αρχείο είναι το πρότυπο
            setTpl(t); setMode('upload'); setBuild(null); const nr = withBuilt(r, b, bo); setR(nr);
            await inspect(t, r.kind, b.sheet, b.head, true); for (const m of nr.more || []) await inspectSub(t, m.id, m.kind, m.head, true);
            window.api.repOpenTpl(b.file);
            setNote('Άνοιξε στο Excel. Άλλαξε ό,τι θέλεις, αποθήκευσε, και πάτα «Ξαναδιάβασε το πρότυπο». Οι {ΕΤΙΚΕΤΕΣ} μέσα στο Excel γεμίζουν μόνες τους.');
          }}/>`}
        ${step === 3 && mode === 'upload' && html`<${Mapping} r=${r} upd=${upd} setR=${setR} insp=${insp} tpl=${tpl} picking=${picking} setPicking=${(k: string | null) => { setPicking(k); if (k) setView('tpl'); }} view=${view} setView=${setView}
          vals=${vals} vi=${vsel} setVi=${setVi} onAddVal=${addVal} onDelVal=${delVal} valEd=${valEd}
          ti=${Math.min(ti, (r.more || []).length)} setTi=${setTi} subInsp=${subInsp} subKind=${(id: string, k: RepKind) => { const m = (r.more || []).find(x => x.id === id); if (!m || !tpl) return; const p = pickForKind(m.kind, m.pick, m.sort, k); upd({ more: (r.more || []).map(x => (x.id === id ? { ...x, sort: p.sort, pick: subPick(p.pick) } : x)) }); inspectSub(tpl, id, k, m.head, false); }}
          signers=${signers} setSigners=${setSigners} onLayout=${() => setLay(true)} reread=${() => tpl && inspect(tpl, r.kind, r.sheet, r.head, true)} sheetTo=${(sh: string) => tpl && inspect(tpl, r.kind, sh)}/>`}
        ${step === 4 && quick && html`<${Alert} tone="info">Ξεκίνησες από το έτοιμο «${r.name}»: οι στήλες είναι έτοιμες. Διάλεξε ποιοι μπαίνουν και πάτα «Αποθήκευση και Βγάλε», ή «Επόμενο» για το πού βγαίνει. Τις στήλες τις αλλάζεις από το βήμα 3.<//>`}
        ${step === 4 && !nop && html`<${TableTabs} r=${r} t1=${mode === 'build' ? build?.t1 : undefined} ti=${Math.min(ti, (r.more || []).length)} setTi=${setTi}/>`}
        ${step === 4 && nop && html`<${Alert} tone="info">Αυτό το έντυπο έχει μόνο πίνακες τιμών: δεν διαλέγεις άτομα. Τους πίνακες και τη στιγμή μέτρησης τα αλλάζεις από το βήμα 3.<//>`}
        ${step === 4 && !nop && (ti > 0 && r.more?.[ti - 1] ? html`<${SubPick} key=${r.more[ti - 1].id} r=${r} t=${r.more[ti - 1]} n=${ti + 1} d=${d} set=${(t: RepTable) => upd({ more: (r.more || []).map(x => (x.id === t.id ? t : x)) })}/>` : r.kind === 'blank' ? html`<${StepBlank} r=${r} upd=${upd}/>` : html`<${StepPick} r=${r} upd=${upd} p=${p}/>`)}
        ${step === 5 && html`<${StepOut} r=${r} upd=${upd} mode=${mode} insp=${insp} build=${build} rows=${p.rows} d=${d}/>`}
      </div>
      <div className="rep-page__nav"><${Button} variant="outline" disabled=${step < 2} why="Είσαι στο πρώτο βήμα" onClick=${() => goStep(step - 1)}>‹ Πίσω<//><${Button} variant="outline" disabled=${step > 4 || !canGo(step + 1)} why=${missing(step + 1)} onClick=${() => goStep(step + 1)}>Επόμενο ›<//></div>
      </div>
      <div className="rep-page__pv">
        <div className="rep-pvbar">
          ${!raw && html`<span className="rep-pvbar__lbl">Δείγμα:</span><${Segmented} small=${true} value=${String(sample)} onChange=${(v: string) => pickSample(+v)} items=${PV_SAMPLES.map(n => ({ value: String(n), label: sampleName(n), tip: n ? 'Κάθε πίνακας δείχνει ως ' + n + ' γραμμές στην προεπισκόπηση. Το έντυπο βγαίνει πάντα με όλους.' : 'Κάθε πίνακας δείχνει όλες τις γραμμές του (ως ' + PV_MAX + ')' }))}/>`}
          ${pages > 1 && html`<span className="rep-pvbar__pg"><${Button} size="icon" variant="ghost" aria-label="Προηγούμενη σελίδα" data-tip="Προηγούμενη σελίδα" disabled=${pg <= 1} onClick=${() => setPage(pg - 1)}>‹<//><span role="status">${pageText(pg, prev.pv!.pages)}</span><${Button} size="icon" variant="ghost" aria-label="Επόμενη σελίδα" data-tip="Επόμενη σελίδα" disabled=${pg >= pages} onClick=${() => setPage(pg + 1)}>›<//></span>`}
        </div>
        ${!raw && lbls.length > 0 && html`<div className="rep-pvbar__cnt" role="status">${lbls.map(x => html`<span key=${x.i}>${(r.more?.length ? x.i + 1 + ' · ' + tname(x.i) + ': ' : '') + x.t}</span>`)}</div>`}
        ${prev.err && html`<${Alert} tone="bad">${prev.err}<//>`}
        ${picking && html`<div className="rep-pickhint" role="status"><b>Κάνε κλικ σε ένα κελί</b> ${picking === '#head' ? 'της γραμμής με τις επικεφαλίδες' : picking.startsWith('#head:') ? 'της γραμμής με τις επικεφαλίδες του ' + (picking === '#head:+' ? 'νέου πίνακα' : 'πίνακα') : 'για «' + (cellOf(picking)?.label || '') + '»'} <${Button} size="sm" variant="ghost" onClick=${() => setPicking(null)}>Άκυρο<//></div>`}
        ${groups.length > 1 && !raw && html`<div className="rep-chips rep-pvgroups" role="group" aria-label="Ποια ομάδα δείχνει η προεπισκόπηση">${groups.map(x => html`<button key=${x.key} type="button" className="ui-chip ui-chip--sm" aria-pressed=${x === g} onClick=${() => { setPvG(x.key); setPage(1); }}>${x.short} (${x.rows.length})</button>`)}</div>`}
        ${mode === 'build' && !nop && !raw && bandItems.length > 1 && html`<${BandsPanel} items=${bandItems} bands=${bands} set=${(b: string[][]) => upd({ bands: keepBands(bandIds, b) })}/>`}
        <${Preview} pv=${prev.pv} busy=${prev.busy} page=${pg} none=${src ? undefined : 'Διάλεξε πρότυπο (βήμα 1) και η προεπισκόπηση φαίνεται εδώ.'} picking=${!!picking} heads=${raw ? [r.head, ...(r.more || []).map(t => t.head)] : []} marks=${raw ? [...r.cells.map(c => c.ref), ...(insp?.tags || []).map(t => t.ref)] : []} onPick=${onPick}/>
      </div>
    </div>
    ${leaving && html`<${DiscardAsk} text=${editing ? 'Οι αλλαγές στο έντυπο δεν αποθηκεύτηκαν. Αν κλείσεις, μένει όπως ήταν.' : 'Το έντυπο δεν αποθηκεύτηκε. Αν κλείσεις, χάνονται όσα διάλεξες.'} onStay=${() => setLeaving(false)} onLeave=${onClose}/>`}
    ${lay && src && html`<${LayoutDialog} title=${r.name || 'Νέο έντυπο'} sigs=${r.sigs ? sigsClean(r.sigs) : mode === 'build' ? sigsSaved(state.settings, 'reports') : undefined} initial=${r.layout ? { main: r.layout } : undefined}
      onClose=${() => setLay(false)} onSave=${(l: Layout | undefined) => { layN.current = sigN(r); upd({ layout: l?.main }); }}
      req=${(l: Layout) => ({ report: { ...r, ...(r.sigs ? { sigs: sigsClean(r.sigs) } : {}), layout: l.main }, ...('build' in src ? { build: src.build } : { file: src.file }), ids: pvIds, date: d })}/>`}
  </div>`;
}

function StepTpl({ mode, tpl, build, tpls, upload, onBuild, onTpl }: P) {
  const cur = mode === 'build' && !tpl ? 'Φτιάχνεται εδώ: «' + (build?.title || '') + '»' : tpl ? '«' + tpl.name + '»' : '';
  return html`<div className="stack">
    ${cur && html`<${Alert} tone="info">Πρότυπο: <b>${cur}</b>. Πάτα «Επόμενο» ή διάλεξε άλλο.<//>`}
    <div><h3 className="rep-h">Δικό σου Excel</h3><p className="note">Ένα έντυπο που ήδη έχεις (.xlsx). Κρατά τη μορφή του (γραμματοσειρές, πλαίσια, λογότυπο, υπογραφές) και η εφαρμογή συμπληρώνει μόνο τα στοιχεία.</p>
      <${Button} variant="outline" onClick=${upload}>Ανέβασε Excel…<//></div>
    <div><h3 className="rep-h">Φτιάξ' το εδώ</h3><p className="note">Η εφαρμογή φτιάχνει το Excel: κεφαλίδα και υπογραφές από τις Ρυθμίσεις, πλαίσια, Α/Α, επικεφαλίδες σε κάθε σελίδα.</p>
      <div className="rep-presets">${PRESETS.map(p => html`<button key=${p.id} type="button" className="rep-preset" onClick=${() => onBuild(p.opts, p.name)}><b>${p.name}</b><small>${p.help}</small></button>`)}
        <button type="button" className="rep-preset" onClick=${() => onBuild(blankBuild(), '')}><b>Κενό</b><small>Α/Α, βαθμός, ονοματεπώνυμο. Προσθέτεις στήλες στο βήμα 3.</small></button></div></div>
    ${tpls.length > 0 && html`<div><h3 className="rep-h">Πρότυπο που ήδη υπάρχει</h3><div className="rep-presets">${tpls.map((t: RepTpl) => html`<button key=${t.id} type="button" className="rep-preset" aria-pressed=${tpl?.id === t.id} onClick=${() => onTpl(t)}><b>${t.name}</b><small>${t.built ? 'Φτιαγμένο εδώ' : 'Ανεβασμένο Excel'}</small></button>`)}</div></div>`}
  </div>`;
}

function StepKind({ r, setKind, mode, tpl, build }: P) {
  return html`<div className="stack">
    <div className="rep-kinds">${REP_KINDS.filter(k => k.id !== 'blank' || mode !== 'upload').map(k => html`<button key=${k.id} type="button" className="rep-preset" aria-pressed=${r.kind === k.id} onClick=${() => setKind(k.id)}><b>${k.label}</b><small>${k.help}</small></button>`)}</div>
    <p className="note">${mode === 'upload' ? 'Οι στήλες του «' + (tpl?.name || '') + '» ξαναδιαβάζονται για το είδος που διαλέγεις.' : build ? 'Οι στήλες που δεν υπάρχουν στο είδος φεύγουν (π.χ. ΑΣΜ στα στελέχη, εκεί είναι ΑΜ) και μπαίνουν οι βασικές του (π.χ. θέση και ώρες στις υπηρεσίες).' : ''}</p>
  </div>`;
}

const fieldOpts = (kind: RepKind) => FIELDS[kind].map(f => html`<option key=${f.k} value=${f.k}>${f.label}</option>`);
function SignerFields({ signers, setSigners, both }: P) {
  return html`<div className="field-row">
    <div className="field"><label className="field__label" htmlFor="sg-s">Όνομα λοχία κάτω από την υπογραφή</label><input id="sg-s" className="ui-input" placeholder="π.χ. ΕΠΟΠ ΛΧΙΑΣ ΠΑΠΑΔΟΠΟΥΛΟΣ" value=${signers.sergeant} onChange=${(e: any) => setSigners({ ...signers, sergeant: e.target.value })}/></div>
    ${both && html`<div className="field"><label className="field__label" htmlFor="sg-c">Όνομα Διοικητή</label><input id="sg-c" className="ui-input" placeholder="π.χ. ΙΛΧΟΣ (ΤΘ) ΓΕΩΡΓΙΟΥ" value=${signers.commander} onChange=${(e: any) => setSigners({ ...signers, commander: e.target.value })}/></div>`}
    <p className="field__help" style=${{ width: '100%', margin: 0 }}>Κοινά για όλα τα έντυπα. Κενό: μένει χώρος να υπογράψει.</p></div>`;
}

// Υπογραφές του εντύπου μέσα στον οδηγό (Michael, 22/10: «να βάζεις και να βγάζεις όποια υπογραφή θέλεις»): καμία, οι κοινές
// (Ρυθμίσεις › Υπογραφές › Έντυπα, ή στο ανεβασμένο πρότυπο όσες έχει), ή δικές του (Report.sigs). Στο «Φτιάξ' το εδώ»,
// «Καμία» σημαίνει και χωρίς γραμμή υπογραφών στο πρότυπο (none/setNone)· στο ανεβασμένο, κενή λίστα που σβήνει όσες έχει.
function RepSigs({ r, upd, none, setNone, upload, onLayout }: P) {
  const { state } = useStore(); const base = sigsSaved(state.settings, 'reports');
  const [mode, setMode] = useState<'none' | 'base' | 'own'>(() => (r.sigs ? (r.sigs.length ? 'own' : 'none') : none ? 'none' : 'base'));
  const to = (m: 'none' | 'base' | 'own') => {
    setMode(m); setNone?.(m === 'none');
    upd({ sigs: m === 'own' ? (r.sigs?.length ? r.sigs : base.map(x => ({ ...x }))) : m === 'none' && upload ? [] : undefined });
  };
  return html`<div className="stack" style=${{ gap: '8px' }}>
    <div className="rep-opts"><span className="field__label">Υπογραφές</span><${Segmented} small=${true} value=${mode} onChange=${to} items=${[{ value: 'none', label: 'Καμία' }, { value: 'base', label: upload ? 'Όπως το πρότυπο' : 'Από τις Ρυθμίσεις' }, { value: 'own', label: 'Δικές του' }]}/>
      ${onLayout && html`<${Button} size="sm" variant="outline" onClick=${onLayout} data-tip="Σύρε κεφαλίδα, ημερομηνία, τίτλο και υπογραφές όπου θέλεις πάνω στο χαρτί. Ισχύει και στο Excel και στην εκτύπωση.">Θέσεις στο χαρτί…${r.layout && Object.keys(r.layout).length ? ' •' : ''}<//>`}</div>
    ${mode === 'base' && html`<p className="note" style=${{ margin: 0 }}>${upload ? html`Όσες έχει το πρότυπο. Σε κελί με {ΥΠΟΓΡΑΦΕΣ} μπαίνουν οι κοινές: <b>${sigsText(base)}</b>.` : html`Μπαίνουν από αριστερά προς τα δεξιά: <b>${sigsText(base)}</b>.`} Οι κοινές αλλάζουν στις <${GoLink} view="templates" params=${{ tab: 'unit' }}>Ρυθμίσεις › Μονάδα και έντυπα › Υπογραφές<//> (Έντυπα).</p>`}
    ${mode === 'own' && html`<p className="note" style=${{ margin: 0 }}>Μόνο για αυτό το έντυπο, από αριστερά προς τα δεξιά.${upload ? ' Μπαίνουν στη θέση των υπογραφών του προτύπου (ή στο {ΥΠΟΓΡΑΦΕΣ}), αλλιώς κάτω από τον πίνακα.' : ''} Τις μετακινείς στο χαρτί με «Θέσεις στο χαρτί…».</p>
      <${SigEditor} value=${r.sigs || []} onChange=${(v: Sig[]) => upd({ sigs: v })} id="rep-sg"/>`}
  </div>`;
}

// ------------------------------------------------------------------ μορφή στήλης (Michael, 22/10)
// Καταστάσεις: πώς γράφεται κάθε μία (ΕΑ, ΕΥ, ΑΔΕΙΑ…)· συνδυασμός: ποια στοιχεία και με ποια μορφή (ΣΤΡ (ΜΧ)).
// Δείγματα για τη λίστα των μορφών: ό,τι θα γραφτεί, με καταστάσεις του είδους της στήλης
const SAMPLE: Record<string, [Status['type'], string?][]> = { smed: [['EA'], ['EY']], sabs: [['LEAVE'], ['SICK']], spun: [['PUN', 'Περιορισμός']], sother: [['STEP'], ['NOS']], sout: [['OUT'], ['DN']] };
function sampleText(f: string, fmt: string, today: string): string {
  const list = SAMPLE[f] || [['EA'], ['LEAVE'], ['PUN', 'Περιορισμός']];
  return [...new Set(list.map(([type, kind]) => stText({ type, kind, from: addDays(today, -2), to: addDays(today, 3) }, fmt, undefined, today).toUpperCase()))].join(', ');
}
const CUSTOM = '#own';   // «Δική σου μορφή…» στις λίστες
function StatusFmt({ f, sf, onChange, id, st, onSt }: P) {
  const { today } = useStore();
  const preset = sf == null || ST_FMTS.includes(sf); const [own, setOwn] = useState(!preset);
  const v = own ? CUSTOM : sf ?? ST_FMTS[0];
  return html`<span className="rep-colopt">
    <span className="rep-colopt__l">Πώς γράφεται</span>
    <${Select} className="ui-select" aria-label="Πώς γράφεται η κατάσταση" value=${v} onChange=${(e: any) => { const x = e.target.value; if (x === CUSTOM) { setOwn(true); onChange(sf || ST_FMTS[0]); } else { setOwn(false); onChange(x === ST_FMTS[0] ? undefined : x); } }}>
      ${ST_FMTS.map(x => html`<option key=${x} value=${x}>${sampleText(f, x, today)}</option>`)}<option value=${CUSTOM}>Δική σου μορφή…</option><//>
    ${onSt && html`<span className="rep-colopt__l">Ποιες</span><${Select} className="ui-select" aria-label="Ποιες καταστάσεις" value=${st || 'on'} onChange=${(e: any) => onSt(e.target.value === 'new' ? 'new' : undefined)}><option value="on">Όσες ισχύουν τη μέρα</option><option value="new">Μόνο όσες ξεκινούν τη μέρα</option><//>`}
    ${own && html`<input id=${id} className="ui-input rep-colopt__fmt" aria-label="Δική σου μορφή κατάστασης" placeholder="π.χ. {ΚΩΔ} ΕΩΣ {ΕΩΣ}" value=${sf || ''} onChange=${(e: any) => onChange(e.target.value)}/>
      <small className="muted rep-colopt__help">${ST_TAGS.map(t => '{' + t.tag + '} ' + t.help).join(' · ')}. Τώρα: ${sampleText(f, sf || '', today) || '—'}</small>`}
  </span>`;
}
function ComboFmt({ kind, o, onChange }: P) {
  const c = comboOf(o); const fmts = comboFmts(c.parts.length);
  const [own, setOwn] = useState(!fmts.includes(c.fmt));
  const set = (x: Partial<ColOpts>) => onChange({ ...(o || {}), ...c, ...x });
  const setParts = (parts: string[]) => { const f2 = comboFmts(parts.length); set({ parts, fmt: own || f2.includes(c.fmt) ? c.fmt : f2[Math.max(0, fmts.indexOf(c.fmt))] || f2[0] }); };
  const opts = comboFields(kind).map(f => html`<option key=${f.k} value=${f.k}>${f.label}</option>`);
  const hasSt = c.parts.some(k => isStatusField(k));
  return html`<span className="rep-colopt rep-colopt--combo">
    <span className="rep-colopt__l">Στοιχεία</span>
    ${c.parts.map((k, i) => html`<${Fragment} key=${i}><b className="rep-colopt__n">{${i + 1}}</b><${Select} className="ui-select" aria-label=${'Στοιχείο ' + (i + 1) + ' του συνδυασμού'} value=${k} onChange=${(e: any) => setParts(c.parts.map((x, j) => (j === i ? e.target.value : x)))}>${opts}<//>
      ${c.parts.length > 1 && html`<button type="button" className="rep-picks__x" aria-label=${'Βγάλε το στοιχείο ' + (i + 1)} onClick=${() => setParts(c.parts.filter((_, j) => j !== i))}>${Icon.x}</button>`}<//>`)}
    <${Button} size="sm" variant="ghost" disabled=${c.parts.length >= 5} why="Ως 5 στοιχεία" onClick=${() => setParts([...c.parts, comboFields(kind).find(f => !c.parts.includes(f.k))?.k || 'last'])}>+ Στοιχείο<//>
    <span className="rep-colopt__l">Μορφή</span>
    <${Select} className="ui-select" aria-label="Μορφή του συνδυασμού" value=${own ? CUSTOM : c.fmt} onChange=${(e: any) => { const x = e.target.value; if (x === CUSTOM) setOwn(true); else { setOwn(false); set({ fmt: x }); } }}>
      ${fmts.map(x => html`<option key=${x} value=${x}>${comboHead(kind, { parts: c.parts }, x)}</option>`)}<option value=${CUSTOM}>Δική σου μορφή…</option><//>
    ${own && html`<input className="ui-input rep-colopt__fmt" aria-label="Δική σου μορφή συνδυασμού" placeholder="π.χ. {1} ({2})" value=${c.fmt} onChange=${(e: any) => set({ fmt: e.target.value })}/>
      <small className="muted rep-colopt__help">{1}, {2}… είναι τα στοιχεία με τη σειρά. Ό,τι άλλο γράψεις μένει όπως είναι. Αν ένα στοιχείο είναι κενό, φεύγουν οι άδειες παρενθέσεις.</small>`}
    ${hasSt && html`<${StatusFmt} f="status" sf=${o?.sf} onChange=${(sf?: string) => onChange({ ...(o || {}), ...c, sf })}/>`}
  </span>`;
}
// Οι επιλογές κάτω από μια στήλη· set(o, h): νέες επιλογές και (στον συνδυασμό) η επικεφαλίδα, αν ήταν η αυτόματη
function ColOptsEditor({ kind, c, set }: P) {
  if (c.f === 'combo') return html`<${ComboFmt} kind=${kind} o=${c.o} onChange=${(o: ColOpts) => set(o, !c.h || c.h === comboHead(kind, c.o) ? comboHead(kind, o) : c.h)}/>`;
  if (isStatusField(c.f)) {
    const put = (x: Partial<ColOpts>) => { const o: ColOpts = { ...(c.o || {}), ...x }; if (o.sf == null) delete o.sf; if (!o.st) delete o.st; set(o.sf == null && !o.st ? undefined : o, c.h); };
    return html`<${StatusFmt} f=${c.f} sf=${c.o?.sf} st=${c.o?.st} onChange=${(sf?: string) => put({ sf })} onSt=${c.f === 'stype' ? undefined : (st?: 'new') => put({ st })}/>`;
  }
  return null;
}
// Ένα στοιχείο σε στήλη: με το «Συνδυασμός» μπαίνει η προεπιλογή (βαθμός και Ο/Σ)
const colWith = (kind: RepKind, f: string, h: string) => (f === 'combo' ? { f, h: comboHead(kind, DEF_COMBO), o: { ...DEF_COMBO } } : { f, h: fieldOf(kind, f)?.head || (kind === 'blank' && h === 'Α/Α' ? '' : h), o: undefined });

// Οι στήλες ενός πίνακα στο «Φτιάξ' το εδώ»
function ColsEditor({ kind, cols, setCols }: P) {
  const setCol = (i: number, x: Partial<BuildCol>) => setCols(cols.map((c: BuildCol, j: number) => (j === i ? { ...c, ...x } : c)));
  // το 2ο όρισμα του setCols: από ποια παλιά στήλη προέρχεται κάθε νέα (για το πλέγμα του «Κενό»)
  const ix = cols.map((_: BuildCol, i: number) => i);
  const move = (i: number, by: number) => { const cs = [...cols]; const j = i + by; if (j < 0 || j >= cs.length) return; [cs[i], cs[j]] = [cs[j], cs[i]]; const from = [...ix]; [from[i], from[j]] = [from[j], from[i]]; setCols(cs, from); };
  const add = () => {
    if (kind === 'blank') { setCols([...cols, { f: 'col', h: 'ΣΤΗΛΗ ' + (cols.filter((c: BuildCol) => c.f === 'col').length + 1), w: 'auto' }], [...ix, -1]); return; }
    const used = new Set(cols.map((c: BuildCol) => c.f)); const f = FIELDS[kind as RepKind].find(x => !used.has(x.k) && x.k !== 'text' && x.k !== 'combo') || FIELDS[kind as RepKind][0]; setCols([...cols, { f: f.k, h: f.head, w: 'auto' }]);
  };
  return html`<div><span className="field__label">Στήλες</span>
    <ul className="rep-cols">${cols.map((c: BuildCol, i: number) => html`<li key=${i}>
      <span className="rep-cols__l">${String.fromCharCode(65 + i)}</span>
      <${Select} className="ui-select" aria-label=${'Στοιχείο στήλης ' + (i + 1)} value=${c.f} onChange=${(e: any) => { const { o, ...x } = colWith(kind, e.target.value, c.h); setCol(i, { ...x, o }); }}>${fieldOpts(kind)}<//>
      <input className="ui-input" aria-label=${'Επικεφαλίδα στήλης ' + (i + 1)} placeholder="Επικεφαλίδα" value=${c.h} onChange=${(e: any) => setCol(i, { h: e.target.value })}/>
      <${Select} className="ui-select rep-cols__w" aria-label=${'Πλάτος στήλης ' + (i + 1)} value=${c.w} onChange=${(e: any) => setCol(i, { w: e.target.value })}><option value="narrow">Στενή</option><option value="auto">Κανονική</option><option value="wide">Φαρδιά</option><//>
      <span className="rep-cols__mv"><${Button} size="icon" variant="ghost" aria-label="Πάνω" disabled=${i === 0} onClick=${() => move(i, -1)}>${Icon.up}<//><${Button} size="icon" variant="ghost" aria-label="Κάτω" disabled=${i === cols.length - 1} onClick=${() => move(i, 1)}>${Icon.down}<//>
        <${Button} size="icon" variant="ghost" aria-label="Βγάλε τη στήλη" disabled=${cols.length < 2} why="Χρειάζεται τουλάχιστον μία στήλη" onClick=${() => setCols(cols.filter((_: BuildCol, j: number) => j !== i), ix.filter((j: number) => j !== i))}>${Icon.x}<//></span>
      ${c.f === 'text' && html`<input className="ui-input rep-cols__txt" aria-label="Κείμενο σε κάθε γραμμή" placeholder="Κείμενο σε κάθε γραμμή" value=${c.text || ''} onChange=${(e: any) => setCol(i, { text: e.target.value })}/>`}
      <${ColOptsEditor} kind=${kind} c=${c} set=${(o: ColOpts | undefined, h: string) => setCol(i, { o, h })}/>
    </li>`)}</ul>
    <${Button} size="sm" variant="outline" disabled=${cols.length >= 16} why="Ως 16 στήλες" onClick=${add}>+ Στήλη<//></div>`;
}

// Οι πίνακες του εντύπου (Michael, 22/10): «Πίνακας 1 · Στρατιώτες», «Πίνακας 2 · Καταστάσεις»…· onAdd: «+ Πίνακας» (βήμα 3)
const kindLbl = (k: RepKind) => REP_KINDS.find(x => x.id === k)?.label || '';
function TableTabs({ r, t1, ti, setTi, onAdd, addTip, vals, vi = -1, setVi, onAddVal, onDel, onDelVal }: P) {
  const more: RepTable[] = r.more || []; const vs: ValueTable[] = onAddVal ? vals || [] : [];
  if (!more.length && !onAdd) return null;
  const pick = (i: number) => { setTi(i); setVi?.(-1); };
  return html`<div className="rep-tables" role="group" aria-label="Πίνακες του εντύπου">
    <span className="field__label">Πίνακες</span>
    <button type="button" className="ui-chip ui-chip--sm" aria-pressed=${ti === 0 && vi < 0} onClick=${() => pick(0)}>1 · ${t1?.trim() ? t1.trim().slice(0, 18) : kindLbl(r.kind)}</button>
    ${more.map((t, i) => html`<span key=${t.id} className="rep-chipx"><button type="button" className="ui-chip ui-chip--sm" aria-pressed=${ti === i + 1 && vi < 0} onClick=${() => pick(i + 1)}>${i + 2} · ${t.title ? t.title.slice(0, 18) : kindLbl(t.kind)}</button>${onAdd && onDel && html`<button type="button" className="rep-chipx__x" aria-label=${'Σβήσε τον πίνακα ' + (i + 2)} data-tip=${'Σβήσε τον πίνακα ' + (i + 2)} onClick=${() => onDel(t.id)}>${Icon.x}</button>`}</span>`)}
    ${onAdd && html`<${Button} size="sm" variant="outline" disabled=${more.length >= 5} why="Ως 6 πίνακες" data-tip=${addTip} onClick=${onAdd}>+ Πίνακας<//>`}
    ${vs.map((v, i) => html`<span key=${v.id} className="rep-chipx ui-chip--gap"><button type="button" className="ui-chip ui-chip--sm" aria-pressed=${vi === i} data-tip="Πίνακας τιμών: κείμενο και αριθμός ανά γραμμή, στο τέλος του εντύπου" onClick=${() => setVi?.(i)}>Τιμές ${i + 1}${v.title ? ' · ' + v.title.slice(0, 14) : ''}</button>${onDelVal && html`<button type="button" className="rep-chipx__x" aria-label="Σβήσε τον πίνακα τιμών" data-tip="Σβήσε τον πίνακα τιμών" onClick=${() => onDelVal(i)}>${Icon.x}</button>`}</span>`)}
    ${onAddVal && html`<${Button} size="sm" variant="outline" disabled=${vs.length >= 4} why="Ως 4 πίνακες τιμών" data-tip="Πίνακας με γραμμές όπως «Παρόντες» ή «Ενεργές άδειες = ΚΑ + Τιμητικές + ΔΝ», με αριθμούς από την εφαρμογή. Μπαίνει στο τέλος του εντύπου, πριν τις υπογραφές." onClick=${onAddVal}>+ Πίνακας τιμών<//>`}
  </div>`;
}
// Μέγεθος και θέση του πίνακα στο χαρτί (Michael, 22/10): πλάτος, αριστερά/κέντρο/δεξιά, ίσες στήλες, κενές γραμμές από πάνω
function LayEditor({ lay, set, n, noEven }: P) {
  const l: TabLay = lay || {};
  const put = (x: Partial<TabLay>) => { const y = { ...l, ...x }; const clean = Object.fromEntries(Object.entries(y).filter(([k, v]) => v != null && !(k === 'w' && v === 'auto') && !(k === 'at' && v === 'left') && !(k === 'even' && !v) && !(k === 'gap' && v === 1))); set(Object.keys(clean).length ? clean : undefined); };
  return html`<div className="rep-opts rep-lay">
    <span className="field__label">Πλάτος στο χαρτί</span><${Select} className="ui-select" aria-label=${'Πλάτος του πίνακα ' + n} value=${l.w || 'auto'} onChange=${(e: any) => put({ w: e.target.value })}>${TAB_WIDTHS.map(w => html`<option key=${w.value} value=${w.value}>${w.label}</option>`)}<//>
    <span className="field__label">Θέση</span><${Segmented} small=${true} value=${l.at || 'left'} onChange=${(at: TabLay['at']) => put({ at })} items=${[{ value: 'left', label: 'Αριστερά' }, { value: 'center', label: 'Κέντρο' }, { value: 'right', label: 'Δεξιά' }]}/>
    ${!noEven && html`<span className="field__label">Στήλες</span><${Segmented} small=${true} value=${l.even ? 'e' : 'n'} onChange=${(v: string) => put({ even: v === 'e' })} items=${[{ value: 'n', label: 'Όσο χρειάζεται η καθεμία' }, { value: 'e', label: 'Ίσες' }]}/>`}
    <label className="field__label" htmlFor=${'lay-gap' + n}>Κενές γραμμές από πάνω</label><input id=${'lay-gap' + n} type="number" min="0" max="10" className="ui-input rep-n" value=${l.gap ?? 1} onChange=${(e: any) => put({ gap: Math.max(0, Math.min(10, Math.round(+e.target.value || 0))) })}/>
  </div>`;
}
// «Χωρίς γραμμή επικεφαλίδων» (Michael, 29/10): ο πίνακας βγαίνει μόνο με τις γραμμές των ατόμων, χωρίς τη γραμμή Α/Α, ΒΑΘΜΟΣ…
function NoHead({ on, set, n }: P) {
  return html`<label className="ui-checkrow" data-tip="Ο πίνακας βγαίνει χωρίς τη γραμμή με τις επικεφαλίδες (Α/Α, ΒΑΘΜΟΣ…), μόνο με τις γραμμές των ατόμων. Οι στήλες μένουν όπως τις έφτιαξες."><input type="checkbox" className="ui-check" aria-label=${'Χωρίς γραμμή επικεφαλίδων στον πίνακα ' + n} checked=${!!on} onChange=${(e: any) => set(e.target.checked)}/>Χωρίς γραμμή επικεφαλίδων</label>`;
}
// Πίνακας στο «Φτιάξ' το εδώ» και στο δικό σου Excel: τίτλος και τι αφορά (δίπλα-δίπλα), από κάτω η βοήθεια και «Βγάλε τον πίνακα»· ο 1ος πίνακας: μόνο τίτλος
function TableHead({ t, kind, title, ta, setTa, setKind, setTitle, onDel, n }: P) {
  return html`<div className="rep-th">
    ${setTitle && html`<div className="field rep-th__t"><label className="field__label" htmlFor=${'t-title' + n}>Τίτλος πάνω από τον πίνακα</label><input id=${'t-title' + n} className="ui-input" placeholder=${n > 1 ? 'π.χ. ΙΑΤΡΙΚΑ (κενό: χωρίς τίτλο)' : 'π.χ. ΠΑΡΟΝΤΕΣ (κενό: χωρίς τίτλο)'} value=${title} onChange=${(e: any) => setTitle(e.target.value)}/>${setTa && alignSeg(ta, 'left', setTa, 'Στοίχιση τίτλου πίνακα ' + n)}</div>`}
    ${setKind && html`<div className="field rep-th__k"><label className="field__label" htmlFor=${'t-kind' + n}>Ο πίνακας ${n} αφορά</label><${Select} id=${'t-kind' + n} className="ui-select" value=${kind} onChange=${(e: any) => setKind(e.target.value)}>${REP_KINDS.filter(k => k.id !== 'blank').map(k => html`<option key=${k.id} value=${k.id}>${k.label}</option>`)}<//></div>`}
    ${onDel && html`<p className="field__help rep-th__h">${t ? 'Ποιοι μπαίνουν σε αυτόν τον πίνακα το διαλέγεις στο βήμα 4. ' : ''}Μπαίνει κάτω από τον προηγούμενο, με δικές του στήλες.</p>
    <${Button} size="sm" variant="ghost" aria-label=${'Σβήσε τον πίνακα ' + n} onClick=${onDel}>${Icon.x}Σβήσε τον πίνακα<//>`}
  </div>`;
}

// Κάρτα που ανοιγοκλείνει (βήμα 3): μία γραμμή με τίτλο και σύνοψη, το περιεχόμενο ανοίγει από κάτω· ανοιχτό/κλειστό το θυμάται η σελίδα (fold)
const foldOpen = (fold: P, id: string) => !!fold?.open[id];
function Fold({ id, fold, title, sum, children }: P) {
  const open = foldOpen(fold, id);
  return html`<div className=${cx('rep-fold', open && 'is-open')}>
    <button type="button" className="rep-fold__h" aria-expanded=${open} onClick=${() => fold.toggle(id)}><span className="rep-fold__t">${title}</span>${sum && html`<span className="rep-fold__s">${sum}</span>`}<span className="rep-fold__c" aria-hidden="true">${open ? '⌄' : '›'}</span></button>
    ${open && html`<div className="rep-fold__b">${children}</div>`}
  </div>`;
}
// σύνοψη μεγέθους και θέσης ενός πίνακα: «Όσο χρειάζεται · Αριστερά»
const layText = (l?: TabLay, nohead?: boolean) => (!l?.w || l.w === 'auto' ? 'Όσο χρειάζεται' : TAB_WIDTHS.find(x => x.value === l.w)?.label || '') + ' · ' + ({ left: 'Αριστερά', center: 'Κέντρο', right: 'Δεξιά' }[l?.at || 'left']) + (l?.even ? ' · ίσες στήλες' : '') + (nohead ? ' · χωρίς επικεφαλίδες' : '');
const nStl = (n: number) => n + (n === 1 ? ' στήλη' : ' στήλες'), nGr = (n: number) => n + (n === 1 ? ' γραμμή' : ' γραμμές');

// «Φτιάξ' το εδώ»: στήλες, τίτλος, κεφαλίδα, υπογραφές, σελίδα· και πίνακες 2, 3… (build.more, με τα «ποιοι» στο r.more)
function Builder({ fold, o, setO, kind, signers, setSigners, onExcel, r, upd, setR, onLayout, ti, setTi, vals, vi, setVi, onAddVal, onDelVal, valEd }: P) {
  const { state } = useStore(); const custom = sigsCustom(state.settings, 'reports'); const toast = useToast();
  const set = (x: Partial<BuildOpts>) => setO({ ...o, ...x });
  const more: BuildTable[] = o.more || [];
  const bt = ti > 0 ? more[ti - 1] : null;
  const setT = (id: string, x: Partial<BuildTable>) => set({ more: more.map(t => (t.id === id ? { ...t, ...x } : t)) });
  const noHeadT = (id: string, on: boolean) => set({ more: more.map(t => { if (t.id !== id) return t; const { nohead: _h, ...rest } = t; return on ? { ...rest, nohead: true } : rest; }) });
  const noTa = <T extends object>(x: T & { ta?: TAlign }, ta?: TAlign): T => { const { ta: _a, ...rest } = x; return (ta ? { ...rest, ta } : rest) as T; };   // στοίχιση τίτλου: μόνο η μη προεπιλεγμένη μένει στο αρχείο
  const setTa1 = (ta?: TAlign) => { const { ta1: _a, ...rest } = o; setO(ta ? { ...rest, ta1: ta } : rest); };
  const setTta = (ta?: TAlign) => { const { tta: _a, ...rest } = o; setO(ta ? { ...rest, tta: ta } : rest); };
  const setT1 = (t1: string) => { const { t1: _t, ...rest } = o; setO(t1 ? { ...rest, t1 } : rest); };
  const noHead1 = (on: boolean) => { const { nohead: _h, ...rest } = o; setO(on ? { ...rest, nohead: true } : rest); };
  const addTable = () => {
    const id = uid(); const k: RepKind = r.kind === 'blank' ? 'people' : r.kind;   // το «Κενό» είναι μόνο ο 1ος πίνακας
    const { nopeople: _n, ...o0 } = o;
    setO({ ...o0, more: [...more, { id, title: '', kind: k, cols: colsForKind([{ f: 'aa', h: 'Α/Α', w: 'narrow' }, ...(fieldOf(k, 'rank') ? [{ f: 'rank', h: 'ΒΑΘΜΟΣ', w: 'auto' as const }] : []), { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }], k) }] });
    upd({ more: [...(r.more || []), newTable(k, id)] }); setTi(more.length + 1); setVi(-1);
  };
  // Σβήσε τον πίνακα N (× στη λίστα ή κουμπί κάτω): με «Αναίρεση» που τον βάζει πίσω στη θέση του, με τα «ποιοι μπαίνουν» που είχε
  const delTable = (id: string) => {
    const i = more.findIndex(t => t.id === id); const bt0 = more[i]; const rt0: RepTable | undefined = (r.more || []).find((t: RepTable) => t.id === id);
    setO({ ...o, more: more.filter(t => t.id !== id) }); const rest = (r.more || []).filter((t: RepTable) => t.id !== id); upd({ more: rest.length ? rest : undefined }); setTi(0);
    const back = <T extends { id: string }>(l: T[] | undefined, x: T) => { const a = [...(l || [])]; if (!a.some(y => y.id === x.id)) a.splice(Math.min(i, a.length), 0, x); return a; };
    if (bt0) toast({ text: 'Σβήστηκε ο πίνακας ' + (i + 2), actions: [{ label: 'Αναίρεση', fn: () => { setO((c: BuildOpts) => ({ ...c, more: back(c.more, bt0) })); if (rt0) setR((c: Report) => ({ ...c, more: back(c.more, rt0) })); setTi(i + 1); setVi(-1); } }] });
  };
  const kindOf = (id: string, k: RepKind) => {
    const t = more.find(x => x.id === id)!; setT(id, { kind: k, cols: colsForKind(t.cols, k) });
    upd({ more: (r.more || []).map((x: RepTable) => { if (x.id !== id) return x; const p = pickForKind(x.kind, x.pick, x.sort, k); return { ...x, kind: k, sort: p.sort, pick: subPick(p.pick) }; }) });
  };
  // μία γραμμή ανά πίνακα (1, 2, 3… και Τ για τους πίνακες τιμών)· το κλικ διαλέγει ποιος ανοίγει από κάτω (ti / vi)
  const tl: { key: string; on: boolean; pick: () => void; n: string; name: string; sub: string; dl?: string; del?: () => void }[] = [
    { key: 'm', on: vi < 0 && ti === 0, pick: () => { setTi(0); setVi(-1); }, n: '1', name: o.t1?.trim() || kindLbl(kind), sub: o.nopeople && !more.length && hasVals(r) ? 'Χωρίς πίνακα ατόμων' : kindLbl(kind) + ' · ' + nStl(o.cols.length) },
    ...more.map((t, i) => ({ key: t.id, on: vi < 0 && ti === i + 1, pick: () => { setTi(i + 1); setVi(-1); }, n: String(i + 2), name: t.title?.trim() || kindLbl(t.kind), sub: kindLbl(t.kind) + ' · ' + nStl(t.cols.length), dl: 'Σβήσε τον πίνακα ' + (i + 2), del: () => delTable(t.id) })),
    ...(vals || []).map((v: ValueTable, i: number) => ({ key: v.id, on: vi === i, pick: () => setVi(i), n: 'Τ', name: v.title?.trim() || v.rows[0]?.label || 'Πίνακας τιμών', sub: 'Πίνακας τιμών · ' + nGr(v.rows.length), dl: 'Σβήσε τον πίνακα τιμών', del: () => onDelVal(i) }))
  ];
  const sigMode = r.sigs ? (r.sigs.length ? 'Δικές του' : 'Καμία') : o.sig === 'none' ? 'Καμία' : 'Από τις Ρυθμίσεις';
  const layFold = (l?: TabLay, nohead?: boolean, nh?: any) => html`<${Fold} id="lay" fold=${fold} title="Μέγεθος και θέση στο χαρτί, χωρίς επικεφαλίδες" sum=${layText(l, nohead)}>${nh}<//>`;
  return html`<div className="rep-build">
    <section className="rep-card">
      <div className="rep-card__row"><label className="field__label" htmlFor="b-title" data-tip="Ένας για όλη τη σελίδα, στη μέση. Κάθε πίνακας έχει και δικό του τίτλο.">Γενικός τίτλος σελίδας</label><input id="b-title" className="ui-input" placeholder="π.χ. ΚΑΤΑΣΤΑΣΗ ΔΥΝΑΜΗΣ" value=${o.title} onChange=${(e: any) => set({ title: e.target.value })}/></div>
      <div className="rep-card__row"><span className="field__label">Στοίχιση</span>${alignSeg(o.tta, 'center', setTta, 'Στοίχιση γενικού τίτλου')}</div>
      <div className="rep-card__row rep-card__checks">
        <label className="ui-checkrow" data-tip=${(state.settings.hdLeft ? 'Κεφαλίδα πάνω αριστερά' : 'Κεφαλίδα πάνω δεξιά') + ' (από τις Ρυθμίσεις)'}><input type="checkbox" className="ui-check" checked=${o.head} onChange=${(e: any) => set({ head: e.target.checked })}/>Κεφαλίδα</label>
        <label className="ui-checkrow" data-tip=${'Τόπος και ημερομηνία πάνω ' + (state.settings.hdLeft ? 'δεξιά' : 'αριστερά')}><input type="checkbox" className="ui-check" checked=${o.date} onChange=${(e: any) => set({ date: e.target.checked })}/>Τόπος, ημερομηνία</label>
        <span className="note rep-card__hint">Κενός τίτλος: χωρίς</span>
      </div>
    </section>
    <section className="rep-card" aria-label="Πίνακες της σελίδας">
      <div className="rep-card__head"><b>Πίνακες της σελίδας</b>
        <${Button} size="sm" variant="outline" disabled=${more.length >= 5} why="Ως 6 πίνακες" data-tip="Κι άλλος πίνακας κάτω από τον πρώτο, με δικές του στήλες (π.χ. ένας για τους παρόντες και ένας για τα ιατρικά)" onClick=${addTable}>+ Πίνακας<//>
        <${Button} size="sm" variant="outline" disabled=${(vals || []).length >= 4} why="Ως 4 πίνακες τιμών" data-tip="Πίνακας με γραμμές όπως «Παρόντες» ή «Ενεργές άδειες = ΚΑ + Τιμητικές + ΔΝ», με αριθμούς από την εφαρμογή. Μπαίνει στο τέλος του εντύπου, πριν τις υπογραφές." onClick=${onAddVal}>+ Πίνακας τιμών<//></div>
      <div className="rep-tl" role="group" aria-label="Πίνακες του εντύπου">${tl.map(x => html`<div key=${x.key} className="rep-tl__row"><button type="button" className="rep-tl__r" aria-pressed=${x.on} onClick=${x.pick}><b>${x.n}</b><span className="rep-tl__n">${x.name}</span><span className="rep-tl__s">${x.sub}</span></button>${x.del ? html`<button type="button" className="rep-picks__x rep-tl__x" aria-label=${x.dl} data-tip=${x.dl} onClick=${x.del}>${Icon.x}</button>` : html`<span className="rep-tl__x" aria-hidden="true"></span>`}</div>`)}</div>
      ${hasVals(r) && !more.length && html`<label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${!!o.nopeople} onChange=${(e: any) => { const { nopeople: _n, ...rest } = o; setO(e.target.checked ? { ...rest, nopeople: true } : rest); if (e.target.checked) { setTi(0); upd({ split: 'none' }); } }}/>Χωρίς πίνακα ατόμων (μόνο πίνακες τιμών)</label>`}
      <div className="rep-card__ed">
      ${valEd ? valEd : bt ? html`<${TableHead} t=${bt} n=${ti + 1} kind=${bt.kind} title=${bt.title} ta=${bt.ta} setTa=${(ta?: TAlign) => set({ more: more.map(x => (x.id === bt.id ? noTa(x, ta) : x)) })} setKind=${(k: RepKind) => kindOf(bt.id, k)} setTitle=${(title: string) => { setT(bt.id, { title }); upd({ more: (r.more || []).map((x: RepTable) => (x.id === bt.id ? { ...x, title } : x)) }); }} onDel=${() => delTable(bt.id)}/>
        <${ColsEditor} kind=${bt.kind} cols=${bt.cols} setCols=${(cols: BuildCol[]) => setT(bt.id, { cols })}/>
        ${layFold(bt.lay, bt.nohead, html`<${LayEditor} n=${ti + 1} lay=${bt.lay} set=${(lay?: TabLay) => setT(bt.id, { lay })}/><${NoHead} n=${ti + 1} on=${bt.nohead} set=${(on: boolean) => noHeadT(bt.id, on)}/>`)}`
        : o.nopeople && !more.length && hasVals(r) ? html`<p className="note" style=${{ margin: 0 }}>Χωρίς πίνακα ατόμων: το έντυπο έχει μόνο τους πίνακες τιμών.</p>`
        : html`<${TableHead} n=${1} kind=${kind} title=${o.t1 || ''} ta=${o.ta1} setTa=${setTa1} setTitle=${setT1}/>
        <${ColsEditor} kind=${kind} cols=${o.cols} setCols=${(cols: BuildCol[], from?: number[]) => set(kind === 'blank' ? { cols, grid: regrid(o.grid, o.cols, cols, from) } : { cols })}/>
        ${kind === 'blank' && html`<${BlankGrid} o=${o} set=${set} r=${r} upd=${upd}/>`}
        ${layFold(o.lay, o.nohead, html`<${LayEditor} n=${1} lay=${o.lay} set=${(lay?: TabLay) => set({ lay })}/><${NoHead} n=${1} on=${o.nohead} set=${noHead1}/>`)}`}
      </div>
    </section>
    <div className="rep-fold2">
      <button type="button" aria-expanded=${foldOpen(fold, 'sig')} onClick=${() => fold.toggle('sig')}><b>Υπογραφές ${foldOpen(fold, 'sig') ? '⌄' : '›'}</b><span>${sigMode}</span></button>
      <button type="button" aria-expanded=${foldOpen(fold, 'paper')} onClick=${() => fold.toggle('paper')}><b>Χαρτί ${foldOpen(fold, 'paper') ? '⌄' : '›'}</b><span>${(o.land ? 'Οριζόντια' : 'Όρθια') + ' · ' + o.sz + ' · ' + ({ none: 'Λευκές', gray: 'Γκρι', olive: 'Λαδί' } as Record<string, string>)[o.fill]}</span></button>
    </div>
    ${foldOpen(fold, 'sig') && html`<section className="rep-card" aria-label="Υπογραφές">
      <${RepSigs} r=${r} upd=${upd} none=${o.sig === 'none'} setNone=${(none: boolean) => set({ sig: none ? 'none' : 'list' })} onLayout=${onLayout}/>
      ${o.sig !== 'none' && !r.sigs && !custom && html`<${SignerFields} signers=${signers} setSigners=${setSigners} both=${true}/>`}
    </section>`}
    ${foldOpen(fold, 'paper') && html`<section className="rep-card" aria-label="Χαρτί">
      <div className="rep-opts"><span className="field__label">Σελίδα</span><${Segmented} small=${true} value=${o.land ? 'l' : 'p'} onChange=${(v: string) => set({ land: v === 'l' })} items=${[{ value: 'p', label: 'Όρθια' }, { value: 'l', label: 'Οριζόντια' }]}/>
        <span className="field__label">Γράμματα</span><${Segmented} small=${true} value=${String(o.sz)} onChange=${(v: string) => set({ sz: +v as BuildOpts['sz'] })} items=${[{ value: '10', label: '10' }, { value: '11', label: '11' }, { value: '12', label: '12' }]}/>
        <span className="field__label">Επικεφαλίδες</span><${Segmented} small=${true} value=${o.fill} onChange=${(fill: BuildOpts['fill']) => set({ fill })} items=${[{ value: 'none', label: 'Λευκές' }, { value: 'gray', label: 'Γκρι' }, { value: 'olive', label: 'Λαδί' }]}/></div>
      <p className="note">Θέλεις λογότυπο, άλλη γραμματοσειρά ή κάτι που δεν έχει εδώ; <${Button} variant="link" onClick=${onExcel}>Άνοιξέ το στο Excel<//> και άλλαξέ το εκεί. Ό,τι γράψεις σε {ΑΓΚΥΛΕΣ} (π.χ. {ΗΜΕΡΟΜΗΝΙΑ}, {ΣΥΝΟΛΟ}) γεμίζει μόνο του.</p>
    </section>`}
  </div>`;
}

// «Κενό»: πόσες γραμμές και ένα μικρό πλέγμα για να γράψεις τα κελιά (BuildOpts.grid: γραμμή × στήλη, χωρίς το Α/Α). Κάθε κελί κρατά το κείμενο
// μέσα του και ενημερώνει τη σελίδα όταν τελειώσεις (Enter, Tab, κλικ αλλού), όχι σε κάθε πλήκτρο· επικόλληση από το Excel γεμίζει πολλά κελιά μαζί
const BlankCell = memo(function BlankCell({ i, j, v, label, put, paste }: P) {
  const [t, setT] = useState<string>(v); useEffect(() => setT(v), [v]);
  return html`<input className="ui-input" aria-label=${label} maxLength=${200} value=${t}
    onChange=${(e: any) => setT(e.target.value)} onBlur=${() => { if (t !== v) put(i, j, t); }}
    onKeyDown=${(e: any) => { if (e.key !== 'Enter') return; e.preventDefault(); const td = e.currentTarget.closest('td'); (td?.parentElement?.nextElementSibling?.children[td.cellIndex]?.querySelector('input') || e.currentTarget).focus(); }}
    onPaste=${(e: any) => { const x: string = e.clipboardData?.getData('text') || ''; if (/[\t\n]/.test(x.replace(/\r?\n$/, ''))) { e.preventDefault(); paste(i, j, x); } }}/>`;
});
function BlankGrid({ o, set, r, upd }: P) {
  const n = blankN(o.nrows); const heads: BuildCol[] = o.cols.filter((c: BuildCol) => c.f !== 'aa');
  const [txt, setTxt] = useState(String(n)); useEffect(() => setTxt(String(n)), [n]);
  const cb = useRef({ o, set, r, upd }); cb.current = { o, set, r, upd };
  const put = useCallback((i: number, j: number, t: string) => {
    const g: string[][] = (cb.current.o.grid || []).map((row: string[]) => [...row]);
    while (g.length <= i) g.push([]);
    while (g[i].length <= j) g[i].push('');
    g[i][j] = t;
    while (g.length && g[g.length - 1].every(x => !x)) g.pop();
    cb.current.set({ grid: g });
  }, []);
  // επικόλληση: ό,τι χωράει από το κελί που επικολλήθηκε (γραμμές μέχρι τις nrows, στήλες μέχρι την τελευταία)
  const paste = useCallback((i: number, j: number, text: string) => {
    const { o: o2, set: set2 } = cb.current; const w = o2.cols.filter((c: BuildCol) => c.f !== 'aa').length; const nr = blankN(o2.nrows);
    const g: string[][] = (o2.grid || []).map((row: string[]) => [...row]);
    text.replace(/\r?\n$/, '').split(/\r?\n/).forEach((line, di) => { if (i + di >= nr) return; while (g.length <= i + di) g.push([]); line.split('\t').forEach((v, dj) => { if (j + dj >= w) return; while (g[i + di].length <= j + dj) g[i + di].push(''); g[i + di][j + dj] = v; }); });
    while (g.length && g[g.length - 1].every(x => !x)) g.pop();
    set2({ grid: g });
  }, []);
  const rows = (x: number) => { cb.current.set({ nrows: x }); cb.current.upd({ pick: { ...cb.current.r.pick, mode: 'all', n: x } }); };
  return html`<div className="rep-grid">
    <div className="rep-grid__bar"><label className="field__label" htmlFor="b-nrows">Γραμμές</label>
      <input id="b-nrows" type="number" min="1" max=${BLANK_MAX} className="ui-input rep-n" value=${txt} onChange=${(e: any) => { setTxt(e.target.value); const x = +e.target.value; if (Number.isInteger(x) && x >= 1 && x <= BLANK_MAX && x !== n) rows(x); }} onBlur=${() => setTxt(String(n))}/>
      <small className="muted">Ως ${BLANK_MAX}. Γράψε στα κελιά ή άφησέ τα κενά για το χέρι· μπορείς να επικολλήσεις από το Excel.</small></div>
    <div className="rep-grid__sc" tabIndex=${0} role="group" aria-label="Κελιά του πίνακα"><table className="rep-grid__t">
      <thead><tr><th scope="col" aria-label="Γραμμή"></th>${heads.map((c, j) => html`<th key=${j} scope="col" title=${c.h}>${c.h || '\u00a0'}</th>`)}</tr></thead>
      <tbody>${Array.from({ length: n }, (_, i) => html`<tr key=${i}><th scope="row">${i + 1}</th>${heads.map((c, j) => html`<td key=${j}><${BlankCell} i=${i} j=${j} v=${o.grid?.[i]?.[j] ?? ''} label=${'Γραμμή ' + (i + 1) + ', ' + (c.h || 'στήλη ' + (j + 1))} put=${put} paste=${paste}/></td>`)}</tr>`)}</tbody></table></div>
  </div>`;
}

// Ανεβασμένο πρότυπο: ποια στήλη (επικεφαλίδα) παίρνει τι, για έναν πίνακα
function ColMap({ kind, headers, cols, setCols }: P) {
  const colOf = (c: number) => cols.find((x: RepCol) => x.c === c);
  const setCol = (h: TplInspect['headers'][number], f: string, x: Partial<RepCol> = {}) => {
    const rest = cols.filter((y: RepCol) => y.c !== h.c); const cur = colOf(h.c);
    const o = f === cur?.f ? cur?.o : f === 'combo' ? { ...DEF_COMBO } : undefined;
    setCols(f ? [...rest, { c: h.c, f, h: h.text, ...(o ? { o } : {}), ...(f === 'text' ? { text: cur?.text ?? '' } : {}), ...x }].sort((a: RepCol, b: RepCol) => a.c - b.c) : rest);
  };
  if (!headers) return html`<div className="empty">Διαβάζεται ο πίνακας…</div>`;
  return headers.length ? html`<table className="rep-table rep-table--map"><tbody>${headers.map((h: P) => { const c = colOf(h.c); return html`<tr key=${h.c}>
    <td className="nw"><span className="rep-cols__l">${String.fromCharCode(64 + Math.min(h.c, 26))}${h.c > 26 ? '…' : ''}</span> ${h.text}</td>
    <td><${Select} className=${cx('ui-select', !c && 'is-off')} aria-label=${'Στοιχείο για «' + h.text + '»'} value=${c?.f || ''} onChange=${(e: any) => setCol(h, e.target.value)}><option value="">— δεν γεμίζει —</option>${fieldOpts(kind)}<//>
      ${c?.f === 'text' && html`<input className="ui-input rep-map__txt" aria-label="Κείμενο σε κάθε γραμμή" placeholder="Κείμενο σε κάθε γραμμή" value=${c.text || ''} onChange=${(e: any) => setCol(h, 'text', { text: e.target.value })}/>`}
      ${c && html`<${ColOptsEditor} kind=${kind} c=${{ ...c, h: '' }} set=${(o: ColOpts | undefined) => setCol(h, c.f, { o })}/>`}</td></tr>`; })}</tbody></table>`
    : html`<${Alert} tone="warn">Δεν βρέθηκαν επικεφαλίδες. Πάτα «Άλλη γραμμή…» και κάνε κλικ στη γραμμή με τις επικεφαλίδες του πίνακα.<//>`;
}

// Ανεβασμένο πρότυπο: φύλλο, γραμμή επικεφαλίδων, ποια στήλη παίρνει τι, στοιχεία σε κελιά· και πίνακες 2, 3… (κλικ στη
// γραμμή με τις επικεφαλίδες τους, κάτω από τον πρώτο)
function Mapping({ r, upd, setR, insp, tpl, picking, setPicking, view, setView, signers, setSigners, reread, sheetTo, onLayout, ti, setTi, subInsp, subKind, vals, vi, setVi, onAddVal, onDelVal, valEd }: P) {
  const toast = useToast();
  if (!insp) return html`<div className="empty">Διαβάζεται το πρότυπο…</div>`;
  const keys = new Set([...r.cells.map((c: P) => c.k), ...insp.tags.map((t: P) => t.k)]);
  // ετικέτες γραμμών πινάκων τιμών που βρέθηκαν στο Excel: ταιριάζουν ή όχι (όσο υπάρχουν πίνακες τιμών)
  const vtags = useMemo(() => tagsOf(vals || [], (id: string) => !!tagKey(id)).map, [vals]);
  const valTagCells: { ref: string; tag: string; row?: string }[] = (vals || []).length ? (insp.unknown || []).map((u: P) => ({ ...u, row: ((e: P) => e && e.t.rows[e.i].label)(vtags.get(tagId(u.tag))) })) : [];
  const free = CELLS.filter(c => !r.cells.some((x: P) => x.k === c.k));
  const m: RepTable | null = ti > 0 ? r.more?.[ti - 1] || null : null;
  const setMore = (id: string, x: Partial<RepTable>) => upd({ more: (r.more || []).map((t: RepTable) => (t.id === id ? { ...t, ...x } : t)) });
  // Σβήσε τον πίνακα N: με «Αναίρεση» που τον βάζει πίσω (στη σειρά των γραμμών επικεφαλίδων)
  const delMore = (id: string) => {
    const i = (r.more || []).findIndex((t: RepTable) => t.id === id); const t0: RepTable | undefined = (r.more || [])[i];
    const rest = (r.more || []).filter((t: RepTable) => t.id !== id); upd({ more: rest.length ? rest : undefined }); setTi(0);
    if (t0) toast({ text: 'Σβήστηκε ο πίνακας ' + (i + 2), actions: [{ label: 'Αναίρεση', fn: () => { setR((c: Report) => ({ ...c, more: c.more?.some(y => y.id === t0.id) ? c.more : [...(c.more || []), t0].sort((a, b) => a.head - b.head) })); setTi(i + 1); } }] });
  };
  const si = m ? subInsp[m.id] : null;
  return html`<div className="stack rep-map">
    ${insp.sheets.length > 1 && html`<div className="rep-opts"><label className="field__label" htmlFor="m-sheet">Φύλλο</label><${Select} id="m-sheet" className="ui-select" value=${insp.sheet} onChange=${(e: any) => sheetTo(e.target.value)}>${insp.sheets.map((s: string) => html`<option key=${s} value=${s}>${s}</option>`)}<//></div>`}
    <${TableTabs} r=${r} ti=${ti} setTi=${setTi} onAdd=${() => setPicking('#head:+')} addTip="Κι άλλος πίνακας στο ίδιο φύλλο, κάτω από τον πρώτο: μετά κάνε κλικ στη γραμμή με τις επικεφαλίδες του" vals=${vals} vi=${vi} setVi=${setVi} onAddVal=${onAddVal} onDel=${delMore} onDelVal=${onDelVal}/>
    ${valEd ? valEd : m ? html`<div className="rep-opts">
        <span>Επικεφαλίδες του πίνακα ${ti + 1} στη γραμμή <b>${m.head}</b>${si && si.prepared > 1 ? ' · ' + si.prepared + ' έτοιμες γραμμές' : ''}</span>
        <${Button} size="sm" variant="outline" aria-pressed=${picking === '#head:' + m.id} onClick=${() => setPicking(picking === '#head:' + m.id ? null : '#head:' + m.id)}>Άλλη γραμμή…<//></div>
      <${TableHead} t=${m} n=${ti + 1} kind=${m.kind} setKind=${(k: RepKind) => subKind(m.id, k)} onDel=${() => delMore(m.id)}/>
      <div><span className="field__label">Ποια στήλη παίρνει τι</span><${ColMap} kind=${m.kind} headers=${si?.headers} cols=${m.cols} setCols=${(cols: RepCol[]) => setMore(m.id, { cols })}/></div>
      ${m.nohead && html`<${NoHead} n=${ti + 1} on=${true} set=${(on: boolean) => setMore(m.id, { nohead: on ? true : undefined })}/>`}`
    : html`<div className="rep-opts">
        <span>Επικεφαλίδες στη γραμμή <b>${insp.head}</b>${insp.guessed ? ' (βρέθηκε μόνη της)' : ''} · ${insp.prepared > 1 ? insp.prepared + ' έτοιμες γραμμές' : 'οι γραμμές μπαίνουν όσες χρειάζονται'}</span>
        <${Button} size="sm" variant="outline" aria-pressed=${picking === '#head'} onClick=${() => setPicking(picking === '#head' ? null : '#head')}>Άλλη γραμμή…<//></div>
      <div><span className="field__label">Ποια στήλη παίρνει τι</span><${ColMap} kind=${r.kind} headers=${insp.headers} cols=${r.cols} setCols=${(cols: RepCol[]) => upd({ cols })}/></div>
      ${r.nohead && html`<${NoHead} n=${1} on=${true} set=${(on: boolean) => upd({ nohead: on ? true : undefined })}/>`}`}
    <div><span className="field__label">Στοιχεία σε κελιά (κεφαλίδα, ημερομηνία, υπογραφές…)</span>
      <ul className="rep-cells">
        ${insp.tags.map((t: P) => html`<li key=${'t' + t.ref}><b>${t.ref}</b> ${cellOf(t.k)?.label}<small className="muted"> · από {${cellOf(t.k)?.tag}} στο Excel</small></li>`)}
        ${r.cells.filter((c: P) => cellOf(c.k)).map((c: P) => html`<li key=${c.ref}><b>${c.ref}</b> ${cellOf(c.k)?.label}<button type="button" className="rep-picks__x" aria-label="Βγάλε" onClick=${() => upd({ cells: r.cells.filter((x: P) => x !== c) })}>${Icon.x}</button></li>`)}
        ${!insp.tags.length && !r.cells.some((c: P) => cellOf(c.k)) && !valTagCells.length && html`<li className="muted">Κανένα ακόμα.</li>`}
        ${valTagCells.map((t: P) => html`<li key=${'v' + t.ref} className=${cx(!t.row && 'is-bad')}><b>${t.ref}</b> {${t.tag}}<small className="muted"> · ${t.row ? 'παίρνει την τιμή «' + t.row + '» (πίνακας τιμών)' : 'δεν ταιριάζει με καμία γραμμή πίνακα τιμών: μένει κενό'}</small></li>`)}
      </ul>
      <${Select} className="ui-select" aria-label="Πρόσθεσε στοιχείο σε κελί" value="" onChange=${(e: any) => e.target.value && setPicking(e.target.value)}><option value="">+ Στοιχείο σε κελί (μετά κλικ στο κελί)…</option>${free.map(c => html`<option key=${c.k} value=${c.k}>${c.label}</option>`)}<//></div>
    ${keys.has('title') && html`<div className="field"><label className="field__label" htmlFor="m-title">Τίτλος</label><input id="m-title" className="ui-input" placeholder=${r.name} value=${r.title || ''} onChange=${(e: any) => upd({ title: e.target.value })}/></div>`}
    ${(keys.has('sgtName') || keys.has('cmdName')) && html`<${SignerFields} signers=${signers} setSigners=${setSigners} both=${keys.has('cmdName')}/>`}
    <${RepSigs} r=${r} upd=${upd} upload=${true} onLayout=${onLayout}/>
    <div className="rep-opts"><span className="field__label">Προεπισκόπηση</span><${Segmented} small=${true} value=${picking ? 'tpl' : view} onChange=${setView} items=${[{ value: 'filled', label: 'Με στοιχεία' }, { value: 'tpl', label: 'Το πρότυπο' }]}/>
      <${Button} size="sm" variant="ghost" onClick=${() => tpl && window.api.repOpenTpl(tpl.file)}>Άνοιξέ το στο Excel<//><${Button} size="sm" variant="ghost" onClick=${reread} data-tip="Αφού το άλλαξες και το αποθήκευσες στο Excel">Ξαναδιάβασε το πρότυπο<//></div>
    <p className="note">Μπορείς και να γράψεις μέσα στο Excel ετικέτες σε αγκύλες, π.χ. {ΚΕΦΑΛΙΔΑ}, {ΗΜΕΡΟΜΗΝΙΑ}, {ΤΟΠΟΣ ΗΜΕΡΟΜΗΝΙΑ}, {ΣΥΝΟΛΟ}, {ΛΟΧΙΑΣ}, {ΔΙΟΙΚΗΤΗΣ}: γεμίζουν μόνες τους.</p>
  </div>`;
}

// Πίνακας 2, 3…: τα ίδια «ποιοι μπαίνουν» για αυτόν, για τη μέρα του εντύπου, χωρίς τυχαίους (η κλήρωση είναι του πρώτου)
function SubPick({ r, t, n, d, set }: P) {
  const { state } = useStore();
  const tr = useMemo(() => ({ ...r, id: t.id, kind: t.kind, pick: subPick(t.pick), sort: t.sort, more: undefined }), [r, t]);
  const p = useMemo(() => ({ pool: candidates(state, tr, d), rows: rowsOf(state, tr, d), random: false, manual: false, recent: 0 }), [state, tr, d]);
  const upd = (x: Partial<Report>) => set({ ...t, ...(x.pick ? { pick: x.pick } : {}), ...(x.sort ? { sort: x.sort } : {}) });
  return html`<div className="stack">
    <p className="note" style=${{ margin: 0 }}>Πίνακας ${n}${t.title ? ' «' + t.title + '»' : ''} (${kindLbl(t.kind).toLowerCase()}): για την ίδια μέρα με τον πρώτο. Μπαίνουν όλοι όσοι περνούν τα φίλτρα ή οι πρώτοι Ν· τυχαίοι μόνο στον πρώτο πίνακα.${r.split && r.split !== 'none' && t.kind !== 'cadre' ? ' Με χωριστά φύλλα ανά ομάδα, ο καθένας μπαίνει στο φύλλο της ομάδας του.' : ''}</p>
    <${StepPick} r=${tr} upd=${upd} p=${p} sub=${true}/></div>`;
}

// Ποιοι μπαίνουν στο «Κενό»: κανείς, οι γραμμές είναι αυτές που γράφεις στο βήμα 3· μένει μόνο η μέρα (ημερομηνία, πίνακες τιμών)
function StepBlank({ r, upd }: P) {
  return html`<div className="stack">
    <${Alert} tone="info">Το «Κενό» δεν παίρνει άτομα: οι ${blankN(r.pick.n)} γραμμές του πίνακα είναι αυτές που ορίζεις και γράφεις στο βήμα 3.<//>
    <div className="field"><span className="field__label">Για ποια μέρα</span><${Segmented} small=${true} value=${r.day} onChange=${(day: Report['day']) => upd({ day })} items=${[{ value: 'today', label: 'Σήμερα' }, { value: 'tomorrow', label: 'Αύριο' }, { value: 'ask', label: 'Ρώτα κάθε φορά' }]}/></div>
  </div>`;
}

// Ποιοι μπαίνουν: από πού, φίλτρα, πόσοι (όλοι, οι πρώτοι, τυχαίοι), σειρά, μέρα· sub: πίνακας 2, 3… (χωρίς μέρα και τυχαίους)
function StepPick({ r, upd, p, sub }: P) {
  const { state } = useStore();
  const pk: RepPick = r.pick; const set = (x: Partial<RepPick>) => upd({ pick: { ...pk, ...x } });
  const people = r.kind === 'people' || r.kind === 'weapon'; const status = r.kind === 'status'; const linked = isLinked(r.kind); const soldiers = r.kind !== 'cadre';
  const duty = r.kind === 'duty'; const wmove = r.kind === 'wmove'; const counted = !duty && !wmove;
  const blockList = (blocksOf(state.settings) || state.settings.blocks).filter(b => !b.hidden);
  const views = state.settings.views || [];
  // στρατιώτες: βάση (σε δύναμη / εκτός δύναμης / λίστα) και φίλτρα που συνδυάζονται· στελέχη: όλα ή παρόντα
  const fromVal = pk.view ? 'v:' + pk.view : people ? (pk.from === 'inactive' ? 'inactive' : 'all') : pk.from;
  const setFrom = (v: string) => {
    if (!people) { set(v.startsWith('v:') ? { from: 'all', view: v.slice(2) } : { from: v as RepPick['from'], view: undefined }); return; }
    const kept = setCond(pk, 'present', condVal(pk, 'present'));   // τα παλιά πεδία γίνονται φίλτρα
    upd({ pick: v.startsWith('v:') ? { ...kept, from: 'all', view: v.slice(2) } : { ...kept, from: v === 'inactive' ? 'inactive' : 'all', view: undefined } });
  };
  const nPass = p.pool.length;
  // τυχαίοι: από προεπιλογή μόνο όσοι είναι παρόντες χωρίς υπηρεσία σήμερα και αύριο (μπορείς να το αλλάξεις)
  const noConds = () => { const c = condsOf(pk); return !c.need.length && !c.not.length; };
  const setMode = (mode: RepPick['mode']) => set(mode === 'random' && pk.mode !== 'random' && people && pk.from === 'all' && !pk.view && noConds() ? { ...defaultPick('random'), n: pk.n || 10, si: pk.si, rooms: pk.rooms } : { mode, n: mode === 'all' ? pk.n : pk.n || 10 });
  const toggle = <T,>(list: T[] | undefined, x: T) => { const s = new Set(list || []); if (s.has(x)) s.delete(x); else s.add(x); return [...s]; };
  return html`<div className="rep-pick">
    <div className="stack">
      ${status && html`<div><span className="field__label">Ποιες καταστάσεις</span><div className="rep-chips">${ST_CATS.map(c => html`<button key=${c.id} type="button" className="ui-chip ui-chip--sm" aria-pressed=${(pk.cats || []).includes(c.id)} onClick=${() => { const cats = toggle<StCat>(pk.cats, c.id); if (cats.length) set({ cats }); }}>${c.label}</button>`)}</div></div>`}
      ${status && html`<div className="rep-opts"><span className="field__label">Ποιες μπαίνουν</span><${Segmented} small=${true} value=${pk.when || 'on'} onChange=${(when: RepPick['when']) => set({ when })} items=${[{ value: 'on', label: 'Όσες ισχύουν τη μέρα' }, { value: 'from', label: 'Από τη μέρα και μετά' }, { value: 'new', label: 'Μόνο όσες ξεκινούν τη μέρα' }]}/></div>`}
      ${duty && html`<div><span className="field__label">Ποιες υπηρεσίες <small className="muted">(καμία = όλες)</small></span><div className="rep-chips">${blockList.map(b => html`<button key=${b.id} type="button" className="ui-chip ui-chip--sm" aria-pressed=${!!pk.blocks?.includes(b.id)} onClick=${() => set({ blocks: toggle(pk.blocks, b.id) })}>${b.name}</button>`)}</div></div>`}
      ${duty && html`<label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${!!pk.empty} onChange=${(e: any) => set({ empty: e.target.checked })}/>Και οι θέσεις που δεν έχουν κανέναν (όχι με φίλτρο θαλάμου ή Σ.Ι.)</label>`}
      ${wmove && html`<label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${!!pk.open} onChange=${(e: any) => set({ open: e.target.checked })}/>Μόνο όσα όπλα είναι ακόμα έξω</label>`}
      ${r.kind === 'weapon' && html`<div className="field"><label className="field__label" htmlFor="p-wf">Ποια όπλα</label><${Select} id="p-wf" className="ui-select" value=${pk.wf || 'with'} onChange=${(e: any) => set({ wf: e.target.value })}>${WEAPON_FILTERS.map(([k, l, , help]) => html`<option key=${k} value=${k} title=${help}>${l}</option>`)}<//></div>`}
      <div className="field-row">
        ${linked ? html`<div className="field"><label className="field__label" htmlFor="p-from">Στρατιώτες</label><${Select} id="p-from" className="ui-select" value=${pk.view ? 'v:' + pk.view : 'all'} onChange=${(e: any) => setFrom(e.target.value)}>
          <option value="all">Όλοι σε δύναμη</option>${views.map(v => html`<option key=${v.id} value=${'v:' + v.id}>Λίστα: ${v.name}</option>`)}<//></div>`
        : people ? html`<div className="field"><label className="field__label" htmlFor="p-from">Από</label><${Select} id="p-from" className="ui-select" value=${fromVal} onChange=${(e: any) => setFrom(e.target.value)}>
          <option value="all">Όλοι σε δύναμη</option><option value="inactive">Εκτός δύναμης</option>
          ${views.map(v => html`<option key=${v.id} value=${'v:' + v.id}>Λίστα: ${v.name}</option>`)}<//></div>`
        : html`<div className="field"><label className="field__label" htmlFor="p-from">Από</label><${Select} id="p-from" className="ui-select" value=${fromVal} onChange=${(e: any) => setFrom(e.target.value)}>
          <option value="all">Όλα τα στελέχη</option><option value="present">Παρόντα τη μέρα (χωρίς κατάσταση)</option><//></div>`}
        ${!sub && html`<div className="field"><span className="field__label">Για ποια μέρα</span><${Segmented} small=${true} value=${r.day} onChange=${(day: Report['day']) => upd({ day })} items=${[{ value: 'today', label: 'Σήμερα' }, { value: 'tomorrow', label: 'Αύριο' }, { value: 'ask', label: 'Ρώτα κάθε φορά' }]}/></div>`}
      </div>
      ${people && html`<div><span className="field__label">Φίλτρα <small className="muted">(συνδυάζονται: μπαίνουν όσοι περνούν όλα · τώρα ${nPass})</small></span>
        <div className="rep-conds">${REP_CONDS.map(c => html`<${Fragment} key=${c.id}><span>${c.label}</span><${Segmented} small=${true} value=${condVal(pk, c.id)} onChange=${(v: 'any' | 'yes' | 'no') => upd({ pick: setCond(pk, c.id, v) })} items=${[{ value: 'any', label: 'Όλοι' }, { value: 'yes', label: c.yes }, { value: 'no', label: c.no }]}/><//>`)}</div></div>`}
      ${soldiers && html`<div><span className="field__label">Θάλαμοι <small className="muted">(κανένας = όλοι)</small></span><div className="rep-chips">${roomList(state).map(n => html`<button key=${n} type="button" className="ui-chip ui-chip--sm" aria-pressed=${!!pk.rooms?.includes(n)} onClick=${() => set({ rooms: toggle(pk.rooms, n) })}>Θ${n}</button>`)}</div></div>`}
      ${soldiers && html`<div><span className="field__label">Σ.Ι. <small className="muted">(κανένα = όλα)</small></span><div className="rep-chips">${siCombos(state.settings.lists?.si).map(s => html`<button key=${s} type="button" className="ui-chip ui-chip--sm" aria-pressed=${!!pk.si?.includes(s)} onClick=${() => set({ si: toggle(pk.si, s) })}>${s}</button>`)}</div></div>`}
      ${people && html`<div className="field-row">
        <div className="field"><label className="field__label" htmlFor="p-always">Πάντα μέσα <small className="muted">(ό,τι κι αν λένε τα φίλτρα)</small></label><${PersonPicker} id="p-always" multiple=${true} value=${pk.always || []} onChange=${(always: number[]) => set({ always, never: (pk.never || []).filter(x => !always.includes(x)) })}/></div>
        <div className="field"><label className="field__label" htmlFor="p-never">Ποτέ σε αυτό το έντυπο</label><${PersonPicker} id="p-never" multiple=${true} value=${pk.never || []} onChange=${(never: number[]) => set({ never, always: (pk.always || []).filter(x => !never.includes(x)) })}/></div>
      </div>`}
      ${counted && html`<div className="rep-opts"><span className="field__label">Πόσοι</span><${Segmented} small=${true} value=${pk.mode} onChange=${setMode} items=${[{ value: 'all', label: 'Όλοι' }, { value: 'first', label: 'Οι πρώτοι Ν' }, ...(sub ? [] : [{ value: 'random', label: 'Ν τυχαίοι' }])]}/>
        ${pk.mode !== 'all' && html`<input type="number" min="1" className="ui-input rep-n" aria-label="Πόσοι" value=${pk.n || 10} onChange=${(e: any) => set({ n: Math.max(1, +e.target.value || 1) })}/>`}
        ${pk.mode === 'random' && soldiers && html`<label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${!!pk.even} onChange=${(e: any) => set({ even: e.target.checked })}/>Ισομερώς από κάθε θάλαμο</label>`}</div>`}
      ${pk.mode === 'random' && html`<label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${!!pk.fair} onChange=${(e: any) => set({ fair: e.target.checked })}/>Πρώτα όσοι βγήκαν λιγότερες φορές σε αυτό το έντυπο (η μέτρηση ξεκινά από την αρχή με τη Νέα ΕΣΣΟ)</label>`}
      ${pk.mode === 'random' && html`<div className="rep-inline"><label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${!!pk.gap} onChange=${(e: any) => set({ gap: e.target.checked ? 1 : undefined })}/>Όχι όσοι βγήκαν σε αυτό το έντυπο τις τελευταίες</label>
        <input type="number" min="1" max="30" className="ui-input rep-n" aria-label="Μέρες" disabled=${!pk.gap} value=${pk.gap || 1} onChange=${(e: any) => set({ gap: Math.min(30, Math.max(1, +e.target.value || 1)) })}/><span>${(pk.gap || 1) === 1 ? 'μέρα' : 'μέρες'}</span></div>`}
      ${pk.mode === 'random' && html`<${Alert} tone="info"><b>Πώς δουλεύει η κλήρωση.</b> Δεξιά είναι μια κλήρωση: με ⟳ δίπλα σε κάποιον μπαίνει άλλος τυχαίος, με ✕ τον βγάζεις, με «Βάλε συγκεκριμένο» βάζεις όποιον θέλεις, με «⟳ Ξανά τυχαία» αλλάζουν όλοι. Αν αλλάξεις φίλτρα ή πόσοι, μένουν όσοι περνούν ακόμα. <b>Αυτοί ακριβώς</b> βγαίνουν αν πατήσεις «Αποθήκευση και Βγάλε». Τις επόμενες φορές, από το «Βγάλε…» στη λίστα, γίνεται νέα κλήρωση και τη βλέπεις (και την αλλάζεις) πριν βγει.<//>`}
      <div className="rep-opts"><span className="field__label">Σειρά στο έντυπο</span><${Segmented} small=${true} value=${r.sort} onChange=${(sort: RepSort) => upd({ sort })} items=${sortsOf(r.kind)}/></div>
    </div>
    <${PickList} p=${p} kind=${r.kind} onNever=${(id: number) => set({ never: [...(pk.never || []), id], always: (pk.always || []).filter(x => x !== id) })}/>
  </div>`;
}

// Πού βγαίνει: όνομα, ένα για όλους ή ανά ομάδα (και στην εκτύπωση), τι γίνεται με το «Βγάλε», και σε απλά λόγια τι θα γίνει
const OUTS: { v: string; t: string; h: string }[] = [
  { v: 'file', t: 'Νέο αρχείο Excel', h: 'Φτιάχνεται ένα αρχείο στον φάκελο των Excel και ανοίγει.' },
  { v: 'print', t: 'Μόνο εκτύπωση', h: 'Ανοίγει κατευθείαν η προεπισκόπηση εκτύπωσης (το αρχείο μένει κι αυτό στον φάκελο).' },
  { v: 'people', t: 'Φύλλο στο Δυναμολόγιο', h: 'Γράφεται ως φύλλο μέσα στο Excel του Δυναμολογίου. Ξαναγράφεται μόνο αυτό το φύλλο.' },
  { v: 'other', t: 'Φύλλο σε άλλο Excel…', h: 'Όπως το προηγούμενο, σε ένα Excel που διαλέγεις.' }
];
function StepOut({ r, upd, mode, insp, rows, d }: P) {
  const { state } = useStore();
  const t = r.target || { to: 'people', sheet: '' };
  const setT = (x: Partial<NonNullable<Report['target']>>) => upd({ target: { ...t, ...x } });
  const sheet = r.out === 'sheet'; const random = r.pick.mode === 'random';
  const outVal = sheet ? (t.to === 'file' ? 'other' : 'people') : r.out;
  const setOut = async (v: string) => {
    if (v === 'other') { const f = t.file || await window.api.repPickFile(); if (!f) return; upd({ out: 'sheet', target: { ...t, to: 'file', file: f } }); return; }
    if (v === 'people') { upd({ out: 'sheet', target: { ...t, to: 'people' } }); return; }
    upd({ out: v as Report['out'] });
  };
  const canSplit = splitOk(r.kind);
  const split = canSplit && !!r.split && r.split !== 'none';
  const plan = outPlan(state, r, rows, d);
  const extra = useMemo(() => moreRows(state, r, d), [state, r.more, d]);   // eslint-disable-line react-hooks/exhaustive-deps
  const noRoster = sheet && t.to !== 'file' && !state.settings.sources?.people?.file;
  return html`<div className="stack">
    <div className="field"><label className="field__label" htmlFor="o-name">Όνομα εντύπου</label><input id="o-name" className="ui-input" data-autofocus="" placeholder="π.χ. Αγγαρεία μαγειρείων" value=${r.name} onChange=${(e: any) => upd({ name: e.target.value })}/>
      <span className="field__help">Έτσι το βρίσκεις στη λίστα και στην αναζήτηση (Ctrl+K).</span></div>
    ${canSplit && html`<div className="field"><span className="field__label">Ένα έντυπο για όλους ή χωριστό ανά ομάδα;</span><${Segmented} small=${true} value=${r.split || 'none'} onChange=${(sp: RepSplit) => upd({ split: sp })} items=${SPLITS}/>
      <span className="field__help">${split ? 'Ένα ' + (r.out === 'print' ? 'φύλλο (και σελίδα στην εκτύπωση)' : 'φύλλο') + ' για κάθε ' + SPLIT_NOUN[r.split as RepSplit][0] + ', με το ίδιο πρότυπο. Βάλε {ΟΜΑΔΑ} σε ένα κελί του προτύπου για να γράφεται εκεί π.χ. «' + (r.split === 'room' ? 'ΘΑΛΑΜΟΣ 3' : r.split === 'unit' ? 'ΟΥΛΑΜΟΣ Α' : 'Ι1') + '».' : 'Όλοι σε ένα φύλλο.'}</span></div>`}
    <div className="field"><span className="field__label">Όταν πατάς «Βγάλε»</span><div className="rep-outs" role="radiogroup">
      ${OUTS.map(o => html`<label key=${o.v} className="rep-out"><input type="radio" name="rep-out" className="ui-check" checked=${outVal === o.v} onChange=${() => setOut(o.v)}/><span><b>${o.t}</b><small>${o.h}</small></span></label>`)}</div></div>
    ${sheet && html`<div className="field-row">
      <div className="field"><label className="field__label" htmlFor="o-sheet">Όνομα φύλλου</label><input id="o-sheet" className="ui-input" maxLength=${31} placeholder=${(r.name || 'ΕΝΤΥΠΟ').toUpperCase()} value=${t.sheet} onChange=${(e: any) => setT({ sheet: e.target.value })}/>
        <span className="field__help">Αν υπάρχει ήδη φύλλο με αυτό το όνομα που δεν το έφτιαξε το έντυπο, θα σε ρωτήσει πριν γράψει από πάνω.</span></div>
      ${t.to === 'file' && html`<div className="field" style=${{ flex: 'none' }}><span className="field__label">Αρχείο</span><${Button} variant="outline" onClick=${async () => { const f = await window.api.repPickFile(); if (f) setT({ file: f }); }}>${fileName(t.file) || 'Διάλεξε…'}<//></div>`}
    </div>`}
    ${sheet && html`<label className="ui-checkrow"><input type="checkbox" className="ui-check" disabled=${random} checked=${!!t.auto && !random} onChange=${(e: any) => setT({ auto: e.target.checked })}/>Ενημερώνεται μόνο του μετά από κάθε αλλαγή${random ? ' (όχι με τυχαίους: θα άλλαζαν κάθε φορά)' : ''}</label>`}
    ${mode === 'upload' && insp && insp.prepared > 1 && html`<label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${!!r.trim} onChange=${(e: any) => upd({ trim: e.target.checked })}/>Σβήσε τις κενές γραμμές του προτύπου που περισσεύουν (έχει ${insp.prepared})</label>`}
    <label className="ui-checkrow"><input type="checkbox" className="ui-check" disabled=${!dailyOk(r)} checked=${!!r.daily && dailyOk(r)} onChange=${(e: any) => upd({ daily: e.target.checked })}/>Βγαίνει και από τα «Έντυπα ημέρας» (Σήμερα), μαζί με ΦΡΟΥΡΑ, ΗΚΑΙ και Εξοδούχους${dailyOk(r) ? '' : ' (όχι με τυχαίους ή «Ρώτα κάθε φορά»)'}</label>
    ${noRoster && html`<${Alert} tone="warn">Δεν έχει οριστεί Δυναμολόγιο: όρισέ το στα Αρχεία Excel ή διάλεξε «Φύλλο σε άλλο Excel…».<//>`}
    <${Alert} tone="info"><b>Τι θα γίνει με «Αποθήκευση και Βγάλε»</b><ul className="rep-plan">
      <li>${extra.length ? 'Πίνακας 1: ' : ''}${rows.length} ${rowNoun(r.kind)}, για ${r.day === 'tomorrow' ? 'αύριο' : r.day === 'ask' ? 'τη μέρα που θα διαλέξεις' : 'σήμερα'}${random ? ': ακριβώς αυτοί της κλήρωσης στο βήμα 4' : ''}.</li>
      ${(r.more || []).map((t: RepTable, i: number) => html`<li key=${t.id}>Πίνακας ${i + 2}${t.title ? ' «' + t.title + '»' : ''}: ${extra[i]?.length || 0} ${rowNoun(t.kind)}.</li>`)}
      <li>${plan.text}</li>
      ${random && html`<li>Μετά, κάθε «Βγάλε…» από τη λίστα κάνει νέα κλήρωση και σου τη δείχνει πριν βγει.</li>`}
    </ul><//>
  </div>`;
}
