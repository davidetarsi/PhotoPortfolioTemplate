import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { useManifest, useSaveQueue } from '../../api/drafts.jsx';
import { PublishBar } from '../publish/PublishBar.jsx';
import { fakeWorker, renderWithQuery } from '../../test-utils.jsx';
import { UploadProvider } from './upload-context.jsx';
import { UploadPanel } from './UploadPanel.jsx';

const t = texts.admin.album;
const file = (name, type = 'image/jpeg') => new File(['x'], name, { type });
// The browser's compression, replaced: every file becomes a small WebP.
const makeProcessFileImpl = async () => async () => ({ blob: new Blob(['w'], { type: 'image/webp' }), width: 4, height: 3, uploadedAt: 1 });

let queue;
function Panel(props) {
  queue = useSaveQueue();
  return <UploadPanel slug="notte" photos={[{ name: 'a.webp', width: 4, height: 3 }]} makeProcessFileImpl={makeProcessFileImpl} {...props} />;
}
const choose = files => fireEvent.change(document.querySelector('input[type=file]'), { target: { files } });
const renderUpload = ui => {
  const result = renderWithQuery(<UploadProvider>{ui}</UploadProvider>);
  return { ...result, rerender: next => result.rerender(<UploadProvider>{next}</UploadProvider>) };
};
const worker = answers => fakeWorker({ 'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp', width: 4, height: 3 }]], ...answers });
const findSummary = text => screen.findByText(text, { selector: '.dash-upload__summary p' });

