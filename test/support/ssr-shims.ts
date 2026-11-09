// Module shims for the screen HTML snapshot tests, used from vi.mock factories (see screens-harness.ts header).
// Kept in its own file with NO react imports: a vi.mock factory may not depend on the module it mocks.
// Does NOT: change any src/ behavior; only lets the server renderer accept two client-only APIs.

type Dict = Record<string, unknown>;
type Original = () => Promise<Dict>;

/** React shim for vi.mock('react'): useSyncExternalStore gets a server snapshot (see header). */
export async function mockReact(orig: Original): Promise<Dict> {
  const real = await orig();
  const useSyncExternalStore = (subscribe: unknown, get: () => unknown, getServer?: () => unknown) =>
    (real.useSyncExternalStore as Function)(subscribe, get, getServer ?? get);
  const def = real.default as Dict | undefined;
  return {
    ...real, useSyncExternalStore,
    ...(def ? { default: { ...def, useSyncExternalStore } } : {}),
  };
}

/** react-dom shim for vi.mock('react-dom'): a portal renders its children in place (see header). */
export async function mockReactDom(orig: Original): Promise<Dict> {
  const real = await orig();
  const createPortal = (children: unknown) => children;
  const def = real.default as Dict | undefined;
  return { ...real, createPortal, ...(def ? { default: { ...def, createPortal } } : {}) };
}
