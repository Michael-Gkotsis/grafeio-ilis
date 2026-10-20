// Ρυθμίσεις › Θάλαμοι και ουλαμοί, και Ρυθμίσεις › Εμφάνιση › Τίτλος και λογότυπο (Michael, 17/10).
// Θάλαμοι: πόσοι είναι και πόσοι ανά ουλαμό· οι ουλαμοί φτιάχνονται μόνοι τους (1–4 → 1ος, 5–8 → 2ος) και αλλάζει ποιος θάλαμος
// ανήκει πού. Ο αριθμός θαλάμων γίνεται η λίστα του πεδίου «Θάλαμος» στη φόρμα στρατιώτη.
import { useMemo, useState } from 'react';
import { html, Alert, Button, Card, Logo, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { makePlatoons, platoonsOf, roomCfg, type Person, type Platoon, type RoomSettings } from '../../shared/domain';
import { BRAND_RANKS, DEFAULT_TITLE, LOGO_KINDS, appLogo, appTitle, type LogoKind } from '../../shared/brand';
type P = any;

const MAX_ROOMS = 40;
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const same = (a: Platoon[], b: Platoon[]) => JSON.stringify(a) === JSON.stringify(b);
const roomsTxt = (r: number[]) => r.length ? r.join(', ') : 'κανένας';

export function RoomsCard() {
  const { state, run } = useStore(); const toast = useToast();
  const cfg = roomCfg(state.settings);
  const [n, setN] = useState(cfg.n); const [per, setPer] = useState(cfg.per);
  const [pl, setPl] = useState<Platoon[]>(() => platoonsOf(state.settings));
  const [out, setOut] = useState<Record<6 | 0, number[]>>(() => ({ 6: [...(state.rules.outRooms[6] || [])], 0: [...(state.rules.outRooms[0] || [])] }));
  // νέος αριθμός θαλάμων ή θαλάμων ανά ουλαμό: οι ουλαμοί ξαναφτιάχνονται από την αρχή
  const renum = (nn: number, pp: number) => { setN(nn); setPer(pp); setPl(makePlatoons(nn, pp)); setOut(o => ({ 6: o[6].filter(r => r <= nn), 0: o[0].filter(r => r <= nn) })); };
  const num = (v: string, max: number) => Math.min(max, Math.max(1, Math.floor(+v || 1)));
  // κλικ σε θάλαμο: πάει σε αυτόν τον ουλαμό (φεύγει από όποιον ήταν)· κλικ σε θάλαμο που ήδη ανήκει εδώ: μένει χωρίς ουλαμό
  const toggle = (i: number, r: number) => setPl(pl.map((u, j) => ({ ...u, rooms: j === i ? (u.rooms.includes(r) ? u.rooms.filter(x => x !== r) : [...u.rooms, r].sort((a, b) => a - b)) : u.rooms.filter(x => x !== r) })));
  const rename = (i: number, name: string) => setPl(pl.map((u, j) => (j === i ? { ...u, name } : u)));
  const addPl = () => setPl([...pl, { name: (pl.length + 1) + 'ος Ουλαμός', rooms: [] }]);
  const delPl = (i: number) => setPl(pl.filter((_, j) => j !== i));
  const togOut = (d: 6 | 0, r: number) => setOut({ ...out, [d]: out[d].includes(r) ? out[d].filter(x => x !== r) : [...out[d], r].sort((a, b) => a - b) });
  const free = range(n).filter(r => !pl.some(u => u.rooms.includes(r)));
  const names = pl.map(u => u.name.trim());
  const dupName = names.find((x, i) => x && names.indexOf(x) !== i);
  // στρατιώτες σε θάλαμο που δεν υπάρχει πια (π.χ. 9 όταν οι θάλαμοι είναι 8)
  const beyond = useMemo(() => state.people.filter((p: Person) => p.active && p.room != null && p.room > n), [state.people, n]);
  const perRoom = useMemo(() => { const m = new Map<number, number>(); state.people.forEach((p: Person) => { if (p.active && p.room != null) m.set(p.room, (m.get(p.room) || 0) + 1); }); return m; }, [state.people]);
  const bad = names.some(x => !x) ? 'Κάθε ουλαμός θέλει όνομα.' : dupName ? 'Δύο ουλαμοί λέγονται «' + dupName + '».' : null;
  const save = async () => {
    if (bad) return;
    const clean = pl.map(u => ({ name: u.name.trim().replace(/\s+/g, ' '), rooms: u.rooms }));
    const rooms: RoomSettings = { n, per, ...(same(clean, makePlatoons(n, per)) ? {} : { platoons: clean }) };
    const ok = await run({ t: 'setSettings', settings: { rooms }, text: 'θάλαμοι ' + n + ', ουλαμοί ' + clean.map(u => u.name + ' (' + roomsTxt(u.rooms) + ')').join(', ') }, false);
    const nr = { ...state.rules, outRooms: { ...state.rules.outRooms, 6: out[6], 0: out[0] } };
    if (ok && JSON.stringify(nr.outRooms) !== JSON.stringify(state.rules.outRooms)) await run({ t: 'setRules', rules: nr, text: 'θάλαμοι εξόδου ΣΑΒ ' + roomsTxt(out[6]) + ', ΚΥΡ ' + roomsTxt(out[0]) }, false);
    if (ok) toast({ text: 'Αποθηκεύτηκαν οι θάλαμοι και οι ουλαμοί' });
  };
  const chip = (r: number, on: boolean, fn: () => void, label: string) => html`<button key=${r} type="button" className="ui-chip ui-chip--sm" aria-pressed=${on} aria-label=${label} data-tip=${perRoom.get(r) ? perRoom.get(r) + ' στρατιώτες' : 'Κανένας στρατιώτης ακόμα'} onClick=${fn}>Θ${r}</button>`;
  return html`<${Card} title="Θάλαμοι και ουλαμοί">
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="rm-n">Αριθμός θαλάμων</label><input id="rm-n" className="ui-input" type="number" min="1" max=${MAX_ROOMS} value=${n} onChange=${(e: any) => renum(num(e.target.value, MAX_ROOMS), per)}/><span className="field__help">Γίνεται η λίστα του πεδίου «Θάλαμος» όταν βάζεις ή διορθώνεις στρατιώτη.</span></div>
      <div className="field"><label className="field__label" htmlFor="rm-p">Θάλαμοι ανά ουλαμό</label><input id="rm-p" className="ui-input" type="number" min="1" max=${MAX_ROOMS} value=${per} onChange=${(e: any) => renum(n, num(e.target.value, MAX_ROOMS))}/><span className="field__help">Οι ουλαμοί φτιάχνονται μόνοι τους με τη σειρά των θαλάμων.</span></div>
    </div>
    ${beyond.length > 0 && html`<${Alert} tone="warn"><span>${beyond.length === 1 ? '1 στρατιώτης είναι' : beyond.length + ' στρατιώτες είναι'} σε θάλαμο μεγαλύτερο από ${n} (${[...new Set(beyond.map(p => 'Θ' + p.room))].join(', ')}). Δεν ανήκουν σε ουλαμό μέχρι να τους αλλάξεις θάλαμο ή να αυξήσεις τους θαλάμους.</span><//>`}
    <div className="field"><span className="field__label">Ουλαμοί</span>
      <span className="field__help">Πάτα έναν θάλαμο για να τον βάλεις σε αυτόν τον ουλαμό· ξαναπάτα για να τον βγάλεις. Ο ουλαμός φαίνεται στο Δυναμολόγιο, στην καρτέλα και στο φίλτρο «Ουλαμός».</span>
      <div className="stack" style=${{ gap: '10px', marginTop: '8px' }}>
        ${pl.map((u, i) => html`<div key=${i} className="field-row" style=${{ alignItems: 'center' }}>
          <input className="ui-input" style=${{ width: '170px', flex: 'none' }} aria-label=${'Όνομα ουλαμού ' + (i + 1)} value=${u.name} onChange=${(e: any) => rename(i, e.target.value)}/>
          <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>${range(n).map(r => chip(r, u.rooms.includes(r), () => toggle(i, r), 'Θάλαμος ' + r + ' στον ' + u.name))}</div>
          <${Button} size="sm" variant="ghost" aria-label=${'Αφαίρεση: ' + u.name} data-tip="Αφαίρεση ουλαμού (οι θάλαμοί του μένουν χωρίς ουλαμό)" onClick=${() => delPl(i)}>✕<//>
        </div>`)}
      </div>
      <div style=${{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
        <${Button} size="sm" variant="outline" onClick=${addPl}>+ Ουλαμός<//>
        <${Button} size="sm" variant="outline" data-tip=${'Από την αρχή: ανά ' + per + ' θαλάμους'} disabled=${same(pl, makePlatoons(n, per))} onClick=${() => setPl(makePlatoons(n, per))}>Ξαναφτιάξε τους ουλαμούς<//>
      </div>
      ${free.length > 0 && html`<span className="field__help" style=${{ color: 'var(--warn)' }}>Χωρίς ουλαμό: ${free.map(r => 'Θ' + r).join(', ')}</span>`}
    </div>
    <div className="field"><span className="field__label">Θάλαμοι εξόδου το Σαββατοκύριακο (Κ-16)</span>
      ${([[6, 'Σάββατο'], [0, 'Κυριακή']] as [6 | 0, string][]).map(([d, l]) => html`<div key=${d} className="field-row" style=${{ alignItems: 'center' }}><span style=${{ width: '80px', flex: 'none', fontSize: '13px' }}>${l}</span>
        <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>${range(n).map(r => chip(r, out[d].includes(r), () => togOut(d, r), 'Θάλαμος ' + r + ' βγαίνει ' + l))}</div></div>`)}
      <span className="field__help">Από αυτούς προτείνει τους εξοδούχους στις Εξόδους.</span>
    </div>
    ${bad && html`<${Alert} tone="bad">${bad}<//>`}
    <div><${Button} disabled=${!!bad} onClick=${save}>Αποθήκευση<//></div>
  <//>`;
}

// Το πεδίο «Θάλαμος» στη φόρμα στρατιώτη: λίστα με τους θαλάμους των ρυθμίσεων και τον ουλαμό τους.
// Αν ο στρατιώτης είναι ήδη σε θάλαμο εκτός λίστας (π.χ. από παλιό Δυναμολόγιο), μένει κι αυτός στη λίστα.
export function RoomField({ id, value, onChange }: P) {
  const { state } = useStore();
  const pl = platoonsOf(state.settings);
  const rooms = range(roomCfg(state.settings).n);
  if (value != null && !rooms.includes(value)) rooms.push(value);
  const unit = (r: number) => pl.find(u => u.rooms.includes(r))?.name;
  return html`<div className="field"><label className="field__label" htmlFor=${id}>Θάλαμος</label>
    <${Select} id=${id} className="ui-input" value=${value == null ? '' : String(value)} onChange=${(e: any) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">—</option>${rooms.map(r => html`<option key=${r} value=${String(r)}>Θάλαμος ${r}${unit(r) ? ' · ' + unit(r) : ''}</option>`)}
    <//></div>`;
}

// Εικόνα που ανέβασε ο χρήστης → τετράγωνο PNG 128×128 (μικρό, για να χωρά στις ρυθμίσεις)
function shrink(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const rd = new FileReader();
    rd.onerror = () => fail(new Error('Δεν διαβάστηκε το αρχείο'));
    rd.onload = () => {
      const img = new Image();
      img.onerror = () => fail(new Error('Το αρχείο δεν είναι εικόνα που ανοίγει (PNG, JPG, GIF, BMP)'));
      img.onload = () => {
        const S = 128, c = document.createElement('canvas'); c.width = S; c.height = S;
        const k = Math.min(S / img.width, S / img.height), w = img.width * k, h = img.height * k;
        c.getContext('2d')!.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        ok(c.toDataURL('image/png'));
      };
      img.src = String(rd.result);
    };
    rd.readAsDataURL(file);
  });
}

export function BrandCard() {
  const { state, run } = useStore(); const toast = useToast();
  const b = state.settings.brand || {};
  const [rank, setRank] = useState(b.rank || BRAND_RANKS[0].rank);
  const [title, setTitle] = useState(b.title || '');
  const [logo, setLogo] = useState(b.logo || '');
  const [upl, setUpl] = useState(/^data:image\//.test(b.logo || '') ? b.logo! : '');   // εικόνα που ανέβασες (μένει στις επιλογές)
  const draft = { brand: { rank, title, logo } };
  const rk = BRAND_RANKS.find(r => r.rank === rank) || BRAND_RANKS[0];
  const custom = /^data:image\//.test(logo);
  const pickFile = async (e: any) => {
    const f: File | undefined = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { const d = await shrink(f); setUpl(d); setLogo(d); } catch (err) { toast({ text: err instanceof Error ? err.message : String(err) }); }
  };
  const save = async () => {
    const brand = { ...(rank !== BRAND_RANKS[0].rank ? { rank } : {}), ...(title.trim() ? { title: title.trim().replace(/\s+/g, ' ') } : {}), ...(logo ? { logo } : {}) };
    if (await run({ t: 'setSettings', settings: { brand }, text: 'τίτλος «' + appTitle({ brand }) + '»' + (custom ? ', δικό σου λογότυπο' : '') }, false)) toast({ text: 'Αποθηκεύτηκε ο τίτλος και το λογότυπο' });
  };
  const opt = (k: string, label: string, kind: LogoKind, src?: string) => html`<button key=${k} type="button" className="ui-chip" aria-pressed=${logo === k} style=${{ height: 'auto', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '8px' }} onClick=${() => setLogo(k)}><${Logo} size=${26} kind=${kind} src=${src}/>${label}</button>`;
  return html`<${Card} title="Τίτλος και λογότυπο">
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="br-rank">Βαθμός όποιου τη χρησιμοποιεί</label>
        <${Select} id="br-rank" className="ui-select" value=${rank} onChange=${(e: any) => setRank(e.target.value)}>${BRAND_RANKS.map(r => html`<option key=${r.rank} value=${r.rank}>${r.name} · «${r.title}»</option>`)}<//>
        <span className="field__help">Αλλάζει τον τίτλο και, αν δεν διάλεξες άλλο, το λογότυπο.</span></div>
      <div className="field"><label className="field__label" htmlFor="br-title">Δικός σου τίτλος (προαιρετικά)</label>
        <input id="br-title" className="ui-input" value=${title} placeholder=${rk.title} maxLength=${40} onChange=${(e: any) => setTitle(e.target.value)}/>
        <span className="field__help">Κενό = «${rk.title}».</span></div>
    </div>
    <div className="field"><span className="field__label">Λογότυπο</span>
      <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        ${opt('', 'Του βαθμού', rk.logo)}
        ${LOGO_KINDS.map(([k, l]) => opt(k, l, k))}
        ${upl && opt(upl, 'Δικό σου', rk.logo, upl)}
        <label className="ui-btn ui-btn--outline" style=${{ cursor: 'pointer' }}>Ανέβασε εικόνα…<input type="file" accept="image/png,image/jpeg,image/gif,image/bmp,image/svg+xml" style=${{ display: 'none' }} onChange=${pickFile}/></label>
      </div>
      <span className="field__help">Τα σχέδια είναι ενδεικτικά. Για το ακριβές διακριτικό ή το σήμα της μονάδας ανέβασε δική σου εικόνα (μικραίνει σε 128×128).</span>
    </div>
    <div className="brand-preview" style=${{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '10px', width: 'fit-content', margin: '4px 0 12px' }}>
      <${Logo} size=${30} ...${appLogo(draft)}/><b style=${{ fontSize: '15px' }}>${appTitle(draft)}</b><span className="muted" style=${{ fontSize: '12px' }}>${state.settings.unit[2] || ''}</span>
    </div>
    <div style=${{ display: 'flex', gap: '8px' }}><${Button} onClick=${save}>Αποθήκευση<//>
      ${(b.rank || b.title || b.logo) && html`<${Button} variant="outline" onClick=${() => { setRank(BRAND_RANKS[0].rank); setTitle(''); setLogo(''); setUpl(''); }}>Όπως ήταν («${DEFAULT_TITLE}»)<//>`}</div>
  <//>`;
}
