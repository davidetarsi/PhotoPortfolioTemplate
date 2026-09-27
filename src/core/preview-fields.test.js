import { describe, expect, it } from 'vitest';
import aboutHtml from '../../about.html?raw';
import { PREVIEW_FIELDS, EDITABLE_TEXT_KEYS } from '../shared/content-rules.js';
import { renderHero } from '../components/Hero.js';
import { renderNav } from '../components/Nav.js';
import { renderFooter } from '../components/Footer.js';
import { landing } from '../components/Landing.js';
import { createContactForm } from '../components/ContactForm.js';
import { texts } from '../../config/texts.config.js';

// Every field the dashboard can edit must be marked somewhere in the template, and
// every mark must name a known field: otherwise the preview silently shows nothing.
async function templateMarks() {
  const root = document.createElement('div');
  const hero = document.createElement('section');
  renderHero(hero, { name: 'N', bio: 'B', heroUrl: null }, texts);
  const nav = document.createElement('div');
  renderNav(nav, { name: 'N' }, texts);
  const footer = document.createElement('div');
  renderFooter(footer, texts, [{ url: 'https://instagram.com/x' }]);
  const land = document.createElement('div');
  await landing.mount(land, { texts, data: Promise.resolve({ site: { name: 'N', bio: '', heroUrl: null }, albums: [], albumsError: null, r2PublicUrl: '' }) });
  const about = new DOMParser().parseFromString(aboutHtml, 'text/html');
  root.append(hero, nav, footer, land, createContactForm({ turnstileSitekey: '' }, texts));
  return new Set([...root.querySelectorAll('[data-field]'), ...about.querySelectorAll('[data-field]')]
    .map(el => el.getAttribute('data-field')));
}

describe('preview fields', () => {
  it('are the site fields plus every editable text', () => {
    expect(PREVIEW_FIELDS).toEqual(['site.name', 'site.bio', 'site.links', ...EDITABLE_TEXT_KEYS.map(key => `texts.${key}`)]);
  });

  it('are all marked in the template, and the template marks nothing else', async () => {
    const marks = await templateMarks();
    expect([...marks].sort()).toEqual([...PREVIEW_FIELDS].sort());
  });
});
