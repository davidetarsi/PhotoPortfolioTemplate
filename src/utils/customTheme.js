import { basename, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const PUBLIC_PAGES = new Set(['index.html', 'album.html', 'about.html']);

export function customThemeRollupInput(themeFile) {
  return existsSync(themeFile) ? { theme: themeFile } : {};
}

function appendThemeLink(html, href) {
  const tag = `<link rel="stylesheet" href="${href}" data-custom-theme>`;
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

/** Vite theme entry plus public HTML linking, tied to the `theme` CSS input. */
export function createCustomThemePlugins({ root = process.cwd(), themeFile = resolve(root, 'custom/theme.css') } = {}) {
  return [
    {
      name: 'optional-custom-theme-link',
      enforce: 'pre',
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          if (!existsSync(themeFile) || !PUBLIC_PAGES.has(basename(context.filename))) return html;
          if (html.includes('data-custom-theme')) return html;
          return appendThemeLink(html, '/custom/theme.css');
        },
      },
    },
    {
      name: 'finalize-custom-theme-link',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler(html, context) {
          if (!existsSync(themeFile) || !PUBLIC_PAGES.has(basename(context.filename))) return html;
          const linkPattern = /<link\b(?=[^>]*\bhref=(['"])[^'"]*\/assets\/theme-[^'"]+\.css\1)[^>]*>/i;
          const existing = html.match(linkPattern)?.[0];
          const link = (existing ?? '<link rel="stylesheet" href="/assets/theme.css">')
            .replace(/\sdata-custom-theme(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/i, '')
            .replace(/\s*\/?>$/, ' data-custom-theme>');
          if (existing) html = html.replace(existing, '');
          html = appendThemeLink(html, link.match(/href=(['"])(.*?)\1/i)?.[2] ?? '/assets/theme.css');
          return html.replace(/<link rel="stylesheet" href="[^"]*" data-custom-theme>/, link);
        },
      },
    },
    {
      // The `theme` input is CSS only; when its CSS is shared with the public pages,
      // Vite keeps an empty JavaScript entry for it that nothing loads.
      name: 'drop-empty-custom-theme-chunk',
      apply: 'build',
      enforce: 'post',
      generateBundle: {
        // After Vite's HTML generation, which reads the chunk to link the theme CSS.
        order: 'post',
        handler(_options, bundle) {
          for (const [fileName, output] of Object.entries(bundle)) {
            const empty = output.code?.replace(/\/\*[\s\S]*?\*\//g, '').trim() === '';
            if (output.type === 'chunk' && output.isEntry && output.facadeModuleId === themeFile && empty) {
              delete bundle[fileName];
            }
          }
        },
      },
    },
  ];
}
