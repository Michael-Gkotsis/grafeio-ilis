// Public API of pages/hkai: the «ΗΚΑΙ» screen (route `hkai`) and its pure rules.
// Import from here only (the architecture test rejects deep imports from other layers).
export { HkaiScreen } from './ui/HkaiScreen';
export {
  HK_ACC_FIELDS,
  HK_TEXT_FIELDS,
  VEHICLE_FIELDS,
  cadreByRank,
  cadreInColumn,
  cadreTotal,
  hkaiFileName,
  hkaiSources,
  manualLabel,
  manualOf,
  officerNames,
  parseCount,
  usedCells,
  vehicleOf,
  withCell,
  withProvided,
} from './model/view';
