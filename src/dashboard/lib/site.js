/**
 * The site as the dashboard edits it: always in the current shape (`links`, never the old
 * `social`), with defaults where the draft has nothing yet. Plain JavaScript (no React).
 */
import { normalizeLinks } from '../../shared/site-links.js';

/**
 * @param {object|null} site - The draft's site (the published one when there is no draft),
 *   or null on a new installation.
 * @param {{name: string, bio?: string, heroImage?: object|null, links?: Array, social?: object}} defaults -
 *   config/site.config.js, used when there is no site yet.
 * @returns {{name: string, bio: string, hero: {album: string, name: string}|null,
 *   links: Array<{url: string, label?: string}>, texts: Record<string, string>}}
 */
export function siteForEditing(site, defaults) {
  if (!site) {
    return { name: defaults.name, bio: defaults.bio ?? '', hero: defaults.heroImage ?? null, links: normalizeLinks(defaults), texts: {} };
  }
  return { name: site.name, bio: site.bio ?? '', hero: site.hero ?? null, links: normalizeLinks(site), texts: site.texts ?? {} };
}
