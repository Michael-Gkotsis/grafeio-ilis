// Τακτικοί αριθμοί στα αρχεία που γράφει η εφαρμογή: «1ο», «2η», «3ος», όχι «1Ο» (Michael, 26/11). Όλα τα άλλα μένουν με κεφαλαία.
import { describe, it, expect } from 'vitest';
import { upperOrd } from '../src/shared/text';
import { Workbook } from '../src/main/xlsx';

describe('upperOrd', () => {
  it('ο τακτικός αριθμός κρατά μικρή την κατάληξη', () => {
    expect(upperOrd('1ο')).toBe('1ο');
    expect(upperOrd('2η ΕΠΧΙΑ Ν/Σ')).toBe('2η ΕΠΧΙΑ Ν/Σ');
    expect(upperOrd('θαλαμοφύλακας 3ος (Α΄)')).toBe('ΘΑΛΑΜΟΦΥΛΑΚΑΣ 3ος (Α΄)');
    expect(upperOrd('ημερήσιας αναφοράς 4ης ίλης της 12 οκτ 26')).toBe('ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ 4ης ΙΛΗΣ ΤΗΣ 12 ΟΚΤ 26');
    expect(upperOrd('δυναμολόγιο 2ου θαλάμου')).toBe('ΔΥΝΑΜΟΛΟΓΙΟ 2ου ΘΑΛΑΜΟΥ');
    expect(upperOrd('μετάθεση στο 2ο σπ.')).toBe('ΜΕΤΑΘΕΣΗ ΣΤΟ 2ο ΣΠ.');
    expect(upperOrd('1Ο, 2Η και 10ΟΣ')).toBe('1ο, 2η ΚΑΙ 10ος');
  });
  it('ό,τι δεν είναι τακτικός αριθμός μένει με κεφαλαία', () => {
    expect(upperOrd('Θ1α')).toBe('Θ1Α');                 // θέση: γράμμα πριν τον αριθμό
    expect(upperOrd('ΟΜΑΔΑ 12ΧΧ')).toBe('ΟΜΑΔΑ 12ΧΧ');
    expect(upperOrd('2 ο')).toBe('2 Ο');                  // με κενό δεν είναι κολλητά
    expect(upperOrd('1ΟΜΑΔΑ')).toBe('1ΟΜΑΔΑ');            // συνέχεια με γράμμα: λέξη
    expect(upperOrd('ΟΝΟΜΑ ΟΗ')).toBe('ΟΝΟΜΑ ΟΗ');
    expect(upperOrd('Στέρηση εξόδου')).toBe('ΣΤΕΡΗΣΗ ΕΞΟΔΟΥ');
    expect(upperOrd(null)).toBe('');
  });
});

describe('Excel: κελιά και λίστες', () => {
  it('το κείμενο που γράφει η εφαρμογή κρατά την κατάληξη μικρή, και η λίστα επιλογής ίδια', async () => {
    const wb = await Workbook.blank('ΕΛΕΓΧΟΣ'); const ws = await wb.sheet('ΕΛΕΓΧΟΣ');
    ws.set('A1', '2η επχία ν/σ'); ws.set('A2', 'Μαγειρεία 5ος'); ws.set('A3', 'θ1α');
    ws.addListValidation('B1:B5', ['1ο', '2η', 'Άλλο']);
    const back = await Workbook.open(await wb.save()); const rows = await back.values('ΕΛΕΓΧΟΣ');
    expect([rows[0][0], rows[1][0], rows[2][0]]).toEqual(['2η ΕΠΧΙΑ Ν/Σ', 'ΜΑΓΕΙΡΕΙΑ 5ος', 'Θ1Α']);
    const sheetXml = await (await import('jszip')).default.loadAsync(await back.save()).then(z => z.file('xl/worksheets/sheet1.xml')!.async('string'));
    expect(sheetXml).toContain('<formula1>&quot;1ο,2η,ΑΛΛΟ&quot;</formula1>');
  });
});
