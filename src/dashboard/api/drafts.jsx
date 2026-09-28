/**
 * The draft seen by the screens: albums and manifests read with TanStack Query and changed
 * through the save queue. A change shows at once (the query's data is updated in place)
 * and is saved in the background. The queue is the truth for what is not saved yet: every
 * answer of the server is overlaid with the values still waiting or being saved, so no
 * refetch — on focus, after publishing, in another tab — shows an older version.
 */
import { useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './client.js';
import { keys, useDraft } from './queries.js';
import { createSaveQueue } from './save-queue.js';
import { SaveQueueContext } from './save-context.js';
import { SLUG_RE } from '../../shared/content-rules.js';
import { siteConfig } from '../../../config/site.config.js';
import { siteForEditing } from '../lib/site.js';

/** Where each queued resource is saved. */
export function savePath(key) {
  if (key === 'albums') return '/api/admin/draft/albums';
  if (key === 'site') return '/api/admin/draft/site';
  if (key.startsWith('manifest:')) return `/api/admin/draft/albums/${key.slice('manifest:'.length)}/manifest`;
  throw new Error(`Unknown draft resource "${key}"`);
}

/**
 * A query's data with the queue's unsaved values laid over it.
 * @param {Array} queryKey
 * @param {any} data - As the server sent it.
 * @param {{holds: Function, valueOf: Function}} queue
 * @returns {any} The same object when nothing waits for it.
 */
export function overlayUnsaved(queryKey, data, queue) {
  if (data === undefined) return data;
  if (queryKey[0] === keys.draft[0]) {
    let next = data;
    if (queue.holds('albums')) next = { ...next, albums: queue.valueOf('albums').albums };
    if (queue.holds('site')) next = { ...next, site: queue.valueOf('site') };
    return next;
  }
  if (queryKey[0] === 'draft-manifest') {
    const key = `manifest:${queryKey[1]}`;
    return queue.holds(key) ? queue.valueOf(key) : data;
  }
  return data;
}

/** Provides the save queue to the dashboard; warns before leaving with unsaved changes. */
export function SaveQueueProvider({ children, delay }) {
  const client = useQueryClient();
  const queue = useMemo(() => createSaveQueue({
    delay,
    save: (key, value) => request(savePath(key), { method: 'PUT', json: value }),
    onSaved: key => {
      client.invalidateQueries({ queryKey: keys.status });
      // A fetch that started before this save could still answer with the older value, now
      // that the queue no longer holds it: read the resource again, which drops that fetch.
      client.invalidateQueries({ queryKey: key.startsWith('manifest:') ? keys.manifest(key.slice('manifest:'.length)) : keys.draft });
    },
  }), [client, delay]);

  useEffect(() => {
    // Every answer of the server passes under the values not saved yet.
    const stopCache = client.getQueryCache().subscribe(event => {
      if (event?.type !== 'updated' || event.action?.type !== 'success' || event.action.manual) return;
      const { queryKey, state } = event.query;
      const next = overlayUnsaved(queryKey, state.data, queue);
      if (next !== state.data) client.setQueryData(queryKey, next);
    });
    const onBeforeUnload = event => {
      if (!queue.busy()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      stopCache();
      window.removeEventListener('beforeunload', onBeforeUnload);
      queue.dispose();
    };
  }, [client, queue]);

  return <SaveQueueContext.Provider value={queue}>{children}</SaveQueueContext.Provider>;
}

/** The save queue itself (set, flush, pause, resume, clear). */
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

/** A value, or a function of the previous one (like React's setState). */
const resolve = (next, prev) => (typeof next === 'function' ? next(prev) : next);

/**
 * The draft's albums, and a setter that shows the change at once and saves it.
 * `setAlbums(next)` takes the new list or a function of the latest one: two quick changes
 * never lose each other. Before the draft has loaded there is no list to change, and saving
 * one built from nothing would replace every album: the setter then does nothing and
 * returns false.
 */
export function useAlbums() {
  const client = useQueryClient();
  const queue = useSaveQueue();
  const draft = useDraft();
  const setAlbums = (next, options) => {
    const current = client.getQueryData(keys.draft)?.albums;
    if (!current) return false;
    const albums = resolve(next, current);
    // A fetch already running would answer with the old list: drop it.
    client.cancelQueries({ queryKey: keys.draft });
    client.setQueryData(keys.draft, old => ({ ...old, albums }));
    queue.set('albums', { albums }, options);
    return true;
  };
  return { ...draft, albums: draft.data?.albums, setAlbums };
}

/**
 * One album's photos in the draft, and a setter (a list, or a function of the latest one).
 * Like `setAlbums`, the setter does nothing and returns false until the photos have loaded.
 */
export function useManifest(slug) {
  const client = useQueryClient();
  const queue = useSaveQueue();
  const manifest = useQuery({
    queryKey: keys.manifest(slug),
    queryFn: () => request(`/api/admin/draft/albums/${slug}/manifest`),
    // The address comes from the URL: only a valid one is ever read.
    enabled: Boolean(slug) && SLUG_RE.test(slug),
    refetchOnWindowFocus: () => !queue.busy(),
  });
  const setManifest = (next, options) => {
    const current = client.getQueryData(keys.manifest(slug));
    if (!current) return false;
    const entries = resolve(next, current);
    client.cancelQueries({ queryKey: keys.manifest(slug) });
    client.setQueryData(keys.manifest(slug), entries);
    queue.set(`manifest:${slug}`, entries, options);
    return true;
  };
  return { ...manifest, photos: manifest.data, setManifest };
}

/**
 * The site being edited (name, bio, home image, links, page texts), always in the current
 * shape, and a setter like `setAlbums`: a value or a function of the latest one, nothing
 * (and false) before the draft has loaded.
 */
export function useSite() {
  const client = useQueryClient();
  const queue = useSaveQueue();
  const draft = useDraft();
  const loaded = draft.data?.site;
  const site = useMemo(() => (draft.data ? siteForEditing(loaded, siteConfig) : undefined), [draft.data, loaded]);
  const setSite = (next, options) => {
    const data = client.getQueryData(keys.draft);
    if (!data) return false;
    const value = resolve(next, siteForEditing(data.site, siteConfig));
    client.cancelQueries({ queryKey: keys.draft });
    client.setQueryData(keys.draft, old => ({ ...old, site: value }));
    queue.set('site', value, options);
    return true;
  };
  return { ...draft, site, setSite };
}

