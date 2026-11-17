// Οχήματα (Michael, 17/11, πρόταση λοχία, φάση 5): οθόνη «Οχήματα» πάνω στο ίδιο μητρώο με τον οπλισμό (shared/assets.ts, sxima-mitroou.md).
// Εδώ είναι οι καθαρές συναρτήσεις: συντήρηση ανά ημερομηνία ή ανά χιλιόμετρα (όποιο έρθει πρώτο), γέμισμα, κατάσταση, μετρήσεις,
// η «Κατάσταση οχημάτων» της ΗΚΑΙ από το μητρώο και τα φύλλα του Excel «ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ». «Σε κίνηση» = γεγονός km ή καυσίμων τη μέρα (χωρίς νέο διακόπτη).
import { dmy, type ISODate } from './dates';
import type { AppState, Asset, AssetCat, AssetCfg, AssetEvent, AssetHolder, HkVehicle } from './domain';
import { assetCfgOf, catOf, doMaint, holderParts, maintState, registry, STATE_TXT, type AssetRow, type AssetSheet, type MaintState } from './assets';
import { normGreek, upper } from './text';

const collator = new Intl.Collator('el', { sensitivity: 'base', numeric: true });
// Αριθμός με τελείες χιλιάδων (48.210) και μονάδα της κατηγορίας: «χλμ» ή «ώρ.» για όσες μετρούν ώρες κινητήρα
export const numTxt = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const unitTxt = (c?: Pick<AssetCat, 'hours'>): string => (c?.hours ? 'ώρ.' : 'χλμ');
export const kmTxt = (n: number | undefined, c?: Pick<AssetCat, 'hours'>): string => (n == null ? '—' : numTxt(n) + (c?.hours ? ' ώρ.' : ''));
export const vehName = (a: Pick<Asset, 'type' | 'plate' | 'no'>): string => [a.type, a.plate || a.no].filter(Boolean).join(' · ');

// ---------- τα οχήματα του μητρώου ----------
export const vehicleRows = (s: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'settings'>, all?: AssetRow[]): AssetRow[] => (all || registry(s)).filter(r => r.cat?.kind === 'vehicle');
// Έγινε κίνηση (χιλιόμετρα ή γέμισμα) τη μέρα d
export const movedOn = (a: Pick<Asset, 'id' | 'kmOn'>, log: AssetEvent[] | undefined, d: ISODate): boolean =>
  a.kmOn === d || (log || []).some(e => e.aid === a.id && e.date === d && (e.what === 'km' || e.what === 'fuel'));

