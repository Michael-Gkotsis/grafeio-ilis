// Deprecated path: the store, nav and people search moved to src/renderer/app/ and src/renderer/shared/lib/.
// Kept so screens and tests import as before; new code imports from the new places.
export { StoreCtx, useStore, useAppState, type StoreValue } from './app/store';
export { NavCtx, useNav, useOpenFrom, type Nav } from './app/nav';
export { searchPeople } from './shared/lib/searchPeople';
