// «Ποιοι γυρίζουν και πότε»: the list of people who are away on a day, grouped by the day they come back.
// Purpose: `ReturnsList`, shared by «Σήμερα» (short, with a limit) and Εξοδούχοι (all, with «Διόρθωση…»).
// Does NOT: decide who is away or when they return (shared/returns.ts does).
// Owner layer: renderer/screens. Why: moved out of guard.ts so «Σήμερα» does not pull the whole Υπηρεσίες screen into
//   the first JS file (Phase 5.1b).
// Covering test: test/screens-main.test.ts (Σήμερα), test/outs-*.test.ts (Εξοδούχοι).
import { RkName } from '../rankName';
import { useMemo, useState } from 'react';
import { html, cx, Badge, Button } from '../ui';
import { useNav, useStore } from '../store';
import { TYPES } from '../../shared/domain';
import { outLbl } from '../../shared/weekend';
import { backsAt, retDay, retWhen, returnsOn, type Back } from '../../shared/returns';
import { BackFixDialog } from './outsPlan';
import { statusLbl } from '../../shared/ranks';

/** Shown for people whose return is unknown because the next day is not declared yet (listed last, as a warning). */
const PENDING = 'Να δηλωθεί η επόμενη μέρα';

/**
 * Who is away on `date` and when they must come back, grouped by return day; people who return for duty come first.
 * @param date - ISODate, the day asked about
 * @param limit - show at most this many rows, then «Και άλλοι N στους Εξοδούχους»
 * @param fixable - Εξοδούχοι screen: a «Διόρθωση…» button per person on leave or DN
 * @param at - minutes since midnight, local time («Σήμερα»): leaves out people who already came back by now
 * @decision Michael 2/11: «Σήμερα» showed ΚΑ people whose leave had already ended, hence `at`.
 */
export function ReturnsList({
  date,
  limit,
  fixable,
  at,
}: {
  date: string;
  limit?: number;
  fixable?: boolean;
  at?: number;
}) {
  const { state } = useStore();
  const nav = useNav();
  const list = useMemo(() => backsAt(state, returnsOn(state, date), date, at), [state, date, at]);
  const [fix, setFix] = useState<Back | null>(null);
  if (!list.length) return html`<div className="empty">Κανείς δεν λείπει.</div>`;
  const shown = limit ? list.slice(0, limit) : list;
  const grp = (b: Back) => (b.r.pending ? PENDING : retDay(b.r));
  const days = [...new Set(shown.map(grp))];
  return html`<div className="backs">${days.map((d) => html`<div key=${d}><div className=${cx('backs__day', d === PENDING && 'txt-bad')}>${d}</div><ul className="rows">${shown.filter((b) => grp(b) === d).map((b) => html`<li key=${b.p.id}><button type="button" className="linkish" onClick=${() => nav.openPerson(b.p.id)}><${RkName} p=${b.p}/></button><span className=${b.r.duty || b.r.pending ? 'txt-bad' : 'muted'}><${Badge} tone=${TYPES[b.st.type].tone} className="tag">${TYPES[b.st.type].cat === 'out' ? outLbl(b.st) : statusLbl(b.st, state.settings.lists)}<//> ${retWhen(b.r)}${b.r.fix ? html` <${Badge} tone="outline" data-tip="Διόρθωση του γραφείου">διόρθωση<//>` : null}${fixable && TYPES[b.st.type].cat === 'out' ? html`<${Button} size="sm" variant="ghost" onClick=${() => setFix(b)} data-tip="Άλλαξε πότε γυρνά, με λόγο">Διόρθωση…<//>` : null}</span></li>`)}</ul></div>`)}
    ${limit && list.length > limit && html`<p className="note rows__more">Και άλλοι ${list.length - limit} στους Εξοδούχους.</p>`}
    ${fix && html`<${BackFixDialog} b=${fix} date=${date} onClose=${() => setFix(null)}/>`}</div>`;
}
