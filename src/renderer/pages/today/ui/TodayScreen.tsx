// «Σήμερα», the first screen: counts, the tasks of the day, who is away and what ends.
// Purpose: `TodayScreen`, the only screen the app loads before it can show anything (routes.ts keeps it eager).
// Does NOT: hold state (model/useToday.ts), hold the rules (model/view.ts) or draw the cards (ui/TodayCards.tsx).
// Owner layer: renderer/pages/today. Why: moved from screens/today.ts (Phase 6); htm became TSX with the same markup,
//   text nodes, keys and hook order. The parts are plain functions called as `{part(x)}`, not components, so the
//   React render counts stay as they were.
// Covering test: test/screens-main.test.ts (HTML snapshot), test/notes.test.ts (note reminders on the screen),
//   test/today-page-view.test.ts.
import { DayFormsDialog } from '../../../features/day-forms';
import { SourcesAlert } from '../../../widgets/sources-alert';
import { Alert, Button, Icon, PageHeader } from '../../../shared/ui';
import { dutyStartOf } from '../../../../shared/domain';
import { awayText } from '../../../../shared/rules';
import { HK } from '../../../../shared/unit';
import { useToday } from '../model/useToday';
import { endRows, todaySub, todayTasks } from '../model/view';
import { awayCard, endsCard, kolCard, newsCard, onboarding, returnsCard, tasksCard } from './TodayCards';

/** The «Σήμερα» page. */
export function TodayScreen() {
  const t = useToday();
  const { state, today, tomorrow, boot, nav, usb, forms, setForms, due, pm, c, empty, kol, wOut, scan } = t;
  if (!c.total) return onboarding(state, nav);
  // What must be done today (numbered) and what merely ends
  const tasks = todayTasks({ state, pm, today, tomorrow, empty, due, boot, nav, usb });
  const ends = endRows(scan, t.endTxt);
  const kpi = (l: string, n: number, fn: () => void, tone?: string, tip?: string) => (
    <button type="button" className={'kpi' + (tone ? ' kpi--' + tone : '')} data-tip={tip} onClick={fn}>
      <span className="kpi__l">{l}</span>
      <span className="kpi__n">{n}</span>
    </button>
  );
  return (
    <div>
      <PageHeader title="Σήμερα" sub={todaySub(today, tasks.length, empty, dutyStartOf(state.settings))}>
        <div className="page-head__acts">
          <Button
            variant="outline"
            onClick={() => setForms(true)}
            data-tip={
              'Αυριανή ΦΡΟΥΡΑ, σημερινή ' +
              HK() +
              ' και Εξοδούχοι: ένας έλεγχος για όλα, μετά «Βγάλε όλα» ή «Τύπωσε όλα»'
            }
          >
            {Icon.print}Έντυπα ημέρας
          </Button>
          <Button variant="outline" onClick={() => nav.go('outs', { outDate: today })}>
            Εξοδούχοι σήμερα
          </Button>
          <Button
            variant="outline"
            onClick={() => nav.go('hkai', { hkaiDate: today })}
            data-tip="Βγαίνει μόνη της από τις υπηρεσίες και τις καταστάσεις"
          >
            {HK()} σήμερα
          </Button>
          <Button onClick={() => nav.declare({})} data-tip="Ιατρικό, άδεια, έξοδος, ΔΝ ή ποινή, για έναν ή πολλούς">
            + Δήλωσε κατάσταση
          </Button>
        </div>
      </PageHeader>
      {boot.dataFallback && (
        <Alert tone="warn">
          <span>
            <b>Τα δεδομένα είναι στο προφίλ του χρήστη</b> ({boot.dataDir}), όχι δίπλα στο GrafeioIlis.exe. Αν
            μεταφέρεις την εφαρμογή σε άλλο PC, πάρε μαζί και αυτόν τον φάκελο, ή κάνε «Αντίγραφο σε USB».
          </span>
        </Alert>
      )}
      <SourcesAlert />
      <div className="kpis">
        {kpi(
          'Στρατιώτες',
          c.total,
          () => nav.go('people', { filter: 'all' }),
          undefined,
          'Στρατιώτες σε δύναμη. Η ' + HK() + ' μετρά και τα στελέχη, με τις 08:00',
        )}
        {kpi(
          'Παρόντες',
          c.present - kol.minus.length,
          () => nav.go('strength', { strengthDate: today, svCat: 'present' }),
          undefined,
          'Χωρίς τους απόντες και τους κωλυόμενους που αφαιρούνται (' + kol.minus.length + '), όπως η Δύναμη',
        )}
        {kpi(
          'Απόντες',
          c.absent,
          () => nav.go('strength', { strengthDate: today, svCat: 'away' }),
          undefined,
          (awayText(c) || 'Κανείς') + '. Κάθε άτομο μία φορά. Ιατρικά σε ισχύ: ' + scan.nRec,
        )}
        {kpi(
          'Εξοδούχοι',
          c.counts.OUT + c.counts.DN,
          () => nav.go('outs', { outDate: today }),
          undefined,
          c.counts.OUT + ' έξοδος · ' + c.counts.DN + ' ΔΝ',
        )}
        {wOut > 0 &&
          kpi(
            'Όπλα εκτός',
            wOut,
            () => nav.go('weapons', { wtab: 'moves', wmoves: 'open' }),
            'warn',
            'Όπλα εκτός οπλοβαστού τώρα, κινήσεις και ένοπλες υπηρεσίες: οι ίδιοι που μετράει ο Οπλισμός. Πάτα για να δεις ποιοι και γιατί',
          )}
        {kpi('Κενές αύριο', empty, () => nav.go('guard', { guardDate: tomorrow }), empty ? 'bad' : 'ok')}
      </div>
      <div className="cols">
        {tasksCard(tasks)}
        {awayCard(t)}
      </div>
      <div className="cols cols--b">
        {kol.man.length > 0 && kolCard(t)}
        {t.away.length > 0 && returnsCard(t)}
        {ends.length > 0 && endsCard(t, ends)}
        {t.news.length > 0 && newsCard(t)}
      </div>
      {forms && <DayFormsDialog onClose={() => setForms(false)} />}
    </div>
  );
}
