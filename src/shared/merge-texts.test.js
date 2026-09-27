import { describe, expect, it } from 'vitest';
import { mergeTexts } from './merge-texts.js';
import { texts } from '../../config/texts.config.js';
import { texts as textsIt } from '../../config/texts.it.js';
import { EDITABLE_TEXT_KEYS } from './content-rules.js';

describe('mergeTexts', () => {
  it('applies overrides for editable keys, nested ones included', () => {
    const merged = mergeTexts(texts, { 'about.heading': 'Scrivimi', 'about.form.successMessage': 'Grazie!' });
    expect(merged.about.heading).toBe('Scrivimi');
    expect(merged.about.form.successMessage).toBe('Grazie!');
    expect(merged.about.body).toBe(texts.about.body);
  });
  it('ignores keys that are not editable and empty overrides', () => {
    const merged = mergeTexts(texts, { 'nav.homeLabel': 'Casa', 'about.body': '  ' });
    expect(merged.nav.homeLabel).toBe(texts.nav.homeLabel);
    expect(merged.about.body).toBe(texts.about.body);
  });
  it('does not modify the texts it receives', () => {
    const before = texts.about.heading;
    mergeTexts(texts, { 'about.heading': 'Changed' });
    expect(texts.about.heading).toBe(before);
  });
  it('without overrides returns an equal copy', () => {
    expect(mergeTexts(texts)).toEqual(texts);
    expect(mergeTexts(texts, null)).toEqual(texts);
  });
  it('every editable key names a string in both texts files', () => {
    for (const source of [texts, textsIt]) {
      for (const key of EDITABLE_TEXT_KEYS) {
        expect(typeof key.split('.').reduce((node, part) => node?.[part], source), key).toBe('string');
      }
    }
  });
});
