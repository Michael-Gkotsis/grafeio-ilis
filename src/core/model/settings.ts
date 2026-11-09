// The settings record (kv «settings») and its defaults.
//
// Purpose: `Settings` (unit, duty forms, holidays, signatures, layouts, bindings, outputs, look), `BrandSettings`,
//   `SavedView`, the out-format choice and `DEFAULT_SETTINGS`.
// Does NOT: read or change settings (settingsAccess.ts, migrate.ts, codes.ts do) or define the types that belong to the
//   reports, signatures, layouts, sources and «ΗΚΑΙ» modules (it imports them).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: the shape is a frozen data contract (users upgrade in place); this file is the one place that lists every field.
//   `UnitKind` is defined here, not in unit.ts, so unit.ts and brand.ts can import Settings without a type cycle.
// Covering tests: test/own-phases.test.ts, test/units.test.ts, test/screens-settings-guide.test.ts.
import type { ISODate } from '../lib/dates';
import type { FormBinding, FormKind, ListKind, SourceBinding } from './bindings';
import type { Esso, ImerSettings, Layout, LayoutForm, Sig, SigForm } from './documents';
import type { UserLists } from './lists';
import type { Report, RepTpl } from './reportTypes';
import { DEFAULT_BLOCKS, DEFAULT_BLOCKS_SPEN } from './defaultBlocks';
import type { BlockDef, Phase, PhaseDef } from './duty';
import type { HkaiSettings } from './hkaiSettings';
import type { RoomSettings } from './rooms';
import type { XlLook } from './xlLook';

/** Ίλη/Επιλαρχία (ΗΚΑΙ) or Λόχος/Τάγμα (ΗΚΑΛ); see unit.ts for the readers. */
export type UnitKind = 'ili' | 'lochos';
/** Format of the outs Excel: current (cur) or the whole strength (all). */
export type OutsFmt = 'cur' | 'all';
/** The two choices with their screen names. */
export const OUTS_FMT: [OutsFmt, string][] = [
  ['cur', 'Τωρινή'],
  ['all', 'Όλη η δύναμη'],
];
/**
 * The old form «Σε 4 πίνακες» ('tab4', Michael 30/10) was replaced by «Όλη η δύναμη»: stored settings with 'tab4' read
 * as 'all'.
 */
