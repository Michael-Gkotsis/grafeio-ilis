// The export context: how a form is made, and which one is being made right now.
// Purpose: `ExportCtx` holds the function the buttons call (`useExport`), `ExportBusyCtx` the kind being made (`useExportBusy`).
// Does NOT: make the file (ExportProvider.tsx / useExportRunner.tsx do) or draw buttons (widgets/export).
// Owner layer: renderer/shared/model. Why: moved down from renderer/common.ts (Phase 5.3b); screens, features and widgets read it.
// Covering test: test/reports-flow.test.ts.
import { createContext, useContext } from 'react';
import type { ExportKind } from '../../../shared/api';
import type { ISODate } from '../../../shared/dates';
import type { Sig } from '../../../shared/sigs';

/** Makes a form: `(kind, date, label, print?, sigs?)`; resolves true when a file was made. `sigs`: only for this time. */
export type ExportFn = (
  kind: ExportKind,
  date: ISODate,
  label: string,
  print?: boolean,
  sigs?: Sig[],
) => Promise<boolean>;

/** The kind being made now, or null. */
export const ExportBusyCtx = createContext<ExportKind | null>(null);

/** The export function; the default does nothing and resolves false (no provider). */
export const ExportCtx = createContext<ExportFn>(async () => false);

/** The function the export buttons call. */
export const useExport = () => useContext(ExportCtx);

/** Which form is being made right now (the buttons show «Δημιουργία…»), or null. */
export const useExportBusy = () => useContext(ExportBusyCtx);
