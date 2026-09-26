import { describe, expect, it } from 'vitest';
import { createFontsPlugin, fontLinkTags } from './fontsPlugin.js';

const URL = 'https://fonts.googleapis.com/css2?family=Sora:wght@300&display=swap';

describe('fontLinkTags', () => {
  it('builds the two preconnects and the stylesheet for a Google Fonts URL', () => {
    expect(fontLinkTags(URL)).toEqual([
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'stylesheet', href: URL }, injectTo: 'head' },
    ]);
  });

  it('adds nothing when the URL is empty: no external fonts', () => {
    expect(fontLinkTags('')).toEqual([]);
    expect(fontLinkTags(undefined)).toEqual([]);
  });

  it('accepts only Google Fonts, which is what the CSP allows', () => {
    expect(() => fontLinkTags('https://example.com/fonts.css')).toThrow(/theme\/fonts\.js/);
  });
});

describe('createFontsPlugin', () => {
  it('adds the tags to every HTML page', () => {
    const plugin = createFontsPlugin(URL);
    expect(plugin.transformIndexHtml.handler('<html></html>')).toEqual(fontLinkTags(URL));
  });
});
