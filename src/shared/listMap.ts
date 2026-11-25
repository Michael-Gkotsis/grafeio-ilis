// Το μοντέλο της οθόνης «Αντιστοίχιση…» για τις λίστες ΑΛΛΗΣ μονάδας (3β): κατάσταση υπηρεσιών σε λίστα (ΦΡΟΥΡΑ), εξοδούχοι/αδειούχοι (Εξοδούχοι)
// και θαλαμιζόμενοι. Καθαρές συναρτήσεις· το αρχείο το διαβάζει το main (src/main/tplLists.ts), εδώ μόνο το σχήμα των απαντήσεων και το προφίλ από τις επιλογές.
import { PROFILE_VERSION, type ListAdd, type ListProfile, type ProfileKind, type TplProfile } from './tplStore';
import { NEW_SVC, SVC_ROLE_LABEL, OUTS_ROLE_LABEL, STATE_TARGETS, matchSvc, svcKeyOf, type ColHow, type OutsSheet, type SvcSheet, type SvcTarget, type Sure } from './unitLists';

export type ListForm = 'froura' | 'outs';
export interface ListColView { key: string; role: string; label: string; ref: string; head: string; how: ColHow; c: number | null; side?: 'o' | 'l' }
export interface SvcBlockView { labelKey: string; label: string; rows: number; groups: number; value: string; sure: Sure | 'mine' | 'ignored'; why: string; suggestLabel: string; show: '' | 'keep' | 'remove' }   // show: τι γίνεται με το μπλοκ στο έντυπο που βγαίνει (αποθηκευμένο)
export interface ListOption { value: string; label: string; group: string }
export interface SvcTargetView { value: string; label: string; nums: number; per: number; kept: boolean }
export interface RoomView { sheet: string; keys: number; table: string; tableRows: number; who: string; saved: boolean }
export interface ListModel {
  ok: true; form: ListForm; kind: 'services' | 'outs'; file: string; sheets: string[]; sheet: string; found: boolean; profileId: string | null;
  svc?: { header: number; title: boolean; sig: boolean; cols: ListColView[]; blocks: SvcBlockView[]; options: ListOption[]; targets: SvcTargetView[]; adds: ListAdd[] };
  outs?: { title: boolean; sig: boolean; lists: { side: 'o' | 'l'; title: string; ready: number; cols: ListColView[] }[] };
  rooms: RoomView[]; subs: string[];
  name?: 'short'; headTexts?: Record<string, string[]>;   // name: μορφή ονόματος που είναι αποθηκευμένη· headTexts: κείμενα της γραμμής επικεφαλίδας ('' = υπηρεσίες, 'o'/'l' = εξοδούχοι/αδειούχοι) για να αποθηκεύεται η επικεφαλίδα κάθε στήλης που διαλέγεται
}
export interface ListReq { file?: string; sheet?: string; posts: Record<string, string>; creates: { name: string }[]; cols: Record<string, number>; rooms: { sheet: string; who: string; on: boolean }[]; show?: Record<string, 'keep' | 'remove'>; add?: ListAdd[]; name?: 'short'; heads?: Record<string, string> }
export interface ListTryRes {
  placed: number; written: number; kept: number; cleared: number; refused: { ref: string; why: string }[]; unplaced: string[]; warnings: string[];
  lines: { label: string; text: string }[];
  rooms: { sheet: string; keys: number; unplaced: number; checked: number; matched: number; unevaluated: number; mismatches: string[] }[];
}
export const emptyListReq = (): ListReq => ({ posts: {}, creates: [], cols: {}, rooms: [] });

