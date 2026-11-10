// The top bar: back button, brand, search button, ESSO chip, update/Excel chips, legend, history, guide, clock, undo.
// Purpose: `TopBar` draws the header from props and the store; every click calls back into the shell.
// Does NOT: keep state, bind keys (useShortcuts.ts) or decide the texts of the clock and undo (useShellInfo.ts).
// Owner layer: renderer/app. Why: it was the first 25 lines of Shell's markup. It re-renders with Shell on purpose, so
//   the clock text and tooltips stay as fresh as before.
// Covering test: test/screens-main.test.ts (screen-shell-full / screen-shell-rail snapshots), test/guide.test.ts.
import type { AuditEntry } from '../../shared/domain';
import type { ISODate } from '../../shared/dates';
import type { UpdInfo } from '../../shared/api';
import { appLogo } from '../../shared/brand';
import { dm, dmy, dow } from '../../shared/dates';
import { Button, Icon, Kbd, Logo } from '../ui';
import { UpdateChip } from '../update';
import { ExcelChip } from './ExcelChip';
import { useNav, type Nav } from './nav';
import { screenName } from './routes';
import type { ScreenId } from './screenId';
import { useStore, type StoreValue } from './store';

interface TopBarProps {
  /** View the «Πίσω» button goes to, or `undefined` when there is no history. */
  backTo: ScreenId | undefined;
  goBack: () => void;
  help: () => void;
  title: string;
  /** ESSO of the unit, empty when unknown. */
  essos: string;
  /** hh:mm, app time. */
  hm: string;
  clockTip: string;
  /** The action the undo button would undo, if any. */
  lastUndo: AuditEntry | undefined;
  upd: UpdInfo | null;
  onOpenUpdate: () => void;
  onOpenLegend: () => void;
  onOpenPalette: () => void;
}

/** The date and time button; a click opens Settings › Time and time zone. */
function clockButton(p: Pick<TopBarProps, 'hm' | 'clockTip'>, today: ISODate, go: Nav['go']) {
  return (
    <button
      type="button"
      className="today-lbl"
      aria-label={'Σήμερα ' + dow(today) + ' ' + dmy(today) + ' ώρα ' + p.hm}
      data-tip={p.clockTip}
      data-tip-side="bottom"
      onClick={() => go('templates', { tab: 'clock' })}
    >
      {dow(today)}
      <b>
        {dm(today)}
        <span className="today-yr">{dmy(today).slice(5)}</span>
      </b>
      <b className="today-time">{p.hm}</b>
    </button>
  );
}

/** «Αναίρεση» with a tooltip that names the action it would undo (and Ctrl+Z). */
function undoButton(lastUndo: AuditEntry | undefined, today: ISODate, undo: StoreValue['undo']) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!lastUndo}
      data-tip={
        lastUndo
          ? 'Αναίρεση: ' +
            lastUndo.text +
            ' (' +
            (lastUndo.day === today ? '' : dm(lastUndo.day) + ' ') +
            lastUndo.at +
            ') · Ctrl+Z'
          : 'Δεν υπάρχει κάτι για αναίρεση'
      }
      data-tip-side="left"
      onClick={() => undo()}
    >
      Αναίρεση
    </Button>
  );
}

/** The right side of the bar: update and Excel chips, legend, history, guide, clock, undo. */
function TopBarTools(p: TopBarProps) {
  const { boot, today, undo } = useStore();
  const { view, go } = useNav();
  const { lastUndo } = p;
  return (
    <div className="topbar__right">
      <UpdateChip u={p.upd} onOpen={p.onOpenUpdate} />
      <ExcelChip />
      {boot.version === 'dev' && (
        <span
          className="mockchip"
          data-tip="Δοκιμή στον browser: φανταστικά δεδομένα, τίποτα δεν αποθηκεύεται"
          data-tip-side="left"
        >
          Δοκιμαστικό
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        data-tip="Τι σημαίνει κάθε κωδικός (Shift+F1)"
        data-tip-side="left"
        onClick={p.onOpenLegend}
      >
        Υπόμνημα
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Ιστορικό ενεργειών"
        data-tip="Ιστορικό ενεργειών και αναίρεση"
        data-tip-side="bottom"
        className={view === 'history' ? 'is-on' : undefined}
        onClick={() => go('history')}
      >
        {Icon.history}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Οδηγός χρήσης"
        data-tip="Οδηγός: πώς δουλεύει αυτή η οθόνη και τι επηρεάζει (F1)"
        data-tip-side="left"
        onClick={p.help}
      >
        {Icon.help}
      </Button>
      {clockButton(p, today, go)}
      {undoButton(lastUndo, today, undo)}
    </div>
  );
}

/** The header of the shell. */
export function TopBar(p: TopBarProps) {
  const { state, boot } = useStore();
  return (
    <header className="topbar">
      <Button
        variant="ghost"
        size="icon"
        className="backbtn"
        aria-label="Πίσω"
        data-tip={p.backTo ? 'Πίσω στο ' + screenName(p.backTo) + ' (Alt+←)' : 'Πίσω (Alt+←)'}
        disabled={!p.backTo}
        onClick={p.goBack}
      >
        {Icon.back}
      </Button>
      <div className="brand" data-tip={'Έκδοση ' + boot.version}>
        <Logo size={30} {...appLogo(state.settings)} />
        <span>
          {p.title}
          <small>{state.settings.unit[2] || ''}</small>
        </span>
      </div>
      <button
        type="button"
        className="searchbtn"
        aria-label="Αναζήτηση"
        data-tip="Βρες άνθρωπο ή ενέργεια από οπουδήποτε (Ctrl+K)"
        onClick={p.onOpenPalette}
      >
        {Icon.search}
        <span>Αναζήτηση προσώπου ή ενέργειας…</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      {p.essos && (
        <span
          className="essochip"
          data-tip={
            state.settings.essos ? 'Η τωρινή ΕΣΣΟ (Ρυθμίσεις › ΕΣΣΟ)' : 'ΕΣΣΟ όσων είναι σε δύναμη (από το Δυναμολόγιο)'
          }
          data-tip-side="bottom"
        >
          <small>ΕΣΣΟ</small>
          <b>{p.essos}</b>
        </span>
      )}
      <TopBarTools {...p} />
    </header>
  );
}
