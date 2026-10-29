// Κλείδωμα κύλισης της σελίδας όσο είναι ανοιχτό κάποιο παράθυρο.
// Μετρητής: δύο παράθυρα που κλείνουν μαζί (π.χ. «Κλείσε χωρίς αποθήκευση») άφηναν τη σελίδα χωρίς κύλιση (review 29/10)
type Target = { style: { overflow: string } };
const counts = new WeakMap<object, number>();

export function lockScroll(target: Target = document.body): () => void {
  const n = counts.get(target) || 0;
  counts.set(target, n + 1);
  if (n === 0) target.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const m = (counts.get(target) || 1) - 1;
    counts.set(target, Math.max(0, m));
    if (m <= 0) target.style.overflow = '';
  };
}