const colRef = (c: number) => { let n = c + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export function svcView(det: SvcSheet, targets: SvcTarget[], profile: ListProfile | null | undefined): NonNullable<ListModel['svc']> {
  const cols: ListColView[] = (['num', 'hours', 'shift', 'rank', 'name'] as const).map(role => { const p = det.cols[role]; return { key: role, role, label: SVC_ROLE_LABEL[role], ref: p.c == null ? '' : colRef(p.c), head: p.head != null ? colRef(p.head) : '', how: p.how, c: p.c }; });
  const blocks = matchSvc(det, targets, profile).map(m => {
    const t = targets.find(x => x.value === m.value) ?? STATE_TARGETS.find(x => x.value === m.value);
    return { labelKey: m.labelKey, label: m.block.label, rows: m.block.rows.length, groups: m.block.groups.length, value: m.value, sure: m.sure, why: m.why, suggestLabel: t?.label || '', show: (profile?.show?.[m.labelKey] || '') as SvcBlockView['show'] };
  });
  const options: ListOption[] = [...targets.map(t => ({ value: t.value, label: t.label + (t.kept ? ' (ανενεργή, μένει στο έντυπο)' : ' (' + t.groups.length + ' νούμερα)'), group: t.value.startsWith('post:') ? 'Λ/Υ και Δ/Υ' : 'Υπηρεσίες της εφαρμογής' })),
    ...STATE_TARGETS.map(t => ({ value: t.value, label: t.label, group: 'Καταστάσεις: γεμίζει με όσους είναι σε αυτή την κατάσταση' }))];
  const tv: SvcTargetView[] = targets.filter(t => t.value.startsWith('blk:')).map(t => ({ value: t.value, label: t.label, nums: t.groups.length, per: Math.max(1, ...t.groups.map(gp => gp.length)), kept: !!t.kept }));
  return { header: det.header, title: det.title != null, sig: det.sig != null, cols, blocks, options, targets: tv, adds: profile?.add || [] };
}
export function outsView(det: OutsSheet): NonNullable<ListModel['outs']> {
  return {
    title: det.titleRow != null, sig: det.sig != null,
    lists: det.lists.map(l => ({ side: l.side, title: l.title, ready: l.last - l.first + 1, cols: (Object.entries(l.cols) as [keyof typeof OUTS_ROLE_LABEL, number][]).map(([role, c]) => ({ key: l.side + '.' + role, role, label: OUTS_ROLE_LABEL[role], ref: colRef(c), head: colRef(c), how: 'sure' as ColHow, c, side: l.side })) }))
  };
}

// Το προφίλ από τις επιλογές του χρήστη. Στις θέσεις μένουν μόνο όσες διάλεξε ο ίδιος (ή αποδέχτηκε με «Σωστό»)· οι σίγουρες της εφαρμογής ξαναβρίσκονται κάθε φορά.
export function listProfileFrom(kind: Extract<ProfileKind, 'services' | 'outs' | 'rooms'>, o: { prev: TplProfile | null; sheet: string; posts?: Record<string, string>; cols?: Record<string, number>; rooms?: { sheet: string; who: string }[]; show?: Record<string, 'keep' | 'remove'>; add?: ListAdd[]; name?: 'short'; heads?: Record<string, string> }): TplProfile {
  const base: TplProfile = o.prev && o.prev.kind === kind ? o.prev : { v: PROFILE_VERSION, id: kind + '-1', kind, fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [] };
  const lst: ListProfile = { sheet: o.sheet, ...(o.posts && Object.keys(o.posts).length ? { posts: o.posts } : {}), ...(o.cols && Object.keys(o.cols).length ? { cols: o.cols } : {}), ...(o.show && Object.keys(o.show).length ? { show: o.show } : {}), ...(o.add && o.add.length ? { add: o.add } : {}), ...(o.name === 'short' ? { name: 'short' as const } : {}), ...(o.heads && Object.keys(o.heads).length ? { heads: o.heads } : {}) };
  if (o.rooms) { lst.sheets = o.rooms.map(r => r.sheet); lst.who = Object.fromEntries(o.rooms.map(r => [r.sheet, r.who])); }
  return { ...base, lst };
}
export { NEW_SVC, svcKeyOf };
