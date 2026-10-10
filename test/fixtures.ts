// Ψεύτικα δεδομένα για τα τεστ: κανένα πραγματικό όνομα.
import { emptyState, type AppState, type Person } from '../src/shared/domain';

const LAST = ['ΔΟΚΙΜΙΟΣ', 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ', 'ΥΠΟΘΕΤΙΔΗΣ', 'ΦΑΝΤΑΣΙΟΣ', 'ΠΛΑΣΜΑΤΙΚΟΣ', 'ΤΥΧΑΙΟΣ', 'ΑΓΝΩΣΤΟΠΟΥΛΟΣ', 'ΔΕΙΓΜΑΤΑΣ'];
const FIRST = ['ΑΛΦΑΣ', 'ΒΗΤΑΣ', 'ΓΑΜΜΑΣ', 'ΔΕΛΤΑΣ', 'ΕΨΙΛΟΝ', 'ΖΗΤΑΣ'];

export function fakePeople(n: number): Person[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1, rank: i === 0 ? 'ΔΝΕΑΣ' : 'ΣΤΡ', spec: 'ΠΖ', last: LAST[i % LAST.length] + (i >= LAST.length ? String(Math.floor(i / LAST.length)) : ''),
    first: FIRST[i % FIRST.length], father: 'ΠΑΤΕΡΑΣ', asm: String(900000 + i), phone: '6900000' + String(i).padStart(3, '0'),
    room: (i % 8) + 1, si: i % 10 === 9 ? 'Ι3 ΑΟΠΛΟ' : 'Ι1', post: i === 5 ? 'ΚΨΜ' : null, role: null, essos: '2026 Γ΄',
    attached: false, active: true, notes: ''
  }));
}
export function fakeState(n = 40): AppState {
  const s = emptyState(); s.people = fakePeople(n); return s;
}
