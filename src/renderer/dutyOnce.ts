// «Μετρά για 1» (Michael, 26/11): η ερώτηση όταν κάποιος έχει 2 υπηρεσίες την ίδια μέρα, και ο μικρός διακόπτης 1/2 στις καρτέλες.
// Η λογική (ποιος, πόσες, τι κείμενο) είναι στο shared/dutyOnceAsk.ts· εδώ μόνο η οθόνη.
import { useCallback, useState } from 'react';
import { html, Button, Dialog, Segmented, useToast } from './ui';
import { useStore } from './store';
import { dmy, type ISODate } from '../shared/dates';
import type { AppState } from '../shared/domain';
import { isOnce } from '../shared/dutyOnce';
import { onceCandidates, onceText, type OnceItem } from '../shared/dutyOnceAsk';

type P = any;
const ONE = [{ value: '1', label: '1' }, { value: '2', label: '2' }];

// Ένα άτομο: δύο κουμπιά (Esc = «Μετρά για 2»). Πολλά άτομα (αυτόματη συμπλήρωση): μία λίστα με 1/2 για το καθένα και μία «Αποθήκευση».
export function DutyOnceDialog({ items, onClose }: { items: OnceItem[]; onClose: () => void }) {
  const { run, undoMark } = useStore(); const toast = useToast();
  const [pick, setPick] = useState<Record<number, string>>({});
  const save = async (ones: OnceItem[]) => {
    onClose();
    let n = 0; for (const x of ones) if (await run({ t: 'setDutyOnce', date: x.date, who: x.who, once: true }, false)) n++;
    if (n) toast({ text: n === 1 ? 'Η μέρα μετρά για 1 υπηρεσία' : n + ' μέρες μετρούν για 1 υπηρεσία', actions: [undoMark()] });
  };
  if (items.length === 1) {
    const x = items[0];
    return html`<${Dialog} title="2 υπηρεσίες την ίδια μέρα" onClose=${onClose}
      footer=${html`<${Button} variant="outline" onClick=${() => save([x])}>Μετρά για 1<//><${Button} data-autofocus="" onClick=${onClose}>${'Μετρά για ' + x.n}<//>`}>
      <p style=${{ margin: 0 }}>${onceText(x)}</p><//>`;
  }
  const ones = items.filter((_, i) => pick[i] === '1');
  return html`<${Dialog} title="2 υπηρεσίες την ίδια μέρα" description="Πόσες υπηρεσίες μετρά η μέρα για καθέναν; Αν δεν αλλάξεις κάτι, μετρούν όλες." onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Κλείσε<//><${Button} data-autofocus="" onClick=${() => save(ones)}>Αποθήκευση<//>`}>
    <ul className="hist">${items.map((x, i) => html`<li key=${x.date + x.who}><span className="num">${dmy(x.date)}</span><span style=${{ flex: 1 }}><b>${x.name}</b> · ${x.codes.join('/')}</span>
      <${Segmented} small=${true} label=${'Πόσες μετρούν: ' + x.name} value=${pick[i] || '2'} onChange=${(v: string) => setPick({ ...pick, [i]: v })} items=${ONE}/></li>`)}</ul><//>`;
}

// Μετά από ανάθεση ή συμπλήρωση: ask(πριν, μετά, μέρες, άτομα) ανοίγει την ερώτηση αν κάποιος πήρε 2η υπηρεσία χωρίς απάντηση
export function useDutyOnce() {
  const [items, setItems] = useState<OnceItem[] | null>(null);
  const ask = useCallback((prev: AppState, next: AppState | null, dates: ISODate[], whos?: string[]) => {
    if (!next) return; const l = onceCandidates(prev, next, dates, whos); if (l.length) setItems(l);
  }, []);
  const dialog = items && html`<${DutyOnceDialog} items=${items} onClose=${() => setItems(null)}/>`;
  return { ask, dialog };
}

// Διακόπτης στην καρτέλα: «Μετρά για: 1 | 2» σε μέρα με 2+ υπηρεσίες
export function OnceToggle({ date, who }: P) {
  const { state, run } = useStore(); const once = isOnce(state.dutyOnce, date, who);
  return html`<${Segmented} small=${true} label=${'Πόσες υπηρεσίες μετρά η μέρα ' + dmy(date)} value=${once ? '1' : '2'} onChange=${(v: string) => run({ t: 'setDutyOnce', date, who, once: v === '1' }, false)} items=${[{ value: '1', label: '1', tip: 'Οι 2 υπηρεσίες της μέρας μετρούν για 1' }, { value: '2', label: '2', tip: 'Κάθε υπηρεσία μετρά' }]}/>`;
}
