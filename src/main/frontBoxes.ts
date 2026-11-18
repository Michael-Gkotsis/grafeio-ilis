// Τα κουτάκια με ονόματα κάτω από τον πίνακα της ΗΚΑΙ/ΗΚΑΛ μιας άλλης μονάδας (Michael 18/11, ΗΚΑΛ Λόχου Σκαπανέων):
// «ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ/ΑΜΔ», «ΑΠΟΣΠΑΣΗ - ΔΙΑΘΕΣΗ», «ΦΥΛΑΚΙΟ - ΠΕΡΙΠΟΛΟ»… με τα ονόματα από κάτω, ένα σε κάθε γραμμή.
// Το πρότυπο κρατά τα ονόματα της μέρας που φτιάχτηκε· αυτά σβήνονται και γράφονται τα σημερινά.
// Κουτάκι = επικεφαλίδα (λέξη κατάστασης) και από κάτω τα κελιά με μορφή (περίγραμμα) στην ίδια στήλη, ως την επόμενη επικεφαλίδα.
// Ποια κατάσταση: η στήλη του πίνακα με το ίδιο όνομα, αλλιώς σίγουρη λέξη του λεξικού, αλλιώς η μόνη στήλη του πίνακα με την ίδια
// πρώτη λέξη («ΦΥΛΑΚΙΟ - ΠΕΡΙΠΟΛΟ» → «Φυλάκιο - Λαγούδι»). Κουτάκι που δεν ξέρουμε τι μετρά: μόνο σβήνονται τα παλιά ονόματα.
// Αγγίζονται μόνο κελιά που είναι κενά ή έχουν όνομα με βαθμό (όχι άλλο κείμενο του εντύπου).
import type { Workbook } from './xlsx';
import type { PlannedWrite } from './safeWrite';
import { Grid, cellRef, valueText, type SheetModel } from '../shared/sheetModel';
import { phraseKey, type Lexicon } from '../shared/lexicon';
import type { FrontMap } from '../shared/hkRules';
import type { HkWho } from '../shared/rules';
import { upper } from '../shared/text';

export interface BoxInfo { ref: string; text: string; keys: string[]; how: 'col' | 'word' | 'first' | 'none'; slots: number; people: number; cleared: number }
const MAX_SLOTS = 15;
const first = (t: string) => (upper(t).split(/[\s\-–/,.()]+/).find(w => w.length >= 4) || '');

