import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fetchFreshManifest, overlayUnsaved, savePath, useAlbums, useManifest, useSaveQueue, useSaveState, useSite } from './drafts.jsx';
import { keys, useDiscard, usePublish } from './queries.js';
import { siteConfig } from '../../../config/site.config.js';
import { fakeWorker, makeQueryClient, Providers } from '../test-utils.jsx';

const DRAFT = {
  site: { name: 'D', bio: '', hero: null },
  albums: [{ slug: 'notte', title: 'Notte', description: '', coverName: null }],
  albumSummaries: { notte: { photoCount: 1, firstPhoto: 'a.webp' } },
  hasDraft: false,
};
const DRAFT_EDITED = { ...DRAFT, albums: [{ ...DRAFT.albums[0], title: 'Edited' }] };
const wrapper = client => ({ children }) => <Providers client={client}>{children}</Providers>;

describe('savePath', () => {
  it('maps each resource to its draft route', () => {
    expect(savePath('albums')).toBe('/api/admin/draft/albums');
    expect(savePath('site')).toBe('/api/admin/draft/site');
    expect(savePath('manifest:notte')).toBe('/api/admin/draft/albums/notte/manifest');
    expect(() => savePath('other')).toThrow();
  });
});

describe('useAlbums', () => {
  it('shows a change at once and saves it through the queue', async () => {
    const fetchMock = fakeWorker({ 'GET /api/admin/draft': DRAFT, 'PUT /api/admin/draft/albums': { ok: true } });
    const { result } = renderHook(() => ({ ...useAlbums(), queue: useSaveQueue(), save: useSaveState() }), { wrapper: wrapper(makeQueryClient()) });
    await waitFor(() => expect(result.current.albums).toHaveLength(1));
    const renamed = [{ ...DRAFT.albums[0], title: 'Notte in montagna' }];
    act(() => { result.current.setAlbums(renamed); });
    await waitFor(() => expect(result.current.albums[0].title).toBe('Notte in montagna'));
    expect(result.current.save.pending).toBe(1);
    await act(() => result.current.queue.flush());
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put[0]).toBe('/api/admin/draft/albums');
    expect(JSON.parse(put[1].body)).toEqual({ albums: renamed });
  });
});

describe('unsaved values win over the server', () => {
  const albumsDraft = { albums: [{ slug: 'notte', title: 'Edited', description: '', coverName: null }] };

  it('overlayUnsaved lays the waiting values over an answer', () => {
    const queue = { holds: key => key === 'albums' || key === 'manifest:notte', valueOf: key => (key === 'albums' ? albumsDraft : []) };
    expect(overlayUnsaved(keys.draft, DRAFT, queue).albums[0].title).toBe('Edited');
    expect(overlayUnsaved(keys.draft, DRAFT, queue).site).toBe(DRAFT.site);
    expect(overlayUnsaved(keys.manifest('notte'), [{ name: 'a.webp' }], queue)).toEqual([]);
    expect(overlayUnsaved(keys.status, { hasDraft: true }, queue)).toEqual({ hasDraft: true });
  });

  it('overlays summaries from queued manifests onto a draft refetch', () => {
    const queuedManifest = [{ name: 'new.webp' }, { name: 'next.webp' }];
    const queue = { holds: key => key === 'manifest:notte', valueOf: () => queuedManifest };
    expect(overlayUnsaved(keys.draft, DRAFT, queue).albumSummaries.notte)
      .toEqual({ photoCount: 2, firstPhoto: 'new.webp' });
  });

  it('a refetch while a change waits (another tab, after publishing) does not show the old list', async () => {
    fakeWorker({ 'GET /api/admin/draft': DRAFT, 'PUT /api/admin/draft/albums': { ok: true } });
    const client = makeQueryClient();
    const { result } = renderHook(() => ({ ...useAlbums(), queue: useSaveQueue() }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.albums).toHaveLength(1));
    act(() => { result.current.queue.pause(); result.current.setAlbums(albumsDraft.albums); });
    await act(() => client.invalidateQueries({ queryKey: keys.draft }));
    await waitFor(() => expect(client.getQueryData(keys.draft).albums[0].title).toBe('Edited'));
    expect(result.current.albums[0].title).toBe('Edited');
  });

  it('a fetch already running when the change is made does not overwrite it', async () => {
    let answer;
    fakeWorker({
      'GET /api/admin/draft': [DRAFT, () => new Promise(resolve => { answer = resolve; })],
      'PUT /api/admin/draft/albums': { ok: true },
    });
    const client = makeQueryClient();
    const { result } = renderHook(() => ({ ...useAlbums(), queue: useSaveQueue() }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.albums).toHaveLength(1));
    act(() => { client.refetchQueries({ queryKey: keys.draft }); });
    act(() => { result.current.queue.pause(); result.current.setAlbums(albumsDraft.albums); });
    await act(async () => { answer(new Response(JSON.stringify(DRAFT), { status: 200 })); });
    await waitFor(() => expect(result.current.albums[0].title).toBe('Edited'));
  });

  it('setAlbums takes a function of the latest list: two quick changes both count', async () => {
    fakeWorker({ 'GET /api/admin/draft': DRAFT, 'PUT /api/admin/draft/albums': { ok: true } });
    const { result } = renderHook(() => useAlbums(), { wrapper: wrapper(makeQueryClient()) });
    await waitFor(() => expect(result.current.albums).toHaveLength(1));
    act(() => {
      result.current.setAlbums(prev => [...prev, { slug: 'a', title: 'A', description: '', coverName: null }]);
      result.current.setAlbums(prev => [...prev, { slug: 'b', title: 'B', description: '', coverName: null }]);
    });
    await waitFor(() => expect(result.current.albums.map(album => album.slug)).toEqual(['notte', 'a', 'b']));
  });
});

