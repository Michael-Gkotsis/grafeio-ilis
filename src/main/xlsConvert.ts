// Reading old .xls files: a converter turns the .xls into an .xlsx inside a temp folder. The original is only copied, never touched.
// Order: Excel of the PC (a small VBScript run by cscript, Windows only), then LibreOffice (soffice --headless), else null
// (the caller shows the friendly «open it in Excel and save as .xlsx» message).
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';

// A converter gets the path of a COPY of the .xls and the output folder; it returns the path of the .xlsx it made, or null
export interface XlsConverter { name: string; run(copy: string, outDir: string): Promise<string | null> }
export interface Converted { file: string; converter: string; cleanup(): void }

const run = (cmd: string, args: string[], timeout: number) => new Promise<boolean>(resolve => {
  try { execFile(cmd, args, { timeout, windowsHide: true }, err => resolve(!err)); } catch { resolve(false); }
});
const exists = (p: string) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

// Excel via cscript: Workbooks.Open read-only, SaveAs FileFormat 51 (xlsx)
export const VBS = [
  'On Error Resume Next',
  'Set x = CreateObject("Excel.Application")',
  'If Err.Number <> 0 Then WScript.Quit 2',
  'x.Visible = False : x.DisplayAlerts = False',
  'Set wb = x.Workbooks.Open(WScript.Arguments(0), 0, True)',
  'If Err.Number <> 0 Then x.Quit : WScript.Quit 3',
  'wb.SaveAs WScript.Arguments(1), 51',
  'wb.Close False : x.Quit',
  'If Err.Number <> 0 Then WScript.Quit 4'
].join('\r\n');
export const excelConverter: XlsConverter = {
  name: 'excel',
  async run(copy, outDir) {
    if (process.platform !== 'win32') return null;
    const vbs = path.join(outDir, 'convert.vbs'); fs.writeFileSync(vbs, VBS);
    const out = path.join(outDir, 'excel-' + path.basename(copy).replace(/\.xls$/i, '') + '.xlsx');
    const ok = await run('cscript', ['//nologo', '//B', vbs, copy, out], 90000);
    return ok && exists(out) ? out : null;
  }
};

// Where LibreOffice may be (PATH first, then the usual install folders)
export function findSoffice(): string | null {
  const names = process.platform === 'win32' ? ['soffice.exe'] : ['soffice', 'libreoffice'];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) for (const n of names) { const p = path.join(dir, n); if (dir && exists(p)) return p; }
  const known = process.platform === 'win32'
    ? ['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe']
    : process.platform === 'darwin' ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice'] : ['/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice', '/opt/libreoffice/program/soffice'];
  return known.find(exists) || null;
}
export const libreOfficeConverter: XlsConverter = {
  name: 'libreoffice',
  async run(copy, outDir) {
    const exe = findSoffice(); if (!exe) return null;
    // own profile folder: works while another LibreOffice is open and never touches the user's settings
    const profile = path.join(outDir, 'lo-profile');
    const dest = path.join(outDir, 'lo');
    fs.mkdirSync(dest, { recursive: true });
    const url = 'file://' + (process.platform === 'win32' ? '/' : '') + profile.replace(/\\/g, '/');
    const ok = await run(exe, ['--headless', '--norestore', '-env:UserInstallation=' + url, '--convert-to', 'xlsx', '--outdir', dest, copy], 120000);
    const out = path.join(dest, path.basename(copy).replace(/\.xls$/i, '') + '.xlsx');
    return ok && exists(out) ? out : null;
  }
};

export const DEFAULT_CONVERTERS: XlsConverter[] = [excelConverter, libreOfficeConverter];

// Converts file (an .xls) with the first converter that works. Returns null when none does.
// With the default converters (the app): one conversion at a time (Excel and LibreOffice do not like to be started in parallel, and a stuck
// one blocks the screen that waits for it), a converted copy kept per path + time + size so the same .xls is converted once (the previews,
// «Αρχεία Excel» and «Αντιστοίχιση» all read it), and a failed conversion is not retried for a minute (otherwise every click waits again).
// cleanup() of a kept copy does nothing. Other converters (tests, own) run as before, without all this.
const FAIL_MS = 60000;
let convQueue: Promise<unknown> = Promise.resolve();
const convFlight = new Map<string, Promise<Converted | null>>();
const convFailed = new Map<string, number>();
export const xlsCacheDir = () => path.join(os.tmpdir(), 'grafeio-xls-cache');
export function xlsCacheKey(file: string): string {
  const st = fs.statSync(file);
  return crypto.createHash('sha1').update(path.resolve(file) + '|' + st.mtimeMs + '|' + st.size).digest('hex').slice(0, 20);
}
export function resetXlsCacheState() { convFlight.clear(); convFailed.clear(); }
export async function convertXls(file: string, converters: XlsConverter[] = DEFAULT_CONVERTERS): Promise<Converted | null> {
  if (converters !== DEFAULT_CONVERTERS) return convertOnce(file, converters);
  let key: string;
  try { key = xlsCacheKey(file); } catch { return null; }
  const cached = path.join(xlsCacheDir(), key + '.xlsx');
  const keep = (converter: string): Converted => ({ file: cached, converter, cleanup() { /* the kept copy is reused */ } });
  if (exists(cached)) return keep('cache');
  const bad = convFailed.get(key); if (bad && Date.now() - bad < FAIL_MS) return null;
  let p = convFlight.get(key);
  if (!p) {
    p = (convQueue = convQueue.then(async () => {
      if (exists(cached)) return keep('cache');
      const r = await convertOnce(file, converters);
      if (!r) { convFailed.set(key, Date.now()); return null; }
      try { fs.mkdirSync(xlsCacheDir(), { recursive: true }); fs.copyFileSync(r.file, cached); } catch { return r; }   // no room for the copy: the caller uses the temp one
      const name = r.converter; r.cleanup(); convFailed.delete(key); return keep(name);
    }, () => null)) as Promise<Converted | null>;
    convFlight.set(key, p); void p.finally(() => convFlight.delete(key));
  }
  return p;
}
async function convertOnce(file: string, converters: XlsConverter[]): Promise<Converted | null> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-xls-'));
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp folder: the OS cleans it later */ } };
  try {
    const copy = path.join(dir, 'src-' + Math.random().toString(36).slice(2, 8) + '.xls');
    fs.copyFileSync(file, copy);
    for (const c of converters) {
      let out: string | null = null;
      try { out = await c.run(copy, dir); } catch { out = null; }
      if (out && exists(out)) return { file: out, converter: c.name, cleanup };
    }
  } catch { /* unreadable original: same as no converter */ }
  cleanup();
  return null;
}
