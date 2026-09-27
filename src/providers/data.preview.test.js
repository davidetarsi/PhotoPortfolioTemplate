import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Preview mode is decided when data.js loads: set the address first, then import it.
const SITE = { name: 'Bozza', bio: '', hero: null, links: [] };
const ALBUMS = [{ slug: 'notte', title: 'Notte', description: '', coverName: null }];
const jsonRes = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

let data;
beforeEach(async () => {
  vi.resetModules();
  window.history.replaceState(null, '', '/?preview=1');
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (url === '/api/admin/draft') return jsonRes({ site: SITE, albums: ALBUMS, hasDraft: true });
    if (url === '/api/admin/draft/albums/notte/manifest') return jsonRes([{ name: 'a.webp', width: 4, height: 3 }]);
    if (url === '/api/data/config') return jsonRes({ r2PublicUrl: 'https://pub.r2.dev', turnstileSitekey: null });
    return jsonRes({ error: 'NOT_FOUND' }, 404);
  }));
  data = await import('./data.js');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('data in preview mode', () => {
  it('reads site and albums from the draft, with one request', async () => {
    expect(await data.fetchSite()).toEqual({ ok: true, data: SITE });
    expect(await data.fetchAlbums()).toEqual({ ok: true, data: ALBUMS });
    expect(fetch.mock.calls.filter(([url]) => url === '/api/admin/draft')).toHaveLength(1);
    expect(fetch.mock.calls.some(([url]) => url.startsWith('/api/data/site'))).toBe(false);
  });

  it('reads manifests from the draft', async () => {
    expect((await data.fetchManifest('notte')).data).toHaveLength(1);
  });

  it('serves photos through the Worker, so unpublished ones show', async () => {
    const res = await data.fetchConfig();
    expect(res.data.r2PublicUrl).toBe(`${window.location.origin}/api/admin/preview/photo`);
  });

  it('a site never published: NOT_FOUND, so the page uses the seed', async () => {
    vi.resetModules();
    fetch.mockImplementation(async () => jsonRes({ site: null, albums: [], hasDraft: false }));
    data = await import('./data.js');
    expect(await data.fetchSite()).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await data.fetchAlbums()).toEqual({ ok: true, data: [] });
  });

  it('without the dashboard sign-in the draft fails, and so do site and albums', async () => {
    vi.resetModules();
    fetch.mockImplementation(async () => { throw new TypeError('redirected to the sign-in page'); });
    data = await import('./data.js');
    expect((await data.fetchSite()).error).toBe('NETWORK');
    expect((await data.fetchAlbums()).error).toBe('NETWORK');
  });
});