describe('before the draft has loaded', () => {
  it('setAlbums does nothing: a list built from nothing would replace every album', async () => {
    const fetchMock = fakeWorker({ 'GET /api/admin/draft': () => new Promise(() => {}), 'PUT /api/admin/draft/albums': { ok: true } });
    const { result } = renderHook(() => ({ ...useAlbums(), queue: useSaveQueue() }), { wrapper: wrapper(makeQueryClient()) });
    let changed;
    act(() => { changed = result.current.setAlbums(prev => [...prev, { slug: 'nuovo', title: 'Nuovo', description: '', coverName: null }], { now: true }); });
    expect(changed).toBe(false);
    await act(() => result.current.queue.flush());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    expect(result.current.albums).toBeUndefined();
  });

  it('setManifest does nothing until the photos have loaded', async () => {
    const fetchMock = fakeWorker({ 'GET /api/admin/draft/albums/notte/manifest': () => new Promise(() => {}) });
    const { result } = renderHook(() => ({ ...useManifest('notte'), queue: useSaveQueue() }), { wrapper: wrapper(makeQueryClient()) });
    let changed;
    act(() => { changed = result.current.setManifest([]); });
    expect(changed).toBe(false);
    await act(() => result.current.queue.flush());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
});

describe('after a save', () => {
  it('a fetch that started before the save and answers after it does not bring the old list back', async () => {
    let answer;
    let finishSave;
    fakeWorker({
      'GET /api/admin/draft': [DRAFT, () => new Promise(resolve => { answer = resolve; }), DRAFT_EDITED],
      'PUT /api/admin/draft/albums': () => new Promise(resolve => { finishSave = resolve; }),
    });
    const client = makeQueryClient();
    const { result } = renderHook(() => ({ ...useAlbums(), queue: useSaveQueue() }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.albums).toHaveLength(1));
    act(() => { result.current.setAlbums(prev => prev.map(album => ({ ...album, title: 'Edited' })), { now: true }); });
    await waitFor(() => expect(finishSave).toBeTypeOf('function'));
    // A refetch (focus, another screen) starts while the save is still on its way…
    act(() => { client.refetchQueries({ queryKey: keys.draft }); });
    await waitFor(() => expect(answer).toBeTypeOf('function'));
    // …the save commits, then the old answer arrives.
    await act(async () => { finishSave(new Response('{"ok":true}', { status: 200 })); });
    await act(async () => { answer(new Response(JSON.stringify(DRAFT), { status: 200 })); });
    await waitFor(() => expect(result.current.queue.busy()).toBe(false));
    await waitFor(() => expect(client.isFetching({ queryKey: keys.draft })).toBe(0));
    expect(result.current.albums[0].title).toBe('Edited');
  });
});

describe('useManifest', () => {
  it('forces a network read even when the query cache already contains a fresh-looking list', async () => {
    const fetchMock = fakeWorker({ 'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'from-window-a.webp' }]] });
    const client = makeQueryClient();
    client.setQueryData(keys.manifest('notte'), [{ name: 'old.webp' }]);

    await expect(fetchFreshManifest(client, 'notte')).resolves.toEqual([{ name: 'from-window-a.webp' }]);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/admin/draft/albums/notte/manifest')).toHaveLength(1);
  });

  it('never reads an address that is not an album address (it comes from the URL)', async () => {
    const fetchMock = fakeWorker({});
    const { result } = renderHook(() => useManifest('..%2Fstatus'), { wrapper: wrapper(makeQueryClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the draft manifest and saves changes under its album', async () => {
    const fetchMock = fakeWorker({
      // An array of answers is a queue: a manifest (itself an array) goes inside one.
      'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp', width: 4, height: 3 }]],
      'PUT /api/admin/draft/albums/notte/manifest': { ok: true },
    });
    const { result } = renderHook(() => ({ ...useManifest('notte'), queue: useSaveQueue() }), { wrapper: wrapper(makeQueryClient()) });
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    act(() => { result.current.setManifest([]); });
    // The query tells its components on the next tick.
    await waitFor(() => expect(result.current.photos).toEqual([]));
    await act(() => result.current.queue.flush());
    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/draft/albums/notte/manifest' && init?.method === 'PUT')).toBe(true);
  });

  it('updates the gallery summary immediately and persists it only with the manifest', async () => {
    const fetchMock = fakeWorker({
      'GET /api/admin/draft': DRAFT,
      'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp' }]],
      'PUT /api/admin/draft/albums/notte/manifest': { ok: true },
    });
    const client = makeQueryClient();
    const { result } = renderHook(() => ({ ...useManifest('notte'), albums: useAlbums(), queue: useSaveQueue() }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    await waitFor(() => expect(client.getQueryData(keys.draft)?.albumSummaries?.notte?.photoCount).toBe(1));
    act(() => { result.current.setManifest([{ name: 'b.webp' }, { name: 'c.webp' }]); });
    await waitFor(() => expect(client.getQueryData(keys.draft).albumSummaries.notte)
      .toEqual({ photoCount: 2, firstPhoto: 'b.webp' }));
    await act(() => result.current.queue.flush());
    expect(fetchMock.mock.calls.filter(([path, init]) => path.endsWith('/manifest') && init?.method === 'PUT'))
      .toHaveLength(1);
    expect(JSON.parse(fetchMock.mock.calls.find(([path, init]) => path.endsWith('/manifest') && init?.method === 'PUT')[1].body))
      .toEqual([{ name: 'b.webp' }, { name: 'c.webp' }]);
  });

  it('overlays a pending manifest after refetch and invalidates both caches on save', async () => {
    let resolveRefetch;
    const refreshed = { ...DRAFT, albumSummaries: { notte: { photoCount: 2, firstPhoto: 'fresh.webp' } } };
    const fetchMock = fakeWorker({
      'GET /api/admin/draft': [DRAFT, () => new Promise(resolve => { resolveRefetch = resolve; }), refreshed],
      'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp' }]],
      'PUT /api/admin/draft/albums/notte/manifest': { ok: true },
    });
    const client = makeQueryClient();
    const { result } = renderHook(() => ({ ...useManifest('notte'), albums: useAlbums(), queue: useSaveQueue() }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    await waitFor(() => expect(client.getQueryData(keys.draft)).toBeDefined());
    act(() => result.current.queue.pause());
    act(() => result.current.setManifest([{ name: 'fresh.webp' }, { name: 'second.webp' }]));
    act(() => { client.refetchQueries({ queryKey: keys.draft }); });
    await waitFor(() => expect(resolveRefetch).toBeTypeOf('function'));
    await act(async () => resolveRefetch(new Response(JSON.stringify(DRAFT), { status: 200 })));
    expect(client.getQueryData(keys.draft).albumSummaries.notte)
      .toEqual({ photoCount: 2, firstPhoto: 'fresh.webp' });
    act(() => result.current.queue.resume());
    await act(() => result.current.queue.flush());
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path === '/api/admin/draft').length).toBe(3));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path.endsWith('/manifest')).length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(client.getQueryData(keys.draft).albumSummaries.notte)
      .toEqual(refreshed.albumSummaries.notte));
  });
});

