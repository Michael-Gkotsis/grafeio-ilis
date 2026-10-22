// Η κατάσταση ζει στο main process· εδώ κρατάμε το τελευταίο αντίγραφο και στέλνουμε εντολές.
import { createContext, useCallback, useContext, useRef } from 'react';
import { normGreek, translit, collator, norm } from '../shared/text';
import type { AppState, AuditEntry, Person } from '../shared/domain';
import type { Boot } from '../shared/api';
import type { Command } from '../shared/commands';
import type { ISODate } from '../shared/dates';

export interface StoreValue {
  state: AppState; audit: AuditEntry[]; boot: Boot; today: ISODate; tomorrow: ISODate;
  run(cmd: Command, okText?: string | false): Promise<AppState | null>;   // η νέα κατάσταση, ή null αν δεν έγινε
  undo(id?: number): Promise<void>;   // id: μόνο αν είναι ακόμα η τελευταία ενέργεια που αναιρείται
  undoMark(): { label: string; fn: () => void; undoId?: number };   // «Αναίρεση» για μήνυμα: αναιρεί την ενέργεια που μόλις έγινε, όχι όποια είναι τελευταία όταν πατηθεί
  refresh(): Promise<void>;   // όλα από την αρχή (νέα μέρα, εισαγωγή)
  sync(): Promise<void>;      // μόνο ό,τι άλλαξε (μετά από εξαγωγή κ.λπ.)
}
export const StoreCtx = createContext<StoreValue>(null as unknown as StoreValue);
export const useStore = () => useContext(StoreCtx);

export interface Nav {
  view: string; params: Record<string, any>;
  go(view: string, params?: Record<string, any>): void;
  set(params: Record<string, any>): void;
  declare(data: Record<string, any>): void;
  openPerson(id: number, list?: number[]): void;   // list: η λίστα που βλέπεις, για ↑/↓ μέσα στην καρτέλα
}
export const NavCtx = createContext<Nav>(null as unknown as Nav);
export const useNav = () => useContext(NavCtx);
// Άνοιγμα καρτέλας στρατιώτη από μια λίστα: η καρτέλα ξέρει τη λίστα (με τα φίλτρα και τη σειρά της) για το ↑/↓.
// Σταθερή συνάρτηση (οι memo γραμμές δεν ξαναζωγραφίζονται)· η λίστα διαβάζεται τη στιγμή του κλικ.
export function useOpenFrom(rows: { id: number }[]) {
  const nav = useNav(); const ref = useRef(rows); ref.current = rows;
  const open = nav.openPerson;
  return useCallback((id: number) => open(id, ref.current.map(p => p.id)), [open]);
}

// Ευρετήριο αναζήτησης: χωρίς τόνους, λατινικοί χαρακτήρες που μοιάζουν, και αναζήτηση με λατινικά
interface Indexed { p: Person; key: string; lat: string }
const idxCache = new WeakMap<Person[], Indexed[]>();
function indexOf(people: Person[]): Indexed[] {
  let x = idxCache.get(people);
  if (!x) {
    // και βαθμός, ρόλος, πόστο, ειδικότητα, ΕΣΣΟ: «θαλαμαρχ», «ΚΨΜ», «2026 Γ» (για τις αποθηκευμένες λίστες)
    x = people.filter(p => p.active).map(p => ({ p, key: normGreek([p.last, p.first, p.father, p.asm, p.room != null ? 'Θ' + p.room : '', p.rank, p.origin, p.role, p.post, p.spec, p.essos].filter(Boolean).join(' ')), lat: translit(p.last + ' ' + p.first) }));
    x.sort((a, b) => collator.compare(a.p.last, b.p.last) || collator.compare(a.p.first, b.p.first));
    idxCache.set(people, x);
  }
  return x;
}
export function searchPeople(people: Person[], q: string): Person[] {
  const idx = indexOf(people);
  const raw = norm(q.trim()); const n = normGreek(q.trim());
  if (!n) return idx.map(x => x.p);
  const parts = n.split(/\s+/);
  return idx.filter(x => parts.every(t => x.key.includes(t)) || x.lat.includes(raw))
    .map(x => ({ p: x.p, sc: x.key.startsWith(parts[0]) ? 0 : 1 })).sort((a, b) => a.sc - b.sc).map(x => x.p);
}
