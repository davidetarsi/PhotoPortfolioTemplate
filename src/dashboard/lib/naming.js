// Upload filename normalization. Legacy names on R2 (with uppercase) remain
// valid on the server; NEW uploads are always normalized this way.

/**
 * Normalizes an upload filename to lowercase, URL-safe format with .webp extension.
 * @param {string} original - The original filename.
 * @returns {string} Normalized filename with .webp extension.
 */
export function normalizeFilename(original) {
  const stem = String(original).replace(/\.[^.]*$/, '');
  const clean = stem
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  return `${clean || 'foto'}.webp`;
}

/**
 * Assigns a unique filename by appending a counter if the base name is already taken.
 * @param {string} base - The base filename.
 * @param {Set<string>} taken - Set of already-used filenames.
 * @returns {string} A unique filename not in the taken set.
 */
export function assignUniqueName(base, taken) {
  if (!taken.has(base)) return base;
  const stem = base.slice(0, -'.webp'.length);
  for (let i = 2; ; i++) {
    const candidate = `${stem}-${i}.webp`;
    if (!taken.has(candidate)) return candidate;
  }
}
