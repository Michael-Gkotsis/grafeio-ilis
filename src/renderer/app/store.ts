// Deprecated path: the store context moved to shared/model/store.ts (Phase 5.3a) so lower layers can read it.
// The provider hook that builds the value stays in app/useStoreValue.tsx.
export { StoreCtx, useStore, useAppState, type StoreValue } from '../shared/model/store';
