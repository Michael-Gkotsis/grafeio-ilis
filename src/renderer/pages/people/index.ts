// Public API of pages/people: the «Δυναμολόγιο» screen (route `people`), its two dialogs and its pure rules.
// Import from here only (the architecture test rejects deep imports from other layers).
export { PeopleScreen } from './ui/PeopleScreen';
export { SaveViewDialog } from './ui/SaveViewDialog';
export { BaselineReviewDialog } from './ui/BaselineReviewDialog';
export { CellDialog, CodesDialog } from './ui/ImerDialogs';
export {
  BASE_KINDS,
  COLS,
  COL_W,
  COL_WN,
  DEF_SORT,
  HEAD_KEYS,
  NARROW_HIDE,
  ariaSort,
  colsOf,
  countFilters,
  gridOf,
  nextSort,
  roomCounts,
  sortRows,
  stTxt,
} from './model/view';
