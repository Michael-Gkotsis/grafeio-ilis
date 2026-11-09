// The lists the user fills in (ranks, origins, specialities, penalty and leave kinds…) and their settings shape.
//
// Purpose: `ListId`, `ListItem`, `UserList`, `UserLists` (Settings.lists) with the small configs they carry: the Σ.Ι.
//   table, the statuses table, «ΗΚΑΙ» rows, leave texts, and the two filter names used in report picks.
// Does NOT: hold the base lists (src/shared/ranks.ts) or merge them with the user's additions (listOf there).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: Settings.lists is part of the saved settings; its shape lives in the model so settings.ts needs no import from
//   ranks.ts (which re-exports these types, so existing imports keep working).
// Covering tests: test/lists.test.ts, test/si.test.ts, test/stat.test.ts.
import type { TypeKey } from './status';

// Lists the user fills in (Settings › Λίστες, Michael 13/10). Settings keep only the additions and the base items he
// hid:
// the base lists are in ranks.ts, so without additions everything stays as before.
export type ListId =
  | 'soldierRanks'
  | 'cadreRanks'
  | 'origins'
  | 'specs'
  | 'punKinds'
  | 'leaveKinds'
  | 'cadreAbs'
  | 'medKinds'
  | 'siUnarmed'
  | 'weaponTypes'
  | 'weaponOut';
// hk: «ΗΚΑΙ» row where the rank counts · col: «ΗΚΑΙ» column (leave, cadre absence; empty = in the list only)
// acc: how the penalty is written in the text («με δύο (02) ημέρες …») · max: maximum days (a warning)
// like: base medical type (ΕΑ/ΕΥ/ΕΟ/ΕΑΡΒ): in the «ΗΚΑΙ» only ΕΥ counts; duties and out are in the Καταστάσεις table.
// New ones enter as ΕΑΡΒ (no restrictions until the user sets them, Michael 18/10) · code: code in the calendar (empty
// = the base one's)
// back: weapon return reason for a reason of the user's own (empty = «ΛΗΞ <reason>»)
// note: «μόνο σημείωση» (Michael, 4/11): only a note on the soldier; noteBadge: also as a badge on screens, noteXl:
// also in the ΕΑ-ΕΥ Excel
// warn: «μόνο προειδοποίηση» (checkbox): gives a warning when he is put on a duty (e.g. a referral for 401)
// duty/out: only for a leave kind of the user's own with col '-' («Πουθενά», present): goes on duties / goes out
// (otherwise not) (Michael, 3/11)
export interface ListItem {
  name: string;
  hk?: string;
  col?: string;
  acc?: string;
  max?: number;
  like?: TypeKey;
  code?: string;
  warn?: boolean;
  note?: boolean;
  noteBadge?: boolean;
  noteXl?: boolean;
  back?: string;
  duty?: boolean;
  out?: boolean;
}
export interface UserList {
  add?: ListItem[];
  hide?: string[];
}
// si: the Σ.Ι. table (si.ts) · stat: the ΕΑ/ΕΥ/ΕΟ… statuses table (stat.ts), whatever the user changed there
// hkRows: «ΗΚΑΙ» rows the user added (Settings › Μονάδα και έντυπα › Γραμμές της ΗΚΑΙ)
// hkNames: another name for a row (key → name), e.g. «Ίλαρχοι» → «Ίλαρχοι-Λοχαγοί»; the key does not change
// leaveText: «Κείμενο στην ΗΚΑΙ» per leave kind (1/11), key leaveKey: t = how the kind is written in 3. ΑΔΕΙΕΣ and 5.
// ΑΙΤΗΣΕΙΣ
// (empty = automatic), dest = the leave's destination is written too («… ΜΕ ΚΑΤΕΥΘΥΝΣΗ ΚΟΡΙΝΘΟ»)
export interface LeaveText {
  t?: string;
  dest?: boolean;
}
export type UserLists = Partial<Record<ListId, UserList>> & {
  si?: SiConfig;
  stat?: StatConfig;
  hkRows?: HkRowDef[];
  hkNames?: Record<string, string>;
  leaveText?: Record<string, LeaveText>;
};
// name: name (and key) of the row · grp: officers or enlisted · after: below which row (empty = at the end of the
// group)
// ranks: ranks that count in it (cadre and soldiers), instead of the row they would get
export interface HkRowDef {
  name: string;
  grp: 'off' | 'nco';
  after?: string;
  ranks?: string[];
}
// add: base ones of the user's own (e.g. Ι5) · cats: the user's own or hidden condition categories
// cells: row of the table («Ι3 ΧΩΡΙΣ ΟΠΛΟ» or «Ι3 ΧΩΡΙΣ ΟΠΛΟ · ΟΡΘΟΠΑΙΔΙΚΟ») → duty (block id) → goes in or not
export interface SiConfig {
  add?: string[];
  cats?: { add?: string[]; hide?: string[] };
  cells?: Record<string, Record<string, boolean>>;
}
export type StatCell = 'yes' | 'last' | 'no';
// cells: row («EA» or «EA:ΕΛ ΓΥΜΝ») → duty (block id) → value · out: row → goes out
export interface StatConfig {
  cells?: Record<string, Record<string, StatCell>>;
  out?: Record<string, boolean>;
}
export type RosterFilter = 'all' | 'leave' | 'pun' | 'post' | 'inactive' | 'dnright';
export type WeaponFilter = 'all' | 'with' | 'out' | 'without' | 'unarmed' | 'dup' | 'return';
