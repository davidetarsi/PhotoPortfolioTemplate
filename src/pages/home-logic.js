/**
 * Pure logic for home page bootstrap: testable without DOM or network.
 */
import { photoUrl } from '../providers/r2.js';
import { resolveHeroUrl } from '../utils/resolveHeroUrl.js';
import { normalizeLinks } from '../shared/site-links.js';

/**
 * Resolves site content from runtime fetch or fallback to build config.
 * @param {{ok: boolean, data?: object, error?: string}} siteRes - Result of fetchSite().
 * @param {object} buildConfig - Site configuration from config/site.config.js.
 * @returns {object} Site content with name, bio, links, texts (page text overrides) and heroUrl.
 */
export function resolveSiteContent(siteRes, buildConfig) {
  if (siteRes.ok) {
    const s = siteRes.data;
    return {
      name: s.name,
      bio: s.bio,
      links: normalizeLinks(s),
      texts: s.texts ?? {},
      heroUrl: s.hero ? photoUrl(buildConfig.r2PublicUrl, s.hero.album, s.hero.name) : null,
    };
  }
  // Asymmetric fallback is deliberate: site identity falls back on every fetch
  // failure so the page always has a frame; albums fall back only when R2 has no
  // albums.json yet. Corrupt or unreachable runtime album data stays visible.
  // Accepted risk: an accidentally emptied or misconfigured bucket also returns
  // NOT_FOUND and therefore looks like a new installation using the seed.
  return {
    name: buildConfig.name,
    bio: buildConfig.bio,
    links: normalizeLinks(buildConfig),
    texts: {},
    heroUrl: resolveHeroUrl(buildConfig.heroImage, buildConfig.r2PublicUrl),
  };
}

/**
 * Resolves runtime albums or the normalized build seed for a new installation.
 * @param {{ok: boolean, data?: Array, error?: string}} albumsRes
 * @param {Array} buildAlbums
 * @returns {Array|null} Albums to render, or null when the fetch error must stay visible.
 */
export function resolveAlbums(albumsRes, buildAlbums) {
  if (albumsRes.ok) return albumsRes.data;
  if (albumsRes.error !== 'NOT_FOUND') return null;
  return buildAlbums.map(album => ({
    ...album,
    coverName: album.coverName || null,
  }));
}

/**
 * Transforms album objects into card data for display.
 * @param {Array} albums - Album objects with slug, title, description, coverName.
 * @param {string|undefined|null} r2PublicUrl - Optional public R2 bucket URL.
 * @returns {Array} Card objects ready to render.
 */
export function albumsToCards(albums, r2PublicUrl) {
  return albums.map(a => ({
    slug: a.slug,
    title: a.title,
    description: a.description,
    coverUrl: a.coverName ? photoUrl(r2PublicUrl, a.slug, a.coverName) : null,
  }));
}
