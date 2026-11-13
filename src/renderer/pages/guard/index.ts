// Public API of pages/guard: the «Υπηρεσίες» screen (route `guard`), its dialogs and its pure rules.
// Import from here only (the architecture test rejects deep imports from other layers).
export { GuardScreen } from './ui/GuardScreen';
export { RulesDialog, type RulesDialogProps } from './ui/RulesDialog';
export { FixedDialog, type FixedDialogProps } from './ui/FixedDialog';
export { WhoDoes, type WhoDoesProps } from './ui/WhoDoes';
export { SkipsView, type SkipsViewProps } from './ui/SkipsView';
export { WeekTable, type WeekTableProps } from './ui/WeekTable';
export { WEEK_ORDER, weekDraft, weekIssue, type WeekDraft } from './model/weekRules';
export {
  checkKinds,
  checkLayout,
  checkRows,
  idleDays,
  kindLabel,
  monLbl,
  type CheckRow,
  type CheckSort,
} from './model/checkView';
export {
  afWhyOf,
  blockNames,
  emptyOn,
  excludedOn,
  guardTabs,
  nextEmptyKey,
  pskOf,
  skipCount,
  type Excluded,
} from './model/guardView';
export {
  chg,
  draftOf,
  fairSteps,
  moveKey,
  opState,
  orderToSave,
  ppl,
  rulesInfo,
  rulesToSave,
  toggleRot,
  weekToSave,
  withRule,
  type FairStep,
  type RulesDraft,
} from './model/rulesView';
export { nDays, skipBadge, skipItems, splitSkips, when } from './model/skipsView';
export { DAY2, FILTERS, cellView, colTip, dayHint, kindsOf, matchesQuery, ownOf, type Filt } from './model/whoView';
