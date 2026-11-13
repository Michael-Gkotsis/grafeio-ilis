// Λειτουργία κέντρου ή μονάδας (Michael, 13/11): το κέντρο εκπαίδευσης έχει μία ΕΣΣΟ τη φορά, η μονάδα συνεχή ροή με
// στρατιώτες από πολλές ΕΣΣΟ. Λείπει = κέντρο: όποιος δεν το πειράξει δεν βλέπει καμία αλλαγή.
import { addDays, daysBetween, MONTHS, type ISODate } from './dates';
import type { Move, Person, Settings } from './domain';
import { itemKey, listOf, type UserLists } from './ranks';
import { ESSO_SERIES, essoPersonTxt, nextEsso, parseEsso, type Esso } from './esso';

export const isUnit = (st?: Pick<Settings, 'mode'> | null): boolean => st?.mode === 'unit';

// Μήνας κατάταξης κάθε σειράς από το 2026: Α΄ Φεβρουάριος, Β΄ Μάιος, Γ΄ Αύγουστος, Δ΄ Νοέμβριος
export const ESSO_MONTH: Record<Esso['s'], number> = { Α: 2, Β: 5, Γ: 8, Δ: 11 };
// Πότε απολύεται περίπου: ο μήνας κατάταξης + 12 μήνες (months: 9 για Θράκη/νησιά κ.λπ.). y/m: μήνας 1–12
export function essoDischarge(e: Esso, months = 12): { y: number; m: number } {
  const t = e.y * 12 + (ESSO_MONTH[e.s] - 1) + months;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}
export const dischargeLabel = (d: { y: number; m: number }) => MONTHS[d.m - 1] + ' ' + d.y;
// η τελευταία μέρα του μήνα (για το «σε N μέρες»)
export const monthEnd = (d: { y: number; m: number }): ISODate => { const n = d.m === 12 ? 1 : d.m + 1, y = d.m === 12 ? d.y + 1 : d.y; return addDays(y + '-' + String(n).padStart(2, '0') + '-01', -1); };
// Πόσες μέρες ως το τέλος του μήνα απόλυσης (αρνητικό = πέρασε)
export const daysToDischarge = (d: { y: number; m: number }, today: ISODate): number => daysBetween(today, monthEnd(d)) - 1;

// η ΕΣΣΟ του ατόμου όπως γράφεται στο Δυναμολόγιο («2026 Γ΄»), ό,τι κι αν έχει γραφτεί στην καρτέλα (2026 Γ', Γ΄ ΕΣΣΟ 2026)
export const essoKeyOf = (p: Pick<Person, 'essos'>): string => { const e = parseEsso(p.essos); return e ? essoPersonTxt(e) : (p.essos || '').trim(); };
const eKey = (e: Esso) => e.y * 4 + ESSO_SERIES.indexOf(e.s);
// Η σειρά που ξεκίνησε τελευταία ως σήμερα (Φεβ Α΄, Μάι Β΄, Αύγ Γ΄, Νοε Δ΄)· πριν τον Φεβρουάριο η Δ΄ της προηγούμενης χρονιάς
export function seasonEsso(today: ISODate): Esso {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  for (let i = ESSO_SERIES.length - 1; i >= 0; i--) if (ESSO_MONTH[ESSO_SERIES[i]] <= m) return { s: ESSO_SERIES[i], y };
  return { s: 'Δ', y: y - 1 };
}
// Οι ΕΣΣΟ που υπάρχουν στα άτομα, με πόσοι είναι σε δύναμη και πόσοι εκτός, από την παλιότερη
export interface EssoRow { esso: Esso; txt: string; active: number; inactive: number }
export function essoRows(people: Person[]): EssoRow[] {
  const m = new Map<string, EssoRow>();
  for (const p of people) {
    const e = parseEsso(p.essos); if (!e) continue;
    const txt = essoPersonTxt(e); const r = m.get(txt) || { esso: e, txt, active: 0, inactive: 0 };
    if (p.active) r.active++; else r.inactive++;
    m.set(txt, r);
  }
  return [...m.values()].sort((a, b) => eKey(a.esso) - eKey(b.esso));
}
// Λίστα επιλογής ΕΣΣΟ στον νέο στρατιώτη: όσες υπάρχουν στα άτομα συν η τωρινή και οι επόμενες 2, η πιο νέα πρώτη
export function essoChoices(people: Person[], today: ISODate): string[] {
  const set = new Map<number, Esso>();
  essoRows(people).forEach(r => set.set(eKey(r.esso), r.esso));
  let e = seasonEsso(today); set.set(eKey(e), e);   // η τωρινή σειρά του ημερολογίου
  for (let i = 0; i < 2; i++) { e = nextEsso(e, today); set.set(eKey(e), e); }
  return [...set.values()].sort((a, b) => eKey(b) - eKey(a)).map(essoPersonTxt);
}
// Η προεπιλογή για νέο: η πιο νέα ΕΣΣΟ που υπάρχει ήδη στα άτομα, αλλιώς η τωρινή του ημερολογίου
export function defaultEsso(people: Person[], today: ISODate): string {
  const r = essoRows(people); return r.length ? r[r.length - 1].txt : essoPersonTxt(seasonEsso(today));
}

