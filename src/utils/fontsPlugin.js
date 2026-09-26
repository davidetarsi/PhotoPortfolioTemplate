const GOOGLE_FONTS = 'https://fonts.googleapis.com/';

/**
 * The <link> tags for a Google Fonts stylesheet: two preconnects and the stylesheet.
 * Only Google Fonts is accepted because the Content Security Policy allows only it.
 *
 * @param {string|undefined} url - googleFontsUrl from theme/fonts.js; empty = no fonts.
 * @returns {Array<object>} Vite HTML tag descriptors.
 */
export function fontLinkTags(url) {
  if (!url) return [];
  if (!url.startsWith(GOOGLE_FONTS)) {
    throw new Error(`theme/fonts.js: googleFontsUrl must start with ${GOOGLE_FONTS} (the CSP allows only Google Fonts).`);
  }
  return [
    { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'stylesheet', href: url }, injectTo: 'head' },
  ];
}

/** Adds the web-font links to every HTML page, in dev and in the build. */
export function createFontsPlugin(url) {
  const tags = fontLinkTags(url);
  return {
    name: 'google-fonts',
    transformIndexHtml: { order: 'pre', handler: () => tags },
  };
}
