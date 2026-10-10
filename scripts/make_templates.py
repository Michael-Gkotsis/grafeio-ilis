#!/usr/bin/env python3
"""Φτιάχνει τα κενά templates της εφαρμογής από τα πραγματικά έντυπα της Ίλης.

Τα πραγματικά αρχεία έχουν προσωπικά δεδομένα και ΔΕΝ μπαίνουν ποτέ στο repo (samples-private/).
Το script καθαρίζει κάθε κελί δεδομένων, ξαναβάζει τους τύπους της ΗΚΑΙ και στο τέλος ελέγχει
ότι κανένα όνομα, τηλέφωνο ή ΑΣΜ από τα δείγματα δεν έμεινε μέσα στα παραγόμενα αρχεία.

Χρήση: python3 scripts/make_templates.py <φάκελος δειγμάτων> [φάκελος εξόδου=templates]
"""
import copy, glob, html, os, re, sys, unicodedata, zipfile
import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else 'samples-private'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'templates'
os.makedirs(OUT, exist_ok=True)

def find(prefix):
    m = sorted(glob.glob(os.path.join(SRC, prefix + '*')))
    if not m: sys.exit('Λείπει το δείγμα ' + prefix + '* στο ' + SRC)
    return m[0]

def scrub_props(wb):
    p = wb.properties
    p.creator = 'Γραφείο Ίλης'; p.lastModifiedBy = ''; p.title = None; p.subject = None
    p.description = None; p.keywords = None; p.category = None; p.lastPrinted = None
    try: wb.custom_doc_props.props.clear()
    except AttributeError: pass
    wb.calculation.fullCalcOnLoad = True

def clear(ws, ref):
    for row in ws[ref] if ':' in ref else [[ws[ref]]]:
        for c in row:
            if type(c).__name__ != 'MergedCell': c.value = None

# ---------------------------------------------------------------- ΦΡΟΥΡΑ ΣΒΕΝ
wb = openpyxl.load_workbook(find('01-'))
ws = wb.worksheets[0]
ws['A5'] = 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ'
ws['A9'] = 'Λ/Υ: '; ws['A10'] = 'Δ/Υ: '
for col in 'CEJL': clear(ws, f'{col}13:{col}24')
clear(ws, 'F27:H31'); clear(ws, 'I27:M31')
clear(ws, 'B36:F41'); clear(ws, 'I36:M41')
ws['B46'] = 'ΑΛΧΙΑΣ ΙΛΗΣ'
scrub_props(wb)
wb.save(os.path.join(OUT, 'froura.xlsx'))

# ---------------------------------------------------------------- ΗΚΑΙ
wb = openpyxl.load_workbook(find('15-'))
fr, bk = wb.worksheets[0], wb.worksheets[1]
fr['A4'] = 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ 4ης ΙΛΗΣ ΤΗΣ'
fr['V34'] = 'Αυλώνας, '
fr['AC34'] = None
for r in list(range(17, 22)) + list(range(23, 30)):
    clear(fr, f'C{r}:D{r}'); clear(fr, f'F{r}:M{r}'); clear(fr, f'O{r}:Y{r}'); fr[f'AB{r}'] = None
    fr[f'E{r}'] = f'=SUM(C{r}:D{r})'; fr[f'N{r}'] = f'=SUM(F{r}:M{r})'
    fr[f'Z{r}'] = f'=SUM(O{r}:Y{r})'; fr[f'AA{r}'] = f'=E{r}-Z{r}'
for r, n in zip(range(17, 22), '12345'): fr[f'AC{r}'] = n
for r, n in zip(range(23, 27), '1234'): fr[f'AC{r}'] = n
for r, n in zip(range(28, 32), '1234'): fr[f'AC{r}'] = n
clear(bk, 'B5:D5'); clear(bk, 'B8:D8'); clear(bk, 'B11:D11'); clear(bk, 'G5:J5')
for r in range(8, 20): bk[f'G{r}'] = None
clear(bk, 'A18:E20'); clear(bk, 'A22:E30')
bk['L23'] = 'Αυλώνας, '
scrub_props(wb)
wb.save(os.path.join(OUT, 'hkai.xlsx'))

# ---------------------------------------------------------------- Εξοδούχοι / Παραμένοντες
wb = openpyxl.load_workbook(find('10-'))
keep = {'ΕΞΟΔΟΥΧΟΙ ΚΥΡ': 'ΕΞΟΔΟΥΧΟΙ', 'ΠΑΡΑΜΕΝΟΝΤΕΣ ΚΥΡ': 'ΠΑΡΑΜΕΝΟΝΤΕΣ'}
for ws in list(wb.worksheets):
    if ws.title not in keep: wb.remove(ws); continue
    title = keep[ws.title]; ws.title = title
    # ύψος/στυλ υποσέλιδου από το πρωτότυπο (γραμμή «Αυλώνας» και οι δύο από κάτω)
    foot = next(r for r in range(7, ws.max_row + 1) if str(ws[f'G{r}'].value or '').startswith('Αυλ'))
    styles = {(i, col): copy.copy(ws[f'{col}{foot + i}']._style) for i in range(3) for col in 'ABCDEFGH'}
    ws.delete_rows(8, ws.max_row)
    clear(ws, 'B7:H7'); ws['A7'] = '=ROW()-6'
    ws['A5'] = title + ' ΤΗΣ'
    for (i, col), st in styles.items(): ws[f'{col}{9 + i}']._style = st
    ws['G9'] = 'Αυλώνας, '
    ws['D10'] = 'Ο'; ws['G10'] = 'Ο'; ws['D11'] = 'ΑΛΧΙΑΣ ΙΛΗΣ'; ws['G11'] = 'ΔΚΤΗΣ ΙΛΗΣ'
    ws.print_area = 'A1:H11'
    for t in ws.tables.values():   # ο πίνακας του Excel: μόνο η γραμμή-πρότυπο, χωρίς την παλιά ταξινόμηση
        t.ref = 'A6:H7'; t.autoFilter.ref = 'A6:H7'; t.sortState = None
