import './styles.css';
import { createRoot } from 'react-dom/client';
import { html } from './ui';
import { App } from './app';
import { applyPrefs, loadPrefs } from './prefs';
import { installTips } from './tips';

applyPrefs(loadPrefs());
installTips();   // θέμα και πυκνότητα πριν από την πρώτη εικόνα, χωρίς αναβόσβημα

// Στον browser (ανάπτυξη χωρίς Electron) δουλεύουμε με δεδομένα στη μνήμη. Φορτώνονται μόνο εκεί: στο PC δεν διαβάζονται καν.
const ready = window.api ? Promise.resolve() : import('./mockApi').then(m => { (window as any).api = m.mockApi(); });
const root = createRoot(document.getElementById('root')!);
ready.then(() => window.api.boot()).then(
  boot => root.render(html`<${App} boot=${boot}/>`),
  err => root.render(html`<div className="boot err">Δεν ξεκίνησε η εφαρμογή: ${String(err)}</div>`)
);
