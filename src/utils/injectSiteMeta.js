import { resolveHeroUrl } from './resolveHeroUrl.js';
import { escapeHtml } from '../shared/html.js';

/**
 * Injects site metadata placeholders into HTML templates.
 * Replaces `{{SITE_*}}` placeholders with values from site.config.js so that
 * social crawlers (which don't execute JS) see real titles and Open Graph meta tags.
 * Meta tags whose content is empty are removed.
 *
 * @param {string} html - HTML template with placeholder markers.
 * @param {object} siteConfig - Site configuration object.
 * @param {string} r2PublicUrl - Public R2 bucket URL for resolving hero image paths.
 * @returns {string} HTML with metadata injected and empty meta tags removed.
 */
export function injectSiteMeta(html, siteConfig, r2PublicUrl) {
  const values = {
    SITE_NAME: siteConfig.name ?? '',
    SITE_BIO: siteConfig.bio ?? '',
    SITE_LANG: siteConfig.language ?? '',
    SITE_IMAGE: resolveHeroUrl(siteConfig.heroImage, r2PublicUrl) ?? '',
  };

  const replaced = html.replace(/\{\{(SITE_[A-Z]+)\}\}/g, (match, key) =>
    key in values ? escapeHtml(values[key]) : match,
  );

  return replaced.replace(/[ \t]*<meta[^>]*content=""[^>]*>\n?/g, '');
}
