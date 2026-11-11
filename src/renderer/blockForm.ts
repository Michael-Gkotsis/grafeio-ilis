// Η φόρμα μιας υπηρεσίας (Michael, 4/11): ίδια για «Νέα υπηρεσία» και «Επεξεργασία». Όνομα · Νούμερα · Άτομα σε κάθε νούμερο ·
// Ώρες · Ένοπλη και Όπλο · Ενεργή · Κωδικοί. Το σχήμα (νούμερα × άτομα) βγαίνει από την reshapeBlock, όπως θα αποθηκευτεί.
import { useMemo, useState } from 'react';
import { html, Alert } from './ui';
import { Select } from './select';
import { useStore } from './store';
import { HoursField, RangeField, shiftForm, shiftOf, shiftWhy, GoLink, type HoursMode, type ShiftForm } from './common';
import { codeErrors } from '../shared/codes';
import { normTime } from '../shared/hours';
import { MAX_NUMS, MAX_PER, blockGroups, blockShape, blocksOf, dutyStartOf, everyBlock, reshapeBlock, withBlocks, type BlockDef, type Phase, type ShiftDef } from '../shared/domain';

type P = any;
const GR = [...'αβγδεζηθικ'];
// Κουτιά του template ΦΡΟΥΡΑ ανά είδος: πέρα από αυτά ο πίνακας μεγαλώνει προς τα κάτω (exports.ts extendFroura)
export const TPL_BOXES: Record<string, number> = { th: 4, op: 4, mg: 5, sk: 2, tae: 1 };
export interface BlockF { name: string; nums: number; per: number; armed: boolean; weapon: 'own' | 'post'; active: boolean; mode: HoursMode; sh: ShiftForm; hrs: string[]; codes: Record<string, string> }
const real = (h?: string) => (h && h !== 'ημέρα' ? h : '');
const clamp = (v: number, max: number) => Math.max(1, Math.min(max, Math.floor(v) || 1));
const isSk = (b?: BlockDef) => !!b && b.kind === 'sk' && !b.custom;

export function useBlockForm(b: BlockDef | undefined, phase: Phase) {
  const { state } = useStore(); const st = state.settings; const start = dutyStartOf(st);
  const rotB = !!b && b.posts.some(p => p.rot != null);
  const [f, setF] = useState<BlockF>(() => {
    if (!b) return { name: '', nums: 1, per: 1, armed: false, weapon: 'own', active: true, mode: 'day', sh: shiftForm(), hrs: [''], codes: {} };
    const sh = blockShape(b); const hrs = blockGroups(b.posts).map(g => (g[0].rot == null ? real(g[0].hrs) : ''));
    return { name: b.name, nums: sh.nums, per: sh.per, armed: b.armed, weapon: b.armWeapon === 'post' ? 'post' : 'own', active: !b.hidden, mode: rotB || b.shift ? 'shift' : hrs.some(Boolean) ? 'fixed' : 'day', sh: shiftForm(b), hrs, codes: Object.fromEntries(b.posts.map(x => [x.k, x.code || ''])) };
  });
  const set = (patch: Partial<BlockF>) => setF(x => ({ ...x, ...patch }));
  const used = useMemo(() => new Set(everyBlock(st).flatMap(x => x.posts.map(p => p.k))), [st]);
  const seed: BlockDef = b || { id: 'new', kind: 'other', name: '', armed: false, custom: true, posts: [{ k: 'new_1', label: '', short: '', hrs: 'ημέρα' }] };
  const posts = useMemo(() => reshapeBlock(seed, f.nums, f.per, f.name.trim() || seed.name || 'Νέα', used), [b, f.nums, f.per, f.name, used]);
  const shown = posts.filter(p => !p.hidden);
  // λάθη στους κωδικούς αυτής της υπηρεσίας όπως θα ήταν μετά την αποθήκευση (ίδιος κωδικός αλλού, σκέτο γράμμα…): εμποδίζουν την
  // αποθήκευση. Λάθη σε άλλες υπηρεσίες μόνο φαίνονται. Νέα μέλη χωρίς κωδικό παίρνουν μόνα τους (προσωρινός κωδικός στον έλεγχο).
  const [errs, others] = useMemo(() => {
    if (!b) return [[] as string[], [] as string[]];
    const ps = posts.map((p, i) => ({ ...p, code: (f.codes[p.k] || '').trim() || p.code || 'ΧΧ' + (i + 1) }));
    const list = blocksOf(st, phase).map(x => (x.id === b.id ? { ...x, posts: ps } : x));
    const t = withBlocks(st, phase, list); const mine = codeErrors(t, { phase, id: b.id });
    return [mine, codeErrors(t).filter(x => !mine.includes(x))];
  }, [f.codes, posts, st, phase, b]);
  const sk = isSk(b); const first = sk ? +(/\d+/.exec(b!.posts[0]?.short || '')?.[0] || 3) : 1;
  // νούμερα: 1ος, 2ος… (σκοποί: 3η, 4η σκοπιά)
  const nums = Array.from({ length: f.nums }, (_, i) => (sk ? first + i + 'η' : i + 1 + 'ος'));
  const labels = nums.map(x => x + (f.per > 1 ? ' (' + GR.slice(0, f.per).join(' + ') + ')' : ''));
  const shiftOut = (): ShiftDef | null => (f.mode !== 'shift' ? null : rotB && !f.sh.own && f.sh.every === 120 && !normTime(f.sh.from) && !normTime(f.sh.to) ? null : shiftOf(f.sh));
  const why = !f.name.trim() ? 'Λείπει: Όνομα' : errs[0] || (f.mode === 'shift' ? shiftWhy(f.sh) : '');
  // οι ώρες ανά νούμερο: όσα νούμερα δεν έχουν δικές τους παίρνουν του 1ου
  const hrsNum = f.mode === 'day' ? Array.from({ length: MAX_NUMS }, () => '') : f.mode === 'fixed' ? Array.from({ length: f.nums }, (_, i) => f.hrs[i] ?? f.hrs[0] ?? '') : undefined;
  const cmd = () => (b
    ? { t: 'editBlock' as const, phase, id: b.id, name: f.name, nums: f.nums, per: f.per, hrs: {}, ...(hrsNum ? { hrsNum } : {}), codes: f.codes, shift: shiftOut(), armed: f.armed, armWeapon: f.weapon, hidden: !f.active }
    : { t: 'addBlock' as const, phase, name: f.name, kind: 'other' as const, armed: f.armed, n: f.nums, per: f.per, hrs: f.mode === 'fixed' ? f.hrs[0] || '' : '', off: !f.active, shift: f.mode === 'shift' ? shiftOf(f.sh) : null, armWeapon: f.weapon });
  return { b, phase, f, set, posts, shown, errs, others, labels, nums, rotB, start, why, cmd };
}

