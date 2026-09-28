// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PREVIEW_FIELDS } from '../../shared/content-rules.js';
import { fieldPage, previewSrc } from './preview.js';

describe('fieldPage', () => {
  it('shows the contact page texts on /about, the rest on the home page', () => {
    expect(fieldPage('texts.about.heading')).toBe('/about');
    expect(fieldPage('texts.about.form.successMessage')).toBe('/about');
    expect(fieldPage('site.name')).toBe('/');
    expect(fieldPage('texts.landing.albumsSectionHeading')).toBe('/');
    expect(fieldPage(null)).toBe('/');
  });

  it('knows a page for every field the site marks', () => {
    for (const field of PREVIEW_FIELDS) expect(['/', '/about']).toContain(fieldPage(field));
  });
});

describe('previewSrc', () => {
  it('asks the page for the draft', () => {
    expect(previewSrc('/about')).toBe('/about?preview=1');
  });
});
