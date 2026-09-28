import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { partitionBySupport, processFile } from '../../../admin/pipeline.js';
import { runBatch } from '../../../admin/upload-manager.js';
import { upload } from '../../api/client.js';
import { useIsPublishing } from '../../api/queries.js';

const t = texts.admin.album;

/** The browser's compression (WebP, at most 1900 px), loaded only when a photo is uploaded. */
export async function makeProcessFile() {
  const { makeProcessDeps } = await import('../../../admin/encoder.js');
  const deps = await makeProcessDeps();
  return file => processFile(file, deps);
}

/**
 * Uploads photos to an album: compressed in the browser, sent to the waiting area, added
 * to the draft's manifest. The mutation key starts with 'draft-save', so Publish waits for
 * it; and it waits for a running publication (spec, publishing rules).
 * @param {{slug: string, photos: Array, setManifest: Function, makeProcessFileImpl?: Function}} props
 */
export function UploadPanel({ slug, photos, setManifest, makeProcessFileImpl = makeProcessFile }) {
  const publishing = useIsPublishing();
  const inputId = useId();
  const [rows, setRows] = useState([]); // [{ name, phase }]
  const [summary, setSummary] = useState(null); // { text, tone, failures }
  const [dragging, setDragging] = useState(false);

  const uploadBatch = useMutation({
    mutationKey: ['draft-save', 'upload', slug],
    mutationFn: async files => {
      const processOne = await makeProcessFileImpl();
      const before = new Set((photos ?? []).map(photo => photo.name));
      return runBatch({
        files,
        existingManifest: photos ?? [],
        processFile: processOne,
        uploadPhoto: (name, blob) => upload(`/api/admin/staging/${slug}/${encodeURIComponent(name)}`, blob),
        // Only the photos this batch added, onto the latest list: a photo deleted or moved
        // while the upload ran stays deleted or moved.
        putManifest: async entries => {
          setManifest(prev => [...prev, ...entries.filter(entry => !before.has(entry.name) && !prev.some(photo => photo.name === entry.name))], { now: true });
        },
        onProgress: (name, phase) => setRows(current => {
          const others = current.filter(row => row.name !== name);
          return [...others, { name, phase }];
        }),
      });
    },
  });

  const start = fileList => {
    const { supported, unsupported } = partitionBySupport([...fileList]);
    setRows([]);
    setSummary(unsupported.length
      ? { text: formatText(t.unsupportedFormat, { elenco: unsupported.map(file => file.name).join(', ') }), tone: 'error', failures: [] }
      : null);
    if (supported.length === 0) return;
    uploadBatch.mutate(supported, {
      onSuccess: ({ uploaded, failed }) => {
        const failures = failed.map(item => formatText(t.uploadFailedItem, { nome: item.name, motivo: item.error?.message ?? String(item.error) }));
        setSummary(failed.length === 0
          ? { text: formatText(t.uploadSuccess, { n: uploaded.length }), tone: 'ok', failures }
          : { text: formatText(t.uploadPartial, { uploaded: uploaded.length, failed: failed.length }), tone: 'error', failures });
      },
    });
  };

  const disabled = publishing || uploadBatch.isPending;
  return (
    <div
      className={`dash-upload${dragging ? ' dash-upload--dragging' : ''}`}
      onDragOver={event => { if (!disabled && event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        setDragging(false);
        if (disabled || !event.dataTransfer?.files?.length) return;
        event.preventDefault();
        start(event.dataTransfer.files);
      }}
    >
      <label htmlFor={inputId} className={`dash-button dash-button--primary dash-upload__button${disabled ? ' is-disabled' : ''}`}>{t.upload}</label>
      <input id={inputId} type="file" multiple accept="image/jpeg,image/png,image/webp" className="visually-hidden" disabled={disabled}
        onChange={event => { start(event.target.files); event.target.value = ''; }} />
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
        </div>
      )}
    </div>
  );
}
