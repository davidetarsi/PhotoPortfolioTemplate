import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { texts } from '../../../../config/texts.config.js';
import { moveItem } from '../../../admin/sortable.js';
import { useAlbums, useSaveQueue } from '../../api/drafts.jsx';
import { keys } from '../../api/queries.js';
import { Button } from '../../ui/Button.jsx';
import { useSortable } from '../../ui/useSortable.js';
import { AlbumCard } from './AlbumCard.jsx';
import { NewAlbumSheet } from './NewAlbumSheet.jsx';
import './albums.css';

const t = texts.admin.albums;

/** The gallery of albums: covers, number of photos, new album, order on the site. */
export function AlbumsScreen() {
  const { albums, albumSummaries, setAlbums, isPending } = useAlbums();
  const queue = useSaveQueue();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [reordering, setReordering] = useState(false);

  // Changes are functions of the latest list: quick successive changes never undo each other.
  const move = (from, to) => setAlbums(prev => moveItem(prev, from, to));
  const listRef = useSortable(move);

  const create = album => {
    if (!setAlbums(prev => [...prev, album], { now: true })) return;
    // A new album starts with an empty manifest in the draft (spec, plan-2 rules): it
    // never inherits the photos of a removed album with the same address.
    client.setQueryData(keys.manifest(album.slug), []);
    client.setQueryData(keys.draft, old => old ? {
      ...old,
      albumSummaries: { ...old.albumSummaries, [album.slug]: { photoCount: 0, firstPhoto: null } },
    } : old);
    queue.set(`manifest:${album.slug}`, [], { now: true });
    setCreating(false);
    navigate(`/album/${album.slug}`);
  };

  return (
    <section className="dash-albums" aria-labelledby="dash-albums-title">
      <div className="dash-screen-head">
        <h1 id="dash-albums-title" className="dash-screen-title">{t.sectionTitle}</h1>
        <div className="dash-screen-head__actions">
          {albums?.length > 1 && (
            <Button onClick={() => setReordering(value => !value)} aria-pressed={reordering}>
              {reordering ? t.reorderDone : t.reorder}
            </Button>
          )}
          {/* Until the albums have loaded there is no list to add to. */}
          <Button variant="primary" onClick={() => setCreating(true)} disabled={!albums}>{t.create}</Button>
        </div>
      </div>
      {reordering && <p className="dash-hint">{t.reorderHint}</p>}
      {!isPending && albums?.length === 0 && <p className="dash-empty">{t.empty}</p>}
      <ul ref={listRef} className={`dash-album-grid${reordering ? ' dash-album-grid--reordering' : ''}`}>
        {(albums ?? []).map((album, index) => (
          <AlbumCard key={album.slug} album={album} summary={albumSummaries?.[album.slug]} index={index} total={albums.length}
            reordering={reordering} onMove={move} />
        ))}
      </ul>
      <NewAlbumSheet open={creating} albums={albums ?? []} onCreate={create} onClose={() => setCreating(false)} />
    </section>
  );
}
