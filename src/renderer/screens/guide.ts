// Οδηγός χρήσης (Michael, 21/10): ένα θέμα ανά μενού και ρύθμιση, με περιεχόμενα αριστερά, αναζήτηση χωρίς τόνους και
// συνδέσμους «τι επηρεάζει τι». Φορτώνεται όταν ανοίξει, όπως οι Ρυθμίσεις. Το κείμενο είναι στο guideText.ts.
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { html, cx, Alert, Button, Kbd, PageHeader } from '../ui';
import { useNav, useStore } from '../store';
import { normGreek } from '../../shared/text';
import { HK } from '../../shared/unit';
import { GUIDE, GUIDE_GROUPS, type GuideTopic } from '../guideText';
type P = any;

const byId = new Map(GUIDE.map(t => [t.id, t]));
// ΗΚΑΙ ↔ ΗΚΑΛ όπως όλη η εφαρμογή (Ρυθμίσεις › Μονάδα και έντυπα)
const hk = (s: string) => (HK() === 'ΗΚΑΙ' ? s : s.replace(/ΗΚΑΙ/g, HK()));
const titleOf = (id: string) => hk(byId.get(id)?.title || id);

// Γραμμές του κειμένου σε κομμάτια: υπότιτλος, παράγραφος, κουκκίδες, βήματα, συμβουλή, προσοχή, πίνακας
// Βήματα που συνεχίζουν μετά από κουκκίδες (1, 2, 3, κουκκίδες, 4…) κρατούν την αρίθμηση (start)
type Block = { t: 'h' | 'p' | 'tip' | 'warn'; text: string } | { t: 'ul' | 'ol'; items: string[]; start?: number } | { t: 'table'; rows: string[][] };
export function parseGuide(body: string): Block[] {
  const out: Block[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim(); const last = out[out.length - 1];
    if (!line) { out.push({ t: 'p', text: '' }); continue; }
    if (line.startsWith('## ')) out.push({ t: 'h', text: line.slice(3) });
    else if (line.startsWith('- ')) { if (last?.t === 'ul') last.items.push(line.slice(2)); else out.push({ t: 'ul', items: [line.slice(2)] }); }
    else if (/^\d+\. /.test(line)) {
      const x = line.replace(/^\d+\. /, ''); const before = out[out.length - 2];
      if (last?.t === 'ol') last.items.push(x);
      else if (last?.t === 'ul' && before?.t === 'ol') out.push({ t: 'ol', items: [x], start: (before.start || 1) + before.items.length });
      else out.push({ t: 'ol', items: [x] });
    }
    else if (line.startsWith('> ')) out.push({ t: 'tip', text: line.slice(2) });
    else if (line.startsWith('! ')) out.push({ t: 'warn', text: line.slice(2) });
    else if (line.startsWith('|')) { const row = line.replace(/^\|/, '').split(' | ').map(c => c.trim()); if (last?.t === 'table') last.rows.push(row); else out.push({ t: 'table', rows: [row] }); }
    else if (last?.t === 'p' && last.text) last.text += ' ' + line;
    else out.push({ t: 'p', text: line });
  }
  return out.filter(b => !(b.t === 'p' && !b.text));
}

// Χωρίς σήμανση, για την αναζήτηση
const plain = (s: string) => s.replace(/\[\[([a-z-]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([a-z-]+)\]\]/g, (_, id) => titleOf(id)).replace(/\*\*|`/g, '').replace(/^(## |- |\d+\. |> |! |\|)/, '').replace(/ \| /g, ' · ');
const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[\[([a-z-]+)(?:\|([^\]]+))?\]\]/g;

function Inline({ text, open }: { text: string; open: (id: string) => void }) {
  const parts: any[] = []; let i = 0; let m: RegExpExecArray | null;
  const txt = hk;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > i) parts.push(txt(text.slice(i, m.index)));
    if (m[1] != null) parts.push(html`<b>${txt(m[1])}</b>`);
    else if (m[2] != null) parts.push(html`<${Kbd}>${m[2]}<//>`);
    else { const id = m[3]; parts.push(byId.has(id) ? html`<button type="button" className="guide__link" onClick=${() => open(id)}>${m[4] ? hk(m[4]) : titleOf(id)}</button>` : (m[4] || id)); }
    i = m.index + m[0].length;
  }
  if (i < text.length) parts.push(txt(text.slice(i)));
  return html`${parts.map((p, k) => html`<${Fragment} key=${k}>${p}<//>`)}`;
}
// Επισήμανση της αναζήτησης μέσα στο κείμενο (χωρίς τόνους: η θέση βρίσκεται στο κανονικοποιημένο κείμενο, ίδιο μήκος)
function Mark(s: string, q: string) {
  const n = normGreek(s).replace(/\s/g, ' '); const at = n.indexOf(q);
  if (at < 0 || n.length !== s.length) return s;
  return html`${s.slice(0, at)}<mark>${s.slice(at, at + q.length)}</mark>${s.slice(at + q.length)}`;
}

function Body({ topic, open }: { topic: GuideTopic; open: (id: string) => void }) {
  const blocks = useMemo(() => parseGuide(topic.body), [topic]);
  const I = (t: string) => html`<${Inline} text=${t} open=${open}/>`;
  const one = (b: Block, k: number) => {
    if (b.t === 'table') return html`<div key=${k} className="guide__table"><table className="legend"><thead><tr>${b.rows[0].map((c, j) => html`<th key=${j}>${I(c)}</th>`)}</tr></thead>
      <tbody>${b.rows.slice(1).map((r, j) => html`<tr key=${j}>${r.map((c, x) => html`<td key=${x}>${I(c)}</td>`)}</tr>`)}</tbody></table></div>`;
    if ('items' in b) return html`<${b.t} key=${k} start=${b.start}>${b.items.map((x, j) => html`<li key=${j}>${I(x)}</li>`)}<//>`;
    if (b.t === 'h') return html`<h3 key=${k}>${hk(b.text)}</h3>`;
    if (b.t === 'p') return html`<p key=${k}>${I(b.text)}</p>`;
    return html`<${Alert} key=${k} tone=${b.t === 'tip' ? 'info' : 'warn'}><span>${I(b.text)}</span><//>`;
  };
  return html`${blocks.map(one)}`;
}