scrub_props(wb)
wb.save(os.path.join(OUT, 'exodouxoi.xlsx'))

# ---------------------------------------------------------------- έλεγχος: κανένα προσωπικό στοιχείο
tokens = set()
def plain(t):  # κεφαλαία χωρίς τόνους
    t = unicodedata.normalize('NFD', html.unescape(t).upper())
    return ''.join(ch for ch in t if unicodedata.category(ch) != 'Mn')
def harvest(path, sheets=None):
    w = openpyxl.load_workbook(path, read_only=True, data_only=True, keep_vba=False)
    for s in w.worksheets:
        for row in s.iter_rows(values_only=True):
            for v in row:
                if v is None: continue
                for t in re.split(r'[\s,()/.:\-]+', str(v)):
                    if len(t) >= 4 and (any(ch.isdigit() for ch in t) and len(t) >= 7 or t.isalpha()): tokens.add(plain(t))
harvest(find('12-')); harvest(find('10-')); harvest(find('01-'))
LABELS = set('''ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΘΑΛΑΜΟΦΥΛΑΚΕΣ ΩΡΕΣ ΣΕΙΣ ΜΑΓΕΙΡΕΙΑ ΤΙΜΩΡΗΜΕΝΟΙ ΑΠΟΝΤΕΣ ΟΝΟΜΑΤΕΠΩΝΥΜΟ ΕΙΔΟΣ ΠΟΙΝΗΣ ΑΠΟΥΣΙΑΣ
ΑΛΧΙΑΣ ΙΛΗΣ ΔΚΤΗΣ ΕΠΧΙΑΣ ΓΡΑΦΕΙΟ ΑΥΛΩΝΑ ΚΕΤΘ ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ ΕΞΟΔΟΥΧΟΙ ΠΑΡΑΜΕΝΟΝΤΕΣ ΒΑΘΜΟΣ ΕΠΙΘΕΤΟ ΟΝΟΜΑ ΘΑΛΑΜΟΣ
ΤΗΛΕΦΩΝΟ ΠΑΡΑΤΗΡΗΣΕΙΣ ΑΥΛΩΝΑΣ ΣΥΝΟΛΙΚΟ ΕΠΩΝΥΜΟ ΠΑΤΡΩΝΥΜΟ ΚΙΝΗΤΟ ΔΙΟΙΚΗΤΗΣ ΣΥΝΟΛΟ ΠΑΡΑΤΗΡΗΣΕΙΣ ΒΑΘΜΟΙ ΔΥΝΑΜΗ
ΤΟΠΟΘΕΤΗΜΕΝΟΙ ΠΡΟΣΚΟΛΗΜΕΝΟΙ ΠΙΝΑΚΑΣ ΠΙΝΑΚΑΣ3 ΕΠΧΙΑ ΑΔΕΙΕΣ ΝΟΣΟΚΟΜΕΙΟ ΣΤΡΑΤΙΩΤΕΣ ΣΤΡΑΤΙΩΤΗΣ'''.split())
def texts(path):
    z = zipfile.ZipFile(path)
    return plain(' '.join(z.read(n).decode('utf8', 'ignore') for n in z.namelist() if n.endswith('.xml') or n.endswith('.rels'))).upper()
if os.environ.get('SELFTEST'):  # δοκιμή του ελέγχου: βάζει μία λέξη από τα δείγματα και περιμένει αποτυχία
    w = openpyxl.load_workbook(os.path.join(OUT, 'froura.xlsx')); w.worksheets[0]['A1'] = sorted(t for t in tokens if t not in LABELS and t.isalpha())[0]
    w.save(os.path.join(OUT, 'froura.xlsx'))
bad = []
for name in ('froura', 'hkai', 'exodouxoi'):
    body = texts(os.path.join(OUT, name + '.xlsx'))
    words = set(re.findall(r'[0-9A-ZΑ-ΩΆΈΉΊΌΎΏΪΫ]{4,}', body))
    leak = sorted(t for t in tokens & words if t not in LABELS and not (t.isdigit() and len(t) < 7))
    if leak: bad.append((name, leak))
if bad:
    for name, leak in bad: print('ΠΡΟΣΟΧΗ', name, 'έχει πιθανή διαρροή:', len(leak), 'λέξεις, π.χ.', ', '.join(leak[:10]) if '--show' in sys.argv else ', '.join(x[:2] + '…' for x in leak[:10]))
    sys.exit(2)
print('Έλεγχος', len(tokens), 'λέξεων από τα δείγματα.')
print('ΟΚ: templates χωρίς προσωπικά στοιχεία →', OUT)
