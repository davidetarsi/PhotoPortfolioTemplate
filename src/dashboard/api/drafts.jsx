/**
 * The draft seen by the screens: albums and manifests read with TanStack Query and changed
 * through the save queue. A change shows at once (the query's data is updated in place)
 * and is saved in the background; while something is waiting, a refetch never overwrites it.
 */
import { useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './client.js';
import { keys } from './queries.js';
import { createSaveQueue } from './save-queue.js';
import { SaveQueueContext } from './save-context.js';

export { SaveQueueContext };

/** Where each queued resource is saved. */
export function savePath(key) {
  if (key === 'albums') return '/api/admin/draft/albums';
  if (key === 'site') return '/api/admin/draft/site';
  if (key.startsWith('manifest:')) return `/api/admin/draft/albums/${key.slice('manifest:'.length)}/manifest`;
  throw new Error(`Unknown draft resource "${key}"`);
}

/** Provides the save queue to the dashboard; warns before leaving with unsaved changes. */
export function SaveQueueProvider({ children, delay }) {
  const client = useQueryClient();
  const queue = useMemo(() => createSaveQueue({
    delay,
    save: (key, value) => request(savePath(key), { method: 'PUT', json: value }),
    onSaved: () => client.invalidateQueries({ queryKey: keys.status }),
  }), [client, delay]);

  useEffect(() => {
    const onBeforeUnload = event => {
      if (!queue.busy()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [queue]);

  return <SaveQueueContext.Provider value={queue}>{children}</SaveQueueContext.Provider>;
}

/** The save queue itself (set, flush, pause, resume). */
export function useSaveQueue() {
  const queue = useContext(SaveQueueContext);
  if (!queue) throw new Error('useSaveQueue needs a <SaveQueueProvider>');
  return queue;
}

/** The queue's state, re-rendering when it changes: { pending, saving, paused, error }. */
export function useSaveState() {
  const queue = useSaveQueue();
  return useSyncExternalStore(queue.subscribe, queue.getState);
}

/** Refetch on focus only when nothing is waiting to be saved (else it would undo edits). */
export function useRefetchGuard() {
  const queue = useContext(SaveQueueContext);
  return () => !queue?.busy();
}

/** The draft's albums and a setter that shows the change at once and saves it. */
export function useAlbums() {
  const client = useQueryClient();
  const queue = useSaveQueue();
  const guard = useRefetchGuard();
  const draft = useQuery({ queryKey: keys.draft, queryFn: () => request('/api/admin/draft'), refetchOnWindowFocus: guard });
  const setAlbums = (albums, options) => {
    client.setQueryData(keys.draft, old => ({ ...old, albums }));
    queue.set('albums', { albums }, options);
  };
  return { ...draft, albums: draft.data?.albums, setAlbums };
}

/** One album's photos in the draft, and a setter that shows the change at once and saves it. */
export function useManifest(slug) {
  const client = useQueryClient();
  const queue = useSaveQueue();
  const guard = useRefetchGuard();
  const manifest = useQuery({
    queryKey: keys.manifest(slug),
    queryFn: () => request(`/api/admin/draft/albums/${slug}/manifest`),
    enabled: Boolean(slug),
    refetchOnWindowFocus: guard,
  });
  const setManifest = (entries, options) => {
    client.setQueryData(keys.manifest(slug), entries);
    queue.set(`manifest:${slug}`, entries, options);
  };
  return { ...manifest, photos: manifest.data, setManifest };
}
