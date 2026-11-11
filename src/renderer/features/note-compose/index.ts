// Public API of features/note-compose: writing a note (new or stored) and binding it to people.
// Import from here only (the architecture test rejects deep imports from other layers).
export { NoteDialog, type NoteDialogProps } from './ui/NoteDialog';
export { EditDialog, type EditDialogProps } from './ui/EditDialog';
export { NoteComposer, type NoteComposerProps } from './ui/NoteComposer';
export { useNoteDraft, type NoteDraft, type Draft, type Start } from './model/useNoteDraft';
export { NoteCard, type NoteCardProps } from './ui/NoteCard';
export { NoteGroup, type NoteGroupProps } from './ui/NoteGroup';
export { NotesTab, type NotesTabProps } from './ui/NotesTab';
export { useOpenWho } from './model/useOpenWho';
