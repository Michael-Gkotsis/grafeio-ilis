// Προεπισκόπηση των εντύπων στην οθόνη: ίδια διάταξη με τα templates, ίδια δεδομένα με την εξαγωγή.
import { E, type Cell, type SheetModel } from './common';
import { ROT, TYPES, coversDay, hkOn, fullName, type AppState, type DutyKind, type Status } from '../shared/domain';
import { bareOf, codeOf } from '../shared/codes';
import { HK_K, HK_A, HK_OFFICERS, HK_NCO, activePeople, isHol, DUTY_START, personMap, postBy, postsOf, type Hkai } from '../shared/rules';
import { MON_SHORT, MONTHS, dm, hkDate, parseD, type ISODate } from '../shared/dates';
import { norm } from '../shared/text';
import { backBy } from '../shared/hours';
import { byName, hkOrgans, hkaiDiaLines, hkaiEgrLines, hkaiLeaveLines, hkaiPunLines, hkaiReqLines, linesText, type Line } from '../shared/hkaiText';
import { hkOffText } from '../shared/cadre';
import { FROURA_FORMS, absenceText, dutyName, frouraLayout, lyLine, phaseOf } from '../shared/froura';


// ΦΡΟΥΡΑ ΣΒΕΝ (δείγμα 01) ή ΣΠΕΝ (φωτογραφία γραφέα): ίδια διάταξη με το template που θα βγει
export function frouraSheet(s: AppState, date: ISODate): SheetModel {
  const g = s.guards[date] || {}; const pm = personMap(s.people); const phase = phaseOf(s); const spen = phase === 'spen';
  const lay = frouraLayout(s, date, phase); const pos = FROURA_FORMS[phase].pos;
  const P = (k: string) => (g[k] ? pm.get(g[k]) : undefined);
  const names = (k: string) => lay.cells.get(pos[k]) || [];
  const nm = (k: string, rs = 3, cs = 1): Cell => { const n = names(k); return n.length ? E(n.join('\n'), 'b c w pl', cs, rs) : E('ΚΕΝΗ', 'b c kenh', cs, rs); };
  const hdr = (...a: string[]) => a.map(t => E(t, 'b hdr'));
  const d = parseD(date); const W = 13;
  const rows: (Cell | null)[][] = [
    [E('', '', 11), E(s.settings.unit[0], 'u', 2)], [E('', '', 11), E(s.settings.unit[1], 'u', 2)], [E('', '', 11), E(s.settings.unit[2], 'u', 2)],
    [E('ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ ' + String(d.getDate()).padStart(2, '0') + ' ' + MON_SHORT[d.getMonth()] + ' ' + d.getFullYear(), 'ttl big', W)], [E('', '', W)]
  ];
  for (const [k, l] of [['ly', 'Λ/Υ'], ['dy', 'Δ/Υ']]) { const p = P(k); rows.push([p ? E(l + ': ' + lyLine(p), '', 8) : E(l + ': ΚΕΝΗ', 'kenh', 8), E('', '', 5)]); }
  rows.push([E('', '', W)]);
  const right = spen ? 'op' : 'th', off = spen ? 1 : 5;
  rows.push([E(''), ...hdr('Α/Α', 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ', 'ΩΡΕΣ', 'ΠΑΡ/ΣΕΙΣ'), E('', '', 3), ...hdr('Α/Α', spen ? 'ΟΠΛΟΦΥΛΑΚΕΣ' : 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ', 'ΩΡΕΣ', 'ΠΑΡ/ΣΕΙΣ'), E('')]);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const h = () => E(ROT[i][j], 'b c');
    rows.push(j === 0 ? [E(''), E((i + 1) + 'ο', 'b c', 1, 3), nm('th' + (i + 1)), h(), E('', 'b', 1, 3), E('', '', 3), E((i + 1) + 'ο', 'b c', 1, 3), nm(right + (i + off)), h(), E('', 'b', 1, 3), E('')]
      : [E(''), null, null, h(), null, E('', '', 3), null, null, h(), null, E('')]);
  }
  rows.push([E('', '', W)]);
  const ext = (x: { label: string; name: string }) => (spen
    ? [E(''), E(x.label, 'b c'), x.name ? E(x.name, 'b c', 2) : E('ΚΕΝΗ', 'b c kenh', 2), E('', 'b'), E('', '', 8)]
    : [E('', '', 4), E(x.label, 'b c'), x.name ? E(x.name, 'b c', 3) : E('ΚΕΝΗ', 'b c kenh', 3), E('', 'b'), E('', '', 4)]);
  if (!spen) {
    rows.push([E('', '', 4), E('Α/Α', 'b hdr'), E('ΜΑΓΕΙΡΕΙΑ', 'b hdr', 3), E('ΠΑΡ/ΣΕΙΣ', 'b hdr'), E('', '', 4)]);
    for (let r = 1; r <= 5; r++) rows.push([E('', '', 4), E(r + 'ο', 'b c'), nm('mg' + r, 1, 3), E('', 'b'), E('', '', 4)]);
  } else {
    rows.push([E(''), E('Α/Α', 'b hdr'), E('ΜΑΓΕΙΡΕΙΑ', 'b hdr', 2), E('ΠΑΡ/ΣΕΙΣ', 'b hdr'), E('', '', 3), ...hdr('Α/Α', 'ΣΚΟΠΟΙ', 'ΩΡΕΣ', 'ΠΑΡ/ΣΕΙΣ'), E('')]);
    for (let r = 0; r < 7; r++) {
      const left = r < 5 ? [E((r + 1) + 'ο', 'b c'), nm('mg' + (r + 1), 1, 2), E('', 'b')] : r === 6 ? [E('ΤΑΕ', 'b c'), nm('tae', 1, 2), E('', 'b')] : [E('', '', 4)];
      const sk = r < 6 ? Math.floor(r / 3) : -1, j = r % 3;
      const rt = sk < 0 ? [E('', '', 4)] : j === 0 ? [E((sk + 3) + 'η', 'b c', 1, 3), nm('sk' + (sk + 3) + 'a'), E(ROT[sk + 2][0], 'b c'), E('', 'b', 1, 3)] : [null, null, E(ROT[sk + 2][j], 'b c'), null];
      rows.push([E(''), ...left, E('', '', 3), ...rt, E('')]);
    }
  }
  lay.extra.forEach(x => rows.push(ext(x)));
  rows.push([E('', '', W)]);
  const on = (x: Status) => coversDay(x, date);
  const away = (x: Status) => on(x) && !backBy(x, date, DUTY_START);   // όποιος γυρίζει ως τις 14:00 δεν είναι απών της υπηρεσίας
  const pun = s.statuses.filter(x => x.type === 'PUN' && !x.pending && on(x) && pm.has(x.pid)).sort((a, b) => byName(pm.get(a.pid)!, pm.get(b.pid)!));
  const abs = s.statuses.filter(x => TYPES[x.type].away && TYPES[x.type].cat !== 'out' && away(x) && pm.has(x.pid)).sort((a, b) => byName(pm.get(a.pid)!, pm.get(b.pid)!));
  rows.push([E('ΤΙΜΩΡΗΜΕΝΟΙ', 'b hdr', 6), E(''), E('ΑΠΟΝΤΕΣ', 'b hdr', 6)]);
  rows.push([...hdr('Α/Α', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡ/ΣΕΙΣ'), E(''), ...hdr('Α/Α', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΕΙΔΟΣ ΑΠΟΥΣΙΑΣ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡ/ΣΕΙΣ')]);
  for (let i = 0; i < Math.max(6, pun.length, abs.length); i++) {
    const a = pun[i], b = abs[i];
    rows.push([E(i + 1, 'b c'), E(a ? dutyName(pm.get(a.pid)!) : '', 'b'), E(a ? norm(a.kind || 'Ποινή') : '', 'b c'), E(a ? dm(a.from) : '', 'b c'), E(a && !a.open ? dm(a.to) : '', 'b c'), E(a?.note || '', 'b'), E(''),
      E(i + 1, 'b c'), E(b ? dutyName(pm.get(b.pid)!) : '', 'b'), E(b ? absenceText(b.kind, TYPES[b.type].long) : '', 'b c'), E(b ? dm(b.from) : '', 'b c'), E(b && !b.open ? dm(b.to) : '', 'b c'), E(b?.note || '', 'b')]);
  }
  rows.push([E('', '', W)], [E(''), E('-Ο-', 'c', 2), E('-Ο-', 'c', 2), E('', '', 2), E('ΤΟ', 'c', 3), E('-Ο-', 'c', 3)], [E(''), E('ΑΛΧΙΑΣ ΙΛΗΣ', 'ttl', 2), E('ΔΚΤΗΣ ΙΛΗΣ', 'ttl', 2), E('', '', 2), E('2ο ΓΡΑΦΕΙΟ', 'ttl', 3), E('ΔΚΤΗΣ ΕΠΧΙΑΣ', 'ttl', 3)]);
  return { cols: [30, 34, 150, 78, 54, 8, 8, 8, 34, 150, 78, 54, 30], rows };
}
export const frouraEmpty = (s: AppState, date: ISODate) => postsOf(s.settings).filter(x => !(s.guards[date] || {})[x.k]).length;

