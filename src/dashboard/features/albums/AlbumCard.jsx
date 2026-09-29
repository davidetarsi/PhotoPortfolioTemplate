import { Link } from 'react-router';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { photoCount } from '../../lib/album-summary.js';
import { photoSrc } from '../../api/photos.js';
import { MoveButtons } from '../../ui/MoveButtons.jsx';

const t = texts.admin.albums;

/**
 * One album of the gallery: its cover (or first photo), title and number of photos. In
 * reorder mode it also shows the arrows that move it.
 * @param {{album: object, summary?: {photoCount: number, firstPhoto: string|null}, index: number, total: number, reordering: boolean, onMove: Function}} props
 */
export function AlbumCard({ album, summary, index, total, reordering, onMove }) {
  const coverName = album.coverName ?? summary?.firstPhoto;
  return (
    <li className="dash-album-card" draggable={reordering ? 'true' : undefined}>
      <Link to={`/album/${album.slug}`} className="dash-album-card__link" draggable="false">
        <span className="dash-album-card__cover">
          {coverName && <img src={photoSrc(album.slug, coverName)} alt="" loading="lazy" draggable="false" />}
        </span>
        <span className="dash-album-card__title">{album.title}</span>
        <span className="dash-album-card__count">{summary ? photoCount(summary.photoCount) : ' '}</span>
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
