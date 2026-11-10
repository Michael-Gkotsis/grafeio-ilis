// The renderer's copy of the app state and the commands that change it.
// Purpose: the `StoreValue` shape, its React context and the `useStore` hook every screen reads.
// Does NOT: hold state (Root builds the value, see useStoreValue.tsx), talk to the main process, or search people
//   (src/renderer/shared/lib/searchPeople.ts).
// Owner layer: renderer/app. Why: the state lives in the main process; the UI keeps the last copy and sends commands.
// Covering test: test/support/screens-harness.ts (provides it to every screen test), test/behaviour tests.
import { createContext, useContext } from 'react';
import type { AppState, AuditEntry } from '../../shared/domain';
import type { Boot } from '../../shared/api';
import type { Command } from '../../shared/commands';
import type { ISODate } from '../../shared/dates';

/** What `useStore()` returns. Unchanged parts of `state` keep their reference, so memoised lookups survive. */
export interface StoreValue {
  state: AppState;
  audit: AuditEntry[];
  boot: Boot;
  /** ISODate, local app time. */
  today: ISODate;
  /** ISODate, `today + 1`. */
  tomorrow: ISODate;
  /** Runs a command. Resolves to the new state, or `null` when it was not done (an error toast was shown). */
  run(cmd: Command, okText?: string | false): Promise<AppState | null>;
  /** Undoes one action; `id` is given only when it must still be the last undoable action. */
  undo(id?: number): Promise<void>;
  /** «Αναίρεση» for a toast: undoes the action that just happened, not whichever is last when it is clicked. */
  undoMark(): { label: string; fn: () => void; undoId?: number };
  /** Everything from scratch (new day, import). */
  refresh(): Promise<void>;
  /** Only what changed (after an export etc.). */
  sync(): Promise<void>;
}

/** Provided by Root; `null` outside it (a screen rendered without the shell is a bug). */
export const StoreCtx = createContext<StoreValue>(null as unknown as StoreValue);

/** The store of the nearest Root. */
export const useStore = () => useContext(StoreCtx);

/** Same hook under the name the architecture plan uses. */
export const useAppState = useStore;
