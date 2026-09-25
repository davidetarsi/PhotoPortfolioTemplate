// @vitest-environment node
import { describe, expect, it } from 'vitest';
import worker from '../worker.js';
import { makeFakeAssets, makeFakeBucket } from './test-helpers.js';

const albumHtml = '<html><head><title>Album — Seed</title><meta name="description" content="Seed" /></head><body></body></html>';
const albums = { albums: [{ slug: 'sport', title: 'Sport', description: 'Gare', coverName: 'c.webp' }] };
const site = { name: 'Davide', bio: 'Bio', hero: null, social: {} };

const run = (path, bucket) => worker.fetch(
  new Request(`https://example.com${path}`),
  {
    ASSETS: makeFakeAssets({ '/album.html': albumHtml }),
    BUCKET: makeFakeBucket(bucket),
    R2_PUBLIC_URL: 'https://photos.example.com',
  },
);

describe('album pages', () => {
  it('cold start: no albums.json → page unchanged, 200', async () => {
    const res = await run('/sport', {});
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(albumHtml);
  });

  it('known album → its title, cover and canonical, no-store', async () => {
    const res = await run('/sport', { '_data/albums.json': albums, '_site/site.json': site });
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('<title>Sport — Davide</title>');
    expect(body).toContain('<meta property="og:image" content="https://photos.example.com/sport/c.webp">');
    expect(body).toContain('<link rel="canonical" href="https://example.com/sport">');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('unknown album with valid albums.json → 404 with the same page, no-store', async () => {
    const res = await run('/non-esiste', { '_data/albums.json': albums, '_site/site.json': site });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(albumHtml);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('albums.json with the wrong shape → page unchanged, 200', async () => {
    const res = await run('/sport', { '_data/albums.json': '{"albums": "nope"}' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(albumHtml);
  });

  it('albums.json that is not JSON → page unchanged, 200', async () => {
    const res = await run('/sport', { '_data/albums.json': '{not json' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(albumHtml);
  });

  it('invalid site.json → the album title alone', async () => {
    const res = await run('/sport', { '_data/albums.json': albums, '_site/site.json': '{"name": 42}' });
    expect(await res.text()).toContain('<title>Sport</title>');
  });

  it('trailing slash is the same album', async () => {
    const res = await run('/sport/', { '_data/albums.json': albums, '_site/site.json': site });
    expect(await res.text()).toContain('<title>Sport — Davide</title>');
  });
});
