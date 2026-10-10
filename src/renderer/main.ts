import './styles.css';
import { createRoot } from 'react-dom/client';
import { html } from './ui';
import { App } from './app';
import { mockApi } from './mockApi';

// Στον browser (ανάπτυξη χωρίς Electron) δουλεύουμε με δεδομένα στη μνήμη
if (!window.api) (window as any).api = mockApi();
const root = createRoot(document.getElementById('root')!);
window.api.boot().then(
  boot => root.render(html`<${App} boot=${boot}/>`),
  err => root.render(html`<div className="boot err">Δεν ξεκίνησε η εφαρμογή: ${String(err)}</div>`)
);
