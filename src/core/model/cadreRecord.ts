// The cadre member («στέλεχος») record, his absences and the absence kinds that feed the «ΗΚΑΙ» columns.
//
// Purpose: `Cadre`, `CadreAbs` and the table CADRE_ABS of absence kinds.
// Does NOT: decide who is on duty (core/duty) or read the cadre Excel (core/excel-in).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: cadre absences are the columns of the «ΗΚΑΙ» form, so their codes and names are a frozen contract with saved
// data.
// Covering tests: test/cadre-duty.test.ts, test/cadre-tab.test.ts, test/hkai.test.ts.
import type { ISODate } from '../lib/dates';

/**
 * A cadre member (tab «Στελέχη»): names, post and the «ΗΚΑΙ» statuses; it also feeds the «ΗΚΑΙ».
 * origin: origin (ΕΠΟΠ, ΟΒΑ, ΣΜΥ, ΣΣΕ…) · spec: Ο/Σ · am: registry number · pos: the order set by the user (hierarchy;
 * without pos on anyone, the order of the «ΗΚΑΙ»).
 * monthMax: ΕΠΟΠ/ΟΒΑ who do duties (Michael, 21/10): at most this many a month. pid: his number in the duty seats
 * (negative, so it never clashes with a soldier); given once and kept for the history (rules.ts cadreSeat).
 * Every active member can be put by hand in any seat (Michael, 26/10): he gets his pid the first time he enters the
 * seats (commands.ts assign), not only those with monthMax. weapon/wtype/rack/wpos: the member's weapon, as on Person
 * (armed seats).
 */
export interface Cadre {
  id: string;
  rank: string;
  origin?: string;
  hk: string;
  last: string;
  first: string;
  spec?: string;
  am?: string;
  phone?: string;
  role?: string;
  active: boolean;
  pos?: number;
  monthMax?: number;
  pid?: number;
  weapon?: string;
  wtype?: string;
  rack?: string;
  wpos?: string;
  eid?: string;
  iban?: string;
  amka?: string;
  afm?: string;
}
/** An absence of a cadre member (kind: a code of CADRE_ABS), from–to both days included. */
export interface CadreAbs {
  id: string;
  cid: string;
  kind: string;
  from: ISODate;
  to: ISODate;
  note?: string;
}
/**
 * Cadre statuses = the columns of the «ΗΚΑΙ» (Michael, 17/10: «οι καταστάσεις τους να αφορούν τις καταστάσεις της
 * ΗΚΑΙ»):
 * [code, name, «ΗΚΑΙ» column]. The prevented first, then the absent, as in the form; «Άλλο» stays in the list only.
 * The old codes (ka, an, eid, nos, fp, ekp, allh, other) keep the same name, for data already written.
 */
export const CADRE_ABS: [string, string, string][] = [
  ['yp', 'Υπηρεσία εντός στρατοπέδου', 'yp'],
  ['ey', 'Ελεύθερος υπηρεσίας', 'ey'],
  ['tim', 'Τιμωρημένος', 'tim'],
  ['os', 'Ο/Σ', 'os'],
  ['mag', 'Μαγειρεία', 'mag'],
  ['sid', 'Σιδηρουργείο', 'sid'],
  ['kin', 'Σε κίνηση', 'kin'],
  ['ka', 'Κανονική άδεια', 'ka'],
  ['an', 'Αναρρωτική άδεια', 'an'],
  ['eid', 'Ειδική άδεια', 'eid'],
  ['nos', 'Νοσοκομείο', 'nos'],
  ['prat', 'Πρατήριο', 'prat'],
  ['adik', 'Αγνοούμενος / αδικαιολογήτως', 'adik'],
  ['fp', 'Φύλλο πορείας', 'fp'],
  ['fyl', 'Φυλάκιο', 'fyl'],
  ['apal', 'Απαλλαγή', 'apal'],
  ['ekp', 'Εκπαίδευση', 'ekp'],
  ['allh', 'Απόσπαση σε άλλη μονάδα', 'allh'],
  ['other', 'Άλλο (μόνο στη λίστα)', ''],
];
