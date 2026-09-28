import { beforeAll, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { texts } from '../../../../config/texts.config.js';
import { routes } from '../../App.jsx';
import { useSaveQueue } from '../../api/drafts.jsx';
import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers } from '../../test-utils.jsx';

const t = texts.admin.album;
beforeAll(installDialogPolyfill);

const NOTTE = { slug: 'notte', title: 'Notte', description: 'Cieli', coverName: 'b.webp' };
const DRAFT = { site: { name: 'D', bio: '', hero: null }, albums: [NOTTE, { slug: 'viaggio', title: 'Viaggio', description: '', coverName: null }], hasDraft: false };
const STATUS = { hasDraft: false, publishing: false, changes: [] };
const photo = name => ({ name, width: 4, height: 3 });

let queue;
function QueueSpy() { queue = useSaveQueue(); return null; }
function renderAt(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<Providers client={makeQueryClient()}><QueueSpy /><RouterProvider router={router} /></Providers>);
  return router;
}
function worker(extra = {}) {
  return fakeWorker({
    'GET /api/admin/draft': DRAFT,
    'GET /api/admin/draft/status': STATUS,
    'GET /api/admin/draft/albums/notte/manifest': [[photo('a.webp'), photo('b.webp'), photo('c.webp')]],
    'PUT /api/admin/draft/albums': { ok: true },
    'PUT /api/admin/draft/albums/notte/manifest': { ok: true },
    ...extra,
  });
}
const lastPut = (fetchMock, path) => {
  const call = fetchMock.mock.calls.filter(([p, init]) => p === path && init?.method === 'PUT').at(-1);
  return call && JSON.parse(call[1].body);
};
const photoNames = () => [...document.querySelectorAll('.dash-photo img')].map(img => img.getAttribute('src').split('/').pop());

