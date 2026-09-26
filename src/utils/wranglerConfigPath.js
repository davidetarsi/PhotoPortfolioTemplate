/**
 * Which Wrangler configuration the build reads.
 * A site commits its own wrangler.json; the template ships only wrangler.example.json,
 * whose placeholders stop a production build (buildHeaders) unless
 * ALLOW_PLACEHOLDER_CSP=1 says it is only a check that the template builds.
 *
 * @param {(path: string) => boolean} exists - Tells whether a file exists.
 * @returns {'wrangler.json' | 'wrangler.example.json'} The file to read.
 */
export function wranglerConfigPath(exists) {
  return exists('wrangler.json') ? 'wrangler.json' : 'wrangler.example.json';
}
