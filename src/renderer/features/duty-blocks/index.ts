// Public API of features/duty-blocks: choose, add or rename a ΦΡΟΥΡΑ form, and add or edit a service block.
// Import from here only (the architecture test rejects deep imports from other layers).
export { AddBlockDialog, type AddBlockDialogProps } from './ui/AddBlockDialog';
export { BlockForm, type BlockFormProps } from './ui/BlockForm';
export { EditBlockDialog, type EditBlockDialogProps } from './ui/EditBlockDialog';
export { PhaseDialog, type PhaseDialogProps } from './ui/PhaseDialog';
export { PhaseSelect, type PhaseSelectProps } from './ui/PhaseSelect';
export { useBlockForm, type BlockFormState } from './model/useBlockForm';
