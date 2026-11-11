// Public API of entities/person: how a person is named, searched, picked and shown with their status.
// Import from here only (the architecture test rejects deep imports from other layers).
export { RkName, type RkNameProps } from './ui/RankName';
export { PersonPicker, type PersonPickerProps } from './ui/PersonPicker';
export { StatusBadge, cadreBadge, type StatusBadgeProps } from './ui/StatusBadge';
export { rkFull, rkOn, rkPlain, rkPrefix, rkShort, rkText, setRankNamesOn } from './model/rankName';
export { searchPeople } from './model/search';
export { CADRE_TONE, absRange } from './model/cadreAbs';
export { cadreStatusBadge } from './ui/CadreStatusBadge';
