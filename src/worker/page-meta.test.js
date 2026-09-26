// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { albumMeta, rewriteHead } from './page-meta.js';

const built = `<!doctype html><html><head>
<title>Album — Seed</title>
<meta name="description" content="Seed bio" />
<meta property="og:type" content="website" />
<meta property="og:title" content="Album — Seed" />
<meta property="og:description" content="Seed bio" />
<meta name="twitter:card" content="summary_large_image" />
</head><body></body></html>`;

const url = new URL('https://example.com/sport');
const site = { name: 'Davide', bio: 'Foto e codice', hero: null };

describe('albumMeta', () => {
  it('uses album title, description and cover', () => {
    expect(albumMeta({
      site,
      album: { slug: 'sport', title: 'Sport', description: 'Gare', coverName: 'c.webp' },
      r2PublicUrl: 'https://photos.example.com',
      url,
    })).toEqual({
      title: 'Sport — Davide',
      description: 'Gare',
      image: 'https://photos.example.com/sport/c.webp',
      canonical: 'https://example.com/sport',
    });
  });

  it('falls back to the site bio and to no image', () => {
    const meta = albumMeta({
      site,
      album: { slug: 'sport', title: 'Sport', description: '', coverName: null },
      r2PublicUrl: '',
      url,
    });
    expect(meta.description).toBe('Foto e codice');
    expect(meta.image).toBe('');
  });

  it('falls back to the site hero when the album has no cover', () => {
    const meta = albumMeta({
      site: { ...site, hero: { album: 'viaggi', name: 'h.webp' } },
      album: { slug: 'sport', title: 'Sport', description: 'Gare', coverName: null },
      r2PublicUrl: 'https://photos.example.com',
      url,
    });
    expect(meta.image).toBe('https://photos.example.com/viaggi/h.webp');
  });

  it('uses the album title alone when the site is unavailable', () => {
    const meta = albumMeta({
      site: {},
      album: { slug: 'sport', title: 'Sport', description: '', coverName: null },
      r2PublicUrl: '',
      url,
    });
    expect(meta.title).toBe('Sport');
    expect(meta.description).toBe('');
  });
});

describe('rewriteHead', () => {
  const meta = {
    title: 'Sport — Davide',
    description: 'Gare',
    image: 'https://p/sport/c.webp',
    canonical: 'https://example.com/sport',
  };

  it('replaces title and existing tags, inserts missing ones', () => {
    const out = rewriteHead(built, meta);
    expect(out).toContain('<title>Sport — Davide</title>');
    expect(out).toContain('<meta name="description" content="Gare">');
    expect(out).toContain('<meta property="og:title" content="Sport — Davide">');
    expect(out).toContain('<meta property="og:description" content="Gare">');
    expect(out).toContain('<meta property="og:image" content="https://p/sport/c.webp">');
    expect(out).toContain('<meta property="og:url" content="https://example.com/sport">');
    expect(out).toContain('<link rel="canonical" href="https://example.com/sport">');
    expect(out.match(/og:title/g)).toHaveLength(1);
  });

  it('leaves unrelated tags alone', () => {
    const out = rewriteHead(built, meta);
    expect(out).toContain('<meta property="og:type" content="website" />');
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('escapes values coming from R2', () => {
    const out = rewriteHead(built, { ...meta, title: 'A "quoted" <b>title</b>' });
    expect(out).toContain('<title>A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt;</title>');
    expect(out).not.toContain('<b>');
  });

  it('keeps $ sequences in values literally', () => {
    const out = rewriteHead(built, { ...meta, title: 'Q&A $& $1 $$' });
    expect(out).toContain('<title>Q&amp;A $&amp; $1 $$</title>');
    expect(out).toContain('<meta property="og:title" content="Q&amp;A $&amp; $1 $$">');
  });

  it('removes og:image when there is no image', () => {
    const withImage = rewriteHead(built, meta);
    expect(rewriteHead(withImage, { ...meta, image: '' })).not.toContain('og:image');
  });

  it('removes the description tags when there is no description', () => {
    const out = rewriteHead(built, { ...meta, description: '' });
    expect(out).not.toContain('name="description"');
    expect(out).not.toContain('og:description');
  });

  it('replaces an existing canonical instead of adding a second one', () => {
    const once = rewriteHead(built, meta);
    const twice = rewriteHead(once, { ...meta, canonical: 'https://example.com/altro' });
    expect(twice.match(/rel="canonical"/g)).toHaveLength(1);
    expect(twice).toContain('<link rel="canonical" href="https://example.com/altro">');
  });

  it('returns HTML without </head> unchanged', () => {
    expect(rewriteHead('ASSET:/album.html', meta)).toBe('ASSET:/album.html');
  });
});
