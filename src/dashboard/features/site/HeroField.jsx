import { useEffect, useId, useState } from 'react';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { useAlbums, useManifest } from '../../api/drafts.jsx';
import { photoSrc } from '../../api/photos.js';
import { Sheet } from '../../ui/Sheet.jsx';
import { Button } from '../../ui/Button.jsx';

const t = texts.admin.site;

/** The home image row and its album/photo picker sheet. */
export function HeroField({ hero, onChange, onOpen, onClose, side = false }) {
  const [open, setOpen] = useState(false);
  const show = () => { setOpen(true); onOpen(); };
  const hide = () => { setOpen(false); onClose(); };
  const pick = next => { onChange(next); hide(); };
  return (
    <>
      <button type="button" className="dash-site-row dash-hero-row" onClick={show} disabled={hero === undefined}>
        <span className="dash-site-row__label">{t.heroLabel}</span>
        {hero
          ? <span className="dash-site-row__value dash-hero-row__value"><img src={photoSrc(hero.album, hero.name)} alt="" />{hero.album} / {hero.name}</span>
          : <span className="dash-site-row__value dash-site-row__value--empty">{t.heroNoImage}</span>}
      </button>
      <HeroSheet open={open} hero={hero ?? null} onPick={pick} onClose={hide} side={side} />
    </>
  );
}

function HeroSheet({ open, hero, onPick, onClose, side }) {
  const { albums } = useAlbums();
  const [slug, setSlug] = useState(null);
  const selectId = useId();
  useEffect(() => {
    if (open) setSlug(hero?.album ?? albums?.[0]?.slug ?? null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const { photos } = useManifest(open ? slug : null);
  const album = albums?.find(item => item.slug === slug);

  return (
    <Sheet open={open} onClose={onClose} title={t.heroLabel} className={`dash-field-sheet${side ? ' dash-field-sheet--side' : ''}`}>
      {albums?.length ? (
        <div className="dash-form">
          <label htmlFor={selectId} className="dash-label">{t.heroAlbumLabel}</label>
          <select id={selectId} className="dash-input" value={slug ?? ''} onChange={event => setSlug(event.target.value)}>
            {albums.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}
          </select>
          {photos?.length === 0 && <p className="dash-hint">{t.heroEmptyAlbum}</p>}
          {photos?.length > 0 && (
            <ul className="dash-hero-grid">
              {photos.map((photo, index) => {
                const chosen = hero?.album === slug && hero?.name === photo.name;
                return (
                  <li key={photo.name}>
                    <button type="button" className="dash-hero-grid__photo" aria-pressed={chosen}
                      aria-label={formatText(t.heroPick, { n: index + 1, album: album?.title ?? slug })}
                      onClick={() => onPick({ album: slug, name: photo.name })}>
                      <img src={photoSrc(slug, photo.name)} alt="" loading="lazy" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : <p className="dash-hint">{t.heroNoAlbums}</p>}
      <div className="dash-confirm__actions">
        {hero && <Button onClick={() => onPick(null)}>{t.heroNoImage}</Button>}
        <Button variant="primary" onClick={onClose}>{t.done}</Button>
      </div>
    </Sheet>
  );
}
