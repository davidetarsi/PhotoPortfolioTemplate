import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { texts } from '../../config/texts.config.js';
import { routes } from './App.jsx';
import { fakeWorker, installDialogPolyfill, makeQueryClient } from './test-utils.jsx';

/** The whole dashboard at a hash path, e.g. '/album/notte', with the real routes in memory. */
function renderDashboard(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...render(<QueryClientProvider client={makeQueryClient()}><RouterProvider router={router} /></QueryClientProvider>) };
}

beforeAll(installDialogPolyfill);
afterEach(() => vi.unstubAllGlobals());

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
    expect(await screen.findByRole('heading', { name: 'notte' })).toBeTruthy();
  });

  it('an unknown address goes back to the albums', async () => {
    fakeWorker({ 'GET /api/admin/draft': DRAFT, 'GET /api/admin/draft/status': STATUS });
    const { router } = renderDashboard('/nowhere');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('says so when the draft cannot be loaded', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': STATUS });
    renderDashboard('/');
    expect((await screen.findByRole('alert')).textContent).toBe(texts.admin.common.loadError);
  });
});
