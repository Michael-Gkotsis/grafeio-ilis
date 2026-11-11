// Public API of widgets/sources-alert: the «Αρχεία Excel» alert of «Σήμερα» and the status of the files.
// Import from here only (the architecture test rejects deep imports from other layers).
export { SourcesAlert } from './ui/SourcesAlert';
export { useSourceStatus, type SourcesState } from './model/useSourceStatus';
export { base } from './model/view';
