import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { MAX_LINKS } from '../../../shared/content-rules.js';
import { routes } from '../../App.jsx';
import { useSaveQueue } from '../../api/drafts.jsx';
import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers } from '../../test-utils.jsx';
const siteStyles = readFileSync(resolve(process.cwd(), 'src/dashboard/features/site/site.css'), 'utf8');

const t = texts.admin.site;
beforeAll(installDialogPolyfill);
afterEach(() => vi.unstubAllGlobals());

const SITE = { name: 'Davide', bio: 'Fotografo', hero: null, links: [], texts: { 'about.heading': 'Scrivimi' } };
const DRAFT = { site: SITE, albums: [], hasDraft: false };
const STATUS = { hasDraft: false, publishing: false, changes: [] };

let queue;
function QueueSpy() { queue = useSaveQueue(); return null; }
function renderSite() {
  const router = createMemoryRouter(routes, { initialEntries: ['/site'] });
  const client = makeQueryClient();
  render(<Providers client={client}><QueueSpy /><RouterProvider router={router} /></Providers>);
  return client;
}
// A Worker that keeps what is saved, as the real one does: a refetch after a save reads it back.
function worker(extra = {}) {
  let draft = DRAFT;
  return fakeWorker({
    'GET /api/admin/draft': () => draft,
    'GET /api/admin/draft/status': STATUS,
    'PUT /api/admin/draft/site': init => { draft = { ...draft, site: JSON.parse(init.body) }; return { ok: true }; },
    ...extra,
  });
}
const siteSaves = fetchMock => fetchMock.mock.calls
  .filter(([path, init]) => path === '/api/admin/draft/site' && init?.method === 'PUT').map(([, init]) => JSON.parse(init.body));
// A row, once the draft has loaded (before that the rows are there but cannot be opened).
async function row(label) {
  const button = await screen.findByRole('button', { name: new RegExp(`^${label}`) });
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}

