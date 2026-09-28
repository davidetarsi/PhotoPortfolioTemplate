import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { texts } from '../../../../config/texts.config.js';
import { PublishBar, describeProblem } from './PublishBar.jsx';
import { fakeWorker, installDialogPolyfill, makeQueryClient, renderWithQuery } from '../../test-utils.jsx';

const t = texts.admin.publish;
beforeAll(installDialogPolyfill);
afterEach(() => vi.unstubAllGlobals());

const STATUS_DRAFT = { hasDraft: true, publishing: false, changes: [{ type: 'site' }, { type: 'album-added', slug: 'notte' }] };
const STATUS_CLEAN = { hasDraft: false, publishing: false, changes: [] };

describe('PublishBar', () => {
  it('is hidden when everything is published', async () => {
    const fetchMock = fakeWorker({ 'GET /api/admin/draft/status': STATUS_CLEAN });
    const { container } = renderWithQuery(<PublishBar />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.querySelector('.dash-publish')).toBeNull();
  });

  it('counts the changes and links to the preview of the whole site', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': STATUS_DRAFT });
    renderWithQuery(<PublishBar />);
    expect(await screen.findByText('2 changes')).toBeTruthy();
    const preview = screen.getByRole('link', { name: t.preview });
    expect(preview.getAttribute('href')).toBe('/?preview=1');
  });

  it('publishes in steps until done, showing the photos left', async () => {
    const fetchMock = fakeWorker({
      'GET /api/admin/draft/status': [STATUS_DRAFT, STATUS_CLEAN],
      'POST /api/admin/publish': [{ done: false, copied: 25, remaining: 5 }, { done: true, copied: 5, remaining: 0 }],
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.publish }));
    expect(await screen.findByText(t.published)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
  });

  it('lists what stops the publication', async () => {
    fakeWorker({
      'GET /api/admin/draft/status': STATUS_DRAFT,
      'POST /api/admin/publish': { status: 409, body: { error: 'PUBLISH_CHECK_FAILED', problems: [{ slug: 'notte', name: 'a.webp', reason: 'PHOTO_MISSING' }] } },
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.publish }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(describeProblem({ slug: 'notte', name: 'a.webp', reason: 'PHOTO_MISSING' }))).toBeTruthy();
  });

  it('offers to resume a publication that stopped half-way', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': { ...STATUS_DRAFT, publishing: true } });
    renderWithQuery(<PublishBar />);
    expect(await screen.findByRole('button', { name: t.resume })).toBeTruthy();
  });

  it('discards after a confirmation in the page', async () => {
    const fetchMock = fakeWorker({
      'GET /api/admin/draft/status': [STATUS_DRAFT, STATUS_CLEAN],
      'DELETE /api/admin/draft': { ok: true },
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.discard }));
    fireEvent.click(await screen.findByRole('button', { name: t.discardConfirm }));
    expect(await screen.findByText(t.discarded)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/draft' && init?.method === 'DELETE')).toBe(true);
  });

  it('a confirmation goes away when new changes appear', async () => {
    const fetchMock = fakeWorker({
      'GET /api/admin/draft/status': [STATUS_DRAFT, STATUS_CLEAN],
      'DELETE /api/admin/draft': { ok: true },
    });
    const client = makeQueryClient();
    render(<QueryClientProvider client={client}><PublishBar /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: t.discard }));
    fireEvent.click(await screen.findByRole('button', { name: t.discardConfirm }));
    expect(await screen.findByText(t.discarded)).toBeTruthy();
    // An edit elsewhere makes the draft dirty again.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(STATUS_DRAFT), { status: 200 }));
    await act(() => client.invalidateQueries());
    expect(await screen.findByText('2 changes')).toBeTruthy();
    expect(screen.queryByText(t.discarded)).toBeNull();
  });

  it('says to finish with Publish when discarding is refused', async () => {
    fakeWorker({
      'GET /api/admin/draft/status': { ...STATUS_DRAFT, publishing: true },
      'DELETE /api/admin/draft': { status: 409, body: { error: 'PUBLISH_IN_PROGRESS' } },
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.discard }));
    fireEvent.click(await screen.findByRole('button', { name: t.discardConfirm }));
    expect((await screen.findByRole('alert')).textContent).toBe(t.inProgress);
  });
});
