/**
 * The site's links (social profiles, website, email): their kind, their label, and the
 * conversion from the old `social: { instagram: url }` shape. Shared by site and dashboard.
 */

/** Kinds recognised from the address, with the name shown when a link has no label. */
export const LINK_KINDS = Object.freeze({
  instagram: 'Instagram',
  behance: 'Behance',
  flickr: 'Flickr',
  '500px': '500px',
  vimeo: 'Vimeo',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  threads: 'Threads',
  bluesky: 'Bluesky',
  x: 'X',
  linkedin: 'LinkedIn',
  github: 'GitHub',
});

const HOST_KINDS = {
  'instagram.com': 'instagram',
  'behance.net': 'behance',
  'flickr.com': 'flickr',
  '500px.com': '500px',
  'vimeo.com': 'vimeo',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'tiktok.com': 'tiktok',
  'facebook.com': 'facebook',
  'threads.net': 'threads',
  'threads.com': 'threads',
  'bsky.app': 'bluesky',
  'x.com': 'x',
  'twitter.com': 'x',
  'linkedin.com': 'linkedin',
  'github.com': 'github',
};

/**
 * The kind of a link, from its address.
 * @param {string} url - An https:// or mailto: address.
 * @returns {string} A key of LINK_KINDS, 'email' for mailto:, otherwise 'website'.
 */
export function linkKind(url) {
  if (String(url).toLowerCase().startsWith('mailto:')) return 'email';
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'website';
  }
  host = host.replace(/^(www\.|m\.)/, '');
  return HOST_KINDS[host] ?? 'website';
}

/**
 * The text shown for a link: its own label, else the name of its kind.
 * @param {{url: string, label?: string}} link
 * @param {object} texts - UI copy; `texts.links.email` and `texts.links.website` name the generic kinds.
 * @returns {string}
 */
export function linkLabel(link, texts) {
  if (link.label?.trim()) return link.label.trim();
  const kind = linkKind(link.url);
  // A texts file without `links` (an old fork's copy) falls back to the address itself.
  return LINK_KINDS[kind] ?? texts?.links?.[kind] ?? link.url;
}

/**
 * The site's links in the current shape. A site saved before links existed has
 * `social: { network: url }`: its non-empty addresses become links, in order.
 * @param {{links?: Array, social?: object}} site
 * @returns {Array<{url: string, label?: string}>}
 */
export function normalizeLinks(site) {
  if (Array.isArray(site?.links)) return site.links;
  return Object.values(site?.social ?? {})
    .filter(url => typeof url === 'string' && url.trim())
    .map(url => ({ url: url.trim() }));
}
