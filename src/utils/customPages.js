/**
 * Validates custom/pages.config.js and turns it into build inputs and output files.
 * Pure: file access comes in as fileExists, so vite.config.js and tests share it.
 */
import { RESERVED_SLUGS, SLUG_RE } from '../shared/content-rules.js';

const CONFIG = 'custom/pages.config.js';
const HTML_RE = /^custom\/pages\/[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\.html$/;

function fail(message) {
  throw new Error(`${CONFIG}: ${message}`);
}

function checkPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) fail(`path ${JSON.stringify(path)} must start with "/".`);
  if (path === '/') fail('"/" is the home page: replace it with the landing slot, not with a page.');
  const segments = path.slice(1).split('/');
  if (RESERVED_SLUGS.includes(segments[0])) fail(`"${path}" starts with "/${segments[0]}", which the template uses.`);
  if (segments.length > 2) fail(`"${path}" must have one or two segments.`);
  segments.forEach((segment, index) => {
    if (segment === ':slug') {
      if (index !== 1) fail(`"${path}": ":slug" must be the second of two segments, as in "/projects/:slug".`);
    } else if (!SLUG_RE.test(segment)) {
      fail(`"${path}": segments must be lowercase letters, digits and dashes.`);
    }
  });
  return segments;
}

/**
 * @param {unknown} pages - The default export of custom/pages.config.js.
 * @param {{ fileExists: (path: string) => boolean }} deps - Tells whether a repo-relative file exists.
 * @returns {Array<object>} Normalized pages, in declaration order.
 */
export function validateCustomPages(pages, { fileExists }) {
  if (!Array.isArray(pages)) {
    fail("must `export default` an array of pages, e.g. [{ path: '/archive', html: 'custom/pages/archive.html' }].");
  }
  const paths = new Set();
  const htmls = new Set();
  const normalized = pages.map(page => {
    if (typeof page !== 'object' || page === null) fail('every page must be an object with path and html.');
    const { path, html, entries } = page;
    const segments = checkPath(path);
    if (typeof html !== 'string' || !HTML_RE.test(html)) {
      fail(`"${path}": html ${JSON.stringify(html)} must be an .html file under custom/pages/.`);
    }
    if (!fileExists(html)) fail(`"${path}": ${html} does not exist.`);
    if (paths.has(path)) fail(`"${path}" is declared twice.`);
    if (htmls.has(html)) fail(`${html} is used by two pages.`);
    paths.add(path);
    htmls.add(html);

    if (segments[1] === ':slug') {
      if (entries === undefined) fail(`"${path}" is a collection: add entries (an array, or a function returning one).`);
      return { kind: 'collection', path, html, name: `${segments[0]}-collection`, prefix: segments[0], entries };
    }
    if (entries !== undefined) fail(`"${path}": only collections take entries.`);
    return { kind: 'single', path, html, name: segments.join('-'), outFile: `${segments.join('/')}.html` };
  });

  const prefixes = new Set(normalized.filter(p => p.kind === 'collection').map(p => p.prefix));
  for (const page of normalized) {
    const [first, second] = page.path.slice(1).split('/');
    if (page.kind === 'single' && second && prefixes.has(first)) {
      fail(`"${page.path}" collides with the collection "/${first}/:slug".`);
    }
  }
  return normalized;
}

/** Build inputs for vite.config.js, keyed so they never clash with the template's. */
export function customPageInputs(pages, resolvePath) {
  return Object.fromEntries(pages.map(page => [`page-${page.name}`, resolvePath(page.html)]));
}

/**
 * One output file per collection entry, with the values of its {{PAGE_*}} placeholders.
 * @param {{ path: string, prefix: string }} page - A normalized collection.
 * @param {unknown} entries - The resolved entries.
 */
export function expandCollection(page, entries) {
  if (!Array.isArray(entries)) fail(`entries of "${page.path}" must be an array (or a function returning one).`);
  const seen = new Set();
  return entries.map(entry => {
    const slug = entry?.slug;
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      fail(`"${page.path}": entry slug ${JSON.stringify(slug)} must be lowercase letters, digits and dashes.`);
    }
    if (seen.has(slug)) fail(`"${page.path}": entry "${slug}" is declared twice.`);
    seen.add(slug);
    if (typeof entry.title !== 'string' || !entry.title.trim()) fail(`"${page.path}": entry "${slug}" needs a title.`);
    const url = `/${page.prefix}/${slug}`;
    return {
      outFile: `${page.prefix}/${slug}.html`,
      url,
      meta: {
        PAGE_TITLE: entry.title,
        PAGE_DESCRIPTION: entry.description ?? '',
        PAGE_IMAGE: entry.image ?? '',
        PAGE_URL: url,
        PAGE_SLUG: slug,
      },
    };
  });
}

/** First path segments taken by the pages: the dashboard refuses them as album slugs. */
export function reservedSlugsOf(pages) {
  return [...new Set(pages.map(page => page.path.split('/')[1]))];
}
