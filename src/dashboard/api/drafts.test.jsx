import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { savePath, useAlbums, useManifest, useSaveQueue, useSaveState } from './drafts.jsx';
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
