import { beforeAll, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { texts } from '../../../../config/texts.config.js';
import { MESSAGE_MS, PublishBar, describeChange, describeProblem } from './PublishBar.jsx';
import { useSaveQueue } from '../../api/drafts.jsx';
import { fakeWorker, installDialogPolyfill, makeQueryClient, renderWithQuery } from '../../test-utils.jsx';

const t = texts.admin.publish;
beforeAll(installDialogPolyfill);

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

  it('lists what publishing changes when the count is touched', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': STATUS_DRAFT });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: '2 changes' }));
    const sheet = await screen.findByRole('dialog', { name: t.changesTitle });
    expect([...sheet.querySelectorAll('li')].map(li => li.textContent)).toEqual([
      describeChange({ type: 'site' }), describeChange({ type: 'album-added', slug: 'notte' }),
    ]);
    expect(describeChange({ type: 'photos-added', slug: 'notte', count: 3 })).toBe('notte: 3 new photos');
    expect(describeChange({ type: 'photos-added', slug: 'notte', count: 1 })).toBe('notte: 1 new photo');
    expect(describeChange({ type: 'photos-removed', slug: 'notte', count: 1 })).toBe('notte: 1 photo removed');
  });

  it('saves what is waiting before publishing, and holds saves while publishing', async () => {
    let queue;
    function WithQueue() { queue = useSaveQueue(); return <PublishBar />; }
    const order = [];
    fakeWorker({
      'GET /api/admin/draft/status': STATUS_DRAFT,
      'PUT /api/admin/draft/albums': () => { order.push('save'); return { ok: true }; },
      'POST /api/admin/publish': () => {
        order.push('publish');
        // A change made during the publication: it must wait.
        queue.set('albums', { albums: [] });
        expect(queue.getState().paused).toBe(true);
        return { done: true, copied: 0, remaining: 0 };
      },
    });
    renderWithQuery(<WithQueue />);
    await screen.findByRole('button', { name: t.publish });
    act(() => { queue.set('albums', { albums: [] }); });
    fireEvent.click(screen.getByRole('button', { name: t.publish }));
    expect(await screen.findByText(t.published)).toBeTruthy();
    expect(order.slice(0, 2)).toEqual(['save', 'publish']);
    // Resumed: the change made during the publication is saved after it.
    await waitFor(() => expect(order).toEqual(['save', 'publish', 'save']), { timeout: 3000 });
  });

  it('a double click on Publish starts one publication', async () => {
    const fetchMock = fakeWorker({
      'GET /api/admin/draft/status': STATUS_DRAFT,
      'POST /api/admin/publish': { done: true, copied: 0, remaining: 0 },
    });
    renderWithQuery(<PublishBar />);
    const button = await screen.findByRole('button', { name: t.publish });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByText(t.published)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('the queue resumes even if the bar goes away during the publication', async () => {
    let queue;
    let finish;
    function WithQueue({ show }) { queue = useSaveQueue(); return show ? <PublishBar /> : null; }
    fakeWorker({
      'GET /api/admin/draft/status': STATUS_DRAFT,
      'POST /api/admin/publish': () => new Promise(resolve => { finish = resolve; }),
    });
    const { rerender } = renderWithQuery(<WithQueue show />);
    fireEvent.click(await screen.findByRole('button', { name: t.publish }));
    await waitFor(() => expect(queue.getState().paused).toBe(true));
    rerender(<WithQueue show={false} />);
    await act(async () => { finish(new Response(JSON.stringify({ done: true, copied: 0, remaining: 0 }), { status: 200 })); });
    await waitFor(() => expect(queue.getState().paused).toBe(false));
  });

  it('discarding drops the changes still waiting to be saved', async () => {
    let queue;
    function WithQueue() { queue = useSaveQueue(); return <PublishBar />; }
    const fetchMock = fakeWorker({
      'GET /api/admin/draft/status': [STATUS_DRAFT, STATUS_CLEAN],
      'DELETE /api/admin/draft': { ok: true },
      'PUT /api/admin/draft/albums': { ok: true },
    });
    renderWithQuery(<WithQueue />);
    await screen.findByRole('button', { name: t.discard });
    act(() => { queue.set('albums', { albums: [] }); });
    fireEvent.click(screen.getByRole('button', { name: t.discard }));
    fireEvent.click(await screen.findByRole('button', { name: t.discardConfirm }));
    expect(await screen.findByText(t.discarded)).toBeTruthy();
    await act(() => queue.flush());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
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

  it('offers to resume a publication that stopped half-way, and no longer to discard', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': { ...STATUS_DRAFT, publishing: true } });
    renderWithQuery(<PublishBar />);
    expect(await screen.findByRole('button', { name: t.resume })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.discard })).toBeNull();
  });

  it('stops asking when the publication does not move forward', async () => {
    fakeWorker({
      'GET /api/admin/draft/status': STATUS_DRAFT,
      'POST /api/admin/publish': { done: false, copied: 0, remaining: 5 },
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.publish }));
    expect((await screen.findByRole('alert')).textContent).toBe(t.noProgress);
  });

  it('the discard confirmation is an alert dialog described by its text', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': STATUS_DRAFT });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.discard }));
    const dialog = await screen.findByRole('alertdialog', { name: t.discardTitle });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toBe(t.discardBody);
  });

  it('a confirmation disappears by itself after a few seconds', async () => {
    // Fake timers that still move on their own, so the waits of Testing Library work.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fakeWorker({
      'GET /api/admin/draft/status': [STATUS_DRAFT, STATUS_CLEAN],
      'POST /api/admin/publish': { done: true, copied: 0, remaining: 0 },
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.publish }));
    expect(await screen.findByText(t.published)).toBeTruthy();
    try {
      act(() => { vi.advanceTimersByTime(MESSAGE_MS); });
      expect(screen.queryByText(t.published)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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
    const { client } = renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.discard }));
    fireEvent.click(await screen.findByRole('button', { name: t.discardConfirm }));
    expect(await screen.findByText(t.discarded)).toBeTruthy();
    // An edit elsewhere makes the draft dirty again.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(STATUS_DRAFT), { status: 200 }));
    await act(() => client.invalidateQueries());
    expect(await screen.findByText('2 changes')).toBeTruthy();
    expect(screen.queryByText(t.discarded)).toBeNull();
  });

  it('says to finish with Publish when discarding is refused (a publication started elsewhere)', async () => {
    fakeWorker({
      'GET /api/admin/draft/status': STATUS_DRAFT,
      'DELETE /api/admin/draft': { status: 409, body: { error: 'PUBLISH_IN_PROGRESS' } },
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.discard }));
    fireEvent.click(await screen.findByRole('button', { name: t.discardConfirm }));
    expect((await screen.findByRole('alert')).textContent).toBe(t.inProgress);
  });
});
