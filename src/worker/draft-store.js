/**
 * Where the published site and the dashboard's draft live, and how to read them.
 * Published content is in the public bucket (BUCKET); the draft and the photos waiting
 * to be published are in the private bucket (PRIVATE_BUCKET), never reachable from r2.dev.
 */

export const PUBLISHED = Object.freeze({
  site: '_site/site.json',
  albums: '_data/albums.json',
  manifest: slug => `${slug}/manifest.json`,
  photo: (slug, name) => `${slug}/${name}`,
});

export const DRAFT = Object.freeze({
  prefix: 'draft/',
  site: 'draft/site.json',
  albums: 'draft/albums.json',
  manifest: slug => `draft/albums/${slug}/manifest.json`,
  // Written by a publication before it overwrites anything: what it still has to delete.
  cleanup: 'draft/cleanup.json',
  // Public photos a publication has copied so far: "discard" removes the ones no published
  // manifest names, so an interrupted publication leaves nothing public behind.
  copied: 'draft/copied.json',
});

export const STAGING = Object.freeze({
  prefix: 'staging/',
  photo: (slug, name) => `staging/${slug}/${name}`,
});

/**
 * Reads a JSON object. A missing key is null; unreadable JSON is an error, so a broken
 * file is never mistaken for an absent one.
 * @param {object} bucket - R2 binding.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function readJson(bucket, key) {
  const obj = await bucket.get(key);
  return obj ? obj.json() : null;
}

/**
 * Writes a JSON object.
 * @param {object} bucket - R2 binding.
 * @param {string} key
 * @param {any} data
 */
export function writeJson(bucket, key, data) {
  return bucket.put(key, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } });
}

/**
 * Every key under a prefix, following R2's pagination.
 * @param {object} bucket - R2 binding.
 * @param {string} prefix
 * @returns {Promise<string[]>}
 */
export async function listKeys(bucket, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    keys.push(...page.objects.map(o => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

/**
 * Deletes every key under a prefix, 1000 at a time (R2's limit per delete call).
 * @param {object} bucket - R2 binding.
 * @param {string} prefix
 * @returns {Promise<number>} How many keys were deleted.
 */
export async function deletePrefix(bucket, prefix) {
  const keys = await listKeys(bucket, prefix);
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
  return keys.length;
}

/** True when the draft or the waiting photos hold anything. */
export async function hasDraft(env) {
  const [draft, staging] = await Promise.all([
    env.PRIVATE_BUCKET.list({ prefix: DRAFT.prefix, limit: 1 }),
    env.PRIVATE_BUCKET.list({ prefix: STAGING.prefix, limit: 1 }),
  ]);
  return draft.objects.length > 0 || staging.objects.length > 0;
}

/**
 * The published site and the site as it will be after publishing (the "effective" draft):
 * each draft file that does not exist means "unchanged", so it falls back to the published one.
 * @param {object} env - Worker env with BUCKET and PRIVATE_BUCKET.
 * @returns {Promise<{published: object, effective: object, draft: object}>}
 *   Each of published and effective is `{ site, albums, manifests }`: site is an object or null,
 *   albums an array, manifests a Map slug → array. `draft` says which draft files exist.
 */
export async function loadStates(env) {
  const [pubSite, pubAlbums, draftSite, draftAlbums] = await Promise.all([
    readJson(env.BUCKET, PUBLISHED.site),
    readJson(env.BUCKET, PUBLISHED.albums),
    readJson(env.PRIVATE_BUCKET, DRAFT.site),
    readJson(env.PRIVATE_BUCKET, DRAFT.albums),
  ]);
  const publishedAlbums = pubAlbums?.albums ?? [];
  const effectiveAlbums = (draftAlbums ?? pubAlbums)?.albums ?? [];
  const slugs = [...new Set([...publishedAlbums, ...effectiveAlbums].map(a => a.slug))];

  const published = { site: pubSite, albums: publishedAlbums, manifests: new Map() };
  const effective = { site: draftSite ?? pubSite, albums: effectiveAlbums, manifests: new Map() };
  const draftManifests = new Set();
  await Promise.all(slugs.map(async slug => {
    const [pub, drf] = await Promise.all([
      readJson(env.BUCKET, PUBLISHED.manifest(slug)),
      readJson(env.PRIVATE_BUCKET, DRAFT.manifest(slug)),
    ]);
    published.manifests.set(slug, pub ?? []);
    effective.manifests.set(slug, drf ?? pub ?? []);
    if (drf) draftManifests.add(slug);
  }));
  return {
    published,
    effective,
    draft: { site: draftSite !== null, albums: draftAlbums !== null, manifests: draftManifests },
  };
}
