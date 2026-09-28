import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { useSaveQueue } from '../../api/drafts.jsx';
import { PublishBar } from '../publish/PublishBar.jsx';
import { fakeWorker, renderWithQuery } from '../../test-utils.jsx';
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

describe('UploadPanel', () => {
  it('compresses, sends each photo to the waiting area, then adds them to the draft', async () => {
    const setManifest = vi.fn();
    const fetchMock = fakeWorker({
      'PUT /api/admin/staging/notte/bosco.webp': { ok: true },
      'PUT /api/admin/staging/notte/a-2.webp': { ok: true },
    });
    renderWithQuery(<Panel setManifest={setManifest} />);
    choose([file('Bosco.JPG'), file('a.png', 'image/png')]);
    expect(await screen.findByText(formatText(t.uploadSuccess, { n: 2 }))).toBeTruthy();
    const staged = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([path]) => path).sort();
    expect(staged).toEqual(['/api/admin/staging/notte/a-2.webp', '/api/admin/staging/notte/bosco.webp']);
    const [update, options] = setManifest.mock.calls.at(-1);
    // Applied to the latest list: here the first photo was deleted while uploading.
    expect(update([]).map(entry => entry.name)).toEqual(['bosco.webp', 'a-2.webp']);
    expect(update([{ name: 'a.webp', width: 4, height: 3 }]).map(entry => entry.name)).toEqual(['a.webp', 'bosco.webp', 'a-2.webp']);
    expect(options).toEqual({ now: true });
  });

  it('says which files the browser cannot upload', async () => {
    fakeWorker({});
    renderWithQuery(<Panel setManifest={vi.fn()} />);
    choose([file('IMG_1.HEIC', '')]);
    expect((await screen.findByRole('alert')).textContent).toContain('IMG_1.HEIC');
  });

  it('lists the photos that failed, with the reason', async () => {
    fakeWorker({ 'PUT /api/admin/staging/notte/bosco.webp': { status: 413, body: { error: 'File over 10MB' } } });
    renderWithQuery(<Panel setManifest={vi.fn()} />);
    choose([file('bosco.jpg')]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(formatText(t.uploadPartial, { uploaded: 0, failed: 1 }));
    expect(alert.textContent).toContain(formatText(t.uploadFailedItem, { nome: 'bosco.webp', motivo: 'File over 10MB' }));
  });

  it('Publish waits while photos are being uploaded', async () => {
    let finish;
    fakeWorker({
      'GET /api/admin/draft/status': { hasDraft: true, publishing: false, changes: [{ type: 'site' }] },
      'PUT /api/admin/staging/notte/bosco.webp': () => new Promise(resolve => { finish = resolve; }),
    });
    renderWithQuery(<><Panel setManifest={vi.fn()} /><PublishBar /></>);
    const publish = await screen.findByRole('button', { name: texts.admin.publish.publish });
    choose([file('bosco.jpg')]);
    await waitFor(() => expect(publish.disabled).toBe(true));
    await act(async () => { finish(new Response('{"ok":true}', { status: 200 })); });
    await waitFor(() => expect(publish.disabled).toBe(false));
  });
});
