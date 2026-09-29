import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { texts } from '../../config/texts.config.js';
import { DraftState, routes } from './App.jsx';
import { formatText } from '../utils/formatText.js';
import { useSaveQueue } from './api/drafts.jsx';
import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers, renderWithQuery } from './test-utils.jsx';

vi.mock('./lib/encoder.js', () => ({
  makeProcessDeps: async () => ({
    decode: async () => ({ bitmap: {}, width: 4, height: 3 }),
    encode: async () => new Blob(['webp'], { type: 'image/webp' }),
    extractCapturedAt: async () => null,
  }),
}));

/** The whole dashboard at a hash path, e.g. '/album/notte', with the real routes in memory. */
function renderDashboard(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...render(<Providers client={makeQueryClient()}><RouterProvider router={router} /></Providers>) };
}

beforeAll(installDialogPolyfill);

const DRAFT = { site: { name: 'Davide Tarsi', bio: '', hero: null }, albums: [], hasDraft: false };
const STATUS = { hasDraft: false, publishing: false, changes: [] };

describe('dashboard frame', () => {
  it('sets React act support in Vitest setup', () => {
    expect(globalThis.IS_REACT_ACT_ENVIRONMENT).toBe(true);
  });

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
    await act(async () => { await router.navigate('/album/notte'); });
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

  it('a value the Worker refuses is explained without Retry: the next change saves it', async () => {
    fakeWorker({
      'GET /api/admin/draft/status': STATUS,
      'PUT /api/admin/draft/site': { status: 400, body: { error: 'site.name is required' } },
    });
    let queue;
    function WithQueue() { queue = useSaveQueue(); return <DraftState />; }
    renderWithQuery(<WithQueue />);
    await screen.findByText(texts.admin.publish.allPublished);
    act(() => { queue.set('site', { name: '' }); });
    await act(() => queue.flush());
    expect(screen.getByRole('alert').textContent).toBe(formatText(texts.admin.publish.saveRefused, { message: 'site.name is required' }));
    expect(screen.queryByRole('button', { name: texts.admin.publish.retry })).toBeNull();
  });

  it('says so when the draft cannot be loaded', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': STATUS });
    renderDashboard('/');
    expect((await screen.findByRole('alert')).textContent).toBe(texts.admin.common.loadError);
  });

  it('keeps a pending upload running and announces it after navigating away and back', async () => {
    let finish;
    const photos = [{ name: 'a.webp', width: 4, height: 3 }];
    fakeWorker({
      'GET /api/admin/draft': { ...DRAFT, albums: [{ slug: 'notte', title: 'Notte', coverName: null }] },
      'GET /api/admin/draft/albums/notte/manifest': () => photos,
      'PUT /api/admin/staging/notte/bosco.webp': () => new Promise(resolve => { finish = resolve; }),
    });
    const { router } = renderDashboard('/album/notte');
    const input = await screen.findByLabelText(texts.admin.album.upload);
    fireEvent.change(input, { target: { files: [new File(['x'], 'bosco.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(document.querySelector('input[type=file]').disabled).toBe(true));
    const live = screen.getByRole('status', { name: texts.admin.album.uploadAnnouncementLabel });
    expect(live.textContent).toContain(texts.admin.album.uploadStartedOne);
    expect(live.textContent).toContain(formatText(texts.admin.album.uploadProgress, { nome: 'bosco.webp', fase: texts.admin.album.uploadPhases.uploading }));
    await act(async () => { await router.navigate('/site'); });
    expect(await screen.findByRole('heading', { name: texts.admin.site.sectionTitle })).toBeTruthy();
    expect(live.textContent).toContain(formatText(texts.admin.album.uploadProgress, { nome: 'bosco.webp', fase: texts.admin.album.uploadPhases.uploading }));
    await act(async () => { finish(new Response('{"ok":true}', { status: 200 })); });
    await act(async () => { await router.navigate('/album/notte'); });
    expect(await screen.findByText(texts.admin.album.uploadSuccessOne, { selector: '.dash-upload__summary p' })).toBeTruthy();
  });

  it('keeps an upload error and its retry available after leaving and reopening the album', async () => {
    fakeWorker({
      'GET /api/admin/draft': { ...DRAFT, albums: [{ slug: 'notte', title: 'Notte', coverName: null }] },
      'GET /api/admin/draft/albums/notte/manifest': () => [{ name: 'a.webp', width: 4, height: 3 }],
      'PUT /api/admin/staging/notte/bosco.webp': [{ status: 500, body: { error: 'STORAGE_ERROR' } }, { ok: true }],
    });
    const { router } = renderDashboard('/album/notte');
    fireEvent.change(await screen.findByLabelText(texts.admin.album.upload), { target: { files: [new File(['x'], 'bosco.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    await act(async () => { await router.navigate('/messages'); });
    expect(await screen.findByRole('heading', { name: texts.admin.messages.sectionTitle })).toBeTruthy();
    await act(async () => { await router.navigate('/album/notte'); });
    await waitFor(() => expect(document.querySelector('.dash-upload__summary')?.textContent).toContain(
      texts.admin.album.uploadPartial.replace('{uploaded}', '0').replace('{failed}', '1'),
    ));
    fireEvent.click(await screen.findByRole('button', { name: texts.admin.album.retry }));
    expect(await screen.findByText(texts.admin.album.uploadSuccessOne, { selector: '.dash-upload__summary p' })).toBeTruthy();
  });

  it('prevents file-drop navigation on Albums, Site, and Messages', async () => {
    fakeWorker({ 'GET /api/admin/draft': DRAFT, 'GET /api/admin/draft/status': STATUS });
    const { router } = renderDashboard('/');
    const transfer = { types: ['Files'], files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] };
    for (const [path, heading] of [
      ['/', null],
      ['/site', texts.admin.site.sectionTitle],
      ['/messages', texts.admin.messages.sectionTitle],
    ]) {
      await act(async () => { await router.navigate(path); });
      if (heading) await screen.findByRole('heading', { name: heading });
      expect(fireEvent.dragOver(document.body, { dataTransfer: transfer })).toBe(false);
      expect(fireEvent.drop(document.body, { dataTransfer: transfer })).toBe(false);
    }
  });

  it('does not block uploads because the server reports an interrupted publication', async () => {
    fakeWorker({
      'GET /api/admin/draft': { ...DRAFT, albums: [{ slug: 'notte', title: 'Notte', coverName: null }] },
      'GET /api/admin/draft/status': { hasDraft: true, publishing: true, changes: [] },
      'GET /api/admin/draft/albums/notte/manifest': () => [{ name: 'a.webp', width: 4, height: 3 }],
    });
    renderDashboard('/album/notte');
    const input = await screen.findByLabelText(texts.admin.album.upload);
    expect(input.disabled).toBe(false);
  });
});
