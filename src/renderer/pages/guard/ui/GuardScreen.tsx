// Screen «Υπηρεσίες»: who is on duty each day: the seats of the form, the check, «Ποιος κάνει τι» and the exceptions.
// Purpose: `GuardScreen`, route `guard`. Tabs Θέσεις · Έλεγχος υπηρεσιών · Ποιος κάνει τι · Εξαιρέσεις (and Excel on a
//   narrow screen).
// Does NOT: hold state (model/useGuard.ts), the rules (model/guardView.ts) or the markup of the parts (the other files
//   of ui/, plain functions called as `{part(G)}` so the render count is the one the screen always had).
// Owner layer: renderer/pages/guard. Why: moved from screens/guard.ts (Phase 6); htm became TSX with the same markup,
//   text nodes, keys and hook order. Frozen: key Ν = next empty seat, the seat codes, every `run({ t: … })` command.
// Covering test: test/screens-main.test.ts, test/status-fix.test.ts, test/ux-names.test.ts,
//   test/guard-page-view.test.ts.
import { addDays } from '../../../../shared/dates';
import { AddBlockDialog } from '../../../features/duty-blocks';
import { Button, DateBar, Tabs } from '../../../shared/ui';
import { PrintButton, SigsButton, TemplateNote } from '../../../widgets/export';
import { emptyOn, guardTabs } from '../model/guardView';
import type { Guard } from '../model/useGuard';
import { useGuard } from '../model/useGuard';
import { DutyCheck } from './DutyCheck';
import { FixedDialog } from './FixedDialog';
import { forceDialog, previewDialog, sheet } from './GuardDialogs';
import { guardHeader } from './GuardHeader';
import { guardLeft } from './GuardLeft';
import { guardSide } from './GuardSide';
import { RulesDialog } from './RulesDialog';
import { SkipsView } from './SkipsView';
import { WhoDoes } from './WhoDoes';

// The Excel tab of a narrow screen: the sheet with the export, print and signature buttons.
function excelTab(G: Guard) {
  const { date, xb, exportX } = G;
  return (
    <div className="guard__xl">
      {sheet(G)}
      <div className="toolbar" style={{ marginTop: '10px' }}>
        <Button disabled={!!xb} onClick={exportX}>
          {xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}
        </Button>
        <PrintButton kind="froura" date={date} label="η κατάσταση υπηρεσιών" variant="outline" />
        <SigsButton kind="froura" date={date} label="η κατάσταση υπηρεσιών" />
      </div>
      <TemplateNote ids={['froura', 'check']} />
    </div>
  );
}

// What the current tab shows.
function content(G: Guard, cur: string) {
  const { nav, mon, who, date, mobile, setProf } = G;
  if (cur === 'skips') return <SkipsView onPerson={setProf} />;
  if (cur === 'who') return <WhoDoes key={who.n} date={date} pid={who.pid} />;
  const check = <DutyCheck onOpen={nav.openPerson} m={mon} />;
  if (mobile) return cur === 'posts' ? guardLeft(G) : cur === 'check' ? check : excelTab(G);
  return cur === 'posts' ? (
    <div className="guard">
      {guardLeft(G)}
      {guardSide(G)}
    </div>
  ) : (
    check
  );
}

/** The «Υπηρεσίες» page. */
export function GuardScreen() {
  const G = useGuard();
  const { state, today, date, setDate, tab, setTab, mobile, empty, skipN } = G;
  const { rules, setRules, setFixedOpen, fixedOpen, addOpen, setAddOpen } = G;
  const tabs = guardTabs(empty.length, skipN, mobile);
  const cur = !mobile && tab === 'xl' ? 'posts' : tab;
  return (
    <div>
      {guardHeader(G)}
      <div className="guard__days">
        <DateBar
          value={date}
          onChange={setDate}
          days={[0, 1, 2, 3, 4, 5, 6].map((i) => addDays(today, i))}
          count={(d: string) => emptyOn(state, G.posts, d)}
        />
      </div>
      <div style={{ marginBottom: '14px' }}>
        <Tabs value={cur} onChange={setTab} items={tabs} />
      </div>
      {content(G, cur)}
      {previewDialog(G)}
      {rules && (
        <RulesDialog
          onClose={() => setRules(false)}
          onTab={setTab}
          onFixed={() => {
            setTab('posts');
            setFixedOpen(true);
          }}
        />
      )}
      {fixedOpen && <FixedDialog onClose={() => setFixedOpen(false)} />}
      {addOpen && <AddBlockDialog onClose={() => setAddOpen(false)} />}
      {forceDialog(G)}
    </div>
  );
}
