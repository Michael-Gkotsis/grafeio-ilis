// Public API of features/leave-end: ending a leave (or hospital / ΣΤΕΠ stay) early, or cancelling it.
// Import from here only (the architecture test rejects deep imports from other layers).
export { LeaveEndDialog, type LeaveEndDialogProps } from './ui/LeaveEndDialog';
export { leaveStarted } from './model/leaveStarted';
export { LeaveTimesDialog, type LeaveTimesDialogProps } from './ui/LeaveTimesDialog';