export function BlockForm({ form, id }: { form: ReturnType<typeof useBlockForm>; id: string }) {
  const { b, f, set, shown, errs, others, labels, nums, rotB, start } = form;
  const ly = b?.kind === 'ly';
  const total = f.nums * f.per; const boxes = b && !b.custom ? TPL_BOXES[b.kind] : undefined;
  const th = b ? b.name.toUpperCase() : '';
  const codes = html`<div className="field"><span className="field__label">Κωδικός στον έλεγχο υπηρεσιών</span><div className="settings-grid">${shown.map((x: P) => html`<label key=${x.k} className="field"><span className="field__help">${x.label}</span><input className="ui-input" maxLength="8" value=${f.codes[x.k] ?? ''} placeholder="αυτόματα" onChange=${(e: any) => set({ codes: { ...f.codes, [x.k]: e.target.value } })}/></label>`)}</div>
      <span className="field__help">Αυτό γράφεται στο κελί της μέρας (π.χ. Θ1α) και έτσι διαβάζεται πίσω. Το σκέτο γράμμα (Θ, Μ, Σ) σημαίνει υπηρεσία χωρίς θέση. Νέες θέσεις παίρνουν μόνες τους κωδικό.</span>
      ${errs.map((t: string) => html`<${Alert} key=${t} tone="bad"><span>${t}</span><//>`)}
      ${others.length > 0 && html`<${Alert} tone="warn"><span>Σε άλλες υπηρεσίες (δεν εμποδίζει την αποθήκευση): ${others.join(' · ')}</span><//>`}</div>`;
  if (ly) return codes;
  return html`<div>
    <div className="field-row" style=${{ alignItems: 'flex-end' }}>
      <div className="field" style=${{ flex: '2 1 220px' }}><label className="field__label" htmlFor=${id + '-n'}>Όνομα *</label><input id=${id + '-n'} className="ui-input" data-autofocus="" placeholder="π.χ. Πύλη, Σκοπιά ΤΑΕ" value=${f.name} onChange=${(e: any) => set({ name: e.target.value })}/></div>
      <div className="field"><label className="field__label" htmlFor=${id + '-c'}>Νούμερα</label><input id=${id + '-c'} type="number" min="1" max=${MAX_NUMS} className="ui-input" value=${f.nums} onChange=${(e: any) => set({ nums: clamp(+e.target.value, MAX_NUMS) })}/><span className="field__help">1–${MAX_NUMS}</span></div>
      <div className="field"><label className="field__label" htmlFor=${id + '-p'}>Άτομα σε κάθε νούμερο</label><input id=${id + '-p'} type="number" min="1" max=${MAX_PER} className="ui-input" value=${f.per} onChange=${(e: any) => set({ per: clamp(+e.target.value, MAX_PER) })}/><span className="field__help">1 = ένας, 2 = ζεύγος… ως ${MAX_PER}</span></div></div>
    <div className="bfshape" aria-live="polite"><b>Θέσεις: ${f.nums} ${f.nums === 1 ? 'νούμερο' : 'νούμερα'} × ${f.per} ${f.per === 1 ? 'άτομο' : 'άτομα'} = ${total}</b>
      <div className="bfchips">${nums.map((x: string) => html`<span key=${x} className="bfchip"><b>${x}</b>${f.per > 1 ? ' ' + GR.slice(0, f.per).join(' · ') : ''}</span>`)}</div>
      ${f.per > 1 && html`<small>Τα άτομα του ίδιου νούμερου φυλάνε μαζί τις ίδιες ώρες (όπως οι σκοποί της ίδιας σκοπιάς). Ο καθένας μετρά μία υπηρεσία.</small>`}
      ${b && total < b.posts.filter((p: P) => !p.hidden).length ? html`<small>Όσες θέσεις φύγουν κρατούν το ιστορικό τους και δεν μπαίνουν πια στις Θέσεις.</small>` : null}</div>
    ${boxes != null && f.nums > boxes && html`<${Alert} tone="info"><span>Το έντυπο έχει κουτιά για <b>${boxes}</b> ${boxes === 1 ? 'νούμερο' : 'νούμερα'}. Ο πίνακας «${th}» στο Excel μεγαλώνει προς τα κάτω: το <b>${boxes + 1}ο</b>${f.nums > boxes + 1 ? ' και τα επόμενα μπαίνουν' : ' μπαίνει'} στον ίδιο πίνακα, με την ίδια διάταξη και αρίθμηση.</span><//>`}
    ${b && !b.custom && f.nums < (boxes || 0) && html`<${Alert} tone="info"><span>Με λιγότερα νούμερα τα τελευταία κουτιά του εντύπου μένουν κενά.</span><//>`}
    <${HoursField} id=${id} mode=${f.mode} setMode=${(mode: HoursMode) => set({ mode })} sh=${f.sh} setSh=${(sh: ShiftForm) => set({ sh })} labels=${labels} rot=${rotB} start=${start}
      fixed=${b ? html`<div className="settings-grid">${nums.map((x: string, i: number) => html`<div key=${i} className="field"><label className="field__help" htmlFor=${id + '-h' + i}>${labels[i]}</label><${RangeField} id=${id + '-h' + i} placeholder="π.χ. 07:30-08:00" value=${f.hrs[i] ?? f.hrs[0] ?? ''} onChange=${(e: any) => set({ hrs: Array.from({ length: Math.max(f.hrs.length, i + 1) }, (_, j) => (j === i ? e.target.value : f.hrs[j] ?? f.hrs[0] ?? '')) })}/></div>`)}</div>`
        : html`<${RangeField} id=${id + '-h'} aria-label="Ώρες" placeholder="π.χ. 08:00-20:00" value=${f.hrs[0] || ''} onChange=${(e: any) => set({ hrs: [e.target.value] })}/>`}/>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${f.armed} onChange=${(e: any) => set({ armed: e.target.checked })}/><span><b>Ένοπλη</b><small>Δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ, ούτε οι άοπλοι (Σ.Ι.). Ποια Σ.Ι. μπαίνουν σε κάθε υπηρεσία το ρυθμίζεις στις <${GoLink} view="templates" params=${{ tab: 'duty', dsub: 'si' }}>Ρυθμίσεις › Σ.Ι.<//></small></span></label>
    ${f.armed && html`<div className="field" style=${{ marginLeft: '28px', maxWidth: '260px' }}><label className="field__label" htmlFor=${id + '-w'}>Όπλο</label><${Select} id=${id + '-w'} className="ui-input" value=${f.weapon} data-tip="Δικό του: κάθε άτομο βγάζει το δικό του όπλο στο νούμερό του. Της θέσης: βγαίνει το όπλο του 1ου νούμερου και περνά από χέρι σε χέρι στις αλλαγές· τα όπλα των άλλων μένουν ΕΝΤΟΣ." onChange=${(e: any) => set({ weapon: e.target.value })}><option value="own">Δικό του</option><option value="post">Της θέσης</option><//></div>`}
    <label className="rule"><input type="checkbox" className="ui-check" checked=${f.active} onChange=${(e: any) => set({ active: e.target.checked })}/><span><b>Ενεργή</b><small>Ανενεργή δεν μπαίνει στις θέσεις, στην αυτόματη συμπλήρωση και στο έντυπο, ώσπου να την ενεργοποιήσεις στις <${GoLink} view="templates" params=${{ tab: 'duty', dsub: 'blocks' }}>Ρυθμίσεις › Υπηρεσίες<//>.</small></span></label>
    ${b && codes}
  </div>`;
}
