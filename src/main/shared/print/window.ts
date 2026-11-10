// The HTML of the print preview window.
//
// Purpose: `previewHtml` (the whole page), `sectionsHtml` (the pages of a document), `infoOf` and the type `PrintInfo`
//   (the data of the settings column).
// Does NOT: contain the script of the window (windowScript.ts) or lay out pages.
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the window shows the pages on the left and the settings on the right; the page text is a template and moves
//   verbatim (Phase 4.8a).
// Covering test: test/print-safety.test.ts, test/print-layout.test.ts and test/print.test.ts.
import type { PrintDoc } from './pagesetup';
import { PRINT_DEFAULT, type PrintOpts } from './options';
import type { SortCol } from './types';
import { esc } from './xml';
import { PREVIEW_SCRIPT, SCRIPT_HASH } from './windowScript';

/** What the settings column needs: pages, orientation and letters of every sheet. */
export interface PrintInfo {
  sheets: {
    name: string;
    pages: number;
    landscape: boolean;
    pt: number;
    font: string;
    size: number;
    titles: boolean;
    scale: number;
  }[];
  all: string[];
  total: number;
  sug?: { n: number; pt: number };
  cols: SortCol[];
}

/** The settings-column data of a rendered document. */
export const infoOf = (doc: PrintDoc): PrintInfo => ({
  sheets: doc.sheets.map((s) => ({
    name: s.name,
    pages: s.pages,
    landscape: s.landscape,
    pt: s.pt,
    font: s.font,
    size: s.size,
    titles: s.titles,
    scale: s.scale,
  })),
  all: doc.all,
  total: doc.total,
  ...(doc.sug ? { sug: doc.sug } : {}),
  cols: doc.cols || [],
});

/** The sheets of a rendered document as `<section>` HTML for the preview window. */
export const sectionsHtml = (doc: PrintDoc) =>
  doc.sheets
    .map(
      (s, i) =>
        `<section data-i="${i}" aria-label="${esc(s.name)}">${doc.sheets.length > 1 ? `<h2>${esc(s.name)}</h2>` : ''}${s.html}</section>`,
    )
    .join('') || '<p class="empty">Δεν διαλέχτηκε φύλλο για εκτύπωση.</p>';

const seg = (name: string, label: string, opts: [string, string, string?][]) =>
  `<div class="grp"><span class="lbl" id="l-${name}">${label}</span><div class="seg" role="radiogroup" aria-labelledby="l-${name}">${opts.map(([v, t, id]) => `<label><input type="radio" name="${name}" value="${v}"><span${id ? ` id="${id}"` : ''}>${t}</span></label>`).join('')}</div>`;

/**
 * The preview page: on the left the pages as they will print, on the right the settings (pages, sides, orientation...).
 */
