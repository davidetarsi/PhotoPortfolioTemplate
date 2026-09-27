/**
 * One step of "Publish": brings the draft onto the public site.
 * Each call recomputes what is left from the buckets themselves, so an interrupted
 * publication resumes with the next call and repeating a step does no harm. Order:
 * check → copy new photos → note what to delete → manifests → albums.json → site.json
 * → delete → close.
 */
import { PUBLISHED, DRAFT, STAGING, listKeys, deletePrefix, readJson, writeJson, loadStates, hasDraft } from './draft-store.js';

/** Photos copied per call: keeps each request well inside the Worker's limits. */
export const PHOTOS_PER_STEP = 25;

/**
 * Problems that would publish a broken site: photos listed in a manifest that exist
 * nowhere, covers that are not in their album, a hero photo that is not in its album.
 * @returns {Array<{slug: string, name: string, reason: string}>}
 */
function findProblems(effective, isAvailable) {
  const problems = [];
  const inAlbum = (slug, name) => (effective.manifests.get(slug) ?? []).some(entry => entry.name === name);
  for (const album of effective.albums) {
    for (const entry of effective.manifests.get(album.slug) ?? []) {
      if (!isAvailable(album.slug, entry.name)) problems.push({ slug: album.slug, name: entry.name, reason: 'PHOTO_MISSING' });
    }
    if (album.coverName && !inAlbum(album.slug, album.coverName)) {
      problems.push({ slug: album.slug, name: album.coverName, reason: 'COVER_NOT_IN_ALBUM' });
    }
  }
  const hero = effective.site?.hero;
  if (hero && !(effective.albums.some(album => album.slug === hero.album) && inAlbum(hero.album, hero.name))) {
    problems.push({ slug: hero.album, name: hero.name, reason: 'HERO_NOT_IN_ALBUM' });
  }
  return problems;
}

/**
 * What the site will no longer use: every file of a removed album, and the photos taken
 * out of a kept album. Computed from the published manifests, so files that were never
 * in a manifest are never touched.
 * @returns {{prefixes: string[], keys: string[]}}
 */
function findDeletions(published, effective) {
  const kept = new Set(effective.albums.map(album => album.slug));
  const prefixes = published.albums.filter(album => !kept.has(album.slug)).map(album => `${album.slug}/`);
  const keys = [];
  for (const album of effective.albums) {
    const wanted = new Set((effective.manifests.get(album.slug) ?? []).map(entry => entry.name));
    for (const entry of published.manifests.get(album.slug) ?? []) {
      if (!wanted.has(entry.name)) keys.push(PUBLISHED.photo(album.slug, entry.name));
    }
  }
  return { prefixes, keys };
}

/**
 * Runs one step of the publication.
 * @param {object} env - Worker env with BUCKET and PRIVATE_BUCKET.
 * @param {{photosPerStep?: number}} [options]
 * @returns {Promise<{done: boolean, copied: number, remaining: number} | {problems: Array}>}
 *   `problems` when the draft cannot be published as it is; nothing has been written then.
 */
export async function publishStep(env, { photosPerStep = PHOTOS_PER_STEP } = {}) {
  if (!(await hasDraft(env))) return { done: true, copied: 0, remaining: 0 };

  const { published, effective, draft } = await loadStates(env);
  const staged = new Set(await listKeys(env.PRIVATE_BUCKET, STAGING.prefix));
  const publicKeys = new Set();
  for (const album of effective.albums) {
    for (const key of await listKeys(env.BUCKET, `${album.slug}/`)) publicKeys.add(key);
  }
  const isPublic = (slug, name) => publicKeys.has(PUBLISHED.photo(slug, name));
  const isStaged = (slug, name) => staged.has(STAGING.photo(slug, name));

  const problems = findProblems(effective, (slug, name) => isPublic(slug, name) || isStaged(slug, name));
  if (problems.length > 0) return { problems };

  // 1. New photos: from the private bucket to the public one, a batch per call.
  const toCopy = [];
  for (const album of effective.albums) {
    for (const entry of effective.manifests.get(album.slug) ?? []) {
      if (!isPublic(album.slug, entry.name)) toCopy.push({ slug: album.slug, name: entry.name });
    }
  }
  const batch = toCopy.slice(0, photosPerStep);
  for (const { slug, name } of batch) {
    const obj = await env.PRIVATE_BUCKET.get(STAGING.photo(slug, name));
    await env.BUCKET.put(PUBLISHED.photo(slug, name), obj.body, { httpMetadata: { contentType: 'image/webp' } });
  }
  if (toCopy.length > batch.length) {
    return { done: false, copied: batch.length, remaining: toCopy.length - batch.length };
  }

  // 2. Note what to delete BEFORE overwriting the manifests that tell us: if this call
  //    stops half-way, the next one still knows (the note survives until the close).
  const earlier = (await readJson(env.PRIVATE_BUCKET, DRAFT.cleanup)) ?? { prefixes: [], keys: [] };
  const found = findDeletions(published, effective);
  // An earlier note may name something the draft wants again: never delete that.
  const kept = new Set(effective.albums.map(album => `${album.slug}/`));
  const wanted = new Set(effective.albums.flatMap(album =>
    (effective.manifests.get(album.slug) ?? []).map(entry => PUBLISHED.photo(album.slug, entry.name))));
  const deletions = {
    prefixes: [...new Set([...earlier.prefixes, ...found.prefixes])].filter(prefix => !kept.has(prefix)),
    keys: [...new Set([...earlier.keys, ...found.keys])].filter(key => !wanted.has(key)),
  };
  await writeJson(env.PRIVATE_BUCKET, DRAFT.cleanup, deletions);

  // 3. Manifests, then the album list, then the site: the list never names an album
  //    whose photos are not in place yet.
  for (const slug of draft.manifests) {
    if (effective.albums.some(album => album.slug === slug)) {
      await writeJson(env.BUCKET, PUBLISHED.manifest(slug), effective.manifests.get(slug));
    }
  }
  if (draft.albums) await writeJson(env.BUCKET, PUBLISHED.albums, { albums: effective.albums });
  if (draft.site) await writeJson(env.BUCKET, PUBLISHED.site, effective.site);

  // 4. Delete what the site no longer uses.
  for (const prefix of deletions.prefixes) await deletePrefix(env.BUCKET, prefix);
  for (let i = 0; i < deletions.keys.length; i += 1000) await env.BUCKET.delete(deletions.keys.slice(i, i + 1000));

  // 5. Close: the draft is now the site.
  await deletePrefix(env.PRIVATE_BUCKET, DRAFT.prefix);
  await deletePrefix(env.PRIVATE_BUCKET, STAGING.prefix);
  return { done: true, copied: batch.length, remaining: 0 };
}
