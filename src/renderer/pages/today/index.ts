// Public API of pages/today: the «Σήμερα» screen (route `home`) and its pure rules.
// Import from here only (the architecture test rejects deep imports from other layers).
export { TodayScreen } from './ui/TodayScreen';
export {
  awayToday,
  endRows,
  endText,
  kolBadge,
  kolBadgeTip,
  kolNote,
  newsDay,
  outUntilText,
  recordWhat,
  scanRecords,
  todaySub,
  todayTasks,
  untilText,
  type AwayRow,
  type EndRow,
  type RecordScan,
  type TodayTask,
  type TodayTaskInput,
} from './model/view';
