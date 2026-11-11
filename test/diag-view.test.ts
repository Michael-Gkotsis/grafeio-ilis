// The pure helpers of the «Διάγνωση» screen (pages/diag/model/view.ts): number texts, colours and the speed-run maths.
import { describe, expect, it } from 'vitest';
import {
  MEM_WARN_KB,
  mb,
  median,
  memTotalKb,
  speedText,
  startupSecs,
  tabName,
  tone,
  writeText,
} from '../src/renderer/pages/diag/model/view';

describe('diag view', () => {
  it('memory: whole MB and the total of all processes', () => {
    expect(mb(86016)).toBe('84 MB');
    expect(mb(512)).toBe('1 MB');
    expect(
      memTotalKb([
        { type: 'Browser', kb: 1000, cpu: 1 },
        { type: 'Tab', kb: 2072, cpu: 0 },
      ]),
    ).toBe(3072);
    expect(memTotalKb([])).toBe(0);
    expect(MEM_WARN_KB).toBe(256000);
  });

  it('times: start-up keeps the dot, writes and the speed table use the Greek comma', () => {
    expect(startupSecs(2345)).toBe('2.3');
    expect(writeText(1420)).toBe('1,4 δευτ.');
    expect(speedText(87)).toBe('0,09 δευτ.');
    expect(speedText(-1)).toBe('—');
  });

  it('tone: ok up to 0.4 s, warn up to 1 s, bad above', () => {
    expect([0, 400, 401, 1000, 1001].map(tone)).toEqual(['ok', 'ok', 'warn', 'warn', 'bad']);
    expect(tone(-1)).toBe('ok');
  });

  it('speed run: the middle of three runs, and tab names without their count', () => {
    expect(median([30.4, 10.2, 20.6])).toBe(21);
    expect(median([5])).toBe(5);
    expect(tabName('Ποινές (3)')).toBe('Ποινές');
    expect(tabName('Αιτήσεις 12')).toBe('Αιτήσεις');
    expect(tabName('ΗΚΑΙ')).toBe('ΗΚΑΙ');
  });
});