// Λόχοι / Ίλες (λίστα των Ρυθμίσεων): οι ονομασίες της λίστας με πόσοι σε δύναμη ανήκουν σε καθεμία (και όσες χρησιμοποιούνται χωρίς να είναι στη λίστα)
export interface SubRow { name: string; n: number }
export function subRows(people: Person[], lists?: UserLists): SubRow[] {
  const m = new Map<string, SubRow>();
  for (const name of listOf(lists, 'subUnits')) m.set(itemKey(name), { name, n: 0 });
  for (const p of people) { if (!p.active || !p.sub) continue; const k = itemKey(p.sub); const r = m.get(k) || { name: p.sub, n: 0 }; r.n++; m.set(k, r); }
  return [...m.values()];
}
// πάνω από αυτό το πλήθος το φίλτρο γίνεται dropdown αντί για κουμπιά
export const SUB_CHIPS_MAX = 6;
export const subKeyOf = (p: Pick<Person, 'sub'>): string => itemKey(p.sub || '');

// Απόλυση περίπου του ατόμου: 12 μήνες από την κατάταξη της ΕΣΣΟ του, ή 9 αν το έχει στην καρτέλα (serve)
export function personDischarge(p: Pick<Person, 'essos' | 'serve'>): { y: number; m: number } | null {
  const e = parseEsso(p.essos); return e ? essoDischarge(e, p.serve === 9 ? 9 : 12) : null;
}
// Κινήσεις δύναμης που περιμένουν (δεν έχουν εφαρμοστεί), από την παλιότερη· to: ως αυτή τη μέρα (αλλιώς όλες)
export interface PendingMove { p: Person; m: Move }
export function pendingMoves(people: Person[], to?: ISODate): PendingMove[] {
  const out: PendingMove[] = [];
  for (const p of people) for (const m of p.moves || []) if (!m.done && (!to || m.on <= to)) out.push({ p, m });
  return out.sort((a, b) => a.m.on.localeCompare(b.m.on) || a.p.last.localeCompare(b.p.last, 'el'));
}
// Για τη λίστα: οι απολύσεις της ίδιας ΕΣΣΟ την ίδια μέρα γίνονται μία γραμμή «ΕΣΣΟ 2025 Γ΄ απολύεται (24)»
export interface MoveRow { key: string; on: ISODate; text: string; ids: { pid: number; id: string }[]; pid?: number }
export function moveRows(list: PendingMove[], name: (p: Person) => string): MoveRow[] {
  const rows: MoveRow[] = []; const groups = new Map<string, MoveRow>();
  for (const { p, m } of list) {
    const e = essoKeyOf(p);
    if (m.dir === 'out' && m.why === 'ΑΠΟΛΥΣΗ' && e) {
      const k = 'd|' + m.on + '|' + e; let g = groups.get(k);
      if (!g) { g = { key: k, on: m.on, text: '', ids: [] }; groups.set(k, g); rows.push(g); }
      g.ids.push({ pid: p.id, id: m.id }); g.text = 'ΕΣΣΟ ' + e + ' απολύεται (' + g.ids.length + ')';
    } else rows.push({ key: p.id + '|' + m.id, on: m.on, pid: p.id, ids: [{ pid: p.id, id: m.id }],
      text: name(p) + (m.dir === 'out' ? ' φεύγει: ' + [m.why, m.where].filter(Boolean).join(' · ') : ' ξαναμπαίνει σε δύναμη') });
  }
  return rows;
}
