import { expandCollection, reservedSlugsOf } from './customPages.js';
import { injectPageMeta } from './injectPageMeta.js';

const VIRTUAL_ID = 'virtual:custom-pages';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Builds the pages of custom/pages.config.js at their public path and tells the
 * dashboard which first segments they take (virtual:custom-pages).
 *
 * @param {Array<object>} pages - Output of validateCustomPages; [] when there is no config.
 */
export function customPagesPlugin(pages) {
  return {
    name: 'custom-pages',
    enforce: 'post',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      return id === RESOLVED_ID ? `export const CUSTOM_PAGE_SLUGS = ${JSON.stringify(reservedSlugsOf(pages))};` : null;
    },
    generateBundle: {
      // After Vite's HTML generation: the built page assets exist only from that point.
      order: 'post',
      async handler(_options, bundle) {
        for (const page of pages) {
          const built = bundle[page.html];
          if (!built || built.type !== 'asset') this.error(`custom/pages.config.js: ${page.html} was not built.`);
          const source = String(built.source);
          delete bundle[page.html];
          if (page.kind === 'single') {
            this.emitFile({ type: 'asset', fileName: page.outFile, source });
            continue;
          }
          const entries = typeof page.entries === 'function' ? await page.entries() : page.entries;
          for (const { outFile, meta } of expandCollection(page, entries)) {
            this.emitFile({ type: 'asset', fileName: outFile, source: injectPageMeta(source, meta) });
          }
        }
      },
    },
  };
}
