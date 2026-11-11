// Deprecated path: the store and nav contexts moved to src/renderer/shared/model/ and the people search to
// src/renderer/entities/person/ (Phase 5.3a). Kept so screens and tests import as before; new code imports from the new places.
export { StoreCtx, useStore, useAppState, type StoreValue } from './shared/model/store';
export { NavCtx, useNav, useOpenFrom, type Nav } from './shared/model/nav';
export { searchPeople } from './entities/person';
