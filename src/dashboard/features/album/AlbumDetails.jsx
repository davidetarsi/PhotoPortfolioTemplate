import { useEffect, useId, useState } from 'react';
import { texts } from '../../../../config/texts.config.js';

const t = texts.admin.album;

/**
 * Title and subtitle of an album, edited in place. What is typed stays in this component's
 * state and is handed to `onChange` as it changes; a refetch of the draft never resets a
 * field being edited (spec, "Moduli").
 * @param {{album: object, onChange: (fields: {title: string, description: string}) => void}} props
 */
export function AlbumDetails({ album, onChange }) {
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  // Another album opened in the same component: start from its values.
  useEffect(() => {
    setTitle(album.title);
    setDescription(album.description);
  }, [album.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const titleMissing = !title.trim();
  const change = (nextTitle, nextDescription) => {
    // An empty title cannot be saved (the site needs one): the last good one is kept.
    if (!nextTitle.trim()) return;
    onChange({ title: nextTitle.trim(), description: nextDescription });
  };

  return (
    <div className="dash-album-details">
      <label htmlFor={titleId} className="dash-label">{t.titleLabel}</label>
      <input id={titleId} className="dash-input dash-album-details__title" value={title}
        aria-invalid={titleMissing ? 'true' : undefined} aria-describedby={titleMissing ? errorId : undefined}
        onChange={event => { setTitle(event.target.value); change(event.target.value, description); }} />
      {titleMissing && <p id={errorId} className="dash-form__error" role="alert">{t.titleRequired}</p>}
      <label htmlFor={descriptionId} className="dash-label">{t.subtitleLabel}</label>
      <textarea id={descriptionId} className="dash-input dash-album-details__subtitle" rows={2} value={description}
        placeholder={t.subtitlePlaceholder}
        onChange={event => { setDescription(event.target.value); change(title, event.target.value); }} />
    </div>
  );
}
