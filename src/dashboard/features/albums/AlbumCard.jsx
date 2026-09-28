import { Link } from 'react-router';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { useManifest } from '../../api/drafts.jsx';
import { photoSrc } from '../../api/photos.js';
import { MoveButtons } from '../../ui/MoveButtons.jsx';

const t = texts.admin.albums;

/** How many photos, in words. */
export function photoCount(n) {
  if (!n) return t.photoCountNone;
  return n === 1 ? t.photoCountOne : formatText(t.photoCountMany, { n });
}

/**
 * One album of the gallery: its cover (or first photo), title and number of photos. In
 * reorder mode it also shows the arrows that move it.
 * @param {{album: object, index: number, total: number, reordering: boolean, onMove: Function}} props
 */
export function AlbumCard({ album, index, total, reordering, onMove }) {
  const { photos } = useManifest(album.slug);
  const coverName = album.coverName ?? photos?.[0]?.name;
  return (
    <li className="dash-album-card" draggable={reordering ? 'true' : undefined}>
      <Link to={`/album/${album.slug}`} className="dash-album-card__link" draggable="false">
        <span className="dash-album-card__cover">
          {coverName && <img src={photoSrc(album.slug, coverName)} alt="" loading="lazy" draggable="false" />}
        </span>
        <span className="dash-album-card__title">{album.title}</span>
        <span className="dash-album-card__count">{photos ? photoCount(photos.length) : ' '}</span>
      </Link>
      {reordering && (
        <span className="dash-album-card__move">
          <MoveButtons index={index} total={total} onMove={onMove}
            earlierLabel={formatText(t.moveEarlier, { album: album.title })}
            laterLabel={formatText(t.moveLater, { album: album.title })} />
        </span>
      )}
    </li>
  );
}
