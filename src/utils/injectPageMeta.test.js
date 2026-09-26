import { describe, expect, it } from 'vitest';
import { injectPageMeta } from './injectPageMeta.js';

const meta = { PAGE_TITLE: 'Sea <Sentinels>', PAGE_DESCRIPTION: 'App "one"', PAGE_IMAGE: '', PAGE_URL: '/projects/sea', PAGE_SLUG: 'sea' };

describe('injectPageMeta', () => {
  it('replaces PAGE placeholders with escaped values', () => {
    expect(injectPageMeta('<title>{{PAGE_TITLE}}</title><p data-slug="{{PAGE_SLUG}}">{{PAGE_DESCRIPTION}}</p>', meta))
      .toBe('<title>Sea &lt;Sentinels&gt;</title><p data-slug="sea">App &quot;one&quot;</p>');
  });

  it('removes meta tags left empty, like injectSiteMeta', () => {
    const html = '<head>\n  <meta property="og:image" content="{{PAGE_IMAGE}}">\n  <link rel="canonical" href="{{PAGE_URL}}">\n</head>';
    expect(injectPageMeta(html, meta)).toBe('<head>\n  <link rel="canonical" href="/projects/sea">\n</head>');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(injectPageMeta('{{PAGE_OTHER}} {{SITE_NAME}}', meta)).toBe('{{PAGE_OTHER}} {{SITE_NAME}}');
  });
});
