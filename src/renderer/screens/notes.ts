// Deprecated path: the screen moved to pages/notes (Phase 6); this re-export goes in Phase 7.
export { NotesScreen } from '../pages/notes';

// Deprecated path: NoteDialog and EditDialog moved to features/note-compose (Phase 5.3b). Removed in Phase 7.
export { NoteDialog, EditDialog } from '../features/note-compose';

// Deprecated path: NoteDot moved to entities/note (Phase 5.3a).
export { NoteDot } from '../entities/note';

// Deprecated paths: the tab moved to features/note-compose, the label and the alert to entities/note (Phase 5.3c). Removed in Phase 7.
export { NotesTab } from '../features/note-compose';
export { TodayAlert, notesTabLabel } from '../entities/note';
