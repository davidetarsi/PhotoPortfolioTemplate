import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { partitionBySupport, processFile } from '../../../admin/pipeline.js';
import { runBatch } from '../../../admin/upload-manager.js';
import { ApiError, request, upload } from '../../api/client.js';

const t = texts.admin.album;
const UploadContext = createContext(null);

/** The browser's compression (WebP, at most 1900 px), loaded only when a photo is uploaded. */
export async function makeProcessFile() {
  const { makeProcessDeps } = await import('../../../admin/encoder.js');
  const deps = await makeProcessDeps();
  return file => processFile(file, deps);
}

/** Names in the published album cannot be reused by an upload. */
async function publishedNames(slug) {
  try {
    return (await request(`/api/data/albums/${slug}/manifest`)).map(photo => photo.name);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
}

const isFileDrag = event => Boolean(event.dataTransfer?.types?.includes('Files'));

/** Keeps upload jobs and their outcomes alive while route screens change. */
export function UploadProvider({ children }) {
  const client = useQueryClient();
  const [byAlbum, setByAlbum] = useState({});
  const [announcements, setAnnouncements] = useState([]);
  const announcementId = useRef(0);
  const announce = text => setAnnouncements(current => [...current, { id: ++announcementId.current, text }].slice(-8));

  useEffect(() => {
    const keep = event => { if (isFileDrag(event)) event.preventDefault(); };
    window.addEventListener('dragover', keep);
    window.addEventListener('drop', keep);
    return () => {
      window.removeEventListener('dragover', keep);
      window.removeEventListener('drop', keep);
    };
  }, []);

  const setAlbum = (slug, update) => setByAlbum(current => ({
    ...current,
    [slug]: { ...(current[slug] ?? { rows: [], summary: null }), ...update },
  }));

  const start = ({ slug, files, photos, setManifest, makeProcessFileImpl = makeProcessFile }) => {
    const { supported, unsupported } = partitionBySupport([...files]);
    const refused = unsupported.length
      ? [formatText(t.unsupportedFormat, { elenco: unsupported.map(file => file.name).join(', ') })]
      : [];
    const key = ['draft-save', 'upload', slug];
    if (client.isMutating({ mutationKey: key }) > 0) return;

    setAlbum(slug, { rows: [], summary: refused.length ? { text: refused[0], tone: 'error', failures: [], retry: [] } : null });
    if (supported.length === 0) {
      if (refused.length) announce(refused[0]);
      return;
    }
    announce(supported.length === 1 ? t.uploadStartedOne : formatText(t.uploadStarted, { n: supported.length }));

    // Build a mutation in the shared cache so it keeps its album-specific key and continues
    // to completion after the current route's UploadPanel unmounts.
    const mutation = client.getMutationCache().build(client, {
      mutationKey: key,
      mutationFn: async () => {
        const [processOne, published] = await Promise.all([makeProcessFileImpl(), publishedNames(slug)]);
        const draft = photos ?? [];
        const before = new Set([...draft.map(photo => photo.name), ...published]);
        return runBatch({
          files: supported,
          existingManifest: [...draft, ...published.filter(name => !draft.some(photo => photo.name === name)).map(name => ({ name }))],
          processFile: processOne,
          uploadPhoto: (name, blob) => upload(`/api/admin/staging/${slug}/${encodeURIComponent(name)}`, blob),
          putManifest: async entries => {
            const add = prev => [...prev, ...entries.filter(entry => !before.has(entry.name) && !prev.some(photo => photo.name === entry.name))];
            if (setManifest(add, { now: true })) return;
            await client.fetchQuery({ queryKey: ['draft-manifest', slug], queryFn: () => request(`/api/admin/draft/albums/${slug}/manifest`) });
            if (!setManifest(add, { now: true })) throw new Error(t.manifestError);
          },
          onProgress: (name, phase) => {
            const row = { name, phase };
            setByAlbum(current => {
              const state = current[slug] ?? { rows: [], summary: null };
              const rows = state.rows.some(item => item.name === name)
                ? state.rows.map(item => (item.name === name ? row : item))
                : [...state.rows, row];
              return { ...current, [slug]: { ...state, rows } };
            });
            announce(formatText(t.uploadProgress, { nome: name, fase: t.uploadPhases[phase] ?? phase }));
          },
        });
      },
    });

    mutation.execute().then(({ uploaded, failed }) => {
      const failures = [...refused, ...failed.map(item => formatText(t.uploadFailedItem, { nome: item.name, motivo: item.error?.message ?? String(item.error) }))];
      const done = uploaded.length === 1 ? t.uploadSuccessOne : formatText(t.uploadSuccess, { n: uploaded.length });
      const summary = failed.length === 0
        ? { text: done, tone: refused.length ? 'error' : 'ok', failures, retry: [] }
        : { text: formatText(t.uploadPartial, { uploaded: uploaded.length, failed: failed.length }), tone: 'error', failures, retry: failed.map(item => item.file) };
      setAlbum(slug, { summary });
      announce(summary.text);
    }).catch(error => {
      console.error('Upload could not start:', error);
      const summary = { text: formatText(t.uploadError, { message: error.message }), tone: 'error', failures: refused, retry: supported };
      setAlbum(slug, { summary });
      announce(summary.text);
    });
  };

  return (
    <UploadContext.Provider value={{ byAlbum, start }}>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="false" aria-relevant="additions text" aria-label={t.uploadAnnouncementLabel}>
        {announcements.map(item => <span key={item.id}>{item.text}</span>)}
      </div>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload(slug) {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUpload must be used within UploadProvider');
  const uploading = useIsMutating({ mutationKey: ['draft-save', 'upload', slug] }) > 0;
  const state = context.byAlbum[slug] ?? { rows: [], summary: null };
  return { ...state, uploading, start: params => context.start({ ...params, slug }) };
}
