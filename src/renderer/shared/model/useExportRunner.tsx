// Making a form: the call to the main process, the busy flag and the pre-flight gate.
// Purpose: `useExportRunner` returns `exec` (one export, with `ack` = «Το ξέρω, συνέχισε»), `start` (what the buttons call),
// the pending `gate` (checks that stopped an export) and the busy kind. A second click while busy does nothing.
// Does NOT: draw the gate dialog (ExportProvider.tsx) or the buttons (widgets/export).
// Owner layer: renderer/shared/model. Why: moved verbatim from renderer/common.ts (Phase 5.3b).
// Covering test: test/reports-flow.test.ts.
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ExportKind } from '../../../shared/api';
import type { ISODate } from '../../../shared/dates';
import type { Check } from '../../../shared/preflight';
import type { Sig } from '../../../shared/sigs';
import { useToast } from '../ui';
import { useStore } from './store';
import { usePrintFile } from './usePrintFile';

/** An export the pre-flight stopped: the checks to show, and `resolve` for whoever waits for the answer. */
export type Gate = {
  kind: ExportKind;
  date: ISODate;
  label: string;
  print: boolean;
  sigs?: Sig[];
  checks: Check[];
  resolve: (ok: boolean) => void;
};

/** What `exportOnce` needs from the hook. */
interface RunCtx {
  toast: ReturnType<typeof useToast>;
  sync: () => Promise<unknown>;
  printFile: ReturnType<typeof usePrintFile>;
  busyRef: { current: boolean };
  setBusy: (k: ExportKind | null) => void;
  setGate: Dispatch<SetStateAction<Gate | null>>;
}
type ExecFn = (
  kind: ExportKind,
  date: ISODate,
  label: string,
  ack: boolean,
  print?: boolean,
  sigs?: Sig[],
) => Promise<boolean>;

/** One export. A failure with checks opens the gate and waits for the answer; a locked file offers «Ξανά» (`again`). */
async function exportOnce(
  c: RunCtx,
  again: ExecFn,
  kind: ExportKind,
  date: ISODate,
  label: string,
  ack: boolean,
  print = false,
  sigs?: Sig[],
): Promise<boolean> {
  if (c.busyRef.current) return false;
  c.busyRef.current = true;
  c.setBusy(kind);
  let r: Awaited<ReturnType<typeof window.api.exportFile>>;
  try {
    r = await window.api.exportFile(kind, date, { open: !print, print, ack, ...(sigs ? { sigs } : {}) });
  } catch (e) {
    r = { ok: false, error: String(e) } as typeof r;
  } finally {
    c.busyRef.current = false;
    c.setBusy(null);
  }
  if (!r.ok) {
    if (r.checks?.length)
      return new Promise<boolean>((resolve) =>
        c.setGate((g) => {
          g?.resolve(false);
          return { kind, date, label, print, sigs, checks: r.checks!, resolve };
        }),
      );
    c.toast({
      text: (
        <span>
          <b>Δεν βγήκε {label}.</b> {r.error}
        </span>
      ),
      actions: r.locked
        ? [
            {
              label: 'Ξανά',
              fn: () => {
                again(kind, date, label, ack, print, sigs);
              },
            },
          ]
        : undefined,
    });
    return false;
  }
  await c.sync(); // «βγήκε» και ιστορικό: μόνο ό,τι άλλαξε
  const file = r.file;
  c.toast({
    text: (
      <span>
        Βγήκε {label}: <b>{file.split(/[\\/]/).pop()}</b>
        {r.warnings.length ? (
          <>
            <br />⚠ {r.warnings.join(' · ')}
          </>
        ) : (
          ''
        )}
      </span>
    ),
    actions: [
      ...(print
        ? []
        : [
            {
              label: 'Εκτύπωση',
              fn: () => {
                c.printFile(file);
              },
            },
          ]),
      { label: 'Φάκελος', fn: () => window.api.openFolder('output') },
    ],
  });
  return true;
}

/**
 * Βγάζει ένα έντυπο από το template και ανοίγει το αρχείο στο Excel (ή, με print, την προεπισκόπηση εκτύπωσης).
 * Πρώτα ο προέλεγχος (έρευνα §3.6): ✕ σταματά με «Δείξε μου», ⚠ θέλει «Το ξέρω, συνέχισε» και γράφεται στο ιστορικό.
 */
export function useExportRunner() {
  const toast = useToast();
  const { sync } = useStore();
  const printFile = usePrintFile();
  const [gate, setGate] = useState<Gate | null>(null);
  // Ποιο έντυπο βγαίνει τώρα: τα κουμπιά δείχνουν «Δημιουργία…» και δεύτερο κλικ δεν ξεκινά δεύτερη εξαγωγή
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const busyRef = useRef(false);
  const exec: ExecFn = useCallback(
    (kind: ExportKind, date: ISODate, label: string, ack: boolean, print = false, sigs?: Sig[]) =>
      exportOnce({ toast, sync, printFile, busyRef, setBusy, setGate }, exec, kind, date, label, ack, print, sigs),
    [toast, sync, printFile],
  );
  const start = useCallback(
    (kind: ExportKind, date: ISODate, label: string, print?: boolean, sigs?: Sig[]) =>
      exec(kind, date, label, false, !!print, sigs),
    [exec],
  );
  return { gate, setGate, busy, exec, start };
}
