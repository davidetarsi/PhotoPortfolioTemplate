import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { photoSrc } from '../../api/photos.js';
import { useSortable } from '../../ui/useSortable.js';
import { MoveButtons } from '../../ui/MoveButtons.jsx';

const t = texts.admin.album;

/**
 * The photos of an album, in their order on the site. Each one can become the cover or be
 * deleted; in reorder mode it can be dragged or moved with the arrows.
 * @param {{slug: string, photos: Array, coverName: string|null, reordering: boolean, disabled: boolean,
 *   onMove: Function, onCover: Function, onDelete: Function}} props
 */
export function PhotoGrid({ slug, photos, coverName, reordering, disabled, onMove, onCover, onDelete }) {
  const listRef = useSortable(onMove);
  return (
    <ol ref={listRef} className={`dash-photo-grid${reordering ? ' dash-photo-grid--reordering' : ''}`}>
      {photos.map((photo, index) => {
        const n = index + 1;
        const isCover = photo.name === coverName;
        return (
          <li key={photo.name} className="dash-photo" draggable={reordering ? 'true' : undefined}>
            <figure className="dash-photo__figure">
              <img src={photoSrc(slug, photo.name)} alt={formatText(t.photoLabel, { n })} loading="lazy" draggable="false" />
              <figcaption className="dash-photo__number">{String(n).padStart(2, '0')}</figcaption>
              {isCover && <span className="dash-photo__cover">{t.coverBadge}</span>}
            </figure>
            <div className="dash-photo__actions">
              {reordering ? (
                <MoveButtons index={index} total={photos.length} onMove={onMove}
                  earlierLabel={formatText(t.movePhotoEarlier, { n })} laterLabel={formatText(t.movePhotoLater, { n })} />
              ) : (
                <>
                  <button type="button" onClick={() => onCover(photo.name)} aria-pressed={isCover} disabled={disabled}
                    aria-label={`${t.coverAsButton} · ${formatText(t.photoLabel, { n })}`}>★</button>
                  <button type="button" className="dash-photo__delete" onClick={() => onDelete(photo.name)} disabled={disabled}
                    aria-label={`${t.deletePhoto} · ${formatText(t.photoLabel, { n })}`}>✕</button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