// ΗΚΑΙ μπροστινό (δείγμα 15)
export function hkaiFront(s: AppState, date: ISODate, h: Hkai): SheetModel {
  const nK = HK_K.length, nA = HK_A.length, W = 8 + nK + nA;
  const rows: (Cell | null)[][] = [[E('ΚΕΤΘ', 'u', 4), E('', '', W - 4)], [E('2Η ΕΠΧΙΑ', 'u', 4), E('', '', W - 4)],
    [E('ΚΑΤΑΣΤΑΣΗ', 'ttl big', W)], [E('ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ ' + s.settings.unitName + ' ΤΗΣ ' + hkDate(date), 'ttl', W)], [E('', '', W)]];
  const H = (v: string, cs?: number, rs?: number) => E(v, 'b hdr sm', cs, rs);
  rows.push([H('ΒΑΘΜΟΙ', 1, 2), H('Προβλ.', 1, 2), H('ΔΥΝΑΜΗ', 2), H('Σύν.', 1, 2), H('ΚΩΛΥΟΜΕΝΟΙ', nK), H('Σύν. κωλ.', 1, 2), H('ΑΠΟΝΤΕΣ', nA), H('Σύν. απ.', 1, 2), H('Διαθ. εκπ.', 1, 2), H('Μισθοτρ.', 1, 2)]);
  rows.push([null, null, H('Τοπ.'), H('Προσκ.'), null, ...HK_K.map(x => H(x[1])), null, ...HK_A.map(x => H(x[1])), null, null, null]);
  const pv = hkOn(s.settings, 'prov') ? s.settings.hkai?.prov || {} : {};
  const pvOf = (list: string[]) => list.reduce((a, r) => a + (pv[r] || 0), 0);
  const line = (label: string, n: number, att: number, c: Record<string, number>, bold: boolean, prov = 0) => {
    const k = HK_K.map(([x]) => c[x] || 0), a = HK_A.map(([x]) => c[x] || 0);
    const sk = k.reduce((p, q) => p + q, 0), sa = a.reduce((p, q) => p + q, 0); const st = bold ? 'b c bold' : 'b c';
    return [E(label, 'b' + (bold ? ' bold' : '')), E(prov || '', st), E(n - att, st), E(att, st), E(n, st), ...k.map(v => E(v || '', st)), E(sk, st), ...a.map(v => E(v || '', st)), E(sa, st), E(n - sa, st), E(c.ab || '', st)];
  };
  const sum = (list: string[]) => { const c: Record<string, number> = {}; let n = 0, att = 0; list.forEach(r => { const x = h.rank[r]; n += x.n; att += x.attached; for (const k in x.c) c[k] = (c[k] || 0) + x.c[k]; }); return { n, att, c }; };
  HK_OFFICERS.forEach(r => rows.push(line(r, h.rank[r].n, h.rank[r].attached, h.rank[r].c, false, pv[r])));
  let x = sum(HK_OFFICERS); rows.push(line('ΣΥΝΟΛΟ ΑΞΚΩΝ', x.n, x.att, x.c, true, pvOf(HK_OFFICERS)));
  HK_NCO.forEach(r => rows.push(line(r, h.rank[r].n, h.rank[r].attached, h.rank[r].c, false, pv[r])));
  x = sum(HK_NCO); rows.push(line('ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ', x.n, x.att, x.c, true, pvOf(HK_NCO)));
  x = sum([...HK_OFFICERS, ...HK_NCO]); rows.push(line('ΓΕΝΙΚΟ ΣΥΝΟΛΟ', x.n, x.att, x.c, true, pvOf([...HK_OFFICERS, ...HK_NCO])));
  rows.push([E('', '', W)], [E('', '', W - 8), E(s.settings.place + ', ' + hkDate(date), 'c', 8)], [E('', '', W)],
    [E('', '', 2), E('-Ο-', 'c', 6), E('', '', W - 16), E('-Ο-', 'c', 8)], [E('', '', 2), E('ΑΛΧΙΑΣ ΙΛΗΣ', 'ttl', 6), E('', '', W - 16), E('ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ', 'ttl', 8)]);
  return { cols: [132, 40, 34, 34, 34, ...HK_K.map(() => 32), 36, ...HK_A.map(() => 32), 36, 36, 40], rows };
}
// ΗΚΑΙ πίσω: ίδιοι κανόνες με την εξαγωγή (main/exports.ts)
export function hkaiBack(s: AppState, date: ISODate): SheetModel {
  const g = s.guards[date] || {}; const pm = personMap(s.people); const posts = postsOf(s.settings);
  let night = 0, day24 = 0;
  for (const k in g) { const p = posts.find(x => x.k === k); if (!p) continue; if (p.kind === 'th' || p.kind === 'sk' || p.kind === 'op') night++; else day24++; }
  const name = (pid: number) => { const p = pm.get(pid); return p ? [p.rank, p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ') : '?'; };
  const egr = hkaiEgrLines(s, date), dia = hkaiDiaLines(s, date), leaves = hkaiLeaveLines(s, date), puns = hkaiPunLines(s, date), reqs = hkaiReqLines(s, date);
  // ενότητες που η Ίλη έκλεισε: κενές, όπως στο έντυπο
  const grd = hkOn(s.settings, 'grd'), v = hkOn(s.settings, 'veh') ? s.settings.hkai?.veh : undefined, acc = hkOn(s.settings, 'acc');
  if (!grd) { night = 0; day24 = 0; }
  const A = (k: string) => E(acc && tx[k]?.trim() ? tx[k].trim() : 'Ø', 'b c');
  const N = (v: number) => E(v || '', 'b c');
  const tx = s.hkaiManual?.[date]?.text || {};
  const og = hkOrgans(s, date);
  // όργανα υπηρεσίας (6 στήλες) αριστερά, απόφαση δεξιά: τίτλος 2 στήλες, κείμενο 6
  const L = (n: number, lbl: string, v: string | Line[]) => [E(n + '. ' + lbl + ':', 'bold', 2), typeof v === 'string' ? E(v || '', 'w', 6) : { ...E(linesText(v), 'w', 6), rich: v }];
  const rows: (Cell | null)[][] = [[E('ΧΟΡΗΓΟΥΜΕΝΕΣ ΦΡΟΥΡΕΣ', 'b hdr', 5), E(''), E('ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ', 'b hdr', 4), E(''), E('ΑΤΥΧΗΜΑΤΑ', 'b hdr', 3)],
    [...['Είδος', 'Αξκοί', 'Υπξκοι', 'Στρατιώτες', 'Σύνολο'].map(x => E(x, 'b hdr sm')), E(''), ...['Είδος', 'Προβλ.', 'Σε κίνηση', 'Επισκευή'].map(x => E(x, 'b hdr sm')), E(''), ...['Οχήματα', 'Ζημιές', 'Άνδρες'].map(x => E(x, 'b hdr sm'))],
    [E('Νυκτοφρουρές', 'b'), N(0), N(0), N(night), N(night), E(''), E(v?.type || '1/4 τόνων', 'b'), N(v?.prov || 0), N(v?.kin || 0), N((v?.maint || 0) + (v?.dmg || 0)), E(''), A('accT'), A('accP'), A('accM')],
    [E('24ωρες', 'b'), N(0), N(0), N(day24), N(day24), E('', '', 9)],
    [E('Πέραν 24ώρου', 'b'), N(0), N(0), N(0), N(0), E('', '', 9)],
    [E('Σύνολο', 'b bold'), N(0), N(0), N(night + day24), N(night + day24), E('', '', 9)],
    [E('', '', 14)],
    [E('Όργανα υπηρεσίας', 'bold', 6), E('Αποφάσεις Διοικητή', 'ttl', 8)],
    [E('Αξιωματικοί:', '', 6), ...L(1, 'ΕΓΓΡΑΦΕΣ', egr)],
    [E(hkOffText(s, date), 'w', 6), ...L(2, 'ΔΙΑΓΡΑΦΕΣ', dia)],
    [E('Υπαξιωματικοί:', '', 6), ...L(3, 'ΑΔΕΙΕΣ', leaves)],
    [E(og.ly ? 'Λ/Υ: ' + name(og.ly) : '', 'w', 6), ...L(4, 'ΠΟΙΝΕΣ', puns)],
    [E(og.dy ? 'Δ/Υ: ' + name(og.dy) : '', 'w', 6), ...L(5, 'ΑΙΤΗΣΕΙΣ', reqs)],
    [E('', '', 6), ...L(6, 'ΛΟΙΠΑ', tx.loi || '')],
    [E('', '', 14)], [E('', '', 6), E('ΑΝΑΦΕΡΕΤΑΙ ΠΛΗΡΟΤΗΤΑ ΟΠΛΙΣΜΟΥ ΚΑΙ ΛΟΙΠΩΝ ΕΛΚΥΣΤΙΚΩΝ ΥΛΙΚΩΝ', 'bold', 8)], [E('', '', 9), E(s.settings.place + ', ' + hkDate(date), 'c', 5)],
    [E('', '', 2), E('-Ο-', 'c', 4), E('', '', 3), E('-Ο-', 'c', 5)], [E('', '', 2), E('ΑΛΧΙΑΣ ΙΛΗΣ', 'ttl', 4), E('', '', 3), E('ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ', 'ttl', 5)]];
  return { cols: [96, 46, 46, 60, 50, 10, 70, 46, 56, 56, 10, 60, 50, 50], rows };
}

// Έλεγχος υπηρεσιών: μηνιαίο πλέγμα όπως το δείγμα 03
// only: μόνο αυτά τα άτομα (αναζήτηση στο πλέγμα)
export function checkSheet(s: AppState, ym: string, only?: Set<number>): SheetModel {
  const [y, m] = ym.split('-').map(Number); const nd = new Date(y, m, 0).getDate();
  const days = Array.from({ length: nd }, (_, i) => ym + '-' + String(i + 1).padStart(2, '0'));
  const hol = days.map(d => isHol(s.settings, d));   // μία φορά ανά μέρα, όχι ανά κελί
  const codes = new Map<string, { code: string; kind: DutyKind } | null>();    // κωδικός ανά θέση (Θ1α, Μ2, ΛΥ), όχι αναζήτηση σε κάθε ανάθεση
  const per = new Map<number, Map<string, { code: string; kind: DutyKind }>>();
  const set = (pid: number, d: string, v: { code: string; kind: DutyKind }) => { if (!per.has(pid)) per.set(pid, new Map()); per.get(pid)!.set(d, v); };
  // όλες οι θέσεις που έχουν υπάρξει (και του άλλου εντύπου), και οι υπηρεσίες χωρίς θέση (σκέτο γράμμα): ίδια με την εξαγωγή
  days.forEach(d => {
    for (const e of s.dutyLog?.[d] || []) set(e.pid, d, { code: bareOf(undefined, e.kind), kind: e.kind });
    const g = s.guards[d] || {};
    for (const k in g) { let v = codes.get(k); if (v === undefined) { const p = postBy(s, k); v = p ? { code: codeOf(s.settings, k, p.kind), kind: p.kind } : null; codes.set(k, v); } if (v) set(g[k], d, v); }
  });
  const W = 8 + nd;
  const rows: (Cell | null)[][] = [[E('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(MONTHS[m - 1]) + ' ' + y, 'ttl big', W)],
    [...['Α/Α', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΘΑΛ.', 'ΑΡΓ.', 'ΣΥΝ.', 'Θ', 'Μ', 'ΛΥ'].map(x => E(x, 'b hdr sm')), ...days.map((d, j) => E(j + 1, 'b hdr sm' + (hol[j] ? ' we' : '')))]];
  activePeople(s).filter(p => !only || only.has(p.id)).sort((a, b) => (a.room ?? 99) - (b.room ?? 99) || byName(a, b)).forEach((p, i) => {
    const x = per.get(p.id); let nh = 0; const c: Record<string, number> = {};
    const cells = days.map((d, j) => { const v = x && x.get(d); if (v) { if (hol[j]) nh++; c[v.kind] = (c[v.kind] || 0) + 1; } return E(v ? v.code : '', hol[j] ? 'b code we' : 'b code'); });
    rows.push([E(i + 1, 'b c'), E(fullName(p), 'b'), E(p.room ?? '', 'b c'), E(nh, 'b c'), E(x ? x.size : 0, 'b c bold'), E(c.th || '', 'b c'), E(c.mg || '', 'b c'), E(c.ly || '', 'b c'), ...cells]);
  });
  return { cols: [30, 172, 34, 34, 34, 26, 26, 26, ...days.map(() => 24)], rows };
}
