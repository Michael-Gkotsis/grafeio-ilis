// Προεπισκόπηση εκτύπωσης: γραμματοσειρά με «κώδικα» στο όνομα δεν βγάζει script, και τρέχει μόνο το script της σελίδας.
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import JSZip from 'jszip';
import { Workbook } from '../src/main/xlsx';
import { previewHtml, renderBook } from '../src/main/print';

describe('εκτύπωση: ασφάλεια της προεπισκόπησης', () => {
  it('όνομα γραμματοσειράς με </style><script>: δεν περνά στο HTML· CSP μόνο για το script της σελίδας', async () => {
    const wb = await Workbook.blank('Φ'); (await wb.sheet('Φ')).set('A1', 'ΚΕΙΜΕΝΟ').setStyle('A1', 1);
    const zip = await JSZip.loadAsync(await wb.save());
    const st = await zip.file('xl/styles.xml')!.async('string');
    zip.file('xl/styles.xml', st.replace('<font><b/><sz val="11"/><name val="Calibri"/></font>', '<font><b/><sz val="11"/><name val="X&quot;;}&lt;/style&gt;&lt;script&gt;alert(1)&lt;/script&gt;"/></font>'));
    const doc = await renderBook(await zip.generateAsync({ type: 'nodebuffer' }), { file: 'a.xlsx' });
    expect(doc.css).not.toMatch(/[<>]/);
    const html = previewHtml(doc, 'a.xlsx');
    expect(html.match(/<script/g)).toHaveLength(1);
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)![1];
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
    expect(csp).toContain("'sha256-" + crypto.createHash('sha256').update(script).digest('base64') + "'");
  });
});
