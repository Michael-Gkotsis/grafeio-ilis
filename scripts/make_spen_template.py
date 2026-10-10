#!/usr/bin/env python3
"""Φτιάχνει το κενό έντυπο «ΦΡΟΥΡΑ ΣΠΕΝ» από το κενό «ΦΡΟΥΡΑ ΣΒΕΝ» (templates/froura.xlsx).

Η διάταξη ακολουθεί τη φωτογραφία που έστειλε ο γραφέας (10/10/2026): θαλαμοφύλακες αριστερά,
οπλοφύλακες δεξιά, μαγειρεία ×5 και ΤΑΕ κάτω αριστερά, σκοποί (3η και 4η σκοπιά, ζεύγη) κάτω δεξιά,
μετά τιμωρημένοι και απόντες. Τα στυλ αντιγράφονται από το ΣΒΕΝ, ώστε τα δύο έντυπα να μοιάζουν.
Δεν διαβάζει κανένα πραγματικό αρχείο: ξεκινά από το ήδη κενό template.

Χρήση: python3 -I scripts/make_spen_template.py [templates]
"""
import copy, os, sys
import openpyxl

DIR = sys.argv[1] if len(sys.argv) > 1 else 'templates'
wb = openpyxl.load_workbook(os.path.join(DIR, 'froura.xlsx'))
ws = wb.active
ws.title = 'ΦΡΟΥΡΑ ΣΠΕΝ'

def style(dst, src):
    d, s = ws[dst], ws[src]
    d.font = copy.copy(s.font); d.border = copy.copy(s.border); d.alignment = copy.copy(s.alignment)
    d.fill = copy.copy(s.fill); d.number_format = s.number_format

def unmerge_in(rows, cols):
    for m in list(ws.merged_cells.ranges):
        if m.min_row >= rows[0] and m.max_row <= rows[1] and m.min_col >= cols[0] and m.max_col <= cols[1]:
            ws.unmerge_cells(str(m))

# 1. κάτω μέρος (τιμωρημένοι, απόντες, υπογραφές) δύο γραμμές πιο κάτω, για να χωρέσει ΤΑΕ και 4η σκοπιά
SHIFT = 2
low = [m for m in ws.merged_cells.ranges if m.min_row >= 34]
for m in low: ws.unmerge_cells(str(m))
ws.move_range('A34:M47', rows=SHIFT)
for m in low: ws.merge_cells(start_row=m.min_row + SHIFT, start_column=m.min_col, end_row=m.max_row + SHIFT, end_column=m.max_col)
ws.print_area = 'A1:M%d' % (46 + SHIFT)

# 2. δεξιός πίνακας: οπλοφύλακες
ws['J12'] = 'ΟΠΛΟΦΥΛΑΚΕΣ'

# 3. μαγειρεία αριστερά (B:E), όπως στη φωτογραφία
blank = copy.copy(ws['G7']._style)
proto = {c: copy.copy(ws[c + '27']._style) for c in 'EFI'}
unmerge_in((26, 31), (5, 9))
for r in range(26, 34):
    for c in 'EFGHI': ws[c + str(r)].value = None; ws[c + str(r)]._style = copy.copy(blank)
for c, src in zip('BCDE', ['B12', 'C12', 'D12', 'E12']): style(c + '26', src)
ws['B26'] = 'Α/Α'; ws['C26'] = 'ΜΑΓΕΙΡΕΙΑ'; ws['E26'] = 'ΠΑΡ/ΣΕΙΣ'; ws.merge_cells('C26:D26')
for i in range(5):
    r = 27 + i
    ws['B%d' % r]._style = copy.copy(proto['E']); ws['C%d' % r]._style = copy.copy(proto['F'])
    ws['D%d' % r]._style = copy.copy(proto['F']); ws['E%d' % r]._style = copy.copy(proto['F'])
    ws['B%d' % r] = '%dο' % (i + 1); ws.merge_cells('C%d:D%d' % (r, r))

# 4. ΤΑΕ: μία γραμμή κάτω από τα μαγειρεία
r = 33
for c in 'BCDE': ws['%s%d' % (c, r)]._style = copy.copy(proto['F'])
ws['B33'] = 'ΤΑΕ'; ws.merge_cells('C33:D33')

# 5. σκοποί δεξιά (I:L): ανά σκοπιά 3 βάρδιες, δύο ονόματα στο ίδιο κελί
for c in 'IJKL': style(c + '26', c + '12')
ws['I26'] = 'Α/Α'; ws['J26'] = 'ΣΚΟΠΟΙ'; ws['K26'] = 'ΩΡΕΣ'; ws['L26'] = 'ΠΑΡ/ΣΕΙΣ'
TIMES = {'3η': ['18:00-20:00', '02:00-04:00', '10:00-12:00'], '4η': ['20:00-22:00', '04:00-06:00', '12:00-14:00']}
for j, (name, times) in enumerate(TIMES.items()):
    top = 27 + 3 * j
    for k in range(3):
        for c in 'IJKL': style('%s%d' % (c, top + k), '%s%d' % (c, 13 + k))
        ws['K%d' % (top + k)] = times[k]
    ws['I%d' % top] = name
    for c in 'IJL': ws.merge_cells('%s%d:%s%d' % (c, top, c, top + 2))
    ws['J%d' % top].alignment = copy.copy(ws['J13'].alignment)

wb.properties.creator = 'Γραφείο Ίλης'; wb.properties.lastModifiedBy = ''
out = os.path.join(DIR, 'froura-spen.xlsx')
wb.save(out)
print('OK:', out)
