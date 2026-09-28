import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { moveItem } from '../../../admin/sortable.js';
import { request } from '../../api/client.js';
import { useAlbums, useManifest } from '../../api/drafts.jsx';
import { useIsPublishing } from '../../api/queries.js';
import { Button } from '../../ui/Button.jsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.jsx';
import { AlbumDetails } from './AlbumDetails.jsx';
import { PhotoGrid } from './PhotoGrid.jsx';
import '../albums/albums.css';
import './album.css';

const t = texts.admin.album;

/**
 * An open album: title and subtitle, its photos (cover, order, delete), delete the album.
 * Every change goes to the draft; the site changes only when it is published.
 */
export function AlbumScreen() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { albums, setAlbums, isPending: albumsPending } = useAlbums();
  const { photos, setManifest, isError: manifestError } = useManifest(slug);
  const publishing = useIsPublishing();
  const [reordering, setReordering] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(null);
  const [deletingAlbum, setDeletingAlbum] = useState(false);

  const album = albums?.find(item => item.slug === slug);
  if (albumsPending) return null;
  if (!album) {
    return (
      <section>
        <Link to="/" className="dash-back">{texts.admin.common.allAlbums}</Link>
        <p className="dash-empty" role="alert">{t.notFound}</p>
      </section>
    );
  }

  // Changes are functions of the latest list: quick successive changes never undo each other.
  const updateAlbum = fields => setAlbums(prev => prev.map(item => (item.slug === slug ? { ...item, ...fields } : item)));

  const deletePhoto = name => {
    setManifest(prev => prev.filter(photo => photo.name !== name));
    if (album.coverName === name) updateAlbum({ coverName: null });
    // A photo still waiting to be published is removed from the waiting area now; a
    // published one is removed from the site when the draft is published.
    request(`/api/admin/staging/${slug}/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => {});
    setDeletingPhoto(null);
  };

  const deleteAlbum = () => {
    setAlbums(prev => prev.filter(item => item.slug !== slug), { now: true });
    setDeletingAlbum(false);
    navigate('/');
  };

  return (
    <section className="dash-album" aria-labelledby="dash-album-title">
      <Link to="/" className="dash-back">{texts.admin.common.allAlbums}</Link>
      <h1 id="dash-album-title" className="visually-hidden">{album.title}</h1>
      <AlbumDetails album={album} onChange={updateAlbum} />

      <div className="dash-screen-head">
        <p className="dash-label">{photos ? formatText(texts.admin.albums.photoCountMany, { n: photos.length }) : ''}</p>
        <div className="dash-screen-head__actions">
          {photos?.length > 1 && (
            <Button onClick={() => setReordering(value => !value)} aria-pressed={reordering}>
              {reordering ? texts.admin.albums.reorderDone : texts.admin.albums.reorder}
            </Button>
          )}
        </div>
      </div>

      {manifestError && <p className="dash-form__error" role="alert">{t.manifestError}</p>}
      {photos?.length === 0 && <p className="dash-empty">{t.empty}</p>}
      {photos?.length > 0 && (
        <PhotoGrid slug={slug} photos={photos} coverName={album.coverName} reordering={reordering} disabled={publishing}
          onMove={(from, to) => setManifest(prev => moveItem(prev, from, to))}
          onCover={name => updateAlbum({ coverName: name })}
          onDelete={name => setDeletingPhoto(name)} />
      )}

      <div className="dash-album__danger">
        <Button variant="danger" onClick={() => setDeletingAlbum(true)} disabled={publishing}>{t.deleteAlbum}</Button>
      </div>

      <ConfirmDialog open={deletingPhoto !== null}
        title={formatText(t.confirmDeletePhoto, { nome: deletingPhoto ?? '' })} body={t.deletePhotoBody}
        confirmLabel={t.deletePhoto} cancelLabel={t.cancel}
        onConfirm={() => deletePhoto(deletingPhoto)} onCancel={() => setDeletingPhoto(null)} />
      <ConfirmDialog open={deletingAlbum}
        title={formatText(t.deleteAlbumTitle, { album: album.title })} body={t.deleteAlbumBody}
        confirmLabel={t.deleteAlbum} cancelLabel={t.cancel}
        onConfirm={deleteAlbum} onCancel={() => setDeletingAlbum(false)} />
    </section>
  );
}
