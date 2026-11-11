// Public API of features/update: the client side of the auto-update (the «Νέα έκδοση» chip, its dialog, the Ρυθμίσεις card).
// Import from here only (the architecture test rejects deep imports from other layers).
export { UpdateChip, type UpdateChipProps } from './ui/UpdateChip';
export { UpdateDialog, type UpdateDialogProps } from './ui/UpdateDialog';
export { UpdatesCard } from './ui/UpdatesCard';
export { useUpd, useUpdDialog } from './model/updState';