describe('UploadPanel', () => {
  it('compresses, sends each photo to the waiting area, then adds them to the draft', async () => {
    const setManifest = vi.fn(() => true);
    const fetchMock = worker({
      'PUT /api/admin/staging/notte/bosco.webp': { ok: true },
      'PUT /api/admin/staging/notte/a-2.webp': { ok: true },
    });
    renderUpload(<Panel setManifest={setManifest} />);
    choose([file('Bosco.JPG'), file('a.png', 'image/png')]);
    expect(await findSummary(formatText(t.uploadSuccess, { n: 2 }))).toBeTruthy();
    const staged = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([path]) => path).sort();
    expect(staged).toEqual(['/api/admin/staging/notte/a-2.webp', '/api/admin/staging/notte/bosco.webp']);
    const [update, options] = setManifest.mock.calls.at(-1);
    // Applied to the latest list: here the first photo was deleted while uploading.
    expect(update([]).map(entry => entry.name)).toEqual(['bosco.webp', 'a-2.webp']);
    expect(update([{ name: 'a.webp', width: 4, height: 3 }]).map(entry => entry.name)).toEqual(['a.webp', 'bosco.webp', 'a-2.webp']);
    expect(options).toEqual({ now: true });
  });

  it('says which files the browser cannot upload', async () => {
    worker({});
    renderUpload(<Panel setManifest={vi.fn(() => true)} />);
    choose([file('IMG_1.HEIC', '')]);
    expect((await screen.findByRole('alert')).textContent).toContain('IMG_1.HEIC');
  });

  it('lists the photos that failed, with the reason', async () => {
    worker({ 'PUT /api/admin/staging/notte/bosco.webp': { status: 413, body: { error: 'File over 10MB' } } });
    renderUpload(<Panel setManifest={vi.fn(() => true)} />);
    choose([file('bosco.jpg')]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(formatText(t.uploadPartial, { uploaded: 0, failed: 1 }));
    expect(alert.textContent).toContain(formatText(t.uploadFailedItem, { nome: 'bosco.webp', motivo: 'File over 10MB' }));
  });

  it('Publish waits while photos are being uploaded', async () => {
    let finish;
    worker({
      'GET /api/admin/draft/status': { hasDraft: true, publishing: false, changes: [{ type: 'site' }] },
      'PUT /api/admin/staging/notte/bosco.webp': () => new Promise(resolve => { finish = resolve; }),
    });
    renderUpload(<><Panel setManifest={vi.fn(() => true)} /><PublishBar /></>);
    const publish = await screen.findByRole('button', { name: texts.admin.publish.publish });
    choose([file('bosco.jpg')]);
    await waitFor(() => expect(publish.disabled).toBe(true));
    await act(async () => { finish(new Response('{"ok":true}', { status: 200 })); });
    await waitFor(() => expect(publish.disabled).toBe(false));
  });

  it('never gives a new photo the name of a published one, even one deleted from the draft', async () => {
    const setManifest = vi.fn(() => true);
    const fetchMock = worker({
      'GET /api/data/albums/notte/manifest': [[{ name: 'a.webp', width: 4, height: 3 }, { name: 'bosco.webp', width: 4, height: 3 }]],
      'PUT /api/admin/staging/notte/bosco-2.webp': { ok: true },
    });
    renderUpload(<Panel setManifest={setManifest} />);
    choose([file('bosco.jpg')]);
    expect(await findSummary(t.uploadSuccessOne)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([path]) => path)).toEqual(['/api/admin/staging/notte/bosco-2.webp']);
    // The published photo deleted from the draft is not brought back.
    const [update] = setManifest.mock.calls.at(-1);
    expect(update([{ name: 'a.webp' }]).map(entry => entry.name)).toEqual(['a.webp', 'bosco-2.webp']);
  });

  it('says so when the upload cannot start, and offers to try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = worker({ 'PUT /api/admin/staging/notte/bosco.webp': { ok: true } });
    let loads = 0;
    const flaky = async () => { loads += 1; if (loads === 1) throw new Error('Failed to fetch dynamically imported module'); return makeProcessFileImpl(); };
    renderUpload(<Panel setManifest={vi.fn(() => true)} makeProcessFileImpl={flaky} />);
    choose([file('bosco.jpg')]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(formatText(t.uploadError, { message: 'Failed to fetch dynamically imported module' }));
    fireEvent.click(screen.getByRole('button', { name: t.retry }));
    expect(await findSummary(t.uploadSuccessOne)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/staging/notte/bosco.webp' && init?.method === 'PUT')).toBe(true);
  });

  it('offers to try again the photos that failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    worker({ 'PUT /api/admin/staging/notte/bosco.webp': [{ status: 500, body: { error: 'STORAGE_ERROR' } }, { ok: true }] });
    renderUpload(<Panel setManifest={vi.fn(() => true)} />);
    choose([file('bosco.jpg')]);
    fireEvent.click(await screen.findByRole('button', { name: t.retry }));
    expect(await findSummary(t.uploadSuccessOne)).toBeTruthy();
  });

  it('keeps the list of files it cannot upload next to the result of the others', async () => {
    worker({ 'PUT /api/admin/staging/notte/bosco.webp': { ok: true } });
    renderUpload(<Panel setManifest={vi.fn(() => true)} />);
    choose([file('IMG.HEIC', ''), file('bosco.jpg')]);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(t.uploadSuccessOne));
    expect(screen.getByRole('alert').textContent).toContain('IMG.HEIC');
  });

  it('one batch at a time per album, even from another copy of the screen (left and reopened)', async () => {
    let finish;
    worker({ 'PUT /api/admin/staging/notte/bosco.webp': () => new Promise(resolve => { finish = resolve; }) });
    renderUpload(<><Panel setManifest={vi.fn(() => true)} /><Panel setManifest={vi.fn(() => true)} /></>);
    const [first, second] = document.querySelectorAll('input[type=file]');
    fireEvent.change(first, { target: { files: [file('bosco.jpg')] } });
    await waitFor(() => expect(second.disabled).toBe(true));
    await act(async () => { finish(new Response('{"ok":true}', { status: 200 })); });
    await waitFor(() => expect(second.disabled).toBe(false));
  });

  it('a photo dropped while uploads wait does not leave the dashboard, and is not uploaded', async () => {
    let finish;
    const fetchMock = worker({ 'PUT /api/admin/staging/notte/bosco.webp': () => new Promise(resolve => { finish = resolve; }) });
    renderUpload(<Panel setManifest={vi.fn(() => true)} />);
    choose([file('bosco.jpg')]);
    await waitFor(() => expect(document.querySelector('input[type=file]').disabled).toBe(true));
    const zone = document.querySelector('.dash-upload');
    const dataTransfer = { types: ['Files'], files: [file('lago.jpg')] };
    // fireEvent answers false when the browser's default action (opening the file) was prevented.
    expect(fireEvent.dragOver(zone, { dataTransfer })).toBe(false);
    expect(fireEvent.drop(zone, { dataTransfer })).toBe(false);
    expect(fireEvent.drop(document.body, { dataTransfer })).toBe(false);
    await act(async () => { finish(new Response('{"ok":true}', { status: 200 })); });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([path]) => path)).toEqual(['/api/admin/staging/notte/bosco.webp']);
  });

  it('shows the pending upload and keeps file input blocked after returning to its album', async () => {
    let finish;
    worker({
      'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp' }]],
      'GET /api/data/albums/notte/manifest': [[]],
      'PUT /api/admin/staging/notte/bosco.webp': () => new Promise(resolve => { finish = resolve; }),
    });
    const Route = ({ showAlbum }) => showAlbum ? <Panel setManifest={vi.fn(() => true)} photos={[{ name: 'a.webp' }, { name: 'local.webp' }]} /> : null;
    const { rerender } = renderUpload(<Route showAlbum />);
    choose([file('bosco.jpg')]);
    const pendingRow = await screen.findByRole('listitem');
    rerender(<Route showAlbum={false} />);
    rerender(<Route showAlbum />);
    expect(document.querySelector('input[type=file]').disabled).toBe(true);
    expect(screen.getByRole('listitem').textContent).toBe(pendingRow.textContent);
    await act(async () => { finish(new Response('{"ok":true}', { status: 200 })); });
    expect(await findSummary(t.uploadSuccessOne)).toBeTruthy();
  });

  it('uploads are held from the click on Publish, while the changes still waiting are saved', async () => {
    let saved;
    worker({
      'GET /api/admin/draft/status': { hasDraft: true, publishing: false, changes: [{ type: 'site' }] },
      'PUT /api/admin/draft/site': () => new Promise(resolve => { saved = resolve; }),
      'POST /api/admin/publish': { done: true, copied: 0, remaining: 0 },
    });
    renderUpload(<><Panel setManifest={vi.fn(() => true)} /><PublishBar /></>);
    const publish = await screen.findByRole('button', { name: texts.admin.publish.publish });
    act(() => { queue.set('site', { name: 'D', bio: '', hero: null }); });
    fireEvent.click(publish);
    await waitFor(() => expect(document.querySelector('input[type=file]').disabled).toBe(true));
    await act(async () => { saved(new Response('{"ok":true}', { status: 200 })); });
    expect(await screen.findByText(texts.admin.publish.published)).toBeTruthy();
    await waitFor(() => expect(document.querySelector('input[type=file]').disabled).toBe(false));
  });

  it('blocks uploads while this tab has an active publication mutation', async () => {
    let finish;
    worker({
      'GET /api/admin/draft/status': { hasDraft: true, publishing: false, changes: [{ type: 'site' }] },
      'POST /api/admin/publish': () => new Promise(resolve => { finish = resolve; }),
    });
    renderUpload(<><Panel setManifest={vi.fn(() => true)} /><PublishBar /></>);
    fireEvent.click(await screen.findByRole('button', { name: texts.admin.publish.publish }));
    await waitFor(() => expect(document.querySelector('input[type=file]').disabled).toBe(true));
    await act(async () => { finish(new Response('{"done":true,"copied":0,"remaining":0}', { status: 200 })); });
    await waitFor(() => expect(document.querySelector('input[type=file]').disabled).toBe(false));
  });

  it('photos uploaded after their album left the cache still reach the draft', async () => {
    // The first setter cannot find the cache; after its network reread, the second setter can add the upload.
    const setManifest = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const fetchMock = worker({
      'PUT /api/admin/staging/notte/bosco.webp': { ok: true },
      'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp', width: 4, height: 3 }]],
    });
    renderUpload(<Panel setManifest={setManifest} />);
    choose([file('bosco.jpg')]);
    expect(await findSummary(t.uploadSuccessOne)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/admin/draft/albums/notte/manifest')).toBe(true);
    expect(setManifest).toHaveBeenCalledTimes(2);
  });

  it('chooses names from a fresh draft manifest after another window saved a photo', async () => {
    const fetchMock = worker({
      'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp' }, { name: 'bosco.webp' }]],
      'GET /api/data/albums/notte/manifest': [[]],
      'PUT /api/admin/staging/notte/bosco-2.webp': { ok: true },
    });
    renderUpload(<Panel setManifest={vi.fn(() => true)} />);
    choose([file('bosco.jpg')]);
    expect(await findSummary(t.uploadSuccessOne)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([path, init]) => init?.method === 'PUT').map(([path]) => path))
      .toEqual(['/api/admin/staging/notte/bosco-2.webp']);
    expect(fetchMock.mock.calls.findIndex(([path]) => path === '/api/admin/draft/albums/notte/manifest'))
      .toBeLessThan(fetchMock.mock.calls.findIndex(([path]) => path === '/api/admin/staging/notte/bosco-2.webp'));
  });

  it('uses queued local manifest entries when choosing names after a fresh read', async () => {
    let setLatest;
    const fetchMock = worker({
      'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp' }]],
      'GET /api/data/albums/notte/manifest': [[]],
      'PUT /api/admin/staging/notte/bosco-2.webp': { ok: true },
    });
    function RealPanel() {
      queue = useSaveQueue();
      const manifest = useManifest('notte');
      setLatest = manifest.setManifest;
      if (!manifest.photos) return null;
      return <UploadPanel slug="notte" photos={manifest.photos} setManifest={manifest.setManifest} makeProcessFileImpl={makeProcessFileImpl} />;
    }
    renderUpload(<RealPanel />);
    await waitFor(() => expect(document.querySelector('input[type=file]')).not.toBeNull());
    act(() => { queue.pause(); setLatest([{ name: 'a.webp' }, { name: 'bosco.webp' }]); });
    choose([file('bosco.jpg')]);
    expect(await findSummary(t.uploadSuccessOne)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([path, init]) => init?.method === 'PUT').map(([path]) => path))
      .toContain('/api/admin/staging/notte/bosco-2.webp');
  });

  it('reserves a network-saved name even when a stale local queued manifest overlays the reread', async () => {
    let setLatest;
    const fetchMock = worker({
      'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp' }], [{ name: 'a.webp' }, { name: 'bosco.webp' }]],
      'GET /api/data/albums/notte/manifest': [[]],
      'PUT /api/admin/staging/notte/bosco-2.webp': { ok: true },
    });
    function RealPanel() {
      queue = useSaveQueue();
      const manifest = useManifest('notte');
      setLatest = manifest.setManifest;
      if (!manifest.photos) return null;
      return <UploadPanel slug="notte" photos={manifest.photos} setManifest={manifest.setManifest} makeProcessFileImpl={makeProcessFileImpl} />;
    }
    renderUpload(<RealPanel />);
    await waitFor(() => expect(document.querySelector('input[type=file]')).not.toBeNull());
    act(() => { queue.pause(); setLatest([{ name: 'a.webp' }, { name: 'stale-local.webp' }]); });
    choose([file('bosco.jpg')]);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path, init]) => init?.method === 'PUT').map(([path]) => path))
      .toEqual(['/api/admin/staging/notte/bosco-2.webp']));
    expect(await findSummary(t.uploadSuccessOne)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/draft/albums/notte/manifest' && init?.method === 'PUT')).toBe(false);
  });

  it('keeps a local reorder and deletion when adding successful uploads', async () => {
    let finishProcessing;
    let setLatest;
    const fetchMock = worker({
      'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp' }, { name: 'b.webp' }, { name: 'c.webp' }]],
      'GET /api/data/albums/notte/manifest': [[]],
      'PUT /api/admin/staging/notte/new.webp': { ok: true },
      'PUT /api/admin/draft/albums/notte/manifest': { ok: true },
    });
    const process = async () => async () => {
      await new Promise(resolve => { finishProcessing = resolve; });
      return { blob: new Blob(['w'], { type: 'image/webp' }), width: 4, height: 3, uploadedAt: 1 };
    };
    function RealPanel() {
      queue = useSaveQueue();
      const manifest = useManifest('notte');
      setLatest = manifest.setManifest;
      if (!manifest.photos) return null;
      return <UploadPanel slug="notte" photos={manifest.photos} setManifest={manifest.setManifest} makeProcessFileImpl={process} />;
    }
    renderUpload(<RealPanel />);
    await waitFor(() => expect(document.querySelector('input[type=file]')).not.toBeNull());
    choose([file('new.jpg')]);
    await waitFor(() => expect(finishProcessing).toBeTypeOf('function'));
    act(() => { setLatest([{ name: 'c.webp' }, { name: 'a.webp' }]); });
    await act(async () => finishProcessing());
    expect(await findSummary(t.uploadSuccessOne)).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls.find(([path, init]) => path === '/api/admin/draft/albums/notte/manifest' && init?.method === 'PUT')[1].body)
      .map(photo => photo.name)).toEqual(['c.webp', 'a.webp', 'new.webp']);
  });

  it('explains the Worker NAME_PUBLISHED response in localized upload copy', async () => {
    worker({
      'GET /api/admin/draft/albums/notte/manifest': [[]],
      'GET /api/data/albums/notte/manifest': [[]],
      'PUT /api/admin/staging/notte/bosco.webp': { status: 409, body: { error: 'NAME_PUBLISHED' } },
    });
    renderUpload(<Panel setManifest={vi.fn(() => true)} />);
    choose([file('bosco.jpg')]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.namePublished);
    expect(alert.textContent).not.toContain('NAME_PUBLISHED');
  });

  it('logs a failed post-upload manifest reread and offers a retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.mockClear();
    const fetchMock = worker({
      'GET /api/admin/draft/albums/notte/manifest': [[], { status: 500, body: { error: 'STORAGE_ERROR' } }],
      'GET /api/data/albums/notte/manifest': [[]],
      'PUT /api/admin/staging/notte/bosco.webp': { ok: true },
    });
    renderUpload(<Panel setManifest={vi.fn(() => false)} />);
    choose([file('bosco.jpg')]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.uploadManifestError);
    expect(log).toHaveBeenCalledWith('Could not reread draft manifest after upload:', expect.any(Error));
    expect(screen.getByRole('button', { name: t.retry })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/admin/draft/albums/notte/manifest')).toHaveLength(2);
  });
});
