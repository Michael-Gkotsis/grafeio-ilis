// features/guard › «Εξαιρέσεις» (Michael, 24/10): εφάπαξ εξαίρεση ενός ατόμου από τις υπηρεσίες, από–έως, με προαιρετική
// αιτιολογία (π.χ. «μην μπει ΣΚ γιατί έχει γάμο»). Δουλεύει όπως οι μέρες χωρίς υπηρεσία: η αυτόματη συμπλήρωση τον προσπερνά
// εκείνες τις μέρες, με το χέρι μπαίνει μόνο με αιτία. Το «πριν ή μετά» βγαίνει μόνο του από τη σειρά δικαιοσύνης.
import { useMemo, useState } from 'react';
import { html, cx, Badge, Button, useToast } from '../ui';
import { useStore } from '../store';
import { DateField, PersonPicker } from '../common';
import { shortName, type Person, type Skip } from '../../shared/domain';
import { statOf } from '../../shared/rules';
import { daysBetween, dm, dow, dayName, weekendFrom, type ISODate } from '../../shared/dates';

type Item = { p: Person; k: Skip };
const when = (k: Skip) => dow(k.from) + ' ' + dm(k.from) + (k.to > k.from ? ' → ' + dow(k.to) + ' ' + dm(k.to) : '');
const nDays = (k: Skip) => daysBetween(k.from, k.to);

