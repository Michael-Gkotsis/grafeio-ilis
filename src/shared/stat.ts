// Καταστάσεις (Michael, 13/10): για ΕΥ, ΕΑ, ΕΟ, ΕΑΡΒ και τα δικά σου ιατρικά ορίζεις σε ποιες υπηρεσίες μπαίνουν
// (ναι · μόνο αν δεν υπάρχει άλλος · όχι), μία στήλη ανά υπηρεσία, και αν βγαίνουν έξοδο (Ρυθμίσεις › Υπηρεσίες).
// Στις ρυθμίσεις μένουν μόνο οι αλλαγές σου (lists.stat). Προεπιλογή: οι κανόνες του λοχία όπως πριν (TYPES):
// ΕΥ καμία υπηρεσία, ΕΑ/ΕΟ όχι σε ένοπλη, όχι μαγειρεία και σκοπιά μόνο αν δεν υπάρχει άλλος, ΕΑΡΒ παντού.
// Το δικό σου ιατρικό ρυθμίζεται μόνο εδώ (Michael, 18/10: όχι «συμπεριφέρεται σαν» στις Λίστες): ό,τι δεν αλλάξεις
// μένει όπως ο βασικός του τύπος (τα παλιά όπως ΕΑ/ΕΥ/ΕΟ/ΕΑΡΒ, τα καινούργια χωρίς περιορισμούς).
// Ποινές (Michael, 18/10): μία γραμμή για όλες και μία για κάθε είδος· αρχικά μπαίνουν παντού, όπως πριν. Έξοδο ποτέ.
import { TYPES, effects, type DutyKind, type Status, type TypeDef, type TypeKey } from './domain';
import { itemKey, listRows, ownMed, type UserLists } from './ranks';

export type StatCell = 'yes' | 'last' | 'no';
// cells: γραμμή («EA» ή «EA:ΕΛ ΓΥΜΝ») → υπηρεσία (id μπλοκ) → τιμή · out: γραμμή → βγαίνει έξοδο
export interface StatConfig { cells?: Record<string, Record<string, StatCell>>; out?: Record<string, boolean> }
// το ΣΤΕΠ (εισαγωγή μέσα στο στρατόπεδο) δεν μπαίνει σε καμία υπηρεσία: όχι εδώ (Michael, 13-14/10)
export const STAT_MED: TypeKey[] = ['EY', 'EA', 'EO', 'EARV'];
export const STAT_ROWS: TypeKey[] = [...STAT_MED, 'PUN'];
export const STAT_TXT: Record<StatCell, string> = { yes: 'μπαίνει', last: 'μόνο αν δεν υπάρχει άλλος', no: 'δεν μπαίνει' };
export const statRowKey = (type: TypeKey, own?: string) => (own ? type + ':' + itemKey(own) : type);

// Η γραμμή μιας κατάστασης: το δικό σου ιατρικό με το όνομά του, αλλιώς ο τύπος (null: δεν ρυθμίζεται, π.χ. άδεια)
export function statRowOf(s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): { type: TypeKey; own?: string } | null {
  if (!STAT_ROWS.includes(s.type)) return null;
  if (s.type === 'PUN') {
    // το είδος της ποινής, βασικό ή δικό σου (και όσα έκρυψες, για ποινές που υπάρχουν ήδη)
    const k = itemKey(s.kind || ''); const r = k ? listRows(lists, 'punKinds').find(x => itemKey(x.name) === k) : undefined;
    return r ? { type: 'PUN', own: r.name } : { type: 'PUN' };
  }
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
  if (type === 'PUN') return { ok: false, from: 'def' };   // η ποινή κόβει πάντα την έξοδο
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
// Τι κάνει μια κατάσταση με αυτές τις υπηρεσίες, σε μία γραμμή (για τη δήλωση): «Όχι: Μαγειρεία · Δεν βγαίνει έξοδο»
export function statSummary(s: Pick<Status, 'type' | 'kind'>, blocks: (Blk & { id: string; name: string; hidden?: boolean })[], lists?: UserLists): string {
  const r = statRowOf(s, lists); const bs = blocks.filter(b => b.kind !== 'ly' && !b.hidden);
  if (!r || !bs.length) return effects(TYPES[s.type]);
  const of = (v: StatCell) => bs.filter(b => statCellOf(lists, r.type, r.own, b).v === v).map(b => b.name);
  const no = of('no'), last = of('last');
  return [no.length === bs.length ? 'Καμία υπηρεσία' : no.length && 'Όχι: ' + no.join(', '), last.length && 'Μόνο αν δεν υπάρχει άλλος: ' + last.join(', '),
    !statOutOf(lists, r.type, r.own).ok && 'Δεν βγαίνει έξοδο'].filter(Boolean).join(' · ') || 'Χωρίς περιορισμούς';
}
// Άλλος βασικός τύπος για ένα δικό σου ιατρικό που δεν το έχει κανείς (στήλη ΗΚΑΙ στον πίνακα: ΕΥ ή παρών). Οι υπηρεσίες και η
// έξοδος μένουν όπως φαίνονται: ό,τι ερχόταν από τον παλιό τύπο γράφεται στη γραμμή του ιατρικού
export function statRebase(lists: UserLists, own: string, to: TypeKey, blocks: (Blk & { id: string })[]): UserLists {
  const m = ownMed(lists, own); if (!m?.like || m.like === to) return lists;
  const from = m.like, kf = statRowKey(from, m.name), kt = statRowKey(to, m.name);
  const cells = { ...(lists.stat?.cells || {}) }; const out = { ...(lists.stat?.out || {}) };
  const row: Record<string, StatCell> = {};
  for (const b of blocks) { const v = statCellOf(lists, from, m.name, b).v; if (v !== statCellOf(lists, to, undefined, b).v) row[b.id] = v; }
  delete cells[kf]; if (Object.keys(row).length) cells[kt] = row; else delete cells[kt];
  const o = statOutOf(lists, from, m.name).ok; delete out[kf]; if (o !== statOutOf(lists, to).ok) out[kt] = o; else delete out[kt];
  const add = (lists.medKinds?.add || []).map(x => (x === m ? { ...x, like: to } : x));
  return { ...lists, medKinds: { ...lists.medKinds, add }, stat: { ...lists.stat, cells, out } };
}
