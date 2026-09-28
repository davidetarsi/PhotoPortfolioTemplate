// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { siteForEditing } from './site.js';

const DEFAULTS = { name: 'Photographer Name', bio: 'Short bio', heroImage: null, links: [{ url: 'https://instagram.com/x' }] };

describe('siteForEditing', () => {
  it('starts from config/site.config.js when there is no site yet', () => {
    expect(siteForEditing(null, DEFAULTS)).toEqual({
      name: 'Photographer Name', bio: 'Short bio', hero: null, links: [{ url: 'https://instagram.com/x' }], texts: {},
    });
  });

  it('turns the old social shape into links and drops it', () => {
    const site = { name: 'D', bio: '', hero: null, social: { instagram: 'https://instagram.com/d' } };
    expect(siteForEditing(site, DEFAULTS)).toEqual({ name: 'D', bio: '', hero: null, links: [{ url: 'https://instagram.com/d' }], texts: {} });
  });

  it('keeps links, texts and hero as they are', () => {
    const site = { name: 'D', bio: 'B', hero: { album: 'notte', name: 'a.webp' }, links: [], texts: { 'about.heading': 'Ciao' } };
    expect(siteForEditing(site, DEFAULTS)).toEqual(site);
  });
});
