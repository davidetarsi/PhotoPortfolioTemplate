import { useEffect, useId, useState } from 'react';
import { useIsMutating, useMutation } from '@tanstack/react-query';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { partitionBySupport, processFile } from '../../../admin/pipeline.js';
import { runBatch } from '../../../admin/upload-manager.js';
import { ApiError, request, upload } from '../../api/client.js';
import { useIsPublishing } from '../../api/queries.js';

const t = texts.admin.album;

/** The browser's compression (WebP, at most 1900 px), loaded only when a photo is uploaded. */
export async function makeProcessFile() {
  const { makeProcessDeps } = await import('../../../admin/encoder.js');
  const deps = await makeProcessDeps();
  return file => processFile(file, deps);
}

/**
 * The names of the album's published photos. A new photo must never take one of them: the
 * publication would copy it over the published file before the site stops naming it.
 */
async function publishedNames(slug) {
  try {
    return (await request(`/api/data/albums/${slug}/manifest`)).map(photo => photo.name);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []; // never published
    throw error;
  }
}

const isFileDrag = event => Boolean(event.dataTransfer?.types?.includes('Files'));

/**
 * Uploads photos to an album: compressed in the browser, sent to the waiting area, added
 * to the draft's manifest. The mutation key starts with 'draft-save', so Publish waits for
 * it; and it waits for a running publication (spec, publishing rules).
 * @param {{slug: string, photos: Array, setManifest: Function, makeProcessFileImpl?: Function}} props
 */
export function UploadPanel({ slug, photos, setManifest, makeProcessFileImpl = makeProcessFile }) {
  const publishing = useIsPublishing();
  // Counted across the app, not by this component: an upload started before leaving the
  // album and coming back is still running, and a second batch would pick the same names.
  const uploading = useIsMutating({ mutationKey: ['draft-save', 'upload', slug] }) > 0;
  const inputId = useId();
  const [rows, setRows] = useState([]); // [{ name, phase }]
  const [summary, setSummary] = useState(null); // { text, tone, failures, retry }
  const [dragging, setDragging] = useState(false);
  const disabled = publishing || uploading;

  // A photo dropped anywhere on the dashboard, even while uploads wait, must not make the
  // browser leave it to open the image (a publication in steps would be cut off).
  useEffect(() => {
    const keep = event => { if (isFileDrag(event)) event.preventDefault(); };
    window.addEventListener('dragover', keep);
    window.addEventListener('drop', keep);
    return () => {
      window.removeEventListener('dragover', keep);
      window.removeEventListener('drop', keep);
    };
  }, []);

  const uploadBatch = useMutation({
    mutationKey: ['draft-save', 'upload', slug],
    mutationFn: async files => {
      const [processOne, published] = await Promise.all([makeProcessFileImpl(), publishedNames(slug)]);
      const draft = photos ?? [];
      // Names already used by the draft or by the published album: never reused, and never
      // added again by this batch.
      const before = new Set([...draft.map(photo => photo.name), ...published]);
      return runBatch({
        files,
        existingManifest: [...draft, ...published.filter(name => !draft.some(photo => photo.name === name)).map(name => ({ name }))],
        processFile: processOne,
        uploadPhoto: (name, blob) => upload(`/api/admin/staging/${slug}/${encodeURIComponent(name)}`, blob),
        // Only the photos this batch added, onto the latest list: a photo deleted or moved
        // while the upload ran stays deleted or moved.
        putManifest: async entries => {
          setManifest(prev => [...prev, ...entries.filter(entry => !before.has(entry.name) && !prev.some(photo => photo.name === entry.name))], { now: true });
        },
        // Each file keeps its place in the list while its phase changes.
        onProgress: (name, phase) => setRows(current => (current.some(row => row.name === name)
          ? current.map(row => (row.name === name ? { name, phase } : row))
          : [...current, { name, phase }])),
      });
    },
  });

  const start = fileList => {
    const { supported, unsupported } = partitionBySupport([...fileList]);
    // Files the browser cannot read are listed with the failures of the batch, not replaced by its result.
    const refused = unsupported.length
      ? [formatText(t.unsupportedFormat, { elenco: unsupported.map(file => file.name).join(', ') })]
      : [];
    setRows([]);
    setSummary(refused.length ? { text: refused[0], tone: 'error', failures: [], retry: [] } : null);
    if (supported.length === 0) return;
    uploadBatch.mutate(supported, {
      onSuccess: ({ uploaded, failed }) => {
        const failures = [...refused, ...failed.map(item => formatText(t.uploadFailedItem, { nome: item.name, motivo: item.error?.message ?? String(item.error) }))];
        const done = uploaded.length === 1 ? t.uploadSuccessOne : formatText(t.uploadSuccess, { n: uploaded.length });
        setSummary(failed.length === 0
          ? { text: done, tone: refused.length ? 'error' : 'ok', failures, retry: [] }
          : { text: formatText(t.uploadPartial, { uploaded: uploaded.length, failed: failed.length }), tone: 'error', failures, retry: failed.map(item => item.file) });
      },
      // The batch could not start: the compression did not load (offline, a new version of
      // the site), or the published photos could not be read.
      onError: error => {
        console.error('Upload could not start:', error);
        setSummary({ text: formatText(t.uploadError, { message: error.message }), tone: 'error', failures: refused, retry: supported });
      },
    });
  };

  return (
    <div
      className={`dash-upload${dragging ? ' dash-upload--dragging' : ''}`}
      onDragOver={event => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
      onDrop={event => {
        setDragging(false);
        if (!isFileDrag(event)) return;
        event.preventDefault();
        if (disabled || !event.dataTransfer.files?.length) return;
        start(event.dataTransfer.files);
      }}
    >
      {/* The input comes first so that its keyboard focus can be drawn on the button after it. */}
      <input id={inputId} type="file" multiple accept="image/jpeg,image/png,image/webp" className="visually-hidden dash-upload__input" disabled={disabled}
        onChange={event => { start(event.target.files); event.target.value = ''; }} />
      <label htmlFor={inputId} className={`dash-button dash-button--primary dash-upload__button${disabled ? ' is-disabled' : ''}`}>{t.upload}</label>
      <p className="dash-upload__hint">{dragging ? t.dropHere : `${t.dropHint} · ${t.dropzoneConstraints}`}</p>
      {publishing && <p className="dash-upload__hint" role="status">{t.uploadWaits}</p>}
      {rows.length > 0 && (
        <ul className="dash-upload__rows" aria-live="polite">
          {rows.map(row => (
            <li key={row.name} className={`dash-upload__row dash-upload__row--${row.phase}`}>
              {formatText(t.uploadProgress, { nome: row.name, fase: t.uploadPhases[row.phase] ?? row.phase })}
            </li>
          ))}
        </ul>
      )}
      {summary && (
        <div className={`dash-upload__summary dash-upload__summary--${summary.tone}`} role={summary.tone === 'error' ? 'alert' : 'status'}>
          <p>{summary.text}</p>
          {summary.failures.length > 0 && <ul>{summary.failures.map(line => <li key={line}>{line}</li>)}</ul>}
          {summary.retry.length > 0 && (
            <button type="button" className="dash-button dash-upload__retry" disabled={disabled}
              onClick={() => start(summary.retry)}>{t.retry}</button>
          )}
        </div>
      )}
    </div>
  );
}