describe('open album', () => {
  it('shows title, subtitle and the photos in order, the cover marked', async () => {
    worker();
    renderAt('/album/notte');
    expect((await screen.findByLabelText(t.titleLabel)).value).toBe('Notte');
    expect(screen.getByLabelText(t.subtitleLabel).value).toBe('Cieli');
    await waitFor(() => expect(photoNames()).toEqual(['a.webp', 'b.webp', 'c.webp']));
    const cover = screen.getByRole('button', { name: `${t.coverAsButton} · Photo 2` });
    expect(cover.getAttribute('aria-pressed')).toBe('true');
  });

  it('saves title and subtitle as they are typed, never an empty title', async () => {
    const fetchMock = worker();
    renderAt('/album/notte');
    const title = await screen.findByLabelText(t.titleLabel);
    fireEvent.change(title, { target: { value: '' } });
    expect(screen.getByRole('alert').textContent).toBe(t.titleRequired);
    fireEvent.change(title, { target: { value: 'Notte in montagna' } });
    fireEvent.change(screen.getByLabelText(t.subtitleLabel), { target: { value: 'Cieli stellati' } });
    await act(() => queue.flush());
    expect(lastPut(fetchMock, '/api/admin/draft/albums').albums[0]).toEqual({ ...NOTTE, title: 'Notte in montagna', description: 'Cieli stellati' });
  });

  it('chooses the cover', async () => {
    const fetchMock = worker();
    renderAt('/album/notte');
    fireEvent.click(await screen.findByRole('button', { name: `${t.coverAsButton} · Photo 3` }));
    await act(() => queue.flush());
    expect(lastPut(fetchMock, '/api/admin/draft/albums').albums[0].coverName).toBe('c.webp');
  });

  it('reorders the photos with the arrows', async () => {
    const fetchMock = worker();
    renderAt('/album/notte');
    fireEvent.click(await screen.findByRole('button', { name: texts.admin.albums.reorder }));
    fireEvent.click(screen.getByRole('button', { name: 'Move photo 3 earlier' }));
    await waitFor(() => expect(photoNames()).toEqual(['a.webp', 'c.webp', 'b.webp']));
    // The first photo cannot move earlier: its arrow says so but keeps the focus.
    const first = screen.getByRole('button', { name: 'Move photo 1 earlier' });
    expect([first.disabled, first.getAttribute('aria-disabled')]).toEqual([false, 'true']);
    await act(() => queue.flush());
    expect(lastPut(fetchMock, '/api/admin/draft/albums/notte/manifest').map(p => p.name)).toEqual(['a.webp', 'c.webp', 'b.webp']);
  });

  it('deletes a photo after a confirmation; deleting the cover clears it', async () => {
    const fetchMock = worker({ 'DELETE /api/admin/staging/notte/b.webp': { ok: true } });
    renderAt('/album/notte');
    fireEvent.click(await screen.findByRole('button', { name: `${t.deletePhoto} · Photo 2` }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.deletePhoto }));
    await waitFor(() => expect(photoNames()).toEqual(['a.webp', 'c.webp']));
    await act(() => queue.flush());
    expect(lastPut(fetchMock, '/api/admin/draft/albums/notte/manifest').map(p => p.name)).toEqual(['a.webp', 'c.webp']);
    expect(lastPut(fetchMock, '/api/admin/draft/albums').albums[0].coverName).toBeNull();
    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/staging/notte/b.webp' && init?.method === 'DELETE')).toBe(true);
  });

  it('deletes the album after a confirmation and goes back to the gallery', async () => {
    const fetchMock = worker();
    const router = renderAt('/album/notte');
    fireEvent.click(await screen.findByRole('button', { name: t.deleteAlbum }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete "Notte"?' });
    fireEvent.click(within(dialog).getByRole('button', { name: t.deleteAlbum }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await act(() => queue.flush());
    expect(lastPut(fetchMock, '/api/admin/draft/albums').albums.map(a => a.slug)).toEqual(['viaggio']);
  });

  it('an album not in the draft says so, with the way back', async () => {
    worker();
    renderAt('/album/altro');
    expect((await screen.findByRole('alert')).textContent).toBe(t.notFound);
    expect(screen.getByRole('link', { name: texts.admin.common.allAlbums }).getAttribute('href')).toBe('/');
  });

  it('reorders the photos by dragging one onto another, dropped on the image', async () => {
    const fetchMock = worker();
    renderAt('/album/notte');
    fireEvent.click(await screen.findByRole('button', { name: texts.admin.albums.reorder }));
    const tiles = document.querySelectorAll('.dash-photo');
    fireEvent.dragStart(tiles[2]);
    fireEvent.drop(tiles[0].querySelector('img'));
    await waitFor(() => expect(photoNames()).toEqual(['c.webp', 'a.webp', 'b.webp']));
    await act(() => queue.flush());
    expect(lastPut(fetchMock, '/api/admin/draft/albums/notte/manifest').map(p => p.name)).toEqual(['c.webp', 'a.webp', 'b.webp']);
  });

  it('after Discard the title shows what is left in the draft, and is not saved back', async () => {
    const fetchMock = worker({
      'GET /api/admin/draft/status': { hasDraft: true, publishing: false, changes: [{ type: 'album-changed', slug: 'notte' }] },
      'DELETE /api/admin/draft': { ok: true },
    });
    renderAt('/album/notte');
    const title = await screen.findByLabelText(t.titleLabel);
    fireEvent.change(title, { target: { value: 'Sbagliato' } });
    fireEvent.click(await screen.findByRole('button', { name: texts.admin.publish.discard }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: texts.admin.publish.discardConfirm }));
    await waitFor(() => expect(screen.getByLabelText(t.titleLabel).value).toBe('Notte'));
    fireEvent.change(screen.getByLabelText(t.subtitleLabel), { target: { value: 'Cieli stellati' } });
    await act(() => queue.flush());
    expect(lastPut(fetchMock, '/api/admin/draft/albums').albums[0]).toEqual({ ...NOTTE, description: 'Cieli stellati' });
  });
});
