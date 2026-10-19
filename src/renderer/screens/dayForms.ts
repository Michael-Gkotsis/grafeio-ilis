// «Έντυπα ημέρας» (Σήμερα): η αυριανή ΦΡΟΥΡΑ, η σημερινή ΗΚΑΙ και οι σημερινοί Εξοδούχοι με έναν προέλεγχο για όλα,
// μετά «Βγάλε όλα» (ανοίγουν στο Excel) ή «Τύπωσε όλα» (μία προεπισκόπηση εκτύπωσης μετά την άλλη)
import { useMemo, useState } from 'react';
import { html, cx, Button, Dialog, Icon } from '../ui';
import { useNav, useStore } from '../store';
import { GO } from '../common';
import { preflight, type Check } from '../../shared/preflight';
import { HK } from '../../shared/unit';
import { dayName, dmy, type ISODate } from '../../shared/dates';
import type { ExportKind } from '../../shared/api';

type Item = { kind: ExportKind; date: ISODate; name: string; label: string };
type Done = { ok: boolean; text: string; file?: string };
export function DayFormsDialog({ onClose }: { onClose: () => void }) {
  const { state, today, tomorrow, sync } = useStore(); const nav = useNav();
  const items: Item[] = [
    { kind: 'froura', date: tomorrow, name: 'ΦΡΟΥΡΑ', label: 'η κατάσταση υπηρεσιών' },
    { kind: 'hkai', date: today, name: HK(), label: 'η ' + HK() },
    { kind: 'outs', date: today, name: 'Εξοδούχοι και παραμένοντες', label: 'οι εξοδούχοι' }
  ];
  const checks = useMemo(() => items.map(it => preflight(it.kind, state, it.date)), [state, today, tomorrow]);   // eslint-disable-line react-hooks/exhaustive-deps
  const bad = checks.map(cs => cs.some(c => c.level === 'err'));
  // με ✕ δεν βγαίνει (όπως και από το κουμπί του κάθε εντύπου), τα άλλα βγαίνουν κανονικά
  const [on, setOn] = useState(() => items.map((_, i) => !bad[i]));
  const [busy, setBusy] = useState<'' | 'xl' | 'print'>('');
  const [done, setDone] = useState<Record<number, Done | 'run'>>({});
  const pick = items.map((_, i) => i).filter(i => on[i] && !bad[i]);
  const nWarn = pick.reduce((a, i) => a + checks[i].length, 0);
  const show = (it: Item, c: Check) => { if (!c.go) return; onClose(); const [v, p] = GO[c.go](it.date); nav.go(v, p); };
  const go = async (print: boolean) => {
    setBusy(print ? 'print' : 'xl'); setDone({});
    const files: [number, string][] = [];
    for (const i of pick) {
      const it = items[i]; setDone(d => ({ ...d, [i]: 'run' }));
      let r: Awaited<ReturnType<typeof window.api.exportFile>>;
      // οι προειδοποιήσεις φάνηκαν εδώ: «Βγάλε όλα» είναι το «Το ξέρω, συνέχισε» και γράφονται στο Ιστορικό
      try { r = await window.api.exportFile(it.kind, it.date, { open: !print, ack: true }); } catch (e) { r = { ok: false, error: String(e) } as typeof r; }
      if (r.ok) { files.push([i, r.file]); setDone(d => ({ ...d, [i]: { ok: true, text: 'Βγήκε: ' + r.file.split(/[\\/]/).pop() + (r.ok && r.warnings.length ? ' · ⚠ ' + r.warnings.join(' · ') : ''), file: r.file } })); }
      else setDone(d => ({ ...d, [i]: { ok: false, text: 'Δεν βγήκε: ' + r.error } }));
    }
    await sync();
    // μία προεπισκόπηση τη φορά: η επόμενη ανοίγει όταν κλείσει η προηγούμενη
    if (print) for (const [i, f] of files) {
      setDone(d => ({ ...d, [i]: { ok: true, text: 'Στην εκτύπωση: ' + f.split(/[\\/]/).pop(), file: f } }));
      const p = await window.api.printFile(f).catch(e => ({ ok: false as const, error: String(e) }));
      if (!p.ok) setDone(d => ({ ...d, [i]: { ok: false, text: 'Δεν άνοιξε η εκτύπωση: ' + p.error } }));
    }
    setBusy('');
  };
  const finished = Object.keys(done).length > 0 && !busy;
  return html`<${Dialog} title="Έντυπα ημέρας" description=${'Έλεγχος πριν βγουν. ' + (nWarn ? 'Αν συνεχίσεις, οι προειδοποιήσεις γράφονται στο Ιστορικό.' : '')} onClose=${busy ? () => {} : onClose} size="lg"
    footer=${finished ? html`<${Button} variant="outline" onClick=${() => window.api.openFolder('output')}>Φάκελος<//><${Button} data-autofocus="" onClick=${onClose}>Κλείσιμο<//>`
      : html`<${Button} variant="outline" disabled=${!!busy} onClick=${onClose}>Άκυρο<//>
        <${Button} variant="outline" disabled=${!!busy || !pick.length} onClick=${() => go(true)} data-tip="Βγαίνουν τα Excel και ανοίγει η προεπισκόπηση εκτύπωσης του καθενός, το ένα μετά το άλλο. Δεν χρειάζεται Excel.">${Icon.print}${busy === 'print' ? 'Τυπώνονται…' : 'Τύπωσε όλα'}<//>
        <${Button} data-autofocus="" disabled=${!!busy || !pick.length} onClick=${() => go(false)}>${busy === 'xl' ? 'Βγαίνουν…' : pick.length === items.length ? 'Βγάλε όλα' : 'Βγάλε τα ' + pick.length}<//>`}>
    <div className="dayforms">${items.map((it, i) => {
      const cs = checks[i]; const d = done[i];
      return html`<section key=${it.kind} className=${cx('dayforms__item', !on[i] && 'is-off')}>
        <label className="dayforms__head"><input type="checkbox" className="ui-check" checked=${on[i] && !bad[i]} disabled=${bad[i] || !!busy} onChange=${(e: any) => setOn(o => o.map((x, j) => (j === i ? e.target.checked : x)))}/>
          <b>${it.name}</b><span className="muted">${dayName(it.date, today)} ${dmy(it.date)}</span>
          <span className=${cx('dayforms__st', bad[i] ? 'txt-bad' : cs.length ? 'txt-warn' : 'txt-ok')}>${bad[i] ? '✕ δεν μπορεί να βγει' : cs.length ? '⚠ ' + cs.length + (cs.length === 1 ? ' προειδοποίηση' : ' προειδοποιήσεις') : '✓ έτοιμο'}</span></label>
        ${cs.length > 0 && html`<ul className="preflight">${cs.map((c, k) => html`<li key=${k} className=${c.level === 'err' ? 'is-err' : 'is-warn'}><span className="preflight__ic">${c.level === 'err' ? '✕' : '⚠'}</span><span>${c.text}</span>${c.go && html`<${Button} size="sm" variant="link" disabled=${!!busy} onClick=${() => show(it, c)}>Δείξε μου<//>`}</li>`)}</ul>`}
        ${d && html`<p className=${cx('dayforms__done', d !== 'run' && !d.ok && 'txt-bad')}>${d === 'run' ? 'Βγαίνει…' : (d.ok ? '✓ ' : '✕ ') + d.text}</p>`}
      </section>`;
    })}</div>
  <//>`;
}