describe('draft refresh after discard and publish', () => {
  it('replaces gallery summaries with the server state after discard', async () => {
    const fresh = { ...DRAFT, albumSummaries: { notte: { photoCount: 0, firstPhoto: null } } };
    const fetchMock = fakeWorker({
      'GET /api/admin/draft': [DRAFT, fresh],
      'DELETE /api/admin/draft': { ok: true },
    });
    const client = makeQueryClient();
    const { result } = renderHook(() => ({ albums: useAlbums(), discard: useDiscard() }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.albums.data).toBeDefined());
    act(() => result.current.discard.mutate());
    await waitFor(() => expect(client.getQueryData(keys.draft).albumSummaries.notte).toEqual(fresh.albumSummaries.notte));
    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/draft' && init?.method === 'DELETE')).toBe(true);
  });

  it('replaces gallery summaries with the server state after publish', async () => {
    const fresh = { ...DRAFT, albumSummaries: { notte: { photoCount: 0, firstPhoto: null } } };
    const fetchMock = fakeWorker({
      'GET /api/admin/draft': [DRAFT, fresh],
      'POST /api/admin/publish': { done: true, copied: 0, remaining: 0 },
    });
    const client = makeQueryClient();
    const { result } = renderHook(() => ({ albums: useAlbums(), publish: usePublish() }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.albums.data).toBeDefined());
    act(() => result.current.publish.mutate());
    await waitFor(() => expect(client.getQueryData(keys.draft).albumSummaries.notte).toEqual(fresh.albumSummaries.notte));
    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/publish' && init?.method === 'POST')).toBe(true);
  });
});

