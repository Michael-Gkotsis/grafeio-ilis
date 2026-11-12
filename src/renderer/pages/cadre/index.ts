// Public API of pages/cadre: the «Στελέχη» screen (route `cadre`) and its pure rules.
// Import from here only (the architecture test rejects deep imports from other layers).
export { CadreScreen } from './ui/CadreScreen';
export {
  GRID,
  activeParts,
  cadreStatusMap,
  cadreSub,
  countsPerFilter,
  dateLabel,
  exportToastText,
  filterRows,
  reorderIds,
} from './model/view';
