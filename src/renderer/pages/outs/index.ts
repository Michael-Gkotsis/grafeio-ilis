// Public API of pages/outs: the «Εξοδούχοι» screen (route `outs`), its Excel-format select and its pure rules.
// Import from here only (the architecture test rejects deep imports from other layers).
export { OutsScreen } from './ui/OutsScreen';
export { OutsFmtSelect } from './ui/OutsFmtSelect';
export {
  OUT_OPTS,
  OUT_OPTS_SAT,
  countOf,
  filterOutRows,
  mergeDraft,
  noteChangesOf,
  outCounts,
  outDaysOf,
  outDiffs,
  pendingDays,
  roomsTxt,
  savedOuts,
  sunWhyOf,
  toChanges,
  valLbl,
  valTone,
  weekendSunPids,
  withChoice,
  type AwayMap,
  type OutDraft,
  type OutVal,
} from './model/view';