describe('useSite', () => {
  it('gives the site in the current shape and saves a change of it', async () => {
    const legacy = { ...DRAFT, site: { name: 'D', bio: '', hero: null, social: { instagram: 'https://instagram.com/d' } } };
    const fetchMock = fakeWorker({ 'GET /api/admin/draft': legacy, 'PUT /api/admin/draft/site': { ok: true } });
    const { result } = renderHook(() => ({ ...useSite(), queue: useSaveQueue() }), { wrapper: wrapper(makeQueryClient()) });
    await waitFor(() => expect(result.current.site).toBeDefined());
    expect(result.current.site.links).toEqual([{ url: 'https://instagram.com/d' }]);
    act(() => { result.current.setSite(prev => ({ ...prev, bio: 'Fotografo' })); });
    await waitFor(() => expect(result.current.site.bio).toBe('Fotografo'));
    await act(() => result.current.queue.flush());
    const put = fetchMock.mock.calls.find(([path, init]) => path === '/api/admin/draft/site' && init?.method === 'PUT');
    // Saved in the current shape: links, no social.
    expect(JSON.parse(put[1].body)).toEqual({ name: 'D', bio: 'Fotografo', hero: null, links: [{ url: 'https://instagram.com/d' }], texts: {} });
  });

  it('on a new installation starts from config/site.config.js and saves it as the first site', async () => {
    const fetchMock = fakeWorker({ 'GET /api/admin/draft': { ...DRAFT, site: null }, 'PUT /api/admin/draft/site': { ok: true } });
    const { result } = renderHook(() => ({ ...useSite(), queue: useSaveQueue() }), { wrapper: wrapper(makeQueryClient()) });
    await waitFor(() => expect(result.current.site).toBeDefined());
    expect(result.current.site.name).toBe(siteConfig.name);
    act(() => { result.current.setSite(prev => ({ ...prev, bio: 'Fotografo' })); });
    await act(() => result.current.queue.flush());
    const put = fetchMock.mock.calls.find(([path, init]) => path === '/api/admin/draft/site' && init?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toMatchObject({ name: siteConfig.name, bio: 'Fotografo', texts: {} });
  });

  it('does nothing before the draft has loaded', () => {
    const fetchMock = fakeWorker({ 'GET /api/admin/draft': () => new Promise(() => {}) });
    const { result } = renderHook(() => useSite(), { wrapper: wrapper(makeQueryClient()) });
    let changed;
    act(() => { changed = result.current.setSite(prev => ({ ...prev, bio: 'x' })); });
    expect(changed).toBe(false);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('a refused site stays on screen while the albums keep saving', async () => {
    const fetchMock = fakeWorker({
      'GET /api/admin/draft': DRAFT,
      'PUT /api/admin/draft/site': { status: 400, body: { error: 'site.name is required' } },
      'PUT /api/admin/draft/albums': { ok: true },
    });
    const client = makeQueryClient();
    const { result } = renderHook(() => ({ site: useSite(), albums: useAlbums(), queue: useSaveQueue(), save: useSaveState() }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.site.site).toBeDefined());
    act(() => {
      result.current.site.setSite(prev => ({ ...prev, name: '' }));
      result.current.albums.setAlbums(prev => prev.map(album => ({ ...album, title: 'Edited' })));
    });
    await act(() => result.current.queue.flush());
    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/draft/albums' && init?.method === 'PUT')).toBe(true);
    expect(result.current.save.error).toEqual({ key: 'site', message: 'site.name is required', refused: true });
    // A refetch keeps what was typed on screen.
    await act(() => client.invalidateQueries({ queryKey: keys.draft }));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(result.current.site.site.name).toBe('');
  });
});
