import './app/styles/index.css';
import { createRoot } from 'react-dom/client';
import { html } from './ui';
import { App } from './app';
import { ErrorBoundary } from './errorBoundary';
import { applyPrefs, loadPrefs } from './prefs';
import { installTips } from './tips';
import { startPrefetch } from './app/prefetch';

applyPrefs(loadPrefs());
installTips();   // θέμα και πυκνότητα πριν από την πρώτη εικόνα, χωρίς αναβόσβημα

// Στον browser (ανάπτυξη χωρίς Electron) δουλεύουμε με δεδομένα στη μνήμη. Φορτώνονται μόνο εκεί: στο PC δεν διαβάζονται καν.
const ready = window.api ? Promise.resolve() : import('./shared/api/mockApi').then(m => { (window as any).api = m.mockApi(); });
const root = createRoot(document.getElementById('root')!);
ready.then(() => window.api.boot()).then(
  boot => {
    root.render(html`<${ErrorBoundary} whole><${App} boot=${boot}/><//>`);
    startPrefetch();   // loads the screens that are not on the page yet, one per idle moment (app/prefetch.ts)
  },
  err => root.render(html`<div className="boot err">Δεν ξεκίνησε η εφαρμογή: ${String(err)}</div>`)
);
