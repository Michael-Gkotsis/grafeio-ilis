// Αλλαγές που γράφτηκαν σε μια κάρτα και δεν αποθηκεύτηκαν ακόμα (Ρυθμίσεις, ΗΚΑΙ). Η κάρτα τις δηλώνει με usePending·
// η εφαρμογή δείχνει μια μπάρα κάτω («Δεν αποθηκεύτηκαν: …») και ρωτά πριν αλλάξεις οθόνη ή ενότητα, ώστε τίποτα να μη χάνεται
// χωρίς να το ξέρεις (Michael, 22/10: «να μην έχουμε regression»· πριν, η αλλαγή χανόταν σιωπηλά).
import { useEffect, useRef, useSyncExternalStore } from 'react';

// bar: false: η σελίδα έχει δικά της «Αποθήκευση»/«Άκυρο» (Έντυπα › σελίδα δημιουργίας): χωρίς μπάρα κάτω, μόνο η ερώτηση όταν φεύγεις
export interface Pending { label: string; save: () => Promise<unknown> | unknown; discard: () => void; bar?: false }
const reg = new Map<number, { current: Pending }>();
let seq = 0, snap: Pending[] = [], asking: (() => void) | null = null;
const subs = new Set<() => void>();
const emit = () => { snap = [...reg.values()].map(r => r.current); subs.forEach(f => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

// dirty: η κάρτα έχει κάτι που δεν αποθηκεύτηκε. save: γυρίζει κάτι «αληθές» αν αποθηκεύτηκε (run → νέα κατάσταση).
export function usePending(dirty: boolean, p: Pending) {
  const ref = useRef(p); ref.current = p;
  useEffect(() => {
    if (!dirty) return;
    const id = ++seq; reg.set(id, ref); emit();
    return () => { reg.delete(id); emit(); };
  }, [dirty]);
}
export const pendingNow = () => snap;
export const usePendingList = () => useSyncExternalStore(subscribe, () => snap);
export const useLeaveAsk = () => useSyncExternalStore(subscribe, () => asking);

// Πριν φύγεις από τη σελίδα: χωρίς εκκρεμότητες γίνεται αμέσως, αλλιώς ρωτά (PendingBar)
export function requestLeave(go: () => void) {
  if (!reg.size) { go(); return; }
  asking = go; emit();
}
export function closeLeaveAsk() { asking = null; emit(); }
export async function saveAll(): Promise<boolean> {
  let ok = true;
  for (const p of [...snap]) { try { if (!(await p.save())) ok = false; } catch { ok = false; } }
  return ok;
}
export function discardAll() { for (const p of [...snap]) p.discard(); }
