// The pure rules of the «Γράμματα Excel» card (pages/settings/model/xlLookView.ts).
import { describe, expect, it } from 'vitest';
import {
  PART_LBL,
  STYLE_BTN,
  formLike,
  lookText,
  partNow,
  sampleCell,
  sampleFamily,
  sampleLook,
  sampleUnits,
  sizeAuto,
  withPart,
} from '../src/renderer/pages/settings/model/xlLookView';
import { XL_LOOK, XL_PARTS, type XlLook } from '../src/shared/xlLook';

describe('Γράμματα Excel view', () => {
  it('says the look in one line', () => {
    expect(lookText(XL_LOOK)).toBe('Arial 12, κέντρο / μέση');
    expect(lookText({ ...XL_LOOK, parts: { hdr: { b: true } } })).toBe(
      'Arial 12, κέντρο / μέση, με δικά τους γράμματα σε κομμάτια',
    );
  });

  it('has a label and a help for every part, and three style buttons', () => {
    expect(XL_PARTS.every((k) => PART_LBL[k][0] && PART_LBL[k][1])).toBe(true);
    expect(STYLE_BTN.map(([key]) => key)).toEqual(['b', 'i', 'u']);
  });

  it('keeps the header and the signatures as the form unless the user set them', () => {
    expect(formLike('hdr') && formLike('sig')).toBe(true);
    expect(['title', 'head', 'data'].some((k) => formLike(k as 'title'))).toBe(false);
    expect(partNow(XL_LOOK, 'hdr')).toEqual({});
    expect(partNow({ ...XL_LOOK, parts: { sig: { u: true } } }, 'sig')).toEqual({ u: true });
  });

  it('changes one part, drops the fields reset to the default, and the empty part', () => {
    const one = withPart(XL_LOOK, 'hdr', { b: true, sz: 14 });
    expect(one.parts).toEqual({ hdr: { b: true, sz: 14 } });
    const two = withPart(one, 'hdr', { sz: undefined });
    expect(two.parts).toEqual({ hdr: { b: true } });
    const gone = withPart(two, 'hdr', { b: undefined });
    expect(gone).toEqual(XL_LOOK);
    expect('parts' in gone).toBe(false);
  });

  it('keeps the other parts when one is emptied', () => {
    const x: XlLook = { ...XL_LOOK, parts: { hdr: { b: true }, sig: { i: true } } };
    expect(withPart(x, 'hdr', { b: undefined }).parts).toEqual({ sig: { i: true } });
  });

  it('picks the sample font family and styles', () => {
    expect(sampleFamily('Calibri')).toContain('Carlito');
    expect(sampleFamily('Times New Roman')).toContain('serif');
    expect(sampleFamily('Arial')).toContain('Liberation Sans');
    expect(sampleLook(XL_LOOK, 'hdr').fontSize).toBe('10pt');
    expect(sampleLook(XL_LOOK, 'sig').fontSize).toBe('12pt');
    expect(sampleLook({ ...XL_LOOK, sz: 14 }, 'data').fontSize).toBe('14pt');
    const bold = sampleLook({ ...XL_LOOK, parts: { title: { b: true, i: true, u: true } } }, 'title');
    expect([bold.fontWeight, bold.fontStyle, bold.textDecoration]).toEqual([700, 'italic', 'underline']);
  });

  it('draws a sample cell with the alignment and a grey head', () => {
    const head = sampleCell({ ...XL_LOOK, h: 'left', v: 'center', sz: 10 }, 'head');
    expect([head.textAlign, head.verticalAlign, head.height, head.background]).toEqual([
      'left',
      'middle',
      '26pt',
      '#d9d9d9',
    ]);
    expect(sampleCell({ ...XL_LOOK, v: 'top' }, 'data').verticalAlign).toBe('top');
  });

  it('words the automatic size by part', () => {
    expect(sizeAuto(XL_LOOK, 'hdr')).toBe('Όπως το έντυπο');
    expect(sizeAuto(XL_LOOK, 'title')).toBe('Αυτόματα (14)');
    expect(sizeAuto(XL_LOOK, 'head')).toBe('Όπως οι γραμμές (12)');
  });

  it('shows the first two unit lines, or the form example', () => {
    expect(sampleUnits(['Α', '', 'Β', 'Γ'])).toEqual(['Α', 'Β']);
    expect(sampleUnits(['', '', ''])).toEqual(['ΚΕΘΤ', 'ΓΡΑΦΕΙΟ ΛΟΧΙΑ']);
  });
});
