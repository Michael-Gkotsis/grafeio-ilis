// Public API of features/person-edit: the dialogs that edit or add a soldier, and the Σ.Ι. / room fields of their form.
// Import from here only (the architecture test rejects deep imports from other layers).
export { EditPersonDialog } from './ui/EditPersonDialog';
export { NewPersonDialog } from './ui/NewPersonDialog';
export { SiField, type SiFieldProps } from './ui/SiField';
export { RoomField, type RoomFieldProps } from './ui/RoomField';
