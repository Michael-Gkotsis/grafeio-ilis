// Public API of pages/guide: the «Οδηγός χρήσης» screen and its pure text helpers.
// Import from here only (the architecture test rejects deep imports from other layers).
export { GuideScreen } from './ui/GuideScreen';
export { parseGuide, searchGuide } from './model/view';
