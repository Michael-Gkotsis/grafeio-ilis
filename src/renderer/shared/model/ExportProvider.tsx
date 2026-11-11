// The provider of the export context, and the pre-flight gate dialog.
// Purpose: `ExportProvider` gives the buttons below it `start` and the busy kind; when the pre-flight stops an export it
// shows the checks («Δείξε μου» for each) and, for warnings only, «Το ξέρω, συνέχισε».
// Does NOT: draw the buttons (widgets/export) or make the file (useExportRunner.tsx).
// Owner layer: renderer/shared/model. Why: moved verbatim from renderer/common.ts (Phase 5.3b); Shell mounts it once.
// Covering test: test/reports-flow.test.ts.
import type { ReactNode } from 'react';
import { dayName, dmy } from '../../../shared/dates';
import type { Check } from '../../../shared/preflight';
import { GO } from '../lib/exportGo';
import { Button, Dialog } from '../ui';
import { ExportBusyCtx, ExportCtx } from './export';
import { useNav } from './nav';
import { useExportRunner, type Gate } from './useExportRunner';

type Runner = ReturnType<typeof useExportRunner>;

/** The footer of the gate: only «Κλείσιμο» when a check failed, else «Άκυρο» and «Το ξέρω, συνέχισε». */
function gateFoot(r: Runner, errs: Check[], close: (ok: boolean) => void) {
  const { gate, setGate, exec } = r;
  if (errs.length)
    return (
      <Button data-autofocus="" onClick={() => close(false)}>
        Κλείσιμο
      </Button>
    );
  return (
    <>
      <Button variant="outline" data-autofocus="" onClick={() => close(false)}>
        Άκυρο
      </Button>
      <Button
        onClick={async () => {
          const g = gate!;
          setGate(null);
          g.resolve(await exec(g.kind, g.date, g.label, true, g.print, g.sigs));
        }}
      >
        Το ξέρω, συνέχισε
      </Button>
    </>
  );
}

/** The gate dialog: every check with its «Δείξε μου», then the note about what continuing means. */
function gateDialog(
  r: Runner,
  gate: Gate,
  c: { errs: Check[]; warns: Check[]; close: (ok: boolean) => void; show: (c: Check) => void },
) {
  const { errs, warns, close, show } = c;
  return (
    <Dialog
      role="alertdialog"
      title={errs.length ? 'Δεν μπορεί να βγει ' + gate.label : 'Έλεγχος πριν βγει ' + gate.label}
      description={dayName(gate.date) + ' ' + dmy(gate.date)}
      onClose={() => close(false)}
      footer={gateFoot(r, errs, close)}
    >
      <ul className="preflight">
        {[...errs, ...warns].map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the checks have no id; the position is the identity (as before)
          <li key={i} className={c.level === 'err' ? 'is-err' : 'is-warn'}>
            <span className="preflight__ic">{c.level === 'err' ? '✕' : '⚠'}</span>
            <span>{c.text}</span>
            {c.go && (
              <Button size="sm" variant="link" onClick={() => show(c)}>
                Δείξε μου
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="note" style={{ margin: 0 }}>
        {errs.length
          ? 'Διόρθωσε τα ✕ και ξαναδοκίμασε. Έτσι δεν φεύγει ποτέ λάθος έντυπο.'
          : 'Αν συνεχίσεις, οι προειδοποιήσεις γράφονται στο Ιστορικό.'}
      </p>
    </Dialog>
  );
}

/** Mount once around the app (Shell does). `children` can use `useExport` and `useExportBusy`. */
export function ExportProvider({ children }: { children?: ReactNode }) {
  const r = useExportRunner();
  const { gate, setGate, busy, start } = r;
  const nav = useNav();
  const close = (ok: boolean) => {
    const g = gate;
    setGate(null);
    g?.resolve(ok);
  };
  const errs = gate ? gate.checks.filter((c) => c.level === 'err') : [];
  const warns = gate ? gate.checks.filter((c) => c.level === 'warn') : [];
  const show = (c: Check) => {
    const g = gate!;
    close(false);
    if (c.go) {
      const [v, p] = GO[c.go](g.date);
      nav.go(v, p);
    }
  };
  return (
    <ExportCtx.Provider value={start}>
      <ExportBusyCtx.Provider value={busy}>
        {children}
        {gate && gateDialog(r, gate, { errs, warns, close, show })}
      </ExportBusyCtx.Provider>
    </ExportCtx.Provider>
  );
}
