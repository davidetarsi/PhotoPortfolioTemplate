import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from './index.js';

afterEach(() => vi.unstubAllGlobals());

describe('public API for custom/', () => {
  it('exports exactly the documented surface', () => {
    // Pinned on purpose: removing or renaming an export breaks forks and must be a
    // deliberate change, announced in docs/upgrading.md. Adding one is safe.
    expect(Object.keys(api).sort()).toEqual([
      'albumsToCards', 'fetchAlbums', 'fetchConfig', 'fetchManifest', 'fetchSite', 'on',
      'photosFromManifest', 'resolveAlbums', 'resolveSiteContent', 'siteConfig', 'slot', 'slugFromPath', 'texts',
    ]);
  });

  // What docs/slots.md promises about each export. Forks rely on it: change these
  // tests only together with a note in docs/upgrading.md.
  describe('albumsToCards', () => {
    const r2PublicUrl = 'https://photos.example.com';

    it('returns one card per album, with the full URL of its cover', () => {
      expect(api.albumsToCards(
        [{ slug: 'sport', title: 'Sport', description: 'Gare', coverName: 'c.webp' }],
        r2PublicUrl,
      )).toEqual([
        { slug: 'sport', title: 'Sport', description: 'Gare', coverUrl: 'https://photos.example.com/sport/c.webp' },
      ]);
    });

    it('gives coverUrl null when the album has no cover', () => {
      const [card] = api.albumsToCards([{ slug: 'viaggi', title: 'Viaggi', description: '', coverName: '' }], r2PublicUrl);
      expect(card.coverUrl).toBeNull();
    });

    it('gives coverUrl null when r2PublicUrl is missing', () => {
      const [card] = api.albumsToCards([{ slug: 'sport', title: 'Sport', description: '', coverName: 'c.webp' }], undefined);
      expect(card.coverUrl).toBeNull();
    });
  });

  it('maps manifest entries to public photo URLs', () => {
    expect(api.photosFromManifest([{ name: 'lake.webp', width: 4, height: 3 }], 'travel', 'https://photos.example.com'))
      .toEqual([{
        name: 'lake.webp', width: 4, height: 3,
        gridUrl: 'https://photos.example.com/travel/lake.webp',
        fullUrl: 'https://photos.example.com/travel/lake.webp',
      }]);
    expect(api.photosFromManifest([{ name: 'lake.webp', width: 4, height: 3 }], 'travel', undefined)).toEqual([]);
  });

  it('exposes the same runtime and build helpers used by the pages', () => {
    const albums = [{ slug: 'travel', title: 'Travel', description: '', coverName: '' }];
    expect(api.resolveAlbums({ ok: false, error: 'NOT_FOUND' }, albums)[0].coverName).toBeNull();
    expect(api.resolveSiteContent({ ok: false, error: 'NETWORK' }, api.siteConfig).name).toBe(api.siteConfig.name);
    expect(api.texts.about.heading).toBeTruthy();
    expect(api.siteConfig.name).toBeTruthy();
    expect(api.on('public-api-test', () => {})).toEqual(expect.any(Function));
  });

  describe('slugFromPath', () => {
    it('reads the entry slug of a collection page', () => {
      expect(api.slugFromPath('/projects/:slug', '/projects/sea-sentinels')).toBe('sea-sentinels');
    });
  });

  it('fetches validated runtime data through the public function', async () => {
    const site = { name: 'Runtime', bio: '', hero: null, social: {} };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(site), { status: 200 })));

    await expect(api.fetchSite()).resolves.toEqual({ ok: true, data: site });
    expect(fetch).toHaveBeenCalledWith('/api/data/site');
  });

  it('resolves a slot lazily when the facade is called', async () => {
    await expect(api.slot('landing')).resolves.toHaveProperty('mount');
  });
});
