// Καταστάσεις (Michael, 13/10): για ΕΥ, ΕΑ, ΕΟ, ΕΑΡΒ και τα δικά σου ιατρικά ορίζεις σε ποιες υπηρεσίες μπαίνουν
// (ναι · μόνο αν δεν υπάρχει άλλος · όχι), μία στήλη ανά υπηρεσία, και αν βγαίνουν έξοδο (Ρυθμίσεις › Υπηρεσίες).
// Στις ρυθμίσεις μένουν μόνο οι αλλαγές σου (lists.stat). Προεπιλογή: οι κανόνες του λοχία όπως πριν (TYPES):
// ΕΥ καμία υπηρεσία, ΕΑ/ΕΟ όχι σε ένοπλη, όχι μαγειρεία και σκοπιά μόνο αν δεν υπάρχει άλλος, ΕΑΡΒ παντού.
// Το δικό σου ιατρικό ακολουθεί το ΕΑ/ΕΥ/ΕΟ/ΕΑΡΒ που μοιάζει, εκτός αν του δώσεις δικούς κανόνες.
import { TYPES, type DutyKind, type Status, type TypeDef, type TypeKey } from './domain';
import { itemKey, ownMed, type UserLists } from './ranks';

export type StatCell = 'yes' | 'last' | 'no';
// cells: γραμμή («EA» ή «EA:ΕΛ ΓΥΜΝ») → υπηρεσία (id μπλοκ) → τιμή · out: γραμμή → βγαίνει έξοδο
export interface StatConfig { cells?: Record<string, Record<string, StatCell>>; out?: Record<string, boolean> }
// το ΣΤΕΠ (εισαγωγή μέσα στο στρατόπεδο) δεν μπαίνει σε καμία υπηρεσία: όχι εδώ (Michael, 13-14/10)
export const STAT_ROWS: TypeKey[] = ['EY', 'EA', 'EO', 'EARV'];
export const STAT_TXT: Record<StatCell, string> = { yes: 'μπαίνει', last: 'μόνο αν δεν υπάρχει άλλος', no: 'δεν μπαίνει' };
export const statRowKey = (type: TypeKey, own?: string) => (own ? type + ':' + itemKey(own) : type);

// Η γραμμή μιας κατάστασης: το δικό σου ιατρικό με το όνομά του, αλλιώς ο τύπος (null: δεν ρυθμίζεται, π.χ. άδεια)
export function statRowOf(s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): { type: TypeKey; own?: string } | null {
  if (!STAT_ROWS.includes(s.type)) return null;
  const m = ownMed(lists, s.kind);
  return m ? { type: s.type, own: m.name } : { type: s.type };
}
type Blk = { kind?: DutyKind; armed: boolean };
export function statDefault(t: TypeDef, b: Blk): StatCell {
  if (t.noDuty) return 'no';
  if (t.noArmed && b.armed) return 'no';
  if (t.light && b.kind === 'mg') return 'no';
  if (t.light && b.kind === 'sk') return 'last';
  return 'yes';
}
// Τιμή ενός κελιού: πρώτα το δικό σου ιατρικό (αν το άλλαξες), μετά ο τύπος, μετά η προεπιλογή
export function statCellOf(lists: UserLists | undefined, type: TypeKey, own: string | undefined, b: Blk & { id: string }): { v: StatCell; from: 'own' | 'row' | 'def' } {
  const c = lists?.stat?.cells;
  const vo = own ? c?.[statRowKey(type, own)]?.[b.id] : undefined; if (vo) return { v: vo, from: 'own' };
  const vr = c?.[type]?.[b.id]; if (vr) return { v: vr, from: 'row' };
  return { v: statDefault(TYPES[type], b), from: 'def' };
}
// Για μια κατάσταση σε μια θέση. Χωρίς θέση (ή Λ/Υ-Δ/Υ, που ορίζονται με το χέρι): η προεπιλογή, σαν ένοπλη αν δεν ξέρουμε
export function statOn(s: Pick<Status, 'type' | 'kind'>, post: (Blk & { block?: string }) | null | undefined, lists?: UserLists): { v: StatCell; from: 'own' | 'row' | 'def' } {
  const t = TYPES[s.type];
  const r = post?.block && post.kind !== 'ly' ? statRowOf(s, lists) : null;
  if (!r) return { v: statDefault(t, post || { armed: true }), from: 'def' };
  return statCellOf(lists, r.type, r.own, { id: post!.block!, kind: post!.kind, armed: post!.armed });
}
// Βγαίνει έξοδο; Όπως πριν (TYPES noOut), εκτός αν το άλλαξες
export function statOutOf(lists: UserLists | undefined, type: TypeKey, own?: string): { ok: boolean; from: 'own' | 'row' | 'def' } {
  const o = lists?.stat?.out;
  const vo = own ? o?.[statRowKey(type, own)] : undefined; if (vo != null) return { ok: vo, from: 'own' };
  const vr = STAT_ROWS.includes(type) ? o?.[type] : undefined; if (vr != null) return { ok: vr, from: 'row' };
  return { ok: !TYPES[type].noOut, from: 'def' };
}
export const statNoOut = (s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): boolean => {
  const r = statRowOf(s, lists);
  return r ? !statOutOf(lists, r.type, r.own).ok : !!TYPES[s.type].noOut;
};
// Άοπλος λόγω κατάστασης (για τα «Αυστηρά Άοπλοι»): δεν μπαίνει σε καμία ένοπλη υπηρεσία του εντύπου.
// Έντυπο χωρίς ένοπλες υπηρεσίες: όπως πριν, από τον τύπο (ΕΑ/ΕΟ).
export function statIsUnarmed(s: Pick<Status, 'type' | 'kind'>, blocks: (Blk & { id: string })[], lists?: UserLists): boolean {
  const armed = blocks.filter(b => b.armed);
  const r = statRowOf(s, lists);
  if (!armed.length || !r) return !!TYPES[s.type].noArmed;
  return armed.every(b => statCellOf(lists, r.type, r.own, b).v === 'no');
}
// Σε καμία υπηρεσία του εντύπου λόγω κατάστασης (για τις λίστες της Φρουράς)
export function statNoDuty(s: Pick<Status, 'type' | 'kind'>, blocks: (Blk & { id: string })[], lists?: UserLists): boolean {
  const r = statRowOf(s, lists); const bs = blocks.filter(b => b.kind !== 'ly');
  if (!bs.length || !r) return !!TYPES[s.type].noDuty;
  return bs.every(b => statCellOf(lists, r.type, r.own, b).v === 'no');
}
