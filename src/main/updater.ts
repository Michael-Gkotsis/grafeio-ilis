// Αυτόματη ενημέρωση, το κομμάτι με το Electron: έλεγχος μία φορά τη μέρα, κατέβασμα, αλλαγή του resources\app.
// Η λογική που δοκιμάζεται χωρίς Electron είναι στο update.ts. Εδώ ΤΙΠΟΤΑ δεν πρέπει να εμποδίσει το άνοιγμα της εφαρμογής:
// κάθε είσοδος είναι τυλιγμένη σε try/catch και κάθε αποτυχία μένει σιωπηλή (μόνο το μήνυμα στις Ρυθμίσεις).
import { app, BrowserWindow, dialog, net, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import type { UpdInfo } from '../shared/api';
import { RELEASES_URL, APP_MAX, checkZip, clearTrial, cmpVersion, dirWritable, downloadApp, fetchManifest, health, parseManifest, pendingVersion, prevVersion, stage, swap, swapPrev, zipVersion, type Fetcher, type Manifest } from './update';

// Δίκτυο του Chromium (δικό του TLS, δεν εξαρτάται από το SChannel των Windows 7), με ακολούθηση ανακατευθύνσεων
export const netFetch: Fetcher = (url, o) => new Promise<Buffer>((resolve, reject) => {
  let done = false, timer: NodeJS.Timeout | undefined;
  const req = net.request({ url, redirect: 'follow' });
  const end = (e?: Error, b?: Buffer) => { if (done) return; done = true; clearTimeout(timer); o.signal?.removeEventListener('abort', onAbort); if (e) { try { req.abort(); } catch { /* ήδη */ } reject(e); } else resolve(b!); };
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => end(new Error('Δεν απάντησε ο διακομιστής (timeout)')), o.timeoutMs); };
  const onAbort = () => end(new Error('Ακυρώθηκε'));
  if (o.signal?.aborted) return reject(new Error('Ακυρώθηκε'));
  o.signal?.addEventListener('abort', onAbort);
  req.on('error', e => end(e instanceof Error ? e : new Error(String(e))));
  req.on('response', res => {
    if (res.statusCode !== 200) return end(new Error('HTTP ' + res.statusCode));
    const total = Number(res.headers['content-length']) || 0;
    if (total > o.maxBytes) return end(new Error('Το αρχείο είναι μεγαλύτερο από το αναμενόμενο'));
    const parts: Buffer[] = []; let got = 0;
    res.on('data', (c: Buffer) => {
      got += c.length; if (got > o.maxBytes) return end(new Error('Το αρχείο είναι μεγαλύτερο από το αναμενόμενο'));
      parts.push(c); arm(); try { o.onProgress?.(got, total); } catch { /* το UI δεν σταματά το κατέβασμα */ }
    });
    res.on('end', () => end(undefined, Buffer.concat(parts)));
    res.on('error', (e: Error) => end(e));
    res.on('aborted', () => end(new Error('Η σύνδεση έκλεισε')));
  });
  arm(); req.end();
});

