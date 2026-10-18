// Ρυθμίσεις › Υπηρεσίες: «Καταστάσεις: σε ποιες υπηρεσίες μπαίνουν» (Michael, 13/10). Για ΕΥ, ΕΑ, ΕΟ, ΕΑΡΒ και
// τα δικά σου ιατρικά: μία στήλη ανά υπηρεσία (ναι · μόνο αν δεν υπάρχει άλλος · όχι), μία για την έξοδο και μία για την ΗΚΑΙ.
// Κάθε ιατρικό που προσθέτεις στις Λίστες ρυθμίζεται εδώ, και οι ποινές ανά είδος (Michael, 18/10).
import { useMemo } from 'react';
import { html, Badge, Button, Card, useToast } from '../ui';
import { useNav, useStore } from '../store';
import { TYPES, type BlockDef, type Person, type TypeKey } from '../../shared/domain';
import { itemKey, listRows, type ListItem, type UserLists } from '../../shared/ranks';
import { statusesOn } from '../../shared/rules';
import { punLbl } from '../../shared/punish';
import { statCellOf, statDefault, statOutOf, statRebase, statRowKey, statRowOf, STAT_MED, STAT_TXT, type StatCell, type StatConfig } from '../../shared/stat';
import { colHead, useDutyCols } from './si';

const OPTS: [StatCell, string][] = [['yes', '✓ Ναι'], ['last', '⚠ Αν δεν υπάρχει άλλος'], ['no', '✕ Όχι']];
// ΗΚΑΙ: από τα ιατρικά μετρά μόνο ο ΕΥ (κωλυόμενοι)· οι άλλοι είναι παρόντες
const HK_EY = 'ey';
type Row = { type: TypeKey; own: string; med?: ListItem };

