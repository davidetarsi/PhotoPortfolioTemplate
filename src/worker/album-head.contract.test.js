// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { injectSiteMeta } from '../utils/injectSiteMeta.js';
import { rewriteHead } from './page-meta.js';

// Runs the real album.html through the build step and then through the Worker's
// rewrite: a template change that rewriteHead would silently miss fails here.
describe('album.html head contract', () => {
  const built = injectSiteMeta(
    readFileSync(new URL('../../album.html', import.meta.url), 'utf8'),
    { name: 'Seed', bio: 'Seed bio', language: 'it', heroImage: null },
    'https://photos.example.com',
  );
  const out = rewriteHead(built, {
    title: 'Sport — Davide',
    description: 'Gare',
    image: 'https://photos.example.com/sport/c.webp',
    canonical: 'https://example.com/sport',
  });

  it.each([
    '<title>',
    'name="description"',
    'property="og:title"',
    'property="og:description"',
    'property="og:image"',
    'property="og:url"',
    'rel="canonical"',
  ])('has exactly one %s', marker => {
    expect(out.split(marker)).toHaveLength(2);
  });

  it('carries the album values', () => {
    expect(out).toContain('<title>Sport — Davide</title>');
    expect(out).toContain('<meta property="og:image" content="https://photos.example.com/sport/c.webp">');
    expect(out).toContain('<link rel="canonical" href="https://example.com/sport">');
  });
});
