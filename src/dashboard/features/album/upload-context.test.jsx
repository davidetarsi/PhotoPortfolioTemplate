import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { texts } from '../../../../config/texts.config.js';
import { fakeWorker, renderWithQuery } from '../../test-utils.jsx';
import { UploadProvider, useUpload } from './upload-context.jsx';

const t = texts.admin.album;
const file = new File(['x'], 'bosco.jpg', { type: 'image/jpeg' });
const process = async () => async () => ({ blob: new Blob(['webp']), width: 4, height: 3, uploadedAt: 1 });

function Job({ setManifest }) {
  const upload = useUpload('notte');
  return (
    <>
      <button type="button" onClick={() => upload.start({
        files: [file], photos: [{ name: 'a.webp', width: 4, height: 3 }], setManifest, makeProcessFileImpl: process,
      })}>Start upload</button>
      <output>{upload.rows.map(row => `${row.name}:${row.phase}`).join(',')}</output>
      {upload.summary && <p data-testid="summary">{upload.summary.text}</p>}
    </>
  );
}

describe('upload context', () => {
  it('keeps the active job and its completed outcome when the album consumer unmounts', async () => {
    let finish;
    fakeWorker({ 'PUT /api/admin/staging/notte/bosco.webp': () => new Promise(resolve => { finish = resolve; }) });
    const setManifest = vi.fn(() => true);
    const first = renderWithQuery(<UploadProvider><Job setManifest={setManifest} /></UploadProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Start upload' }));
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(screen.getByRole('status', { name: t.uploadAnnouncementLabel }).textContent).toContain(
      t.uploadStartedOne,
    );
    expect(screen.getByRole('status', { name: t.uploadAnnouncementLabel }).textContent).toContain(
      t.uploadProgress.replace('{nome}', 'bosco.webp').replace('{fase}', t.uploadPhases.uploading),
    );

    first.rerender(<UploadProvider>{null}</UploadProvider>);
    await act(async () => { await finish(new Response('{"ok":true}', { status: 200 })); });
    first.rerender(<UploadProvider><Job setManifest={setManifest} /></UploadProvider>);
    expect((await screen.findByTestId('summary')).textContent).toContain(t.uploadSuccessOne);
  });

  it('starts with no upload result after the dashboard provider is recreated', async () => {
    fakeWorker({ 'PUT /api/admin/staging/notte/bosco.webp': { ok: true } });
    const first = renderWithQuery(<UploadProvider><Job setManifest={vi.fn(() => true)} /></UploadProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Start upload' }));
    expect((await screen.findByTestId('summary')).textContent).toContain(t.uploadSuccessOne);
    first.unmount();

    renderWithQuery(<UploadProvider><Job setManifest={vi.fn(() => true)} /></UploadProvider>);
    expect(screen.queryByTestId('summary')).toBeNull();
  });
});
