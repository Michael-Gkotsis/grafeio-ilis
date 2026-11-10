// The root of the UI: toasts, the store provider and the shell.
// Purpose: `App` is what main.ts renders once the boot data from the main process has arrived.
// Does NOT: hold state (useStoreValue.tsx), route (useRouter.ts) or draw the layout (Shell.tsx).
// Owner layer: renderer/app. Why: formerly the end of src/renderer/app.ts, which now only re-exports `App`.
// Covering test: test/screens-main.test.ts and the behaviour tests that render `App` (test/support/behaviour.ts).
import type { Boot } from '../../shared/api';
import { ToastProvider } from '../ui';
import { Shell } from './Shell';
import { StoreCtx } from './store';
import { useStoreValue } from './useStoreValue';

function Root({ boot }: { boot: Boot }) {
  const store = useStoreValue(boot);
  return (
    <StoreCtx.Provider value={store}>
      <Shell />
    </StoreCtx.Provider>
  );
}

/**
 * The whole application.
 * @param boot - result of `window.api.boot()`: state, audit, version
 */
export function App({ boot }: { boot: Boot }) {
  return (
    <ToastProvider>
      <Root boot={boot} />
    </ToastProvider>
  );
}
