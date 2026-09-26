/**
 * How the dashboard reads the album list at start-up.
 * A new installation has no albums.json yet: that is an empty list, not an error, and
 * the first album saved from the dashboard creates the file. Any other failure (network,
 * server, malformed data) stays an error, so a broken list is never mistaken for an
 * empty one and overwritten.
 *
 * @param {{ok: boolean, data?: Array, error?: string}} res - Result of fetchAlbums().
 * @returns {{ok: boolean, albums: Array}} The albums to edit, and whether loading worked.
 */
export function resolveAdminAlbums(res) {
  if (res.ok) return { ok: true, albums: res.data };
  if (res.error === 'NOT_FOUND') return { ok: true, albums: [] };
  return { ok: false, albums: [] };
}