export function previewHtml(
  doc: PrintDoc,
  file: string,
  init: { opts?: PrintOpts; remember?: boolean; duplex?: boolean } = {},
): string {
  const one = doc.sheets[0];
  const data = {
    opts: init.opts || PRINT_DEFAULT,
    info: infoOf(doc),
    remember: init.remember !== false,
    duplex: !!init.duplex,
  };
  return `<!doctype html><html lang="el"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${SCRIPT_HASH}'">
<title>Εκτύπωση · ${esc(file)}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:#5c6152;font:14px "Segoe UI",Tahoma,Arial,sans-serif;color:#1b1f16;display:flex;flex-direction:column}
[hidden]{display:none!important}
.bar{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:9px 16px;background:#4b5320;color:#fff}
.bar b{font-size:15px}.bar .meta{color:#d6dbbf}
.sheets{display:flex;flex-wrap:wrap;gap:6px}.sheets label{display:inline-flex;gap:5px;align-items:center;padding:2px 9px;border:1px solid #727c45;border-radius:14px;cursor:pointer}
.sheets small{color:#d6dbbf}.sheets input{accent-color:#d8b23a}
.wrap{flex:1;display:flex;min-height:0}
#view{flex:1;overflow:auto;padding:18px 0 30px;min-width:0}
#pages{display:flex;flex-direction:column;align-items:center;gap:18px}
section{display:flex;flex-direction:column;align-items:center;gap:18px}
section h2{margin:0;color:#e9ecdf;font-size:13px;font-weight:600}
.pbox{display:flex;flex-direction:column;align-items:center;gap:5px}.pbox>small{color:#e9ecdf;font-size:12px}
.sheet{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 12px;border:1px dashed rgba(233,236,223,.45);border-radius:10px}
.sheet>b{color:#e9ecdf;font-size:13px;font-weight:600}.pair{display:flex;gap:24px;align-items:flex-start}.pair.stack{flex-direction:column;gap:14px}
.hint{color:#e9ecdf;font-size:12.5px;text-align:center;margin:16px auto 0;max-width:60ch}
.empty{color:#fff;text-align:center}
body.busy #pages{opacity:.55;transition:opacity .15s}
.pg{position:relative;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.45);overflow:hidden;flex:none}
.ar{position:absolute;transform-origin:0 0}
#view tr[data-r]{cursor:pointer}#view tr[data-r]:hover td{background-color:#fff6c9!important}
table{border-collapse:collapse;table-layout:fixed;color:#000}
td{padding:0;overflow:visible;vertical-align:bottom;font:11pt Calibri,Carlito,Arial,sans-serif}
table.grid td{outline:0.5px solid #bbb}
.x{display:flex;padding:0 2px;white-space:pre;overflow:hidden;line-height:1.15}
.x.o{overflow:visible}
.x.w{white-space:pre-wrap;word-wrap:break-word}.x.w span{width:100%}
.hf{position:absolute;display:flex;justify-content:space-between;font:10pt Calibri,Carlito,Arial,sans-serif}.hf span{flex:1}.hf span:nth-child(2){text-align:center}.hf span:nth-child(3){text-align:right}
.pno{position:absolute;left:0;right:0;text-align:center;font:9pt Arial,sans-serif;color:#333}
.side{width:336px;flex:none;background:#fff;display:flex;flex-direction:column;border-left:1px solid #dadecf;min-height:0}
.scroll{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:14px}
.grp{display:flex;flex-direction:column;gap:6px}
.lbl{font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#596050}
.seg{display:flex;border:1px solid #c2c8b5;border-radius:7px;overflow:hidden}
.seg label{flex:1;position:relative;min-width:0}
.seg input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.seg span{display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:5px 3px;border-left:1px solid #c2c8b5;font-size:12.5px;line-height:1.2;cursor:pointer}
.seg label:first-child span{border-left:0}
.seg input:checked+span{background:#4b5320;color:#fff;font-weight:600}
.seg input:focus-visible+span{outline:2px solid #5b7a2b;outline-offset:-3px}
.help{font-size:12px;color:#596050;margin:0}
.chk{display:flex;gap:7px;align-items:flex-start;font-size:13px;cursor:pointer}.chk input{margin-top:3px;accent-color:#4b5320}
.legible{display:flex;flex-direction:column;gap:5px;padding:9px 11px;border-radius:8px;font-size:13px}
.legible.ok{background:#ddf0e2;color:#1e6b34}.legible.warn{background:#fbedd2;color:#7a4700}.legible.bad{background:#fadfdc;color:#8a1c12}
.legible b{font-size:14px}
.manual{display:flex;gap:8px;align-items:center;justify-content:space-between;background:#e3e7d8;padding:5px 9px;border-radius:7px;font-size:12.5px}
.range{display:flex;gap:8px;align-items:center}.range input{flex:1;accent-color:#4b5320}.range output{min-width:46px;text-align:right;font-weight:600}
.foot{border-top:1px solid #dadecf;padding:10px 14px;display:flex;flex-direction:column;gap:8px;background:#f3f4ef}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.prn{display:inline-flex;gap:6px;align-items:center;color:#596050;font-size:13px}.prn select,.prn input{font:inherit;padding:4px 6px;border:1px solid #c2c8b5;border-radius:6px;background:#fff;color:#1b1f16}.prn select{max-width:200px}.prn input{width:56px}
button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #c2c8b5;background:#fff;cursor:pointer;color:#1b1f16}
button.sm{padding:3px 9px;font-size:12.5px;align-self:flex-start}
button.pri{background:#4b5320;border-color:#4b5320;color:#fff;font-weight:600}button:disabled{opacity:.6;cursor:default}
button:focus-visible,.sheets label:focus-within{outline:2px solid #5b7a2b;outline-offset:2px}
.msg{color:#b3261e;font-size:13px}.msg.ok{color:#1e6b34}.msg:empty{display:none}
.flip{position:fixed;inset:0;background:rgba(15,18,10,.45);display:flex;align-items:center;justify-content:center;z-index:5}
.flip>div{background:#fff;border-radius:12px;padding:18px 20px;max-width:440px;display:flex;flex-direction:column;gap:12px;box-shadow:0 16px 40px rgba(0,0,0,.3)}
.flip h3{margin:0;font-size:16px}.flip p{margin:0}
#out{display:none}
.sorts{display:flex;flex-direction:column;gap:5px}.sorts:empty{display:none}
.srt{display:flex;gap:5px;align-items:center}.srt .no{font-size:12px;color:#596050;min-width:20px}
.srt .dd{flex:1;min-width:0;display:flex;justify-content:space-between;gap:6px;padding:4px 8px;text-align:left}.srt .dd span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.srt .dd::after{content:"▾";color:#596050}.srt .sm{align-self:auto;white-space:nowrap}.srt .x{padding:3px 7px}
.menu{position:fixed;z-index:6;background:#fff;border:1px solid #c2c8b5;border-radius:7px;box-shadow:0 8px 22px rgba(0,0,0,.25);max-height:min(320px,70vh);overflow:auto;padding:3px;display:flex;flex-direction:column}
.menu button{border:0;border-radius:5px;text-align:left;padding:5px 10px;font-size:13px}.menu button:hover,.menu button:focus{background:#e3e7d8;outline:none}.menu button[aria-selected="true"]{font-weight:700}
${doc.css}
@media print{html,body{height:auto;background:#fff}body{display:block}.bar,.wrap,.flip,.menu{display:none!important}#out{display:block}#out .pg{margin:0;box-shadow:none;break-after:page;contain:strict}#out .pg:last-child{break-after:auto}}
</style><style id="cells"></style><style id="page">${one ? `@page{size:${one.paper} ${one.landscape ? 'landscape' : 'portrait'};margin:0}` : ''}</style></head><body data-init="${esc(JSON.stringify(data))}">
<div class="bar"><b>${esc(file)}</b><span class="meta" id="meta"></span><div class="sheets" id="sheets" role="group" aria-label="Φύλλα"></div></div>
<div class="wrap">
<div id="view"><div id="pages">${sectionsHtml(doc)}</div><p class="hint">Κλικ σε μια γραμμή: η νέα σελίδα ξεκινά από εκεί. Κλικ στην πρώτη γραμμή μιας σελίδας: ενώνεται με την προηγούμενη.</p></div>
<aside class="side" aria-label="Ρυθμίσεις εκτύπωσης"><div class="scroll">
${seg('pages', 'Σε πόσες σελίδες', [
  ['1', '1'],
  ['2', '2'],
  ['3', '3'],
  ['auto', 'Όσες χρειάζονται'],
])}
<div class="manual" id="manual" hidden><span>Χειροκίνητα: <b id="mcount"></b> σελίδες</span><button type="button" class="sm" id="mreset">Αρχικό</button></div>
<p class="help" id="pagesHelp"></p></div>
<div class="legible" id="legible" role="status"></div>
<div class="grp" id="sizeGrp" hidden><span class="lbl" id="l-size">Μέγεθος γραμμάτων</span><div class="range"><input type="range" id="size" min="6" max="16" step="0.5" aria-labelledby="l-size"><output id="sizeOut" for="size"></output></div><p class="help">Οι στήλες χωράνε πάντα στο πλάτος: αν δεν χωράει, σταματά στο μέγιστο που χωράει.</p></div>
<div class="grp" id="sortGrp" hidden><span class="lbl">Ταξινόμηση</span><div id="sorts" class="sorts"></div><button type="button" class="sm" id="sortAdd" aria-haspopup="listbox"></button><p class="help" id="sortHelp"></p></div>
${seg('side', 'Η σελίδα 2 τυπώνεται', [
  ['back', 'Στην πίσω όψη'],
  ['new', 'Σε νέο φύλλο'],
])}
<label class="chk" id="duplexRow"><input type="checkbox" id="duplex"> <span>Ο εκτυπωτής γυρίζει μόνος του το χαρτί</span></label>
<p class="help" id="sideHelp"></p></div>
<div class="grp" id="sameGrp"><label class="chk"><input type="checkbox" id="same"> <span>Ίδια γράμματα σε όλα τα φύλλα (μπρος και πίσω)</span></label><p class="help">Αν ένα φύλλο του Excel χρειάζεται μικρότερα γράμματα, μικραίνουν και τα άλλα, ώστε π.χ. Arial 12 να βγαίνει ίδιο παντού.</p></div>
${seg('or', 'Προσανατολισμός', [
  ['auto', 'Αυτόματα', 'oaText'],
  ['p', 'Κατακόρυφα'],
  ['l', 'Οριζόντια'],
])}<p class="help">«Αυτόματα» διαλέγει όποιον βγάζει τα μεγαλύτερα γράμματα.</p></div>
${seg('sp', 'Αν περισσεύει χώρος από κάτω', [
  ['top', 'Πάνω'],
  ['center', 'Στο κέντρο'],
  ['fill', 'Ψηλότερες γραμμές'],
])}<p class="help">«Ψηλότερες γραμμές» αφήνει χώρο για υπογραφή με το χέρι.</p></div>
${seg('m', 'Περιθώρια', [
  ['narrow', 'Στενά'],
  ['normal', 'Κανονικά'],
  ['wide', 'Φαρδιά'],
])}</div>
${seg('pa', 'Χαρτί', [
  ['A4', 'A4'],
  ['A3', 'A3'],
])}</div>
<div class="grp"><span class="lbl">Σε κάθε σελίδα</span>
<label class="chk"><input type="checkbox" id="stretch"> <span>Οι στήλες πιάνουν όλο το πλάτος</span></label>
<label class="chk" id="repeatRow"><input type="checkbox" id="repeat"> <span>Η κεφαλίδα του πίνακα ξανά πάνω</span></label>
<label class="chk"><input type="checkbox" id="keep"> <span>Δεν κόβεται θάλαμος ή πίνακας στη μέση</span></label>
<label class="chk"><input type="checkbox" id="pno"> <span>«Σελίδα 1 από 2» κάτω</span></label></div>
</div><div class="foot">
<label class="chk"><input type="checkbox" id="remember"> <span>Να θυμάται τις ρυθμίσεις για αυτό το έντυπο</span></label>
<div class="row"><label class="prn" hidden>Εκτυπωτής <select id="prn"></select></label><label class="prn" hidden>Αντίτυπα <input id="copies" type="number" min="1" max="99" value="1"></label></div>
<div class="row"><button type="button" class="pri" id="go" autofocus>Εκτύπωση…</button><button type="button" id="pdf">PDF…</button><button type="button" id="dlg" hidden title="Ο διάλογος των Windows παίρνει τον προσανατολισμό του εκτυπωτή: διάλεξε εκεί «Οριζόντιο» για τα οριζόντια φύλλα">Διάλογος των Windows…</button></div>
<div class="row"><button type="button" id="reset">Αρχικές ρυθμίσεις</button><button type="button" id="close">Κλείσιμο</button></div>
<div class="msg" id="msg" role="status"></div></div></aside>
</div>
<div class="flip" id="flip" hidden role="dialog" aria-modal="true" aria-labelledby="flipT"><div><h3 id="flipT">Γύρισε τα φύλλα</h3>
<p>Τυπώθηκαν οι μπροστινές σελίδες (<span id="flipCount"></span>). Πάρε τα φύλλα όπως βγήκαν και βάλ' τα ξανά στον δίσκο του εκτυπωτή με την τυπωμένη πλευρά από την άλλη μεριά. Μετά πάτα «Τύπωσε τις πίσω».</p>
<label class="chk"><input type="checkbox" id="flipRev"> <span>Αντίστροφη σειρά (αν την προηγούμενη φορά βγήκαν ανακατεμένες)</span></label>
<div class="row"><button type="button" class="pri" id="flipGo">Τύπωσε τις πίσω</button><button type="button" id="flipNo">Άκυρο</button></div></div></div>
<div class="menu" id="menu" role="listbox" aria-label="Στήλες" hidden></div>
<div id="out"></div>
<script>${PREVIEW_SCRIPT}</script></body></html>`;
}
