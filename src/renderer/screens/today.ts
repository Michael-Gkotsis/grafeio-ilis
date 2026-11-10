// «Σήμερα», the first screen: counts, the tasks of the day, who is away and what ends.
// Purpose: `TodayScreen`, the only screen the app loads before it can show anything (routes.ts keeps it eager).
// Does NOT: contain any other screen of the old other.ts (those load on demand, see routes.ts and prefetch.ts), or
//   change what the screen shows.
// Owner layer: renderer/screens. Why: split out of other.ts so the screens that are not shown at start stay out of the
//   first JS file (Phase 5.1b).
// Covering test: test/screens-main.test.ts (HTML snapshot), test/notes.test.ts (note reminders on the screen).
import { RkName } from '../rankName';
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, Icon, PageHeader } from '../ui';
import { useNav, useStore } from '../store';
import { DayFormsDialog } from './dayForms';
import { useNowMin } from '../clock';
import { useUsbCopy } from '../common';
import { newsSince, usbDue } from '../../shared/reminders';

import { frouraEmpty } from '../sheets';
import { kolColName, dutyStartOf, TYPES, type Status } from '../../shared/domain';
import { ReturnsList } from './returnsList';
import { kolView, personMap, strengthOf, strengthAt, awayText } from '../../shared/rules';
import { dm, dmy, dow, nowHM, parseD, DOW_GEN } from '../../shared/dates';
import { outCountOn } from '../../shared/weaponView';

import { punLbl } from '../../shared/punish';
import { SourcesAlert } from './srcStatus';
import { awayToday, endText, outUntilText, scanRecords, todayTasks } from './todayView';
import { appTitle } from '../../shared/brand';
import { statusLbl } from '../../shared/ranks';
import { UNIT, HK } from '../../shared/unit';

/** Label and badge tone of each audit source (app, Excel, import, automatic); the History screen shows the same. */
export const SRC: Record<string, [string, string]> = {
  app: ['Εφαρμογή', 'outline'],
  excel: ['Excel', 'info'],
  import: ['Εισαγωγή', 'ey'],
  auto: ['Αυτόματα', 'ok'],
};

