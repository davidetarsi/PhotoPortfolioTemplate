/**
 * The only module code in custom/ may import. Everything else in src/ is internal
 * and may change in any template update. Removing or renaming an export here, or
 * changing its arguments or what it returns, is a breaking change for forks: note it
 * in docs/upgrading.md. Adding an export, or a field to an object it returns, is safe.
 */
export { albumsToCards } from '../pages/home-logic.js';
export { fetchSite, fetchAlbums, fetchManifest, fetchConfig } from '../providers/data.js';
export { photosFromManifest } from '../providers/r2.js';
export { resolveSiteContent, resolveAlbums } from '../pages/home-logic.js';
export { on } from '../core/events.js';
export { slugFromPath } from '../utils/slugFromPath.js';
export { texts } from '../../config/texts.config.js';
export { siteConfig } from '../../config/site.config.js';

/** Resolve a slot on demand without making the registry part of every API import. */
export async function slot(name) {
  const registry = await import('../core/custom-slots.js');
  return registry.slot(name);
}
