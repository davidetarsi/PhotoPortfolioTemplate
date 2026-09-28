import { beforeAll, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { texts } from '../../config/texts.config.js';
import { DraftState, routes } from './App.jsx';
import { useSaveQueue } from './api/drafts.jsx';
import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers, renderWithQuery } from './test-utils.jsx';

/** The whole dashboard at a hash path, e.g. '/album/notte', with the real routes in memory. */
function renderDashboard(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...render(<Providers client={makeQueryClient()}><RouterProvider router={router} /></Providers>) };
}

beforeAll(installDialogPolyfill);

const DRAFT = { site: { name: 'Davide Tarsi', bio: '', hero: null }, albums: [], hasDraft: false };
const STATUS = { hasDraft: false, publishing: false, changes: [] };

describe('dashboard frame', () => {
  it('shows the site name, the state, and the three sections', async () => {
    fakeWorker({ 'GET /api/admin/draft': DRAFT, 'GET /api/admin/draft/status': STATUS });
    renderDashboard('/');
    expect(await screen.findByText('Davide Tarsi')).toBeTruthy();
    expect(await screen.findByText(texts.admin.publish.allPublished)).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: texts.admin.common.navLabel });
    expect([...nav.querySelectorAll('a')].map(a => a.textContent)).toEqual([
      texts.admin.common.navAlbums, texts.admin.common.navSite, texts.admin.common.navMessages,
    ]);
    expect(screen.getByRole('link', { name: texts.admin.common.navAlbums }).className).toContain('active');
  });

  it('moves between sections and opens an album by address', async () => {
    fakeWorker({ 'GET /api/admin/draft': DRAFT, 'GET /api/admin/draft/status': STATUS });
    const { router } = renderDashboard('/');
    fireEvent.click(await screen.findByRole('link', { name: texts.admin.common.navSite }));
    expect(await screen.findByRole('heading', { name: texts.admin.site.sectionTitle })).toBeTruthy();
    await router.navigate('/album/notte');
    // Not in this draft: the album screen says so.
    expect(await screen.findByText(texts.admin.album.notFound)).toBeTruthy();
  });

  it('an unknown address goes back to the albums', async () => {
    fakeWorker({ 'GET /api/admin/draft': DRAFT, 'GET /api/admin/draft/status': STATUS });
    const { router } = renderDashboard('/nowhere');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('the state says saving, then not saved with Retry when a save fails, then saved', async () => {
    fakeWorker({
      'GET /api/admin/draft/status': [STATUS, { hasDraft: true, publishing: false, changes: [] }],
      'PUT /api/admin/draft/albums': [{ status: 500, body: { error: 'STORAGE_ERROR' } }, { ok: true }],
    });
    let queue;
    function WithQueue() { queue = useSaveQueue(); return <DraftState />; }
    renderWithQuery(<WithQueue />);
    await screen.findByText(texts.admin.publish.allPublished);
    act(() => { queue.set('albums', { albums: [] }); });
    expect(screen.getByText(texts.admin.publish.saving)).toBeTruthy();
    await act(() => queue.flush());
    expect(screen.getByRole('alert').textContent).toContain('STORAGE_ERROR');
    fireEvent.click(screen.getByRole('button', { name: texts.admin.publish.retry }));
    expect(await screen.findByText(texts.admin.publish.draftSaved)).toBeTruthy();
  });

  it('says so when the draft cannot be loaded', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': STATUS });
    renderDashboard('/');
    expect((await screen.findByRole('alert')).textContent).toBe(texts.admin.common.loadError);
  });
});
