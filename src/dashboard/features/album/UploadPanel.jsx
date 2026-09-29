import { useId, useState } from 'react';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { useIsPublishing } from '../../api/queries.js';
import { useUpload } from './upload-context.jsx';

const t = texts.admin.album;
const isFileDrag = event => Boolean(event.dataTransfer?.types?.includes('Files'));

/** Uploads photos to the album and displays the job kept by the dashboard shell. */
export function UploadPanel({ slug, photos, setManifest, makeProcessFileImpl }) {
  const publishing = useIsPublishing();
  const { rows, summary, uploading, start } = useUpload(slug);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const disabled = publishing || uploading;
  const begin = files => start({ files, photos, setManifest, makeProcessFileImpl });

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
        begin(event.dataTransfer.files);
      }}
    >
      <input id={inputId} type="file" multiple accept="image/jpeg,image/png,image/webp" className="visually-hidden dash-upload__input" disabled={disabled}
        onChange={event => { begin(event.target.files); event.target.value = ''; }} />
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
              onClick={() => begin(summary.retry)}>{t.retry}</button>
          )}
        </div>
      )}
    </div>
  );
}
