import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { overlayUnsaved, savePath, useAlbums, useManifest, useSaveQueue, useSaveState } from './drafts.jsx';
import { keys } from './queries.js';
import { fakeWorker, makeQueryClient, Providers } from '../test-utils.jsx';

const DRAFT = { site: { name: 'D', bio: '', hero: null }, albums: [{ slug: 'notte', title: 'Notte', description: '', coverName: null }], hasDraft: false };
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

describe('useManifest', () => {
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
});
