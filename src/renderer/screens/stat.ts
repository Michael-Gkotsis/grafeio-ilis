// Ρυθμίσεις › Υπηρεσίες: «Καταστάσεις: σε ποιες υπηρεσίες μπαίνουν» (Michael, 13/10). Για ΕΥ, ΕΑ, ΕΟ, ΕΑΡΒ και
// τα δικά σου ιατρικά: μία στήλη ανά υπηρεσία (ναι · μόνο αν δεν υπάρχει άλλος · όχι) και μία για την έξοδο.
import { useMemo } from 'react';
import { html, Badge, Button, Card, useToast } from '../ui';
import { useStore } from '../store';
import { TYPES, type BlockDef, type Person, type TypeKey } from '../../shared/domain';
import { medKinds, type UserLists } from '../../shared/ranks';
import { statusesOn } from '../../shared/rules';
import { statCellOf, statDefault, statOutOf, statRowKey, statRowOf, STAT_ROWS, STAT_TXT, type StatCell, type StatConfig } from '../../shared/stat';
import { colHead, useDutyCols } from './si';

const OPTS: [StatCell, string][] = [['yes', '✓ Ναι'], ['last', '⚠ Αν δεν υπάρχει άλλος'], ['no', '✕ Όχι']];

export function StatCard() {
  const { state, run, today } = useStore(); const toast = useToast();
  const lists: UserLists = state.settings.lists || {};
  const cfg: StatConfig = lists.stat || {};
  const cells = cfg.cells || {}; const out = cfg.out || {};
  const cols = useDutyCols();
  // γραμμές: οι βασικές και από κάτω τα δικά σου ιατρικά που μοιάζουν με αυτές
  const rows = useMemo(() => {
    const own = medKinds(lists);
    return STAT_ROWS.flatMap(t => [{ type: t, own: '' }, ...own.filter(m => m.like === t).map(m => ({ type: t, own: m.name }))]);
  }, [lists]);
  // πόσοι (σε δύναμη) έχουν σήμερα κάθε κατάσταση
  const count = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of state.people as Person[]) {
      if (!p.active) continue;
      for (const s of statusesOn(state.statuses, p.id, today)) { const r = statRowOf(s, lists); if (r) { const k = statRowKey(r.type, r.own); m.set(k, (m.get(k) || 0) + 1); } }
    }
    return m;
  }, [state.people, state.statuses, today, lists]);

  const name = (type: TypeKey, own: string) => own || TYPES[type].label;
  const save = (stat: StatConfig, text: string) => run({ t: 'setSettings', settings: { lists: { ...lists, stat } }, text: 'Καταστάσεις: ' + text }, false);
  const setCell = async (type: TypeKey, own: string, b: BlockDef, v: StatCell) => {
    // ό,τι θα ίσχυε χωρίς αυτό το κελί: για δικό σου ιατρικό ο βασικός του τύπος, αλλιώς η προεπιλογή
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
  const resetRow = (type: TypeKey, own: string) => {
    const k = statRowKey(type, own); const nc = { ...cells }; delete nc[k]; const no = { ...out }; delete no[k];
    return save({ ...cfg, cells: nc, out: no }, name(type, own) + ': ' + (own ? 'όπως το ' + TYPES[type].label : 'όπως στην αρχή'));
  };

  return html`<${Card} title="Καταστάσεις: σε ποιες υπηρεσίες μπαίνουν">
    <p className="note" style=${{ marginTop: 0 }}>Μία στήλη για κάθε υπηρεσία, και για όσες προσθέτεις. Αρχικά όπως πριν: ΕΥ σε καμία υπηρεσία, ΕΑ και ΕΟ όχι σε ένοπλη, όχι μαγειρεία και σκοπιά μόνο αν δεν υπάρχει άλλος, ΕΑΡΒ παντού. Τα δικά σου ιατρικά ακολουθούν αυτό με το οποίο μοιάζουν, εκτός αν αλλάξεις τη γραμμή τους. «Αν δεν υπάρχει άλλος»: η αυτόματη συμπλήρωση τον βάζει τελευταίο, με προειδοποίηση. «Όχι»: δεν μπαίνει ούτε με το χέρι. Ισχύει μαζί με τη Σ.Ι. και τη «Δυνατότητα υπηρεσιών» του ατόμου: μετρά το αυστηρότερο.</p>
    <div style=${{ overflowX: 'auto' }}><table className="sigrid">
      <thead><tr><th>Κατάσταση</th><th>Σήμερα</th>${cols.map(colHead)}<th>Έξοδος</th><th></th></tr></thead>
      <tbody>${rows.map(({ type, own }) => {
        const k = statRowKey(type, own); const n = count.get(k) || 0;
        const custom = !!cells[k] || out[k] != null; const o = statOutOf(lists, type, own || undefined);
        return html`<tr key=${k} className=${own ? 'is-sub' : ''}>
          <td>${own ? html`<b>${own}</b> <span className="muted" style=${{ fontSize: '12px' }}>σαν ${TYPES[type].label}</span>` : html`<b data-tip=${TYPES[type].long}>${TYPES[type].label}</b>`}</td>
          <td className="num">${n || ''}</td>
          ${cols.map(b => { const c = statCellOf(lists, type, own || undefined, b); return html`<td key=${b.id} className=${c.from === (own ? 'own' : 'row') ? 'is-set' : ''}>
            <select className=${'ui-input statsel is-' + c.v} aria-label=${name(type, own) + ': ' + b.name} value=${c.v} onChange=${(e: any) => setCell(type, own, b, e.target.value)}>${OPTS.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></td>`; })}
          <td className=${o.from === (own ? 'own' : 'row') ? 'is-set' : ''}><input type="checkbox" className="ui-check" aria-label=${name(type, own) + ': έξοδος'} checked=${o.ok} onChange=${(e: any) => setOut(type, own, e.target.checked)}/></td>
          <td style=${{ textAlign: 'right' }}>${custom && html`<${Button} size="sm" variant="ghost" data-tip=${own ? 'Ό,τι και για το ' + TYPES[type].label : 'Όπως στην αρχή'} onClick=${() => resetRow(type, own)}>Επαναφορά<//>`}</td>
        </tr>`;
      })}</tbody>
    </table></div>
    <p className="note">Δικά σου ιατρικά προσθέτεις από τις Λίστες › Ιατρικά. Άδειες, έξοδοι και νοσοκομείο είναι απόντες: καμία υπηρεσία. Το ΣΤΕΠ (εισαγωγή μέσα στο στρατόπεδο) μετρά παρών, αλλά σε καμία υπηρεσία και χωρίς έξοδο.</p>
    ${rows.some(r => r.own && TYPES[r.type] && (lists.medKinds?.add || []).some(m => m.name === r.own && m.warn)) && html`<p className="note"><${Badge} tone="warn">μόνο προειδοποίηση<//> Τα ιατρικά «μόνο προειδοποίηση» βγάζουν προειδοποίηση σε κάθε υπηρεσία, ό,τι κι αν ορίσεις εδώ.</p>`}
  <//>`;
}
