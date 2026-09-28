// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EDITABLE_TEXT_KEYS, MAX_TEXT_LENGTH } from '../../shared/content-rules.js';
import { defaultText, fieldProblem, textFields } from './site-fields.js';

const TEXTS = { landing: { albumsSectionHeading: 'Albums' }, about: { heading: 'Contact', body: 'Write', form: { successMessage: 'Sent' } } };
const SITE = { name: 'D', bio: '', hero: null, links: [], texts: { 'about.heading': 'Scrivimi' } };
const byId = id => textFields(TEXTS).find(field => field.id === id);

describe('site fields', () => {
  it('has one field for the name, the bio and every editable page text', () => {
    expect(textFields(TEXTS).map(field => field.id)).toEqual(['site.name', 'site.bio', ...EDITABLE_TEXT_KEYS.map(key => `texts.${key}`)]);
  });

  it('a page text shows the template text until it is changed, and can go back to it', () => {
    expect(defaultText('about.form.successMessage', TEXTS)).toBe('Sent');
    expect(byId('texts.about.body').read(SITE)).toBe('Write');
    expect(byId('texts.about.heading').read(SITE)).toBe('Scrivimi');
    expect(byId('texts.about.heading').isDefault(SITE)).toBe(false);
    const reset = byId('texts.about.heading').reset(SITE);
    expect(reset.texts).toEqual({});
    expect(byId('texts.about.body').write(SITE, 'Ciao').texts).toEqual({ 'about.heading': 'Scrivimi', 'about.body': 'Ciao' });
  });

  it('the name is required; a page text has a length limit', () => {
    expect(fieldProblem(byId('site.name'), '  ')).toBe('required');
    expect(fieldProblem(byId('site.bio'), '')).toBeNull();
    expect(fieldProblem(byId('texts.about.body'), 'x'.repeat(MAX_TEXT_LENGTH + 1))).toBe('tooLong');
    expect(fieldProblem(byId('texts.about.body'), 'x'.repeat(MAX_TEXT_LENGTH))).toBeNull();
  });
});
