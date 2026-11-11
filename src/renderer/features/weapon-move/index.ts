// Public API of features/weapon-move: the dialogs and pop-ups that take a weapon out of the rack and bring it back,
// the ΕΝΤΟΣ | ΕΚΤΟΣ switch of a row, and the small pieces the Οπλισμός screen shares with them.
// Import from here only (the architecture test rejects deep imports from other layers).
export { BulkFixDialog } from './ui/BulkFixDialog';
export { DutyFixDialog } from './ui/DutyFixDialog';
export { EditMoveDialog } from './ui/EditMoveDialog';
export { Key, type KeyProps } from './ui/Key';
export { Pop, type PopProps } from './ui/Pop';
export { WeaponInDialog } from './ui/WeaponInDialog';
export { WeaponOutDialog } from './ui/WeaponOutDialog';
export { WeaponState } from './ui/WeaponState';
export { reasonLbl } from './model/text';
export type { BulkFixDialogProps } from './model/useBulkFix';
export type { DutyFixDialogProps } from './model/useDutyFix';
export type { EditMoveDialogProps } from './model/useEditMove';
export type { WeaponInDialogProps } from './model/useWeaponIn';
export type { WeaponOutDialogProps } from './model/useWeaponOut';
export type { WeaponStateProps } from './model/useWeaponState';
