// Προεπισκόπηση εντύπου στην οθόνη: το ΙΔΙΟ αρχείο που γράφει η εξαγωγή (produce στο main.ts), με την ίδια διάταξη σελίδας που θα τυπωθεί
// (printSetup: οι ρυθμίσεις του παραθύρου «Εκτύπωση» που θυμάται η εφαρμογή ανά έντυπο). Καμία δική της ζωγραφιά του Excel:
// ό,τι βγάζει η εξαγωγή (δικό σου template, προφίλ άλλης μονάδας, κεφαλίδα, υπογραφές) φαίνεται όπως θα τυπωθεί.
import { cleanOpts, openBook, printDefaults, printKey, rememberedSheets, renderOpen, sheetFontSize, type Book, type PrintOpts } from './print';
import type { FormPv } from '../shared/api';

// όσα χρειάζεται από το αποτέλεσμα της εξαγωγής (ExportResult στο exports.ts)
export interface Produced { name?: string; data: Buffer; warnings?: string[]; empty?: string[]; sheet?: string }
const MAX_PAGES = 8;   // το μηνιαίο πλέγμα είναι μεγάλο: δείχνονται οι πρώτες σελίδες

// Οι ρυθμίσεις και τα φύλλα με τα οποία ανοίγει το παράθυρο «Εκτύπωση» ένα αρχείο: μία συνάρτηση για την εκτύπωση (printPage) και την οθόνη
// rep: αρχείο εντύπου των Έντυπα· saved: ό,τι είναι αποθηκευμένο για το έντυπο (meta.json printPrefs[printKey])· fix: έντυπο με «Σταθερό μέγεθος γραμμάτων» (Michael, 4/11)
export async function printSetup(book: Book, fileName: string, saved: Partial<PrintOpts> | undefined, sheets?: string[], fix?: boolean, rep?: boolean) {
  const key = printKey(fileName); const visible = book.sheets.filter(x => !x.hidden).map(x => x.name);
  let base = printDefaults(key, sheets && sheets.length ? sheets : visible);
  // Έντυπα (Michael, 25/11): το παράθυρο ξεκινά με «Όσες χρειάζονται»· ό,τι έχει αποθηκευτεί για το έντυπο ισχύει πάνω από αυτό
  if (rep) base = { ...base, pages: 'auto' };
  const opts = cleanOpts({ ...(saved || {}), breaks: undefined }, base);
  if (fix) {
    const sz = await sheetFontSize(book, (sheets && sheets[0]) || visible[0] || '');
    const f = cleanOpts({ pages: 'auto', size: sz }, base); base = { ...base, pages: f.pages, size: f.size }; opts.pages = f.pages; opts.size = f.size;
  }
  // τα φύλλα που είχες διαλέξει την προηγούμενη φορά (αν δεν ζητήθηκαν συγκεκριμένα)· αν λείπει κάποιο, η αρχική επιλογή
  const rem = rememberedSheets(opts.sheets, visible); if (rem) opts.sheets = rem; else delete opts.sheets;
  return { key, base, opts, want: sheets && sheets.length ? sheets : rem };
}

// sheet: μόνο αυτό το φύλλο· saved: οι αποθηκευμένες ρυθμίσεις εκτύπωσης αυτού του εντύπου
export async function previewOf(out: Produced, saved?: Partial<PrintOpts>, sheet?: string): Promise<FormPv> {
  const t0 = Date.now(); const name = out.name || 'προεπισκόπηση.xlsx';
  const book = await openBook(out.data);
  const su = await printSetup(book, name, saved);
  const doc = await renderOpen(book, { file: name, sheets: sheet ? [sheet] : su.want, layout: su.opts, refs: true, maxPages: MAX_PAGES });
  const sheets = doc.sheets.map(x => ({ name: x.name, html: x.html, pages: x.pages }));
  // οι κενές θέσεις σημαδεύονται στο φύλλο της ΦΡΟΥΡΑΣ που γέμισε η εξαγωγή
  const marks = out.empty && sheets.length === 1 ? out.empty : [];
  return { css: doc.css, sheets, warnings: out.warnings || [], marks, ms: Date.now() - t0 };
}