export function SkipsView({ onPerson }: { onPerson?: (pid: number) => void }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast();
  const [pid, setPid] = useState<number | null>(null);
  const [from, setFrom] = useState<ISODate>(today); const [to, setTo] = useState<ISODate>(today); const [touched, setTouched] = useState(false);
  const [why, setWhy] = useState(''); const [edit, setEdit] = useState<string | null>(null);
  const pm = useMemo(() => new Map(state.people.map(p => [p.id, p])), [state.people]);
  const items = useMemo<Item[]>(() => state.people.flatMap(p => (p.skips || []).map(k => ({ p, k }))).sort((a, b) => (a.k.from < b.k.from ? -1 : a.k.from > b.k.from ? 1 : shortName(a.p).localeCompare(shortName(b.p), 'el'))), [state.people]);
  const now = items.filter(x => x.k.from <= today && today <= x.k.to), next = items.filter(x => x.k.from > today), past = items.filter(x => x.k.to < today).reverse();
  const reset = () => { setPid(null); setFrom(today); setTo(today); setTouched(false); setWhy(''); setEdit(null); };
  const p = pid != null ? pm.get(pid) : undefined;
  const missing = !p ? 'Διάλεξε ποιος' : null;
  const quick = (next: boolean) => { const [f, t] = weekendFrom(today, next); setFrom(f); setTo(t); setTouched(true); };
  const save = async () => {
    if (!p) return;
    const r = await run({ t: 'setSkip', pid: p.id, id: edit || undefined, from, to, why }, false);
    if (r) { toast({ text: (edit ? 'Άλλαξε η εξαίρεση: ' : 'Εξαίρεση από υπηρεσίες: ') + shortName(p) + ' ' + when({ id: '', from, to }) + '. Η αυτόματη συμπλήρωση τον προσπερνά εκείνες τις μέρες.', actions: [undoMark()] }); reset(); }
  };
  const change = (x: Item) => { setPid(x.p.id); setFrom(x.k.from); setTo(x.k.to); setTouched(true); setWhy(x.k.why || ''); setEdit(x.k.id); };
  const del = async (x: Item) => { if (await run({ t: 'delSkip', pid: x.p.id, id: x.k.id }, false)) { if (edit === x.k.id) reset(); toast({ text: 'Σβήστηκε η εξαίρεση: ' + shortName(x.p), actions: [undoMark()] }); } };
  const group = (title: string, list: Item[], tone: string) => list.length > 0 && html`<section className="skips__grp"><h3 className="minihd">${title} (${list.length})</h3>
    <div className="skips__list">${list.map(x => {
      const last = statOf(state, x.p.id).last;
      return html`<div key=${x.k.id} className=${cx('skips__row', edit === x.k.id && 'is-edit')}>
        <span className="skips__who"><button type="button" className="linkish" onClick=${() => onPerson?.(x.p.id)} data-tip="Πάτα: «Ποιος κάνει τι»"><b>${shortName(x.p)}</b></button>
          <small>${x.p.room != null ? 'Θ' + x.p.room : ''}${last ? (x.p.room != null ? ' · ' : '') + 'τελευταία υπηρεσία ' + dm(last) : ''}</small></span>
        <span className="skips__when num">${when(x.k)}<small>${nDays(x.k)} ${nDays(x.k) === 1 ? 'μέρα' : 'μέρες'}</small></span>
        <span className="skips__why">${x.k.why || html`<span className="muted">—</span>`}</span>
        <span className="skips__act"><${Badge} tone=${tone}>${tone === 'warn' ? 'ισχύει' : tone === 'info' ? (daysBetween(today, x.k.from) <= 2 ? 'αύριο' : 'σε ' + (daysBetween(today, x.k.from) - 1) + ' μέρες') : 'πέρασε'}<//>
          <${Button} variant="ghost" size="sm" onClick=${() => change(x)}>Αλλαγή<//><${Button} variant="ghost" size="sm" aria-label=${'Σβήσιμο εξαίρεσης ' + shortName(x.p)} onClick=${() => del(x)}>Σβήσιμο<//></span>
      </div>`;
    })}</div></section>`;
  return html`<div className="skips">
    <p className="skips__lead">Μία φορά εξαίρεση από τις υπηρεσίες, από–έως. Η αυτόματη συμπλήρωση και ο «Επόμενος» τον προσπερνούν εκείνες τις μέρες· με το χέρι μπαίνει μόνο με αιτία. Η σειρά δικαιοσύνης δεν αλλάζει: όταν τελειώσει, έρχεται η σειρά του με βάση τις μέρες από την τελευταία του υπηρεσία. Παραμένει παρών (ΗΚΑΙ, Δύναμη).</p>
    <div className="skips__form" role="group" aria-label=${edit ? 'Αλλαγή εξαίρεσης' : 'Νέα εξαίρεση'}>
      <div className="field skips__f-who"><label className="field__label" htmlFor="sk-who">Ποιος</label>
        ${p ? html`<span className="picker__chip skips__chosen">${shortName(p)}<button type="button" aria-label="Άλλαξε άτομο" onClick=${() => setPid(null)}>✕</button></span>`
          : html`<${PersonPicker} id="sk-who" value=${pid} onChange=${(id: number) => setPid(id)} date=${from}/>`}</div>
      <div className="field"><label className="field__label" htmlFor="sk-from">Από</label><${DateField} id="sk-from" className="ui-input" value=${from} onChange=${(e: any) => { const f = e.target.value; if (!f) return; setFrom(f); if (!touched || to < f) setTo(f); }}/><span className="field__help">${dayName(from, today)}</span></div>
      <div className="field"><label className="field__label" htmlFor="sk-to">Έως (μετρά κι αυτή)</label><${DateField} id="sk-to" className="ui-input" min=${from} value=${to} onChange=${(e: any) => { const t = e.target.value; if (t) { setTo(t < from ? from : t); setTouched(true); } }}/><span className="field__help">${dayName(to, today)} · ${daysBetween(from, to)} ${daysBetween(from, to) === 1 ? 'μέρα' : 'μέρες'}</span></div>
      <div className="field skips__f-why"><label className="field__label" htmlFor="sk-why">Αιτιολογία (προαιρετική)</label><input id="sk-why" className="ui-input" placeholder="π.χ. γάμος αδελφού" value=${why} onChange=${(e: any) => setWhy(e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter' && p) save(); }}/></div>
      <div className="skips__f-btn"><${Button} onClick=${save} disabled=${!!missing} why=${missing}>${edit ? 'Αποθήκευση' : '+ Πρόσθεσε'}<//>${edit && html`<${Button} variant="ghost" onClick=${reset}>Άκυρο<//>`}</div>
    </div>
    <div className="skips__quick"><span>Γρήγορα:</span><button type="button" className="ui-chip" onClick=${() => quick(false)}>Αυτό το ΣΚ</button><button type="button" className="ui-chip" onClick=${() => quick(true)}>Επόμενο ΣΚ</button></div>
    ${items.length === 0 && html`<p className="skips__empty">Καμία εξαίρεση ακόμη. Διάλεξε ποιος, από ποια μέρα ως ποια, και πάτα «Πρόσθεσε».</p>`}
    ${group('Ισχύουν τώρα', now, 'warn')}${group('Επόμενες', next, 'info')}${group('Παλιότερες', past, '')}
  </div>`;
}