// ---------- συντήρηση: ημερομηνία ή χιλιόμετρα, όποιο έρθει πρώτο ----------
const RANK: Record<MaintState, number> = { none: 0, ok: 1, soon: 2, overdue: 3 };
export interface VMaint { st: MaintState; by?: 'date' | 'km'; days: number | null; kmLeft: number | null }
// Όριο προειδοποίησης για τα χιλιόμετρα: το 1/10 του διαστήματος της κατηγορίας (5.000 → 500)
const kmWarn = (c?: Pick<AssetCat, 'everyKm'>) => Math.max(1, Math.round((c?.everyKm || 5000) / 10));
export function vehMaint(a: Pick<Asset, 'maint' | 'km'>, c: Pick<AssetCat, 'everyKm'> | undefined, today: ISODate, warn: number): VMaint {
  const d = maintState(a, today, warn); const n = a.maint?.next;
  const days = n ? Math.round((new Date(n + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 864e5) : null;
  const nk = a.maint?.nextKm; const kmLeft = nk != null && a.km != null ? nk - a.km : null;
  const k: MaintState = kmLeft == null ? 'none' : kmLeft <= 0 ? 'overdue' : kmLeft <= kmWarn(c) ? 'soon' : 'ok';
  const by = RANK[k] > RANK[d] ? 'km' : RANK[d] > 0 ? 'date' : undefined;
  return { st: RANK[k] > RANK[d] ? k : d, by, days, kmLeft };
}
// Η συντήρηση που έγινε (date, km): επόμενη = date + every μήνες και/ή km + everyKm
export function doVehMaint(a: Asset, c: AssetCat | undefined, date: ISODate, km?: number): NonNullable<Asset['maint']> {
  const m = { ...doMaint(a, c, date) };
  if (km != null) { m.lastKm = km; if (c?.everyKm) m.nextKm = km + c.everyKm; else delete m.nextKm; }
  return m;
}
// Γέμισμα ή χιλιόμετρα: ενημερώνουν τα km/kmOn μόνο αν η μέρα δεν είναι παλιότερη από την τελευταία καταγραφή
export function withKm(a: Asset, km: number | undefined, date: ISODate): Asset {
  if (km == null || !isFinite(km) || km < 0) return a;
  return !a.kmOn || date >= a.kmOn ? { ...a, km, kmOn: date } : a;
}

// ---------- κατάσταση στον πίνακα ----------
export interface VStatus { tone: 'ok' | 'warn' | 'bad' | 'outline'; text: string; tip?: string }
export function vehStatus(a: Asset, c: AssetCat | undefined, log: AssetEvent[] | undefined, today: ISODate, warn: number): VStatus {
  if (a.state === 'immobile') return { tone: 'bad', text: 'Ακινησία' + (a.why ? ': ' + a.why : ''), tip: a.why };
  if (a.state === 'repair') return { tone: 'bad', text: 'Προς επισκευή', tip: a.why };
  if (a.state === 'writeoff') return { tone: 'outline', text: 'Προς διαγραφή', tip: a.why };
  const m = vehMaint(a, c, today, warn);
  if (m.st === 'overdue') return { tone: 'bad', text: 'Καθυστέρηση συντήρησης', tip: m.by === 'km' ? 'Πέρασε το όριο ' + kmTxt(a.maint?.nextKm, c) : 'Η συντήρηση ήταν για ' + dmy(a.maint!.next!) };
  if (m.st === 'soon') return { tone: 'warn', text: m.by === 'km' ? 'Συντήρηση σε ' + numTxt(m.kmLeft!) + ' ' + unitTxt(c) : 'Συντήρηση ' + dmy(a.maint!.next!).slice(0, 5) };
  return movedOn(a, log, today) ? { tone: 'ok', text: 'Σε κίνηση' } : { tone: 'ok', text: 'Διαθέσιμο' };
}

// ---------- μετρήσεις της οθόνης ----------
export interface VStats { total: number; moving: number; down: number; due: number }
export function vehStats(rows: AssetRow[], log: AssetEvent[] | undefined, today: ISODate, warn: number): VStats {
  const o = { total: rows.length, moving: 0, down: 0, due: 0 };
  for (const r of rows) {
    if (movedOn(r.a, log, today)) o.moving++;
    if (r.a.state === 'repair' || r.a.state === 'immobile') o.down++;
    const m = vehMaint(r.a, r.cat, today, warn).st; if (m === 'soon' || m === 'overdue') o.due++;
  }
  return o;
}
export interface VQuery { cat?: string; q?: string }
// Οι γραμμές του πίνακα: κατηγορία, τύπος, πινακίδα
export function vehicleView(s: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'settings'>, o: VQuery, all?: AssetRow[]): AssetRow[] {
  const cfg = assetCfgOf(s.settings); const order = new Map(cfg.cats.map((c, i) => [c.id, i])); const q = normGreek(o.q || '').replace(/\s+/g, ' ');
  return vehicleRows(s, all).filter(r => (!o.cat || r.a.cat === o.cat)
    && (!q || normGreek([r.a.type, r.a.no, r.a.plate, driverText(s, r.a.driver), r.cat?.name, r.a.why, r.a.note].join(' ')).includes(q)))
    .sort((x, y) => (order.get(x.a.cat) ?? 99) - (order.get(y.a.cat) ?? 99) || collator.compare(x.a.type, y.a.type) || collator.compare(x.a.plate || x.a.no, y.a.plate || y.a.no));
}
export function driverText(s: Pick<AppState, 'people' | 'cadreList'>, h?: Asset['driver']): string {
  if (!h) return ''; const x = holderParts(s, h); return (x.rank + ' ' + x.name).trim();
}
// Ό,τι οδηγεί ένα άτομο ή στέλεχος
export const drivenBy = (rows: AssetRow[], h: AssetHolder): AssetRow[] => rows.filter(r => r.cat?.kind === 'vehicle' && r.a.driver && r.a.driver.k === h.k && (h.k === 'person' ? (r.a.driver as any).pid === h.pid : h.k === 'cadre' && (r.a.driver as any).cid === h.cid));

// ---------- ΗΚΑΙ «Κατάσταση οχημάτων» από το μητρώο ----------
// prov: όσα δεν έχουν διαγραφεί· kin: με κίνηση τη μέρα· maint: προς επισκευή ή με καθυστερημένη συντήρηση· dmg: ακινησία (ένα όχημα
// μετρά σε ένα μόνο από τα maint/dmg). Καμία εγγραφή οχήματος = undefined (μένει ό,τι έγραψες με το χέρι).
export function vehHkai(s: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'assetLog' | 'settings'>, d: ISODate): HkVehicle | undefined {
  const cfg = assetCfgOf(s.settings); const rows = vehicleRows(s); if (!rows.length) return undefined;
  const h: HkVehicle = { type: '', prov: rows.length, kin: 0, maint: 0, dmg: 0 };
  for (const r of rows) {
    if (movedOn(r.a, s.assetLog, d)) h.kin!++;
    if (r.a.state === 'immobile') h.dmg!++;
    else if (r.a.state === 'repair' || (r.a.state === 'ok' && vehMaint(r.a, r.cat, d, cfg.warnDays).st === 'overdue')) h.maint!++;
  }
  const names: string[] = []; for (const c of cfg.cats) if (c.kind === 'vehicle' && rows.some(r => r.a.cat === c.id)) names.push(upper(c.name));
  for (const r of rows) if (!r.cat) { const t = upper(r.a.type); if (t && !names.includes(t)) names.push(t); }
  h.type = names.join(', ');
  return h;
}
// Ό,τι γράφεται στο έντυπο: με την επιλογή κλειστή (προεπιλογή) ακριβώς ό,τι έγραψες με το χέρι· ανοιχτή: ό,τι έγραψες υπερισχύει, τα κενά από το μητρώο
export function hkaiVeh(s: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'assetLog' | 'settings'>, d: ISODate): HkVehicle | undefined {
  const man = s.settings.hkai?.veh;
  if (!s.settings.hkai?.vehReg) return man;
  const c = vehHkai(s, d); if (!c) return man;
  return { type: man?.type?.trim() ? man.type : c.type, prov: man?.prov ?? c.prov, kin: man?.kin ?? c.kin, maint: man?.maint ?? c.maint, dmg: man?.dmg ?? c.dmg };
}

// ---------- Excel «ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ»: ένα φύλλο ανά κατηγορία οχημάτων, ΚΑΥΣΙΜΑ και ΣΥΝΤΗΡΗΣΕΙΣ ----------
const dateXl = (d?: ISODate) => (d ? dmy(d) : '');
const holderXl = (s: Pick<AppState, 'people' | 'cadreList'>, h?: AssetHolder): string => {
  if (!h) return 'ΑΧΡΕΩΤΟ'; const x = holderParts(s, h);
  return upper((x.rank + ' ' + x.name).trim()) + (h.k === 'unit' ? ' (ΑΛΛΗ ΜΟΝΑΔΑ)' : h.k === 'ext' ? ' (ΦΥΣΙΚΟ ΠΡΟΣΩΠΟ)' : '');
};
export function vehicleSheets(s: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'assetLog' | 'settings'>, d: ISODate): AssetSheet[] {
  const cfg: AssetCfg = assetCfgOf(s.settings); const rows = vehicleRows(s); const out: AssetSheet[] = []; const used = new Set<string>();
  const uniq = (n: string) => { let x = upper(n).replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'ΦΥΛΛΟ'; let i = 2; const base = x; while (used.has(x)) x = base.slice(0, 28) + ' (' + i++ + ')'; used.add(x); return x; };
  const sorted = vehicleView(s, {}, rows);
  for (const c of cfg.cats) {
    if (c.kind !== 'vehicle') continue; const l = sorted.filter(r => r.a.cat === c.id); if (!l.length) continue;
    const u = c.hours ? 'ΩΡΕΣ' : 'ΧΛΜ'; const fx = c.fields;
    const head = ['Α/Α', 'ΤΥΠΟΣ', 'ΠΙΝΑΚΙΔΑ', 'ΟΔΗΓΟΣ', 'ΧΡΕΩΜΕΝΟ ΣΕ', u, 'ΚΑΤΑΣΤΑΣΗ', 'ΤΕΛ. ΣΥΝΤΗΡΗΣΗ', 'ΕΠΟΜ. ΣΥΝΤΗΡΗΣΗ', ...fx.map(x => upper(x.name)), 'ΠΑΡΑΤΗΡΗΣΕΙΣ'];
    out.push({ name: uniq(c.name), title: 'ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ ' + upper(c.name) + ' ' + dmy(d), head, kind: 'vehicle', note: 'ΤΟ ΟΧΗΜΑ ΠΟΥ ΔΕΝ ΕΧΕΙ ΚΑΤΟΧΟ ΦΑΙΝΕΤΑΙ ΩΣ «ΑΧΡΕΩΤΟ»',
      rows: l.map((r, j) => {
        const a = r.a; const nx = [a.maint?.next ? dmy(a.maint.next) : '', a.maint?.nextKm != null ? numTxt(a.maint.nextKm) + ' ' + u : ''].filter(Boolean).join(' Ή ');
        const lt = [dateXl(a.maint?.last), a.maint?.lastKm != null ? numTxt(a.maint.lastKm) + ' ' + u : ''].filter(Boolean).join(' ΣΤΑ ');
        return [j + 1, upper(a.type), upper(a.plate || a.no), upper(driverText(s, a.driver)), holderXl(s, a.holder), a.km != null ? numTxt(a.km) : '', upper(STATE_TXT[a.state] + (a.why && a.state !== 'ok' ? ': ' + a.why : '')),
          lt, nx, ...fx.map(x => upper(a.extra?.[x.id] || '')), upper([a.acc && 'ΠΑΡΕΛΚΟΜΕΝΑ: ' + a.acc, a.note].filter(Boolean).join(' · '))];
      }) });
  }
  // το ιστορικό: με όλα τα οχήματα, και όσα διαγράφηκαν (το ιστορικό μένει)
  const vehs = new Map((s.assets || []).filter(a => catOf(cfg, a.cat)?.kind === 'vehicle').map(a => [a.id, a]));
  const evs = (what: AssetEvent['what']) => (s.assetLog || []).filter(e => e.what === what && vehs.has(e.aid)).map((e, i) => [e, i] as const).sort((x, y) => x[0].date.localeCompare(y[0].date) || x[1] - y[1]).map(x => x[0]);
  const nameOf = (id: string) => { const a = vehs.get(id)!; return upper(vehName(a)); };
  out.push({ name: uniq('ΚΑΥΣΙΜΑ'), title: 'ΚΑΥΣΙΜΑ ΟΧΗΜΑΤΩΝ ' + dmy(d), head: ['Α/Α', 'ΗΜΕΡΟΜΗΝΙΑ', 'ΟΧΗΜΑ', 'ΛΙΤΡΑ', 'ΧΛΜ'], kind: 'fuel', note: 'ΤΑ ΧΙΛΙΟΜΕΤΡΑ (Ή ΩΡΕΣ ΚΙΝΗΤΗΡΑ) ΕΙΝΑΙ ΑΥΤΑ ΠΟΥ ΕΙΧΕ ΤΟ ΟΧΗΜΑ ΣΤΟ ΓΕΜΙΣΜΑ',
    rows: evs('fuel').map((e, j) => [j + 1, dmy(e.date), nameOf(e.aid), e.litres ?? '', e.km != null ? numTxt(e.km) : '']) });
  out.push({ name: uniq('ΣΥΝΤΗΡΗΣΕΙΣ'), title: 'ΣΥΝΤΗΡΗΣΕΙΣ ΟΧΗΜΑΤΩΝ ' + dmy(d), head: ['Α/Α', 'ΗΜΕΡΟΜΗΝΙΑ', 'ΟΧΗΜΑ', 'ΧΛΜ', 'ΣΗΜΕΙΩΣΗ'], kind: 'maint', note: 'ΟΙ ΣΥΝΤΗΡΗΣΕΙΣ ΠΟΥ ΕΧΟΥΝ ΚΑΤΑΧΩΡΗΘΕΙ ΣΤΟ ΜΗΤΡΩΟ, ΑΠΟ ΤΗΝ ΠΑΛΙΟΤΕΡΗ ΠΡΟΣ ΤΗΝ ΠΙΟ ΠΡΟΣΦΑΤΗ',
    rows: evs('maint').map((e, j) => [j + 1, dmy(e.date), nameOf(e.aid), e.km != null ? numTxt(e.km) : '', upper(e.text || '')]) });
  return out;
}
