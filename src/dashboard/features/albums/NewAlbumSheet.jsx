import { useId, useState } from 'react';
import { texts } from '../../../../config/texts.config.js';
import { Button } from '../../ui/Button.jsx';
import { Sheet } from '../../ui/Sheet.jsx';
import { newAlbum } from './new-album.js';

const t = texts.admin.albums;

/**
 * Asks for the title of a new album. `onCreate(album)` receives it once the title is valid.
 * @param {{open: boolean, albums: Array, onCreate: Function, onClose: Function}} props
 */
export function NewAlbumSheet({ open, albums, onCreate, onClose }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);
  const inputId = useId();
  const errorId = useId();

  const close = () => { setTitle(''); setError(null); onClose(); };
  const submit = event => {
    event.preventDefault();
    const result = newAlbum(title, albums);
    if (!result.ok) { setError(result.error); return; }
    setTitle('');
    setError(null);
    onCreate(result.album);
  };

  return (
    <Sheet open={open} onClose={close} title={t.create}>
      <form className="dash-form" onSubmit={submit}>
        <label htmlFor={inputId} className="dash-label">{t.titleLabel}</label>
        <input id={inputId} className="dash-input" value={title} autoComplete="off"
          placeholder={t.newTitlePlaceholder} onChange={event => { setTitle(event.target.value); setError(null); }}
          aria-invalid={error ? 'true' : undefined} aria-describedby={error ? errorId : undefined} />
        {error && <p id={errorId} className="dash-form__error" role="alert">{error}</p>}
        <div className="dash-confirm__actions">
          <Button onClick={close}>{t.cancel}</Button>
          <Button type="submit" variant="primary">{t.createConfirm}</Button>
        </div>
      </form>
    </Sheet>
  );
}