export async function planBoxes(wb: Workbook, sh: SheetModel, map: FrontMap, who: HkWho[], lex: Lexicon, statusCol: Record<string, string>): Promise<{ plan: PlannedWrite[]; warnings: string[]; boxes: BoxInfo[] }> {
  const plan: PlannedWrite[] = []; const warnings: string[] = []; const boxes: BoxInfo[] = [];
  const g = new Grid(sh); const ws = await wb.sheet(sh.name);
  const styled = (r: number, c: number) => { const x = ws.styleOf(cellRef(r, c)); return x != null && x !== 0; };
  const cols = map.cols.filter(c => c.rule?.t === 'state' && c.text) as (FrontMap['cols'][number] & { rule: { t: 'state'; keys: string[] } })[];
  // τι μετρά μια επικεφαλίδα· null = δεν είναι επικεφαλίδα κουτιού
  const keysOf = (t: string): { keys: string[]; how: BoxInfo['how'] } | null => {
    // στήλη του πίνακα με το ίδιο όνομα: ό,τι μετρά εκείνη (αν δεν έχει αντιστοιχιστεί, ούτε το κουτάκι)
    const same = map.cols.find(c => c.text && phraseKey(c.text) === phraseKey(t));
    if (same) return same.rule?.t === 'state' ? { keys: same.rule.keys, how: 'col' } : { keys: [], how: 'none' };
    const m = lex.match(t, { kinds: ['status', 'hkcol'] });
    if (m.confidence === 'sure' && m.concept) {
      const k = statusCol[m.concept] ?? (m.concept.startsWith('hkcol:') ? m.concept.slice(6) : null);
      // η λέξη είναι κατάσταση· μετρά μόνο αν ο πίνακας έχει στήλη γι' αυτήν (αλλιώς δεν ξέρουμε ποιοι, σβήνονται μόνο τα παλιά)
      return k && cols.some(c => c.rule.keys.includes(k)) ? { keys: [k], how: 'word' } : { keys: [], how: 'none' };
    }
    const w = first(t); const hits = w ? cols.filter(c => first(c.text) === w) : [];
    if (hits.length === 1) return { keys: hits[0].rule.keys, how: 'first' };
    return null;
  };
  const isName = (t: string) => { const w = upper(t).trim().split(/[\s(]+/)[0]; return /\([Α-Ω]{1,4}\)/.test(upper(t)) || (!!w && lex.match(w, { kinds: ['rank'] }).confidence === 'sure'); };
  // οι επικεφαλίδες: κάτω από τον πίνακα, κείμενο όχι τύπος, πάνω αριστερά συγχώνευσης
  const heads: { r: number; c: number; c2: number; text: string; k: { keys: string[]; how: BoxInfo['how'] } }[] = [];
  for (let r = map.region.r2 + 1; r < sh.rows.length; r++) for (let c = 0; c < (sh.rows[r]?.length ?? 0); c++) {
    const v = sh.rows[r][c]; if (typeof v !== 'string' || g.isFormula(r, c)) continue;
    const m = g.mergeOf(r, c); if (m && (m.r1 !== r || m.c1 !== c)) continue;
    const t = v.replace(/\s+/g, ' ').trim(); if (t.length < 3 || t.length > 40 || /[:]/.test(t) || isName(t)) continue;
    const k = keysOf(t); if (k) heads.push({ r, c, c2: m?.c2 ?? c, text: t, k });
  }
  const headAt = new Set(heads.map(h => h.r + ':' + h.c));
  const nameOf = (w: HkWho) => { const x = w.p ?? w.c!; return upper((x.rank + (x.spec ? ' (' + x.spec + ')' : '') + ' ' + x.last + (x.first ? ' ' + x.first.trim()[0] + '.' : '')).replace(/\s+/g, ' ').trim()); };
  for (const h of heads) {
    // τα κελιά του κουτιού: από κάτω, ίδια στήλη, με μορφή, ως την επόμενη επικεφαλίδα ή κείμενο που δεν είναι όνομα
    // όλα με το ίδιο πλάτος (συγχώνευση) με το πρώτο: εκεί τελειώνει το περίγραμμα του κουτιού
    const slots: { r: number; old: string }[] = []; let span = -1;
    for (let r = h.r + 1; r <= h.r + MAX_SLOTS; r++) {
      if (headAt.has(r + ':' + h.c) || !styled(r, h.c)) break;
      const m = g.mergeOf(r, h.c); if (m && (m.r1 !== r || m.c1 !== h.c)) break;
      const w = (m?.c2 ?? h.c) - h.c; if (span < 0) span = w; else if (w !== span) break;
      if (g.isFormula(r, h.c)) break;
      const t = valueText(sh.rows[r]?.[h.c]).trim(); if (t && !isName(t)) break;
      slots.push({ r, old: typeof sh.rows[r]?.[h.c] === 'string' ? String(sh.rows[r][h.c]) : '' });
    }
    if (!slots.length) continue;
    const people = h.k.keys.length ? who.filter(w => w.col != null && h.k.keys.includes(w.col)).map(nameOf) : [];
    // περισσότερα ονόματα από γραμμές: τα υπόλοιπα στην τελευταία, χωρισμένα με κόμμα (δεν χάνεται κανείς)
    const n = slots.length; const lines = people.length > n ? [...people.slice(0, n - 1), people.slice(n - 1).join(', ')] : people;
    let cleared = 0;
    slots.forEach((s, i) => {
      const v = lines[i] ?? null;
      if (v == null && !s.old.trim()) return;
      if (v == null) cleared++;
      plan.push({ sheet: sh.name, r: s.r, c: h.c, value: v, ...(s.old ? { over: s.old } : {}) });
    });
    boxes.push({ ref: cellRef(h.r, h.c), text: h.text, keys: h.k.keys, how: h.k.how, slots: slots.length, people: people.length, cleared });
    if (h.k.how === 'none' && cleared) warnings.push('Το κουτάκι «' + h.text + '» δεν αντιστοιχεί σε στήλη του πίνακα: σβήστηκαν τα παλιά ονόματα και δεν γράφτηκαν νέα');
  }
  return { plan, warnings, boxes };
}
