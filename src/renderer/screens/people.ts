// Deprecated path: the screen moved to pages/people (Phase 6); this re-export goes in Phase 7.
export { PeopleScreen, SaveViewDialog, BaselineReviewDialog } from '../pages/people';

// Deprecated path: needsBaselineReview lives in screens/baselineReview.ts (the shell asks it on every render).
export { needsBaselineReview } from './baselineReview';

// Deprecated paths: these dialogs moved to renderer/features/ (Phase 5.3b); removed in Phase 7.
export { DeclareStatusDialog } from '../features/declare-status';
export { StatusFixDialog } from '../features/fix-status';
export { LeaveEndDialog, LeaveTimesDialog, leaveStarted } from '../features/leave-end';

// Deprecated path: these two dialogs moved to features/person-edit (Phase 5.3c). Removed in Phase 7.
export { EditPersonDialog, NewPersonDialog } from '../features/person-edit';

// Deprecated path: PersonSheet moved to widgets/person-sheet (Phase 5.3c). Removed in Phase 7.
export { PersonSheet } from '../widgets/person-sheet';
