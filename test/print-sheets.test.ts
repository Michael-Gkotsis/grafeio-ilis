// Παράθυρο «Εκτύπωση» (Michael, 31/10): τα κουτάκια των φύλλων θυμούνται την επιλογή ανά έντυπο («μόνο ΕΞΟΔΟΥΧΟΙ»)·
// αν λείπει φύλλο που είχε επιλεγεί, γυρνά η αρχική επιλογή
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fillOuts } from '../src/main/exports';
import { cleanOpts, openBook, printDefaults, printKey, PRINT_DEFAULT, rememberedSheets, renderOpen } from '../src/main/print';
import { genState } from './outs-gen';

const T = fs.readFileSync(path.join(__dirname, '..', 'templates', 'exodouxoi.xlsx'));

describe('Εκτύπωση: φύλλα που θυμούνται', () => {
  it('το cleanOpts κρατά τα φύλλα (και καθαρίζει ό,τι δεν είναι όνομα)', () => {
    expect(cleanOpts({ sheets: ['ΕΞΟΔΟΥΧΟΙ'] }).sheets).toEqual(['ΕΞΟΔΟΥΧΟΙ']);
    expect(cleanOpts({ sheets: ['ΕΞΟΔΟΥΧΟΙ', 5, null, ''] }).sheets).toEqual(['ΕΞΟΔΟΥΧΟΙ']);
    expect(cleanOpts({ sheets: [] }).sheets).toBeUndefined(); expect(cleanOpts({ sheets: 'x' }).sheets).toBeUndefined(); expect(cleanOpts({}).sheets).toBeUndefined();
    // αποθηκεύεται και διαβάζεται όπως τα printPrefs (JSON)
    expect(cleanOpts(JSON.parse(JSON.stringify(cleanOpts({ sheets: ['ΔΥΝΑΜΗ'] }))), PRINT_DEFAULT).sheets).toEqual(['ΔΥΝΑΜΗ']);
  });
  it('rememberedSheets: ισχύει αν υπάρχουν όλα, αλλιώς αρχική επιλογή', () => {
    const vis = ['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ'];
    expect(rememberedSheets(['ΕΞΟΔΟΥΧΟΙ'], vis)).toEqual(['ΕΞΟΔΟΥΧΟΙ']);
    expect(rememberedSheets(['ΔΥΝΑΜΗ', 'ΕΞΟΔΟΥΧΟΙ'], vis)).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
    expect(rememberedSheets(['ΕΞΟΔΟΥΧΟΙ', 'ΠΑΡΑΜΕΝΟΝΤΕΣ'], vis)).toBeUndefined();   // το φύλλο δεν υπάρχει πια
    expect(rememberedSheets(['ΠΑΡΑΜΕΝΟΝΤΕΣ'], vis)).toBeUndefined();
    expect(rememberedSheets([], vis)).toBeUndefined(); expect(rememberedSheets(undefined, vis)).toBeUndefined();
  });
  it('«μόνο ΕΞΟΔΟΥΧΟΙ» στο Excel «Όλη η δύναμη»: μένει την επόμενη μέρα (άλλο όνομα αρχείου, ίδιο κλειδί)', async () => {
    const g = genState(1008, true, 10); const s = { ...g, settings: { ...g.settings, outsFmt: 'all' as const } };
    const a = await fillOuts(T, s, '2026-10-29'), b = await fillOuts(T, s, '2026-10-30');
    expect(printKey(a.name)).toBe(printKey(b.name));
    // 1η φορά: όλα τα φύλλα, διαλέγει μόνο τα ΕΞΟΔΟΥΧΟΙ και αποθηκεύεται
    const book1 = await openBook(a.data); const vis1 = book1.sheets.map(x => x.name);
    const first = await renderOpen(book1, { file: a.name, sheets: rememberedSheets(undefined, vis1) });
    expect(first.sheets.map(x => x.name)).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
    const saved = JSON.parse(JSON.stringify(cleanOpts({ ...printDefaults(printKey(a.name), vis1), sheets: ['ΕΞΟΔΟΥΧΟΙ'] })));
    // την επόμενη μέρα
    const book2 = await openBook(b.data); const vis2 = book2.sheets.map(x => x.name);
    const second = await renderOpen(book2, { file: b.name, sheets: rememberedSheets(cleanOpts(saved).sheets, vis2) });
    expect(second.sheets.map(x => x.name)).toEqual(['ΕΞΟΔΟΥΧΟΙ']); expect(second.all).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
    // αν λείπει φύλλο που είχε επιλεγεί: πάλι όλα
    const third = await renderOpen(book2, { file: b.name, sheets: rememberedSheets(['ΕΞΟΔΟΥΧΟΙ', 'ΠΑΡΑΜΕΝΟΝΤΕΣ'], vis2) });
    expect(third.sheets.map(x => x.name)).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
  });
});
