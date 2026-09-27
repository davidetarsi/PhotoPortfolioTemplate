/**
 * What publishing the draft would change on the site, as a list the dashboard can count
 * and show. Pure: works on the states loaded by loadStates() in draft-store.js.
 */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const names = manifest => manifest.map(entry => entry.name);

/**
 * @param {{site: object|null, albums: Array, manifests: Map<string, Array>}} published
 * @param {{site: object|null, albums: Array, manifests: Map<string, Array>}} effective
 * @returns {Array<{type: string, slug?: string, count?: number}>} Changes, site first, then
 *   albums in the draft's order, then removed albums.
 */
export function diffDraft(published, effective) {
  const changes = [];
  if (!same(published.site, effective.site)) changes.push({ type: 'site' });

  const before = new Map(published.albums.map(album => [album.slug, album]));
  const after = new Map(effective.albums.map(album => [album.slug, album]));

  const keptBefore = published.albums.map(a => a.slug).filter(slug => after.has(slug));
  const keptAfter = effective.albums.map(a => a.slug).filter(slug => before.has(slug));
  if (!same(keptBefore, keptAfter)) changes.push({ type: 'albums-reordered' });

  for (const album of effective.albums) {
    const { slug } = album;
    if (!before.has(slug)) {
      changes.push({ type: 'album-added', slug });
    } else if (!same(before.get(slug), album)) {
      changes.push({ type: 'album-changed', slug });
    }
    const oldNames = names(published.manifests.get(slug) ?? []);
    const newNames = names(effective.manifests.get(slug) ?? []);
    const added = newNames.filter(name => !oldNames.includes(name)).length;
    const removed = oldNames.filter(name => !newNames.includes(name)).length;
    if (added) changes.push({ type: 'photos-added', slug, count: added });
    if (removed) changes.push({ type: 'photos-removed', slug, count: removed });
    const keptOld = oldNames.filter(name => newNames.includes(name));
    const keptNew = newNames.filter(name => oldNames.includes(name));
    if (!same(keptOld, keptNew)) changes.push({ type: 'photos-reordered', slug });
  }

  for (const album of published.albums) {
    if (!after.has(album.slug)) changes.push({ type: 'album-removed', slug: album.slug });
  }
  return changes;
}