export const isOutsAll = (st: { outsFmt?: OutsFmt | 'tab4' }) => st.outsFmt === 'all' || st.outsFmt === 'tab4';
/** All settings. Each field says what it is and where it is read; optional ones are written when first set. */
export interface Settings {
  unit: [string, string, string]; // header of 3 lines
  unitName: string; // e.g. 4ης ΙΛΗΣ
  unitKind?: UnitKind; // Ίλη/Επιλαρχία («ΗΚΑΙ», default) or Λόχος/Τάγμα («ΗΚΑΛ»), unit.ts
  place: string; // Αυλώνας (place of the signatures)
  tz?: string; // app time zone: empty = Europe/Athens, 'system' = Windows, otherwise an IANA name (dates.ts)
  clockFix?: number; // clock correction in minutes (−720..720), 0 = none
  blocks: BlockDef[]; // ΣΒΕΝ
  blocksSpen: BlockDef[]; // ΣΠΕΝ
  phases?: PhaseDef[]; // the user's own duty forms (at first a copy of ΣΒΕΝ or ΣΠΕΝ)
  phase: Phase; // which duty form is in force now
  // holidays the user added (the official ones come by themselves every year, rules.ts)
  holidays: Record<ISODate, string>;
  holidaysOff?: ISODate[]; // official holidays the user removed
  cadre: Record<string, number>; // cadre per rank for the «ΗΚΑΙ»
  signers: { sergeant: string; commander: string };
  // the user's own Word template for the «Ημερήσια Διαταγή» (file in the templates folder)
  hdTpl?: { file: string; name: string };
  imer?: ImerSettings; // prevented calendar: title, sheets, codes and «Μετρά ως» (shared/imer.ts)
  sigs?: Partial<Record<SigForm, Sig[]>>; // signatures per form, left to right (empty = as the form), sigs.ts
  layout?: Partial<Record<LayoutForm, Layout>>; // where the user moved signatures, header, date on the paper, layout.ts
  outputDir: string; // folder for the Excel files (empty = default)
  fixed: Partial<Record<'ly' | 'dy', number>>; // permanent Λ/Υ and Δ/Υ: they go in by themselves, out of turn
  rev: number; // settings revision, for changes of defaults (migrate.ts)
  views?: SavedView[]; // saved lists in «Προσωπικό» (e.g. «Θαλαμάρχες»)
  sources?: Partial<Record<ListKind, SourceBinding>>; // which Excel/sheet/table each kind reads from and writes to
  forms?: Partial<Record<FormKind, FormBinding>>; // which template and which folder for each form
  // where new Excel files of each kind are made (empty = the general folder)
  newDirs?: Partial<Record<ListKind, string>>;
  // duty check: unknown code (codeKey) → post, «kind:<kind>» without a post, or «ignore»
  dutyCodeAliases?: Record<string, string>;
  // the first day the version with approval for all requests opened: older unanswered requests got old
  // (markOldRequests)
  reqFrom?: ISODate;
  baselineReviewed?: boolean; // the check of the «προηγούμενες υπηρεσίες» after the upgrade (post codes) is done
  lists?: UserLists; // what the user added or hid in the lists (ranks, Ο/Σ); the base ones are in ranks.ts
  hkai?: HkaiSettings; // «ΗΚΑΙ»: sections the unit does not use, vehicles, «Προβλέπονται»
  rooms?: RoomSettings; // how many rooms, how many per platoon and which belong to each platoon (empty = 8 and 4)
  brand?: BrandSettings; // title and logo of the app (empty = «Γραφείο Λοχία»)
  reportTpls?: RepTpl[]; // «Έντυπα»: the user's templates (files in the folder «Πρότυπα εντύπων»), shared/reports.ts
  reports?: Report[]; // «Έντυπα»: the ready forms (template, columns, who goes in, where it goes out)
  // the current ΕΣΣΟ (Settings › ΕΣΣΟ, «Νέα ΕΣΣΟ»); without it, the most common one of the people (esso.ts)
  essos?: Esso;
  // when the duty cycle starts (HH:MM, empty = 14:00): the duty day runs from then to the same hour next day
  dutyStart?: string;
  // outs Excel: 'cur' = current (default), 'all' = whole strength (old 'tab4' reads as 'all', isOutsAll); the last
  // choice stays and the automatic rewrite follows it
  outsFmt?: OutsFmt | 'tab4';
  // outs «Όλη η δύναμη», page 2 (ΔΥΝΑΜΗ): 'same' = same signatures as page 1 (default), 'none' = none, 'own' = its own
  // list (outsSigs2)
  outsSig2?: 'same' | 'none' | 'own';
  outsSigs2?: Sig[]; // the signatures of page 2 when outsSig2 = 'own' (empty = as the signatures of the outs)
  // true: header top left and date top right (old layout); empty = date left, header right (layout.ts swapHeadDate);
  // the «ΗΚΑΙ» never changes (header left)
  hdLeft?: boolean;
  // fonts and alignment of everything the app makes in Excel (empty = Arial 12, centred), xlLook.ts
  xl?: Partial<XlLook>;
}
/**
 * Title and logo (Michael, 17/10): by the rank of whoever uses the app, or the user's own.
 * rank: rank from the table of brand.ts · title: own title (empty = the rank's)
 * logo: empty = the rank's, one of the designs (brand.ts) or an uploaded image (data:image/png…)
 */
export interface BrandSettings {
  rank?: string;
  title?: string;
  logo?: string;
}
/** A saved list: platoon, room, status filter and search text. */
export interface SavedView {
  id: string;
  name: string;
  unit: string;
  room: number | null;
  filter: string;
  q: string;
}
/** Settings of a new installation (rev = the current revision, see migrate.ts). */
export const DEFAULT_SETTINGS: Settings = {
  unit: ['ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', '2η ΕΠΧΙΑ Ν/Σ', '4η ΙΛΗ'],
  unitName: '4ης ΙΛΗΣ',
  place: 'Αυλώνας',
  blocks: DEFAULT_BLOCKS,
  blocksSpen: DEFAULT_BLOCKS_SPEN,
  phase: 'sven',
  holidays: {},
  cadre: { Επίλαρχοι: 0, Ίλαρχοι: 0, 'Ανθυπίλαρχοι-Ανθλγοι': 0, Ανθυπασπιστές: 0, ΔΕΑ: 0, Αρχιλοχίες: 0, Επιλοχίες: 0 },
  signers: { sergeant: '', commander: '' },
  outputDir: '',
  fixed: {},
  rev: 8,
};
