// The top bar (44 px): brand, search, ESSO chip, update/Excel chips, undo, guide, «⋯» menu and clock.
// Purpose: `TopBar` draws the header from props and the store; every click calls back into the shell.
// Does NOT: keep state, bind keys (useShortcuts.ts) or decide the texts of the clock and undo (useShellInfo.ts).
// Owner layer: renderer/app. Why: it was the first 25 lines of Shell's markup. It re-renders with Shell on purpose, so
//   the clock text and tooltips stay as fresh as before. Back, Legend and History moved into TopBarMore.tsx.
// Covering test: test/screens-main.test.ts (screen-shell-full / screen-shell-rail snapshots), test/shell-nav.test.ts.
import type { AuditEntry } from '../../shared/domain';
import type { ISODate } from '../../shared/dates';
import type { UpdInfo } from '../../shared/api';
import { appLogo } from '../../shared/brand';
import { dm, dmy, dow } from '../../shared/dates';
import { Button, Icon, Kbd, Logo } from '../ui';
import { UpdateChip } from '../update';
import { ExcelChip } from './ExcelChip';
import { TopBarMore } from './TopBarMore';
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
      <span className="today-lbl__day">
        {dow(today)} {dm(today)}
      </span>
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

/** The right side of the bar: update and Excel chips, undo, guide, «⋯» menu and clock. */
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
      {undoButton(lastUndo, today, undo)}
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
      <TopBarMore
        backTo={p.backTo ? screenName(p.backTo) : undefined}
        hasUpdate={!!p.upd && (!!p.upd.avail || p.upd.phase !== 'idle')}
        routeKey={view}
        onBack={p.goBack}
        onOpenHistory={() => go('history')}
        onOpenLegend={p.onOpenLegend}
        onOpenUpdate={p.onOpenUpdate}
        onOpenDiag={() => go('diag')}
      />
      {clockButton(p, today, go)}
    </div>
  );
}

/** The header of the shell. */
export function TopBar(p: TopBarProps) {
  const { state, boot } = useStore();
  return (
    <header className="topbar">
      <div className="brand" data-tip={p.title + ' · Έκδοση ' + boot.version} data-tip-side="bottom">
        <Logo size={24} {...appLogo(state.settings)} />
        <span className="brand__text">
          {p.title}
          <small>{state.settings.unit[2] || ''}</small>
        </span>
      </div>
      <button
        type="button"
        className="searchbtn"
        aria-label="Αναζήτηση"
        data-tip="Βρες άνθρωπο, οθόνη ή ενέργεια από οπουδήποτε (Ctrl+K)"
        onClick={p.onOpenPalette}
      >
        {Icon.search}
        <span>Βρες άνθρωπο, οθόνη ή ενέργεια…</span>
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