type Saved = { auto?: boolean; lastDay?: string; lastCheck?: number; lastOk?: boolean; lastError?: string; skip?: string; askedDay?: string; manifest?: unknown };
type Deps = { dataDir: string; getWin: () => BrowserWindow | null; backup: (label: string) => string; today: () => string };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createUpdater(d: Deps) {
  const RES = DEV_RES();
  const FILE = path.join(d.dataDir, 'update.json');
  const TRIAL = path.join(d.dataDir, 'update-trial.json');
  const version = app.getVersion();
  const canApply = process.platform === 'win32' && app.isPackaged;
  let saved: Saved = {};
  try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { /* πρώτη φορά */ }
  const persist = () => { try { fs.mkdirSync(d.dataDir, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(saved)); } catch { /* δεν είναι κρίσιμο */ } };
  let manifest: Manifest | null = null;
  try { if (saved.manifest) { const m = parseManifest(saved.manifest); if (cmpVersion(m.version, version) > 0) manifest = m; } } catch { /* παλιό αρχείο */ }
  let checking = false, offer = false, phase: UpdInfo['phase'] = 'idle', step = 0, got = 0, total = 0, backup = '', error = '', readyVersion = pendingVersion(RES) || '', target = '';
  if (readyVersion && canApply) phase = 'ready'; else readyVersion = '';
  let ac: AbortController | null = null, lastEmit = 0;

  const info = (): UpdInfo => {
    const m = manifest && saved.skip !== manifest.version ? manifest : null;
    return {
      version, canApply, auto: saved.auto !== false, lastCheck: saved.lastCheck || 0, lastOk: saved.lastOk !== false, lastError: saved.lastError || '', checking,
      avail: m ? { version: m.version, date: m.date, size: m.app.size, notes: m.notes, setup: m.electron !== process.versions.electron } : null,
      offer, phase, step, got, total, backup, error, target, readyVersion, prev: canApply ? prevVersion(RES) : null, releases: RELEASES_URL
    };
  };
  const emit = (force = true) => {
    const t = Date.now(); if (!force && t - lastEmit < 150) return; lastEmit = t;
    try { const w = d.getWin(); if (w && !w.isDestroyed()) w.webContents.send('update', info()); } catch { /* χωρίς παράθυρο */ }
  };

  // Στην εκκίνηση, ΠΡΙΝ ανοίξει παράθυρο. true = η εφαρμογή ξανανοίγει με άλλον κώδικα, μην συνεχίσεις.
  function startup(): boolean {
    if (!canApply) return false;
    try {
      if (pendingVersion(RES)) {
        const r = swap(RES, TRIAL);
        if (r.ok) { app.relaunch(); app.exit(0); return true; }
        if (!r.none) console.error('update swap', r.error);   // μένει το app.new για την επόμενη φορά, η τωρινή έκδοση ανοίγει κανονικά
      }
      const h = health(RES, TRIAL, version);
      if (h.state === 'rolledback') { saved.skip = h.version; persist(); app.relaunch(); app.exit(0); return true; }
    } catch (e) { console.error('update startup', e); }
    return false;
  }
  // Η οθόνη φόρτωσε και ρώτησε για την ενημέρωση: η νέα έκδοση ξεκίνησε καλά
  const confirm = () => { try { clearTrial(TRIAL); } catch { /* τίποτα */ } };

  async function check(manual: boolean): Promise<UpdInfo> {
    if (checking || phase !== 'idle') return info();
    checking = true; emit();
    try {
      const m = await fetchManifest(netFetch);
      saved.lastCheck = Date.now(); saved.lastOk = true; saved.lastError = ''; saved.lastDay = d.today();
      if (cmpVersion(m.version, version) > 0) {
        manifest = m; saved.manifest = m;
        if (manual && saved.skip === m.version) saved.skip = '';
        offer = saved.skip !== m.version && (manual || saved.askedDay !== d.today());
      } else { manifest = null; saved.manifest = undefined; offer = false; }
    } catch (e) { saved.lastCheck = Date.now(); saved.lastOk = false; saved.lastError = msg(e); }
    checking = false; persist(); emit();
    return info();
  }
  // ~15″ μετά το άνοιγμα του παραθύρου, μία φορά τη μέρα· ποτέ δεν καθυστερεί ούτε σταματά την εκκίνηση
  function schedule() {
    try { setTimeout(() => { try { if (saved.auto !== false && saved.lastDay !== d.today()) void check(false).catch(() => {}); } catch { /* σιωπηλά */ } }, 15000).unref?.(); } catch { /* σιωπηλά */ }
  }

  // Κοινή ροή: αντίγραφο βάσης → απόκτηση zip → αποσυμπίεση στο app.new
  async function apply(ver: string, getZip: () => Promise<Buffer>) {
    phase = 'working'; target = ver; step = 1; got = 0; total = 0; error = ''; backup = ''; ac = new AbortController(); emit();
    try {
      if (!dirWritable(RES)) throw new Error('Ο φάκελος της εφαρμογής δεν γράφεται· τρέξε το Setup.exe');
      try { backup = path.basename(d.backup('πριν-ενημέρωση-' + ver)); } catch (e) { throw new Error('Δεν έγινε το αντίγραφο της βάσης, οπότε η ενημέρωση δεν ξεκίνησε (' + msg(e) + ')'); }
      step = 2; emit();
      const buf = await getZip();
      step = 3; emit();
      await stage(RES, buf, ver);
      phase = 'ready'; readyVersion = ver;
    } catch (e) { phase = 'idle'; step = 0; error = ac?.signal.aborted ? '' : msg(e); }
    ac = null; emit();
  }
  async function start() {
    const m = manifest; if (!canApply || !m || phase !== 'idle' || m.electron !== process.versions.electron) return;
    await apply(m.version, () => downloadApp(netFetch, m, { signal: ac!.signal, onProgress: (g, t) => { got = g; total = t || m.app.size; emit(false); } }));
  }
  // Ενημέρωση από αρχείο (USB): το zip της εφαρμογής, προαιρετικά και latest.json δίπλα για έλεγχο SHA-256
  async function fromFile(): Promise<{ ok: boolean; error?: string } | null> {
    if (!canApply) return { ok: false, error: 'Η ενημέρωση από αρχείο γίνεται μόνο στα Windows (στην εγκατεστημένη εφαρμογή). Πάρε τη νέα έκδοση από τα Releases.' };
    if (phase !== 'idle') return { ok: false, error: 'Τρέχει ήδη ενημέρωση.' };
    const w = d.getWin() || undefined;
    const r = await (w ? dialog.showOpenDialog(w, pickOpts) : dialog.showOpenDialog(pickOpts));
    if (r.canceled || !r.filePaths[0]) return null;
    try {
      let file = r.filePaths[0], man: Manifest | null = null;
      const jsonOf = (f: string) => parseManifest(JSON.parse(fs.readFileSync(f, 'utf8')));
      if (/\.json$/i.test(file)) { man = jsonOf(file); file = path.join(path.dirname(file), man.app.file); }
      else { const j = path.join(path.dirname(file), 'latest.json'); if (fs.existsSync(j)) { try { const m = jsonOf(j); if (m.app.file === path.basename(file)) man = m; } catch { /* άσχετο latest.json */ } } }
      if (!fs.existsSync(file)) return { ok: false, error: 'Δεν βρέθηκε το ' + path.basename(file) + ' δίπλα στο latest.json.' };
      if (fs.statSync(file).size > APP_MAX) return { ok: false, error: 'Το αρχείο είναι πολύ μεγάλο για αρχείο εφαρμογής.' };
      const buf = fs.readFileSync(file);
      if (man) checkZip(buf, man);
      const ver = await zipVersion(buf);
      if (man && man.version !== ver) return { ok: false, error: 'Η έκδοση μέσα στο zip (' + ver + ') δεν ταιριάζει με το latest.json (' + man.version + ').' };
      if (man && man.electron !== process.versions.electron) return { ok: false, error: 'Αυτή η έκδοση χρειάζεται νέο Electron: τρέξε το Setup.exe.' };
      if (cmpVersion(ver, version) <= 0) {
        const q = { type: 'question' as const, buttons: ['Άκυρο', 'Συνέχεια'], defaultId: 0, cancelId: 0, title: 'Γραφείο Λοχία', message: ver === version ? 'Έχεις ήδη την ' + ver + '.' : 'Η ' + ver + ' είναι παλαιότερη από την τωρινή (' + version + ').', detail: 'Να γίνει η ενημέρωση παρ’ όλα αυτά;' };
        const a = await (w ? dialog.showMessageBox(w, q) : dialog.showMessageBox(q));
        if (a.response !== 1) return null;
      }
      void apply(ver, async () => buf);
      return { ok: true };
    } catch (e) { return { ok: false, error: msg(e) }; }
  }
  const pickOpts = { title: 'Αρχείο ενημέρωσης (GrafeioIlis-app-….zip)', properties: ['openFile' as const], filters: [{ name: 'Αρχείο εφαρμογής (zip ή latest.json)', extensions: ['zip', 'json'] }] };

  // Στο κλείσιμο, αφού κλείσει η βάση: αν υπάρχει έτοιμη ενημέρωση γίνεται η αλλαγή. Αν αποτύχει, ξαναπροσπαθεί στην επόμενη εκκίνηση.
  function atQuit() {
    if (!canApply) return;
    try { if (pendingVersion(RES)) { const r = swap(RES, TRIAL); if (!r.ok && !r.none) console.error('update swap', r.error); } } catch (e) { console.error('update quit', e); }
  }
  function restart() { if (phase === 'ready') { app.relaunch(); app.quit(); } }
  function rollback(): { ok: boolean; error?: string } {
    if (!canApply) return { ok: false, error: 'Μόνο στα Windows.' };
    if (!prevVersion(RES)) return { ok: false, error: 'Δεν υπάρχει προηγούμενη έκδοση.' };
    if (!dirWritable(RES)) return { ok: false, error: 'Ο φάκελος της εφαρμογής δεν γράφεται· τρέξε το Setup.exe' };
    try { fs.rmSync(path.join(RES, 'app.new'), { recursive: true, force: true }); } catch { /* δεν πειράζει */ }
    if (!swapPrev(RES)) return { ok: false, error: 'Δεν έγινε η επιστροφή (κάποιο αρχείο είναι σε χρήση). Δοκίμασε μετά το κλείσιμο και άνοιγμα της εφαρμογής.' };
    clearTrial(TRIAL); saved.skip = manifest?.version || saved.skip; persist();
    app.relaunch(); app.quit();
    return { ok: true };
  }

  return {
    startup, schedule, atQuit, confirm, info,
    check: (manual = true) => check(manual), start, fromFile, rollback, restart,
    cancel: () => { ac?.abort(); },
    setAuto: (on: boolean) => { saved.auto = on; persist(); emit(); return info(); },
    seen: () => { offer = false; saved.askedDay = d.today(); persist(); emit(); },
    skip: () => { if (manifest) saved.skip = manifest.version; offer = false; persist(); emit(); },
    openReleases: () => shell.openExternal(RELEASES_URL)
  };
}
function DEV_RES(): string { return app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'release', 'dev-resources'); }
