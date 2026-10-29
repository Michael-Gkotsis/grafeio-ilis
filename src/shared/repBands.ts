// Έντυπα, Φάση 3 (Michael, 24/10): «κάθε πίνακας (και ο 1ος) μπαίνει πάνω, κάτω ή δίπλα σε άλλον». Οι πίνακες του εντύπου (ο 1ος = 'main',
// οι πίνακες 2, 3… και οι πίνακες τιμών με το id τους) μπαίνουν σε ζώνες: κάθε ζώνη είναι μια σειρά πινάκων από αριστερά προς τα δεξιά,
// και οι ζώνες μπαίνουν η μία κάτω από την άλλη. Η ζώνη είναι τόσο ψηλή όσο ο ψηλότερος πίνακάς της, ώστε όταν μεγαλώνει ο ένας να μη
// σκίζεται ο διπλανός. Καθαρή λογική: χωρίς οθόνη και χωρίς Node, για το «Φτιάξ' το εδώ», το γέμισμα και την οθόνη.
export const MAIN = 'main';
export type Bands = string[][];

// Οι ζώνες όπως ισχύουν για αυτούς τους πίνακες: ό,τι δεν υπάρχει πια (σβησμένος πίνακας) φεύγει, ό,τι είναι καινούριο μπαίνει σε δική του ζώνη
// στο τέλος. Χωρίς αποθηκευμένες ζώνες: ο ένας κάτω από τον άλλον με τη σειρά των ids (όπως πριν τη Φάση 3).
export function bandsOf(ids: string[], saved?: Bands): Bands {
  const have = new Set(ids), seen = new Set<string>(); const out: Bands = [];
  for (const b of saved || []) { const c = b.filter(x => have.has(x) && !seen.has(x) && !!seen.add(x)); if (c.length) out.push(c); }
  for (const x of ids) if (!seen.has(x)) out.push([x]);
  return out;
}
// Η προεπιλεγμένη διάταξη: όλοι ο ένας κάτω από τον άλλον με τη σειρά των ids
export const isDefault = (ids: string[], bands: Bands): boolean => bands.length === ids.length && bands.every((b, i) => b.length === 1 && b[0] === ids[i]);
export const hasBeside = (bands: Bands): boolean => bands.some(b => b.length > 1);
// Για αποθήκευση: η προεπιλεγμένη διάταξη δεν αποθηκεύεται (το έντυπο μένει όπως ήταν)
export const keepBands = (ids: string[], bands: Bands): Bands | undefined => (isDefault(ids, bands) ? undefined : bands);
export const bandIndex = (bands: Bands, id: string): number => bands.findIndex(b => b.includes(id));

export type Put = { first: true } | { id: string; how: 'below' | 'above' | 'beside' | 'left' };
// Βάζει τον πίνακα id: πρώτο στο φύλλο, ή κάτω από / πάνω από / δεξιά από / αριστερά από τον πίνακα t (και στην ίδια ζώνη με αυτόν)
export function put(bands: Bands, id: string, to: Put): Bands {
  const rest = bands.map(b => b.filter(x => x !== id)).filter(b => b.length);
  if ('first' in to) return [[id], ...rest];
  const i = rest.findIndex(b => b.includes(to.id)); if (i < 0 || to.id === id) return bands;
  if (to.how === 'below') rest.splice(i + 1, 0, [id]);
  else if (to.how === 'above') rest.splice(i, 0, [id]);
  else { const j = rest[i].indexOf(to.id); rest[i].splice(to.how === 'left' ? j : j + 1, 0, id); }
  return rest;
}
export type Step = 'up' | 'down' | 'left' | 'right';
// Βελάκια: ←/→ αλλάζουν θέση με τον διπλανό μέσα στη ζώνη· ↑/↓ από ζώνη με πολλούς βγάζουν τον πίνακα πάνω/κάτω από αυτούς, αλλιώς ανεβάζουν/κατεβάζουν όλη τη ζώνη
export function step(bands: Bands, id: string, dir: Step): Bands {
  const bi = bandIndex(bands, id); if (bi < 0) return bands;
  const b = bands[bi]; const j = b.indexOf(id);
  if (dir === 'left' || dir === 'right') {
    const k = dir === 'left' ? j - 1 : j + 1; if (k < 0 || k >= b.length) return bands;
    const nb = b.slice(); [nb[j], nb[k]] = [nb[k], nb[j]]; return bands.map((x, i) => (i === bi ? nb : x));
  }
  if (b.length > 1) { const rest = b.filter(x => x !== id); const out = bands.map((x, i) => (i === bi ? rest : x)); out.splice(dir === 'up' ? bi : bi + 1, 0, [id]); return out; }
  const k = dir === 'up' ? bi - 1 : bi + 1; if (k < 0 || k >= bands.length) return bands;
  const out = bands.slice(); [out[bi], out[k]] = [out[k], out[bi]]; return out;
}
export const canStep = (bands: Bands, id: string, dir: Step): boolean => step(bands, id, dir) !== bands;
// Σύρσιμο πάνω σε κουτί: ποια ζώνη του κουτιού (x, y από 0 ως 1 μέσα σε αυτό) → πού μπαίνει ο πίνακας που σέρνεται
export function dropAt(x: number, y: number): 'left' | 'beside' | 'above' | 'below' {
  if (x < 0.28) return 'left'; if (x > 0.72) return 'beside';
  return y < 0.5 ? 'above' : 'below';
}
// Πού είναι ο πίνακας id ως προς τους άλλους, σε λέξεις: «πρώτος», «κάτω από Χ», «δίπλα σε Χ»
export function whereText(bands: Bands, id: string, name: (id: string) => string): string {
  const bi = bandIndex(bands, id); if (bi < 0) return '';
  const b = bands[bi];
  if (b.length > 1) { const j = b.indexOf(id); return 'δίπλα σε ' + name(b[j ? j - 1 : 1]); }
  return bi ? 'κάτω από ' + name(bands[bi - 1][0]) : 'πρώτος';
}
