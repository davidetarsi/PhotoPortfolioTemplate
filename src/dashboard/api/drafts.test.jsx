import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { overlayUnsaved, savePath, useAlbums, useManifest, useSaveQueue, useSaveState } from './drafts.jsx';
import { keys } from './queries.js';
import { fakeWorker, makeQueryClient, Providers } from '../test-utils.jsx';

const DRAFT = { site: { name: 'D', bio: '', hero: null }, albums: [{ slug: 'notte', title: 'Notte', description: '', coverName: null }], hasDraft: false };
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
});
