// Public API of pages/notes: the «Σημειώσεις» screen (notes of the office with optional reminders).
// Import from here only (the architecture test rejects deep imports from other layers).
export { NotesScreen } from './ui/NotesScreen';
export { countByFilter, filterNotes, notesSub, openPeople, sortDone, type NotePerson } from './model/view';
