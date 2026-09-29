import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { texts } from '../../../../config/texts.config.js';
import { MessagesScreen } from './MessagesScreen.jsx';
import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers } from '../../test-utils.jsx';

const t = texts.admin.messages;
beforeAll(installDialogPolyfill);

const message = (extra = {}) => ({ id: '2026-01-01T00-00-00-000Z-abc123', name: 'Ada Lovelace', email: 'ada@example.test', message: 'Hello there', receivedAt: Date.UTC(2026, 0, 2), ...extra });
const renderScreen = client => render(<Providers client={client ?? makeQueryClient()}><MessagesScreen /></Providers>);

describe('MessagesScreen', () => {
  it('shows a loading state while messages are being fetched', () => {
    fakeWorker({ 'GET /api/admin/messages': () => new Promise(() => {}) });
    renderScreen();
    expect(screen.getByRole('status').textContent).toMatch(/loading/i);
  });

  it('shows the empty state', async () => {
    fakeWorker({ 'GET /api/admin/messages': { messages: [] } });
    renderScreen();
    expect(await screen.findByText(t.empty)).toBeTruthy();
  });

  it('shows a load error distinct from an empty list', async () => {
    fakeWorker({ 'GET /api/admin/messages': { status: 503, body: { error: 'STORAGE_UNAVAILABLE' } } });
    renderScreen();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', t.loadError);
    expect(screen.queryByText(t.empty)).toBeNull();
  });

  it('shows sender, locale date, optional subject, email, message, and a reply link', async () => {
    fakeWorker({ 'GET /api/admin/messages': { messages: [message({ subject: 'Wedding photos' })] } });
    renderScreen();
    const row = await screen.findByRole('article');
    expect(within(row).getByText('Ada Lovelace')).toBeTruthy();
    expect(within(row).getByText('Wedding photos')).toBeTruthy();
    expect(within(row).getByText('ada@example.test')).toBeTruthy();
    expect(within(row).getByText('Hello there')).toBeTruthy();
    expect(within(row).getByText(new Date(Date.UTC(2026, 0, 2)).toLocaleDateString('en'))).toBeTruthy();
    expect(within(row).getByRole('link', { name: t.reply }).getAttribute('href')).toBe('mailto:ada@example.test');
  });

  it('does not treat a saved email query as mailto headers', async () => {
    fakeWorker({ 'GET /api/admin/messages': { messages: [message({ email: 'victim@example.com?bcc=attacker%40example.com' })] } });
    renderScreen();
    const row = await screen.findByRole('article');
    expect(within(row).getByText('victim@example.com?bcc=attacker%40example.com')).toBeTruthy();
    expect(within(row).queryByRole('link', { name: t.reply })).toBeNull();
  });

  it('omits an absent subject', async () => {
    fakeWorker({ 'GET /api/admin/messages': { messages: [message()] } });
    renderScreen();
    const row = await screen.findByRole('article');
    expect(within(row).queryByText('Wedding photos')).toBeNull();
    expect(within(row).getByText('Hello there')).toBeTruthy();
  });

  it('asks for confirmation, leaves the message on cancel, and deletes after confirmation', async () => {
    const fetchMock = fakeWorker({ 'GET /api/admin/messages': [{ messages: [message()] }, { messages: [] }], 'DELETE /api/admin/messages/2026-01-01T00-00-00-000Z-abc123': { ok: true } });
    renderScreen();
    const row = await screen.findByRole('article');
    fireEvent.click(within(row).getByRole('button', { name: t.delete }));
    let dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Ada Lovelace');
    fireEvent.click(within(dialog).getByRole('button', { name: t.cancel }));
    expect(screen.getByRole('article')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);

    fireEvent.click(within(row).getByRole('button', { name: t.delete }));
    dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.confirmDeleteAction }));
    await waitFor(() => expect(screen.queryByRole('article')).toBeNull());
    expect(await screen.findByText(t.empty)).toBeTruthy();
    expect(await screen.findByRole('status')).toHaveProperty('textContent', t.deleted);
    expect(fetchMock.mock.calls.some(([path, init]) => path.endsWith('/2026-01-01T00-00-00-000Z-abc123') && init?.method === 'DELETE')).toBe(true);
  });

  it('shows a delete error and keeps the message when deletion fails', async () => {
    fakeWorker({ 'GET /api/admin/messages': { messages: [message()] }, 'DELETE /api/admin/messages/2026-01-01T00-00-00-000Z-abc123': { status: 500, body: { error: 'STORAGE_UNAVAILABLE' } } });
    renderScreen();
    const row = await screen.findByRole('article');
    fireEvent.click(within(row).getByRole('button', { name: t.delete }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: t.confirmDeleteAction }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', t.deleteError);
    expect(screen.getByRole('article')).toBeTruthy();
  });

  it('renders hostile HTML-looking visitor data literally', async () => {
    fakeWorker({ 'GET /api/admin/messages': { messages: [message({ name: '<img src=x onerror=alert(1)>', email: 'x@example.test', subject: '<script>alert(2)</script>', message: '<b>not markup</b>' })] } });
    renderScreen();
    const row = await screen.findByRole('article');
    expect(within(row).getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(within(row).getByText('<script>alert(2)</script>')).toBeTruthy();
    expect(within(row).getByText('<b>not markup</b>')).toBeTruthy();
    expect(row.querySelector('img, script, b')).toBeNull();
  });
});
