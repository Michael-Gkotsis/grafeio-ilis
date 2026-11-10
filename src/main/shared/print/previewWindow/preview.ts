// Entry of the print preview window script (bundled into windowScript.gen.ts, which `previewHtml` inlines).
//
// Purpose: wires the modules in the order the old script ran: sort controls, pages, settings, keys, printers, printing,
//   then the first `render`.
// Does NOT: lay out pages or hold state (state.ts) or build the page (window.ts).
// Owner layer: main (architecture), `shared/print/previewWindow` (browser side of the print window).
// Why: the window is a page loaded from a string with a strict CSP; this one bundle is the only script allowed to
//   run, by its hash. It talks to the app only through `window.printer` (src/preload/print.ts).
// Covering test: test/print-window-gen.test.ts (bundle is fresh, hash) and test/print-safety.test.ts (CSP).
import { wireControls, wireKeys } from './controls';
import { render, wirePages } from './pages';
import { listPrinters, wirePrinting } from './printing';
import { onLayout } from './request';
import { wireSorts } from './sorts';

onLayout(render);
wireSorts();
wirePages();
wireControls();
wireKeys();
void listPrinters();
wirePrinting();
render();
