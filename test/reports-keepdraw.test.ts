// «Αποθήκευση και Βγάλε»: βγαίνουν οι τυχαίοι που έδειχνε ο οδηγός (με τις αλλαγές με ✕), όχι νέα κλήρωση
import { describe, it, expect } from 'vitest';
import { candidates, defaultPick, keepDraw, pickRandom, replaceOne, type Report } from '../src/shared/reports';
import { fakeState } from './fixtures';

const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Αγγαρεία', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: { ...defaultPick(), mode: 'random', n: 5 }, sort: 'pick', day: 'today', out: 'file', ...x });

describe('keepDraw', () => {
  const s = fakeState(); const D = '2026-10-19';
  const pool = candidates(s, rep({}), D);
  it('υπάρχουν αρκετοί υποψήφιοι', () => expect(pool.length).toBeGreaterThan(6));

  it('κρατά την κλήρωση του οδηγού, με τις αλλαγές με ✕, στη σειρά της', () => {
    let seq = 0; const rnd = () => ((seq = (seq * 9301 + 49297) % 233280) / 233280);
    const draw = pickRandom(pool, 5, false, rnd);
    const swapped = replaceOne(draw, 0, pool, rnd)!;
    expect(swapped[0].id).not.toBe(draw[0].id);
    const ids = swapped.map(x => x.id);
    const kept = keepDraw(pool, ids)!;
    expect(kept.map(x => x.id)).toEqual(ids);
    // τα τωρινά στοιχεία, όχι τα αντίγραφα της κλήρωσης
    expect(kept[0]).toBe(pool.find(x => x.id === ids[0]));
  });

  it('αν κάποιος δεν περνά πια τα φίλτρα, νέα κλήρωση (null)', () => {
    const ids = pool.slice(0, 3).map(x => x.id);
    expect(keepDraw(pool.slice(1), ids)).toBeNull();
    expect(keepDraw(pool, [])).toEqual([]);
  });
});