/** The «Σήμερα» screen. */
export function TodayScreen() {
  const { state, today, tomorrow, boot, audit } = useStore();
  const nav = useNav();
  const usb = useUsbCopy();
  const [forms, setForms] = useState(false);
  const due = usbDue(boot.lastUsb, today);
  const news = newsSince(audit, boot.seenUntil, boot.sessionStart);
  const pm = personMap(state.people);
  const now = useNowMin();
  const c = useMemo(() => strengthOf(state, today, strengthAt(state.rules, today, today, now)), [state, today, now]);
  // Away today with the reason and until when; the list stops at 12, the rest are on the Δύναμη screen
  const away = useMemo(() => awayToday(state, today, now), [state, today, now]);
  // Out/DN: until when the person is away («ως 22:00», «ως Δευ 06:00»), else «σήμερα» when the return is unknown
  const outUntil = (s: Status) => outUntilText(state, s, today);
  const empty = frouraEmpty(state, tomorrow);
  // People prevented (κωλυόμενοι) declared today (duty outside our unit), at the same moment as the present count
  const kol = useMemo(() => kolView(state, today, strengthAt(state.rules, today, today, now)), [state, today, now]);
  // Weapons out now: the same people the Οπλισμός header counts (movements and armed duties)
  const wOut = useMemo(
    () => outCountOn(state, today, nowHM()),
    [
      state.people,
      state.settings,
      state.rules,
      state.guards,
      state.dutyLog,
      state.weaponLog,
      state.dutyFix,
      today,
      now,
    ],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  // One scan of all statuses, only when they change (not on every render of «Σήμερα»)
  const { ending, endTom, expired, nRec } = useMemo(
    () => scanRecords(state, pm, today, tomorrow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.statuses, state.settings.lists, state.people, today, tomorrow],
  );
  const endTxt = (s: Status) => endText(state, s, today, tomorrow, now);
  const what = (s: Status) =>
    s.type === 'PUN' ? 'ποινή (' + punLbl(s.kind) + ')' : statusLbl(s, state.settings.lists);
  if (!c.total)
    return html`<div className="onboard"><${Card} title=${'Καλώς ήρθες στο ' + appTitle(state.settings)}>
    <p style=${{ marginTop: 0 }}>Για να ξεκινήσεις χρειάζεται το προσωπικό ${UNIT().nom === 'Λόχος' ? 'του Λόχου' : 'της Ίλης'}. Πάρ' το από το Δυναμολόγιο (το αρχείο .xlsm με το φύλλο «ΣΥΝΟΛΙΚΟ»).</p>
    <ol><li>Πάτα <b>Εισαγωγή Δυναμολογίου</b> και διάλεξε το αρχείο.</li><li>Δες τι βρέθηκε και πάτα <b>Εισαγωγή</b>.</li><li>Στις <b>Ρυθμίσεις</b> βάλε τα στελέχη ανά βαθμό για την ${HK()}.</li></ol>
    <${Button} onClick=${() => nav.go('templates', { tab: 'import' })}>Εισαγωγή Δυναμολογίου<//>
  <//></div>`;
  // What must be done today (numbered) and what merely ends
  const tasks = todayTasks({ state, pm, today, tomorrow, empty, due, boot, nav, usb });
  const ends = [
    ...expired.map((s) => ({
      s,
      when: 'έληξε χθες, αφαιρέθηκε αυτόματα',
      tip: 'Από σήμερα δεν ισχύει· γράφτηκε στο Ιστορικό',
    })),
    ...ending.map((s) => ({ s, when: 'λήγει σήμερα', tip: endTxt(s) })),
    ...endTom.map((s) => ({ s, when: 'λήγει αύριο', tip: '' })),
  ];
  const kpi = (l: string, n: number, fn: () => void, tone?: string, tip?: string) =>
    html`<button type="button" className=${'kpi' + (tone ? ' kpi--' + tone : '')} data-tip=${tip} onClick=${fn}><span className="kpi__l">${l}</span><span className="kpi__n">${n}</span></button>`;
  return html`<div>
    <${PageHeader} title="Σήμερα" sub=${'Ημερήσια κατάσταση ' + DOW_GEN[parseD(today).getDay()] + ' ' + dmy(today) + '. ' + (tasks.length ? tasks.length + (tasks.length === 1 ? ' πράγμα θέλει εσένα' : ' πράγματα θέλουν εσένα') + (empty > 0 ? '. Το πρώτο πριν τις ' + dutyStartOf(state.settings) + '.' : '.') : 'Τίποτα δεν περιμένει από σένα αυτή τη στιγμή.')}>
      <div className="page-head__acts"><${Button} variant="outline" onClick=${() => setForms(true)} data-tip=${'Αυριανή ΦΡΟΥΡΑ, σημερινή ' + HK() + ' και Εξοδούχοι: ένας έλεγχος για όλα, μετά «Βγάλε όλα» ή «Τύπωσε όλα»'}>${Icon.print}Έντυπα ημέρας<//><${Button} variant="outline" onClick=${() => nav.go('outs', { outDate: today })}>Εξοδούχοι σήμερα<//><${Button} variant="outline" onClick=${() => nav.go('hkai', { hkaiDate: today })} data-tip="Βγαίνει μόνη της από τις υπηρεσίες και τις καταστάσεις">${HK()} σήμερα<//><${Button} onClick=${() => nav.declare({})} data-tip="Ιατρικό, άδεια, έξοδος, ΔΝ ή ποινή, για έναν ή πολλούς">+ Δήλωσε κατάσταση<//></div><//>
    ${boot.dataFallback && html`<${Alert} tone="warn"><span><b>Τα δεδομένα είναι στο προφίλ του χρήστη</b> (${boot.dataDir}), όχι δίπλα στο GrafeioIlis.exe. Αν μεταφέρεις την εφαρμογή σε άλλο PC, πάρε μαζί και αυτόν τον φάκελο, ή κάνε «Αντίγραφο σε USB».</span><//>`}
    <${SourcesAlert}/>
    <div className="kpis">
      ${kpi('Στρατιώτες', c.total, () => nav.go('people', { filter: 'all' }), undefined, 'Στρατιώτες σε δύναμη. Η ' + HK() + ' μετρά και τα στελέχη, με τις 08:00')}
      ${kpi('Παρόντες', c.present - kol.minus.length, () => nav.go('strength', { strengthDate: today, svCat: 'present' }), undefined, 'Χωρίς τους απόντες και τους κωλυόμενους που αφαιρούνται (' + kol.minus.length + '), όπως η Δύναμη')}
      ${kpi('Απόντες', c.absent, () => nav.go('strength', { strengthDate: today, svCat: 'away' }), undefined, (awayText(c) || 'Κανείς') + '. Κάθε άτομο μία φορά. Ιατρικά σε ισχύ: ' + nRec)}
      ${kpi('Εξοδούχοι', c.counts.OUT + c.counts.DN, () => nav.go('outs', { outDate: today }), undefined, c.counts.OUT + ' έξοδος · ' + c.counts.DN + ' ΔΝ')}
      ${wOut > 0 && kpi('Όπλα εκτός', wOut, () => nav.go('weapons', { wtab: 'moves', wmoves: 'open' }), 'warn', 'Όπλα εκτός οπλοβαστού τώρα, κινήσεις και ένοπλες υπηρεσίες: οι ίδιοι που μετράει ο Οπλισμός. Πάτα για να δεις ποιοι και γιατί')}
      ${kpi('Κενές αύριο', empty, () => nav.go('guard', { guardDate: tomorrow }), empty ? 'bad' : 'ok')}
    </div>
    <div className="cols">
      <${Card} flush=${true} title="Πρέπει σήμερα" actions=${html`<span className="card__meta">${tasks.length ? tasks.length + ' ανοιχτά' : 'όλα εντάξει'}</span>`}>
        ${tasks.length ? html`<ol className="tasks">${tasks.map((t, i) => html`<li key=${t.key}><span className="tasks__n">${i + 1}</span><div><b>${t.title}</b><small className=${t.urgent ? 'txt-bad' : undefined}>${t.sub}</small></div><${Button} variant=${i === 0 ? 'default' : 'outline'} onClick=${t.fn}>${t.btn}<//></li>`)}</ol>` : html`<div className="empty">Όλα εντάξει. Τίποτα δεν περιμένει από σένα αυτή τη στιγμή.</div>`}
      <//>
      <${Card} flush=${true} title=${'Απόντες σήμερα · ' + away.length} actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => nav.go('strength', { strengthDate: today, svCat: 'away' })}>Δύναμη<//>`}>
        ${
          away.length
            ? html`<ul className="rows">${away.slice(0, 12).map(({ p, s }) => html`<li key=${s.id}><button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}><${RkName} p=${p}/></button><${Badge} tone=${TYPES[s.type].tone} className="tag" data-tip=${TYPES[s.type].long} data-tip-side="left">${statusLbl(s, state.settings.lists)} ${TYPES[s.type].cat === 'out' ? outUntil(s) : s.open ? 'χωρίς λήξη' : 'έως ' + dm(s.to) + (s.toTime ? ' ' + s.toTime : '')}<//></li>`)}</ul>
          ${away.length > 12 && html`<p className="note rows__more">Και άλλοι ${away.length - 12} στη Δύναμη.</p>`}`
            : html`<div className="empty">Κανείς δεν λείπει σήμερα.</div>`
        }
      <//>
    </div>
    <div className="cols cols--b">
      ${
        kol.man.length > 0 &&
        html`<${Card} flush=${true} title=${'Κωλυόμενοι · ' + kol.man.length} actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => nav.go('strength', { strengthDate: today, svCat: kol.minus.length ? 'kol' : 'present' })} data-tip="Δύναμη, με τους κωλυόμενους και γιατί">Δύναμη<//>`}>
        <ul className="rows">${kol.man.map(({ p, st, col, minus }) => html`<li key=${st.id}><span style=${{ minWidth: 0 }}><button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}><${RkName} p=${p}/></button><small className="muted" style=${{ display: 'block' }}>${st.type === 'STEP' ? [TYPES.STEP.long, st.note].filter(Boolean).join(' · ') : st.type === 'LEAVE' ? [statusLbl(st, state.settings.lists), st.note].filter(Boolean).join(' · ') : st.note || 'Κωλυόμενος'}${st.noOut || st.type === 'LEAVE' ? ' · χωρίς έξοδο' : ''} · ${st.open ? 'χωρίς λήξη' : 'έως ' + dm(st.to) + (st.toTime ? ' ' + st.toTime : '')}</small></span><${Badge} tone=${minus ? 'warn' : 'outline'} className="tag" data-tip=${minus ? 'Αφαιρείται από τους παρόντες· ' + (col && col !== '-' ? 'στην ' + HK() + ': ' + kolColName(col) : 'δεν μετρά σε στήλη της ' + HK()) : 'Μένει στους παρόντες, δεν μπαίνει στην ' + HK()} data-tip-side="left">${minus ? (col && col !== '-' ? kolColName(col) : 'εκτός ' + HK()) : 'παρών'}<//></li>`)}</ul>
        <p className="note rows__more">${kol.minus.length} αφαιρούνται από τους παρόντες${kol.keep.length ? ', ' + kol.keep.length + ' μένουν παρόντες' : ''}.</p>
      <//>`
      }
      ${away.length > 0 && html`<${Card} flush=${true} title="Ποιοι γυρίζουν και πότε" actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => nav.go('outs', { outDate: today })}>Εξοδούχοι<//>`}><${ReturnsList} date=${today} limit=${12} at=${strengthAt(state.rules, today, today, now)}/><//>`}
      ${
        ends.length > 0 &&
        html`<${Card} flush=${true} title="Λήγουν" actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => nav.go('records', { recTab: expired.length ? 'expired' : 'med' })}>Ιατρικά<//>`}>
        <ul className="rows">${ends.map(({ s, when, tip }) => html`<li key=${s.id}><button type="button" className="linkish" onClick=${() => nav.openPerson(s.pid)}><${RkName} p=${pm.get(s.pid)!}/></button><span className="muted" data-tip=${tip || undefined} data-tip-side="left">${what(s)} · ${when}</span></li>`)}</ul>
      <//>`
      }
      ${
        news.length > 0 &&
        html`<${Card} flush=${true} title="Από το προηγούμενο άνοιγμα" actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => nav.go('history')}>Όλο το ιστορικό<//>`}>
        <ul className="log log--compact">${news.slice(0, 10).map((e) => html`<li key=${e.id}><span className="log__time">${e.day === today ? '' : dow(e.day) + ' ' + dm(e.day) + ' '}<b>${e.at}</b></span><div>${e.text}</div><span className="log__src">${SRC[e.source][0]}</span></li>`)}</ul>
        ${news.length > 10 && html`<p className="note" style=${{ margin: '8px 0 0' }}>Και άλλες ${news.length - 10} ενέργειες στο Ιστορικό.</p>`}
      <//>`
      }
    </div>
    ${forms && html`<${DayFormsDialog} onClose=${() => setForms(false)}/>`}
  </div>`;
}
