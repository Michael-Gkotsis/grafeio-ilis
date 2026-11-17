// The renderer side of «Πρότυπο μονάδας»: every step of the screen renders (react-dom/server, no DOM) from a real model of a mock unit template.
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { modelOfBuffer } from '../src/main/bookModel';
import { tryFill } from '../src/main/tplAdapt';
import { buildTplModel, emptyChoices, kindOfSettings } from '../src/shared/tplMap';
import { activePeople } from '../src/shared/rules';
import { TplMapBody } from '../src/renderer/screens/tplMap';
import { genFillMock } from './mockgen';

describe('mapping screen render', () => {
  it('renders the four steps with the colours, the panels and the trial table', async () => {
    const m = await genFillMock(5, { own: true, countifs: true, ownCols: 2, unknownRow: true });
    const sheets = await modelOfBuffer(m.buf); const kind = kindOfSettings(m.s.settings);
    const posts = [...new Set(activePeople(m.s).map(p => (p.post || '').trim()).filter(Boolean))];
    const model = buildTplModel(sheets, { settings: m.s.settings, kind, posts, vocab: [], driven: null });
    const ch = model.choices || emptyChoices();
    const trial = await tryFill(sheets, m.buf, m.s, '2026-09-25', { choices: ch, creates: [] });
    const base = { model, ch, creates: {}, sel: null, trial: null, busy: false, onStep() {}, onSel() {}, setCol() {}, setRow() {}, setWord() {}, setSkip() {}, setBack() {}, accept() {}, setCreate() {}, onTry() {}, onRestore() {} };
    const out: Record<string, string> = {};
    for (const step of ['cols', 'rows', 'words', 'back', 'try']) out[step] = renderToString(React.createElement(TplMapBody as any, { ...base, step, trial: step === 'try' ? trial : null }));
    expect(out.cols).toContain('tm__tbl'); expect(out.cols).toMatch(/Τι σημαίνει/);
    expect(out.rows).toContain('tm__rl');
    expect(out.try).toContain('tm__tbl--num');
    for (const h of Object.values(out)) expect(h).not.toMatch(/undefined|\[object|NaN/);
  });
});
