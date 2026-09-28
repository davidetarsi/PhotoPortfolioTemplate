import { beforeAll, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { texts } from '../../../../config/texts.config.js';
import { routes } from '../../App.jsx';
import { useSaveQueue } from '../../api/drafts.jsx';
import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers } from '../../test-utils.jsx';

const t = texts.admin.albums;
beforeAll(installDialogPolyfill);

const album = (slug, extra = {}) => ({ slug, title: slug[0].toUpperCase() + slug.slice(1), description: '', coverName: null, ...extra });
const DRAFT = { site: { name: 'D', bio: '', hero: null }, albums: [album('notte', { coverName: 'c.webp' }), album('viaggio')], hasDraft: false };
const STATUS = { hasDraft: false, publishing: false, changes: [] };
const photo = name => ({ name, width: 4, height: 3 });

let queue;
function QueueSpy() { queue = useSaveQueue(); return null; }

function renderAt(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<Providers client={makeQueryClient()}><QueueSpy /><RouterProvider router={router} /></Providers>);
  return router;
}

function worker(extra = {}) {
  return fakeWorker({
    'GET /api/admin/draft': DRAFT,
    'GET /api/admin/draft/status': STATUS,
    'GET /api/admin/draft/albums/notte/manifest': [[photo('a.webp'), photo('c.webp')]],
    'GET /api/admin/draft/albums/viaggio/manifest': [[]],
    'PUT /api/admin/draft/albums': { ok: true },
    ...extra,
  });
}
// "New album" is enabled once the albums have loaded.
async function createButton() {
  const button = await screen.findByRole('button', { name: t.create });
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}
const puts = (fetchMock, path) => fetchMock.mock.calls
  .filter(([p, init]) => p === path && init?.method === 'PUT').map(([, init]) => JSON.parse(init.body));

describe('albums gallery', () => {
  it('shows each album with its cover and number of photos, linking to it', async () => {
    worker();
    renderAt('/');
    const notte = await screen.findByRole('link', { name: /Notte/ });
    expect(notte.getAttribute('href')).toBe('/album/notte');
    expect(notte.querySelector('img').getAttribute('src')).toBe('/api/admin/preview/photo/notte/c.webp');
    expect(await within(notte).findByText('2 photos')).toBeTruthy();
    const viaggio = screen.getByRole('link', { name: /Viaggio/ });
    expect(await within(viaggio).findByText(t.photoCountNone)).toBeTruthy();
    expect(viaggio.querySelector('img')).toBeNull();
  });

  it('creates an album with an empty manifest and opens it', async () => {
    const fetchMock = worker({ 'PUT /api/admin/draft/albums/luci/manifest': { ok: true }, 'GET /api/admin/draft/albums/luci/manifest': [[]] });
    const router = renderAt('/');
    fireEvent.click(await createButton());
    const sheet = await screen.findByRole('dialog', { name: t.create });
    fireEvent.change(within(sheet).getByLabelText(t.titleLabel), { target: { value: 'Luci' } });
    fireEvent.click(within(sheet).getByRole('button', { name: t.createConfirm }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/album/luci'));
    await act(() => queue.flush());
    expect(puts(fetchMock, '/api/admin/draft/albums').at(-1).albums.map(a => a.slug)).toEqual(['notte', 'viaggio', 'luci']);
    expect(puts(fetchMock, '/api/admin/draft/albums/luci/manifest')).toEqual([[]]);
  });

  it('offers a new album only once the albums have loaded: a list built from nothing would replace them all', async () => {
    const fetchMock = worker({ 'GET /api/admin/draft': () => new Promise(() => {}) });
    renderAt('/');
    const button = await screen.findByRole('button', { name: t.create });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(screen.queryByRole('dialog', { name: t.create })).toBeNull();
    expect(puts(fetchMock, '/api/admin/draft/albums')).toEqual([]);
  });

  it('refuses a title that is taken or reserved, saying why', async () => {
    worker();
    renderAt('/');
    fireEvent.click(await createButton());
    const sheet = await screen.findByRole('dialog', { name: t.create });
    const input = within(sheet).getByLabelText(t.titleLabel);
    fireEvent.change(input, { target: { value: 'Notte' } });
    fireEvent.click(within(sheet).getByRole('button', { name: t.createConfirm }));
    expect(within(sheet).getByRole('alert').textContent).toBe('An album "notte" already exists.');
    fireEvent.change(input, { target: { value: 'Admin' } });
    fireEvent.click(within(sheet).getByRole('button', { name: t.createConfirm }));
    expect(within(sheet).getByRole('alert').textContent).toBe('"admin" is a reserved name.');
  });

  it('reorders with the arrows and saves the new order', async () => {
    const fetchMock = worker();
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: t.reorder }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Viaggio earlier' }));
    await waitFor(() => expect([...document.querySelectorAll('.dash-album-card__title')].map(el => el.textContent)).toEqual(['Viaggio', 'Notte']));
    // At the top the arrow stays focusable (a disabled button would drop the focus) and does nothing.
    const top = screen.getByRole('button', { name: 'Move Viaggio earlier' });
    expect(top.disabled).toBe(false);
    expect(top.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(top);
    await act(() => queue.flush());
    expect(puts(fetchMock, '/api/admin/draft/albums').map(body => body.albums.map(a => a.slug))).toEqual([['viaggio', 'notte']]);
  });

  it('reorders by dragging a card onto another and saves the new order', async () => {
    const fetchMock = worker();
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: t.reorder }));
    const [notte, viaggio] = document.querySelectorAll('.dash-album-card');
    fireEvent.dragStart(viaggio);
    // Dropped on the title inside the card, as a mouse usually does.
    fireEvent.drop(notte.querySelector('.dash-album-card__title'));
    await waitFor(() => expect([...document.querySelectorAll('.dash-album-card__title')].map(el => el.textContent)).toEqual(['Viaggio', 'Notte']));
    await act(() => queue.flush());
    expect(puts(fetchMock, '/api/admin/draft/albums').at(-1).albums.map(a => a.slug)).toEqual(['viaggio', 'notte']);
  });

  it('says there are no albums yet', async () => {
    fakeWorker({ 'GET /api/admin/draft': { ...DRAFT, albums: [] }, 'GET /api/admin/draft/status': STATUS });
    renderAt('/');
    expect(await screen.findByText(t.empty)).toBeTruthy();
  });
});