describe('Site screen', () => {
  it('shows each field as a row with its value; a page text not changed says it is the template text', async () => {
    worker();
    renderSite();
    expect((await row(t.nameLabel)).textContent).toContain('Davide');
    expect((await row(t.aboutHeadingLabel)).textContent).toContain('Scrivimi');
    const body = await row(t.aboutBodyLabel);
    expect(body.textContent).toContain(texts.about.body);
    expect(body.textContent).toContain(t.templateText);
  });

  it('edits a field in a sheet and saves it as soon as the sheet closes', async () => {
    const fetchMock = worker();
    renderSite();
    fireEvent.click(await row(t.bioLabel));
    const sheet = await screen.findByRole('dialog', { name: t.bioLabel });
    fireEvent.change(within(sheet).getByLabelText(t.bioLabel), { target: { value: 'Fotografo di montagna' } });
    fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
    await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.bio).toBe('Fotografo di montagna'));
    expect((await row(t.bioLabel)).textContent).toContain('Fotografo di montagna');
  });

  it('never saves an empty name: the field says why and the last one is kept', async () => {
    const fetchMock = worker();
    renderSite();
    fireEvent.click(await row(t.nameLabel));
    const sheet = await screen.findByRole('dialog', { name: t.nameLabel });
    fireEvent.change(within(sheet).getByLabelText(t.nameLabel), { target: { value: ' ' } });
    expect(within(sheet).getByRole('alert').textContent).toBe(t.nameRequired);
    fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
    await act(() => queue.flush());
    expect(siteSaves(fetchMock)).toEqual([]);
  });

  it('gives a page text back to the template', async () => {
    const fetchMock = worker();
    renderSite();
    fireEvent.click(await row(t.aboutHeadingLabel));
    const sheet = await screen.findByRole('dialog', { name: t.aboutHeadingLabel });
    fireEvent.click(within(sheet).getByRole('button', { name: t.restoreDefault }));
    expect(within(sheet).getByLabelText(t.aboutHeadingLabel).value).toBe(texts.about.heading);
    fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
    await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.texts).toEqual({}));
  });

  it('on a phone the sheet shows the page of the field above it, and the whole page on request', async () => {
    worker();
    renderSite();
    fireEvent.click(await row(t.successMessageLabel));
    const sheet = await screen.findByRole('dialog', { name: t.successMessageLabel });
    const frame = within(sheet).getByTitle(t.previewTitle);
    expect(frame.getAttribute('src')).toBe('/about?preview=1');
    expect(within(sheet).getByText(t.formNote)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: t.previewFull }));
    expect(frame.className).toContain('dash-preview--full');
  });

  it('on a phone the field sheet uses the full viewport width', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    worker();
    renderSite();
    fireEvent.click(await row(t.bioLabel));
    const sheet = await screen.findByRole('dialog', { name: t.bioLabel });
    expect(sheet.classList.contains('dash-field-sheet')).toBe(true);
    expect(siteStyles).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.dash-sheet\.dash-field-sheet\s*\{[^}]*width:\s*100%/);
  });

  it('on a computer the preview stands beside the fields and follows the field being edited', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    worker();
    renderSite();
    const frame = await screen.findByTitle(t.previewTitle);
    expect(frame.getAttribute('src')).toBe('/?preview=1');
    fireEvent.click(await row(t.aboutBodyLabel));
    await waitFor(() => expect(frame.getAttribute('src')).toBe('/about?preview=1'));
    expect(screen.getAllByTitle(t.previewTitle)).toHaveLength(1);
  });

  describe('links', () => {
    const withLinks = links => ({ ...DRAFT, site: { ...SITE, links } });
    function linksWorker(links) {
      let draft = withLinks(links);
      return fakeWorker({
        'GET /api/admin/draft': () => draft,
        'GET /api/admin/draft/status': STATUS,
        'PUT /api/admin/draft/site': init => { draft = { ...draft, site: JSON.parse(init.body) }; return { ok: true }; },
      });
    }
    const addButton = async () => {
      const button = await screen.findByRole('button', { name: t.addLink });
      await waitFor(() => expect(button.disabled).toBe(false));
      return button;
    };

    it('adds a link from a bare address; its icon and name follow the address', async () => {
      const fetchMock = linksWorker([]);
      renderSite();
      expect(await screen.findByText(t.linksEmpty)).toBeTruthy();
      fireEvent.click(await addButton());
      const sheet = await screen.findByRole('dialog', { name: t.newLink });
      fireEvent.change(within(sheet).getByLabelText(t.linkUrlLabel), { target: { value: 'instagram.com/davide' } });
      expect(within(sheet).getByLabelText(t.linkLabelLabel).getAttribute('placeholder')).toBe('Instagram');
      fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
      await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.links).toEqual([{ url: 'https://instagram.com/davide' }]));
      expect(await screen.findByRole('button', { name: /^Instagram/ })).toBeTruthy();
    });

    it('refuses an address that is not a web or email address, saying why', async () => {
      const fetchMock = linksWorker([]);
      renderSite();
      fireEvent.click(await addButton());
      const sheet = await screen.findByRole('dialog', { name: t.newLink });
      fireEvent.change(within(sheet).getByLabelText(t.linkUrlLabel), { target: { value: 'http://old.example' } });
      fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
      expect(within(sheet).getByRole('alert').textContent).toBe(t.linkUrlInvalid);
      await act(() => queue.flush());
      expect(siteSaves(fetchMock)).toEqual([]);
    });

    it('gives a link a name of its own, and removes one', async () => {
      const fetchMock = linksWorker([{ url: 'https://github.com/d' }, { url: 'mailto:d@example.com' }]);
      renderSite();
      fireEvent.click(await screen.findByRole('button', { name: /^GitHub/ }));
      let sheet = await screen.findByRole('dialog', { name: t.editLink });
      fireEvent.change(within(sheet).getByLabelText(t.linkLabelLabel), { target: { value: 'Codice' } });
      fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
      await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.links[0]).toEqual({ url: 'https://github.com/d', label: 'Codice' }));
      fireEvent.click(await screen.findByRole('button', { name: /^Email/ }));
      sheet = await screen.findByRole('dialog', { name: t.editLink });
      fireEvent.click(within(sheet).getByRole('button', { name: t.removeLink }));
      await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.links).toEqual([{ url: 'https://github.com/d', label: 'Codice' }]));
    });

    it('moves a link with the arrows; the arrow keeps its place in the page', async () => {
      const fetchMock = linksWorker([{ url: 'https://github.com/d' }, { url: 'https://instagram.com/d' }]);
      renderSite();
      const up = await screen.findByRole('button', { name: formatText(t.moveLinkEarlier, { link: 'Instagram' }) });
      fireEvent.click(up);
      await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.links.map(link => link.url)).toEqual(['https://instagram.com/d', 'https://github.com/d']));
      // The same button, now at the top: still in the page, marked as unable to move further.
      await waitFor(() => expect(up.getAttribute('aria-disabled')).toBe('true'));
      expect(up.isConnected).toBe(true);
    });

    it('offers no more links past the limit', async () => {
      linksWorker(Array.from({ length: MAX_LINKS }, (_, i) => ({ url: `https://example.com/${i}` })));
      renderSite();
      expect(await screen.findByText(formatText(t.linksFull, { n: MAX_LINKS }))).toBeTruthy();
      expect(screen.getByRole('button', { name: t.addLink }).disabled).toBe(true);
    });
  });
});