export function StatCard() {
  const { state, run, today } = useStore(); const toast = useToast(); const nav = useNav();
  const lists: UserLists = state.settings.lists || {};
  const cfg: StatConfig = lists.stat || {};
  const cells = cfg.cells || {}; const out = cfg.out || {};
  const cols = useDutyCols();
  // ιατρικά: οι βασικοί τύποι και από κάτω όλα όσα πρόσθεσες στις Λίστες· ποινές: όλες και κάθε είδος
  const sections = useMemo(() => {
    const meds = listRows(lists, 'medKinds').filter(r => !r.builtin && !r.hidden && r.like && STAT_MED.includes(r.like));
    const puns = listRows(lists, 'punKinds').filter(r => !r.hidden || cells[statRowKey('PUN', r.name)]);
    return [
      { title: 'Ιατρικά', rows: STAT_MED.map(t => ({ type: t, own: '' }) as Row) },
      { title: 'Δικά σου ιατρικά (από τις Λίστες)', rows: meds.map(m => ({ type: m.like!, own: m.name, med: m }) as Row), empty: true },
      { title: 'Ποινές', rows: [{ type: 'PUN', own: '' } as Row, ...puns.map(r => ({ type: 'PUN', own: r.name }) as Row)] }
    ];
  }, [lists]);   // eslint-disable-line react-hooks/exhaustive-deps
  // πόσοι (σε δύναμη) έχουν σήμερα κάθε κατάσταση· η γραμμή «Ποινή» μετρά όλες τις ποινές
  const count = useMemo(() => {
    const m = new Map<string, number>(); const inc = (k: string) => m.set(k, (m.get(k) || 0) + 1);
    for (const p of state.people as Person[]) {
      if (!p.active) continue;
      for (const s of statusesOn(state.statuses, p.id, today)) { const r = statRowOf(s, lists); if (!r) continue; inc(statRowKey(r.type, r.own)); if (r.type === 'PUN' && r.own) inc('PUN'); }
    }
    return m;
  }, [state.people, state.statuses, today, lists]);
  // ιατρικά που έχει ήδη κάποιος: ο βασικός τους τύπος (άρα και η στήλη της ΗΚΑΙ) δεν αλλάζει
  const usedMed = useMemo(() => new Set(state.statuses.filter(x => STAT_MED.includes(x.type) && x.kind).map(x => itemKey(x.kind!).replace(/[^Α-ΩA-Z0-9]/g, ''))), [state.statuses]);

  const name = (type: TypeKey, own: string) => (type === 'PUN' ? (own ? punLbl(own) : 'Ποινή (όλες)') : own || TYPES[type].label);
  const baseName = (type: TypeKey) => (type === 'PUN' ? 'όλες τις ποινές' : 'το ' + TYPES[type].label);
  const save = (stat: StatConfig, text: string) => run({ t: 'setSettings', settings: { lists: { ...lists, stat } }, text: 'Καταστάσεις: ' + text }, false);
  const setCell = async (type: TypeKey, own: string, b: BlockDef, v: StatCell) => {
    // ό,τι θα ίσχυε χωρίς αυτό το κελί: για δικό σου ιατρικό ή είδος ποινής ο βασικός του τύπος, αλλιώς η προεπιλογή
    const inherited = own ? statCellOf(lists, type, undefined, b).v : statDefault(TYPES[type], b);
    const k = statRowKey(type, own); const row = { ...(cells[k] || {}) };
    if (v === inherited) delete row[b.id]; else row[b.id] = v;
    const next = { ...cells, [k]: row }; if (!Object.keys(row).length) delete next[k];
    const who = name(type, own);
    if (await save({ ...cfg, cells: next }, who + ' ' + STAT_TXT[v] + ' σε ' + b.name)) toast({ text: who + ': ' + STAT_TXT[v] + ' σε ' + b.name + '. Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.' });
  };
  const setOut = async (type: TypeKey, own: string, ok: boolean) => {
    const inherited = own ? statOutOf(lists, type).ok : !TYPES[type].noOut;
    const k = statRowKey(type, own); const next = { ...out }; if (ok === inherited) delete next[k]; else next[k] = ok;
    const who = name(type, own);
    if (await save({ ...cfg, out: next }, who + (ok ? ' βγαίνει' : ' δεν βγαίνει') + ' έξοδο')) toast({ text: who + (ok ? ' βγαίνει' : ' δεν βγαίνει') + ' έξοδο.' });
  };
  // ΗΚΑΙ ενός δικού σου ιατρικού: στους ΕΥ (βασικός τύπος ΕΥ) ή παρών (ΕΑΡΒ)· οι υπηρεσίες και η έξοδος μένουν όπως φαίνονται
  const setHk = async (r: Row, col: string) => {
    const to: TypeKey = col === HK_EY ? 'EY' : 'EARV'; if (to === r.type || !r.med) return;
    const next = statRebase(lists, r.own, to, cols); const txt = col === HK_EY ? 'στην ΗΚΑΙ στους ΕΥ' : 'στην ΗΚΑΙ παρών';
    if (await run({ t: 'setSettings', settings: { lists: next }, text: 'Καταστάσεις: ' + r.own + ' ' + txt }, false)) toast({ text: r.own + ': ' + txt + '. Οι υπηρεσίες και η έξοδος μένουν όπως είναι.' });
  };
  const resetRow = (type: TypeKey, own: string) => {
    const k = statRowKey(type, own); const nc = { ...cells }; delete nc[k]; const no = { ...out }; delete no[k];
    return save({ ...cfg, cells: nc, out: no }, name(type, own) + ': ' + (own ? 'όπως ' + baseName(type) : 'όπως στην αρχή'));
  };
  const hkCell = (r: Row) => {
    if (r.type === 'PUN') return html`<td className="muted" data-tip="Οι ποινές μετρούν στη στήλη «Τιμ.» (κωλυόμενοι)">Τιμ.</td>`;
    if (!r.med) return html`<td className="muted" data-tip=${r.type === 'EY' ? 'Κωλυόμενοι: ελεύθεροι υπηρεσίας' : 'Παρών: δεν μετρά σε στήλη'}>${r.type === 'EY' ? 'ΕΥ' : '—'}</td>`;
    const used = usedMed.has(itemKey(r.own).replace(/[^Α-ΩA-Z0-9]/g, ''));
    return html`<td><select className="ui-input statsel" aria-label=${r.own + ': ΗΚΑΙ'} value=${r.type === 'EY' ? HK_EY : ''} disabled=${used}
      data-tip=${used ? 'Το έχουν ήδη κάποιοι, οπότε η ΗΚΑΙ μένει όπως είναι. Για άλλη στήλη φτιάξε νέο ιατρικό στις Λίστες.' : 'Πού μετρά στην ΗΚΑΙ'} onChange=${(e: any) => setHk(r, e.target.value)}>
      <option value=${HK_EY}>ΕΥ</option><option value="">— (παρών)</option></select></td>`;
  };
  const span = cols.length + 5;

  return html`<${Card} title="Καταστάσεις: σε ποιες υπηρεσίες μπαίνουν">
    <p className="note" style=${{ marginTop: 0 }}>Μία στήλη για κάθε υπηρεσία, και για όσες προσθέτεις. Αρχικά όπως πριν: ΕΥ σε καμία υπηρεσία, ΕΑ και ΕΟ όχι σε ένοπλη, όχι μαγειρεία και σκοπιά μόνο αν δεν υπάρχει άλλος, ΕΑΡΒ παντού, οι ποινές παντού. Κάθε ιατρικό που προσθέτεις στις Λίστες μπαίνει εδώ χωρίς περιορισμούς, ώσπου να ορίσεις τι κάνει. «Αν δεν υπάρχει άλλος»: η αυτόματη συμπλήρωση τον βάζει τελευταίο, με προειδοποίηση. «Όχι»: μπαίνει με το χέρι μόνο με αιτία. Ισχύει μαζί με τη Σ.Ι. και τη «Δυνατότητα υπηρεσιών» του ατόμου: μετρά το αυστηρότερο.</p>
    <div style=${{ overflowX: 'auto' }}><table className="sigrid">
      <thead><tr><th>Κατάσταση</th><th>Σήμερα</th>${cols.map(colHead)}<th>Έξοδος</th><th>ΗΚΑΙ</th><th></th></tr></thead>
      ${sections.map(sec => html`<tbody key=${sec.title}>
        <tr className="sigrid__sec"><th colSpan=${span}>${sec.title}</th></tr>
        ${sec.empty && !sec.rows.length && html`<tr><td colSpan=${span} className="muted" style=${{ textAlign: 'left' }}>Κανένα ακόμα. Πρόσθεσε από τις <a href="#" onClick=${(e: any) => { e.preventDefault(); nav.set({ tab: 'lists' }); }}>Λίστες › Ιατρικά</a>· εμφανίζεται εδώ για να ορίσεις τι κάνει.</td></tr>`}
        ${sec.rows.map(r => {
          const { type, own } = r; const k = statRowKey(type, own); const n = count.get(k) || 0;
          const custom = !!cells[k] || out[k] != null; const o = statOutOf(lists, type, own || undefined);
          const isPun = type === 'PUN';
          return html`<tr key=${k} className=${own && isPun ? 'is-sub' : ''}>
            <td>${own ? html`<b>${name(type, own)}</b>${r.med?.warn && html` <${Badge} tone="warn" data-tip="Μόνο προειδοποίηση (Λίστες): προειδοποίηση σε κάθε υπηρεσία">⚠<//>`}${r.med && r.type !== 'EARV' && html` <span className="muted" style=${{ fontSize: '12px' }} data-tip=${'Ό,τι δεν άλλαξες ακολουθεί τη γραμμή ' + TYPES[type].label}>αρχικά όπως ${TYPES[type].label}</span>`}`
              : html`<b data-tip=${isPun ? 'Κάθε ποινή, εκτός αν ορίσεις κάτι άλλο για το είδος της' : TYPES[type].long}>${name(type, own)}</b>`}</td>
            <td className="num">${n || ''}</td>
            ${cols.map(b => { const c = statCellOf(lists, type, own || undefined, b); return html`<td key=${b.id} className=${c.from === (own ? 'own' : 'row') ? 'is-set' : ''}>
              <select className=${'ui-input statsel is-' + c.v} aria-label=${name(type, own) + ': ' + b.name} value=${c.v} onChange=${(e: any) => setCell(type, own, b, e.target.value)}>${OPTS.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></td>`; })}
            <td className=${o.from === (own ? 'own' : 'row') ? 'is-set' : ''}>${isPun
              ? html`<input type="checkbox" className="ui-check" aria-label=${name(type, own) + ': έξοδος'} checked=${false} disabled data-tip="Η ποινή κόβει πάντα την έξοδο"/>`
              : html`<input type="checkbox" className="ui-check" aria-label=${name(type, own) + ': έξοδος'} checked=${o.ok} onChange=${(e: any) => setOut(type, own, e.target.checked)}/>`}</td>
            ${hkCell(r)}
            <td style=${{ textAlign: 'right' }}>${custom && html`<${Button} size="sm" variant="ghost" data-tip=${own ? 'Ό,τι και για ' + baseName(type) : 'Όπως στην αρχή'} onClick=${() => resetRow(type, own)}>Επαναφορά<//>`}</td>
          </tr>`;
        })}
      </tbody>`)}
    </table></div>
    <p className="note">Νέα ιατρικά και είδη ποινής προσθέτεις από τις Λίστες· το όνομα, ο κωδικός στο ημερολόγιο και το «μόνο προειδοποίηση» είναι εκεί. Άδειες, έξοδοι και νοσοκομείο είναι απόντες: καμία υπηρεσία. Το ΣΤΕΠ (εισαγωγή μέσα στο στρατόπεδο) μετρά παρών, αλλά σε καμία υπηρεσία και χωρίς έξοδο.</p>
  <//>`;
}
