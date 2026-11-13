// Public API of pages/weapons: the «Οπλισμός» screen (route `weapons`) and its pure rules.
// Import from here only (the architecture test rejects deep imports from other layers).
export { WeaponsScreen } from './ui/WeaponsScreen';
export { MovesView } from './ui/MovesView';
export {
  LBL,
  NORM,
  commitRack,
  commitWpos,
  dtCell,
  emptyText,
  filterCounts,
  pasteSeatsPlan,
  pasteWeaponsPlan,
  roomCounts,
  rowSorter,
  saveMessage,
  weaponNotes,
  weaponPlace,
  weaponRows,
  type WeaponField,
  type WeaponNote,
  type WeaponNotes,
  type WeaponSort,
} from './model/view';