// Αναζήτηση: όλες οι λέξεις στον τίτλο, στις λέξεις-κλειδιά ή στο κείμενο. Πρώτα όσα ταιριάζουν στον τίτλο.
type Hit = { topic: GuideTopic; lines: string[]; score: number };
export function searchGuide(q: string): Hit[] {
  const words = normGreek(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: Hit[] = [];
  for (const t of GUIDE) {
    const lines = t.body.split('\n').map(plain).filter(l => l.trim());
    const all = normGreek(hk(t.title) + ' ' + (t.keys || '') + ' ' + lines.join(' '));
    if (!words.every(w => all.includes(w))) continue;
    const title = normGreek(hk(t.title));
    const found = lines.filter(l => words.some(w => normGreek(l).includes(w)));
    hits.push({ topic: t, lines: found.slice(0, 3), score: (words.every(w => title.includes(w)) ? 100 : words.some(w => title.includes(w)) ? 50 : 0) + found.length });
  }
  return hits.sort((a, b) => b.score - a.score);
}

export function GuideScreen() {
  const nav = useNav(); const { boot, state } = useStore();
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  const topic = byId.get(nav.params.topic) || GUIDE[0];
  const open = (id: string) => { setQ(''); nav.set({ topic: id }); };
  useEffect(() => { window.scrollTo(0, 0); }, [topic.id]);
  const hits = useMemo(() => searchGuide(dq), [dq]);
  const first = normGreek(dq).split(/\s+/).filter(Boolean)[0] || '';
  const group = (g: string) => GUIDE.filter(t => t.group === g);
  return html`<div className="guide">
    <${PageHeader} title="Οδηγός χρήσης" sub="Τι κάνει κάθε μενού, πώς το χρησιμοποιείς και τι επηρεάζει τι. Πάτα ένα θέμα αριστερά ή ψάξε μια λέξη.">
      <input type="search" className="ui-input guide__search" aria-label="Αναζήτηση στον οδηγό" placeholder="Ψάξε, π.χ. ΔΝ, κενή θέση, υπογραφές · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
    <//>
    <div className="setgrid guide__grid">
      <nav className="setnav guidenav" aria-label="Περιεχόμενα οδηγού">${GUIDE_GROUPS.map(([g, label]) => html`<${Fragment} key=${g}>
        <span className="guidenav__group">${label}</span>
        ${group(g).map(t => html`<button key=${t.id} type="button" aria-current=${!dq.trim() && topic.id === t.id ? 'page' : undefined} onClick=${() => open(t.id)}>${hk(t.title)}</button>`)}<//>`)}
      </nav>
      <div className="setbody">${dq.trim() ? html`<div className="ui-card guide__card">
          <h2 className="guide__title">${hits.length ? 'Βρέθηκαν ' + hits.length + (hits.length === 1 ? ' θέμα' : ' θέματα') : 'Δεν βρέθηκε κάτι'}</h2>
          ${!hits.length && html`<p className="muted">Δοκίμασε άλλη λέξη ή μόνο τα πρώτα γράμματα (π.χ. «ποιν» για ποινές).</p>`}
          <ul className="guide__hits">${hits.map(h => html`<li key=${h.topic.id}><button type="button" className="guide__link guide__hit" onClick=${() => open(h.topic.id)}>${hk(h.topic.title)}</button>
            ${h.lines.map((l, j) => html`<p key=${j} className="guide__snip">${Mark(hk(l), first)}</p>`)}</li>`)}</ul></div>`
        : html`<article className="ui-card guide__card" aria-labelledby="guide-title">
          <div className="guide__head"><h2 id="guide-title" className="guide__title">${hk(topic.title)}</h2>
            ${topic.go && html`<${Button} variant="outline" size="sm" onClick=${() => nav.go(topic.go!.view, topic.go!.params)}>Άνοιξε: ${hk(topic.go.label)}<//>`}</div>
          ${topic.id === 'about' && html`<dl className="kv guide__kv"><dt>Έκδοση</dt><dd>${boot.version}</dd><dt>Δεδομένα</dt><dd>${boot.dataDir}</dd>
            <dt>Έντυπα που βγαίνουν</dt><dd>${state.settings.outputDir || boot.outputDir}</dd></dl>`}
          <${Body} topic=${topic} open=${open}/>
          <${Pager} id=${topic.id} open=${open}/>
        </article>`}</div>
    </div>
  </div>`;
}
// Προηγούμενο / επόμενο θέμα, για όποιον τον διαβάζει από την αρχή ως το τέλος
function Pager({ id, open }: P) {
  const i = GUIDE.findIndex(t => t.id === id); const prev = GUIDE[i - 1], next = GUIDE[i + 1];
  return html`<div className=${cx('guide__pager')}>
    ${prev ? html`<${Button} variant="ghost" size="sm" onClick=${() => open(prev.id)}>← ${hk(prev.title)}<//>` : html`<span></span>`}
    ${next && html`<${Button} variant="ghost" size="sm" onClick=${() => open(next.id)}>${hk(next.title)} →<//>`}</div>`;
}

