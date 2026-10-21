// Οδηγός χρήσης (Michael, 21/10): κάθε σύνδεσμος πάει σε θέμα που υπάρχει, κάθε «Άνοιξε» σε οθόνη που υπάρχει,
// κάθε μενού και κάθε ενότητα των Ρυθμίσεων έχει θέμα, και η αναζήτηση βρίσκει χωρίς τόνους.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { GUIDE, GUIDE_GROUPS } from '../src/renderer/guideText';
import { parseGuide, searchGuide } from '../src/renderer/screens/guide';
import { topicFor } from '../src/renderer/guideTopic';

const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', f), 'utf8');
const ids = new Set(GUIDE.map(t => t.id));
const views = [...src('app.ts').match(/const SCREENS[^;]+;/)![0].matchAll(/(\w+): \['/g)].map(m => m[1]);
const tabs = [...src('screens/settings.ts').match(/const SET_SECTIONS[^;]+;/)![0].matchAll(/\['(\w+)', '/g)].map(m => m[1]);

describe('οδηγός χρήσης', () => {
  it('μοναδικά θέματα, σε ομάδα που υπάρχει', () => {
    expect(ids.size).toBe(GUIDE.length);
    const groups = GUIDE_GROUPS.map(([g]) => g);
    expect(GUIDE.filter(t => !groups.includes(t.group)).map(t => t.id)).toEqual([]);
  });
  it('οι σύνδεσμοι [[…]] πάνε σε θέμα που υπάρχει', () => {
    const bad = GUIDE.flatMap(t => [...t.body.matchAll(/\[\[([^\]|]+)/g)].map(m => m[1]).filter(id => !ids.has(id)).map(id => t.id + ' → ' + id));
    expect(bad).toEqual([]);
  });
  it('το «Άνοιξε» πάει σε οθόνη και ενότητα Ρυθμίσεων που υπάρχουν', () => {
    expect(views).toContain('guide');
    const bad = GUIDE.filter(t => t.go && (!views.includes(t.go.view) || (t.go.view === 'templates' && !tabs.includes(t.go.params?.tab || '')))).map(t => t.id);
    expect(bad).toEqual([]);
  });
  it('κάθε οθόνη και κάθε ενότητα των Ρυθμίσεων έχει θέμα (Shift+F1)', () => {
    for (const v of views.filter(v => v !== 'templates' && v !== 'guide' && v !== 'diag')) expect(ids.has(topicFor(v, {})), v).toBe(true);
    for (const tab of tabs) expect(ids.has(topicFor('templates', { tab })), tab).toBe(true);
    expect(topicFor('templates', {})).toBe('set-unit');
  });
  it('οι πίνακες έχουν ίδιο πλήθος στηλών σε κάθε γραμμή', () => {
    for (const t of GUIDE) for (const b of parseGuide(t.body)) if (b.t === 'table') {
      expect(b.rows.length, t.id).toBeGreaterThan(1);
      for (const r of b.rows) expect(r.length, t.id + ': ' + r.join(' | ')).toBe(b.rows[0].length);
    }
  });
  it('η σήμανση γίνεται κομμάτια: υπότιτλοι, βήματα, κουκκίδες, συμβουλές', () => {
    const b = parseGuide('## Τίτλος\nΜία\nγραμμή\n\n1. πρώτο\n2. δεύτερο\n- α\n- β\n> συμβουλή\n! προσοχή\n| Α | Β\n| 1 | 2');
    expect(b.map(x => x.t)).toEqual(['h', 'p', 'ol', 'ul', 'tip', 'warn', 'table']);
    expect(b[1]).toEqual({ t: 'p', text: 'Μία γραμμή' });
    // βήματα μετά από κουκκίδες συνεχίζουν την αρίθμηση
    const c = parseGuide('1. α\n2. β\n- υπο\n3. γ');
    expect(c[2]).toEqual({ t: 'ol', items: ['γ'], start: 3 });
  });
  it('αναζήτηση χωρίς τόνους και κεφαλαία, πρώτα όσα ταιριάζουν στον τίτλο', () => {
    expect(searchGuide('εξοδουχοι')[0].topic.id).toBe('outs');
    expect(searchGuide('ΑΝΤΙΓΡΑΦΟ usb').map(h => h.topic.id)).toContain('set-backup');
    expect(searchGuide('κενη θεση').length).toBeGreaterThan(0);
    expect(searchGuide('ξξξξ')).toEqual([]);
    expect(searchGuide('   ')).toEqual([]);
  });
});
