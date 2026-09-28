/**
 * The dashboard takes its colours and fonts from the site's own theme (custom/theme.css),
 * so each installation gets a dashboard that matches its site. Only custom properties of
 * `:root` are read, never selectors: a broken theme cannot break the dashboard.
 * Without a custom theme the dashboard keeps its own look (src/dashboard/styles/tokens.css).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Site token → dashboard token. */
export const ADMIN_TOKEN_MAP = Object.freeze({
  '--color-bg': '--admin-bg',
  '--color-surface': '--admin-surface',
  '--color-text': '--admin-ink',
  '--color-muted': '--admin-muted',
  '--color-border': '--admin-line',
  '--color-accent': '--admin-accent',
  '--font-body': '--admin-font-body',
  '--font-heading': '--admin-font-display',
  '--font-mono': '--admin-font-mono',
});

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Relative luminance of a #rgb / #rrggbb colour (WCAG), or null for anything else. */
function luminance(color) {
  const match = HEX_RE.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The dashboard tokens found in a theme's CSS.
 * Reads `--name: value;` declarations inside `:root { … }` blocks: site tokens are mapped
 * with ADMIN_TOKEN_MAP, `--admin-*` tokens are taken as they are. Values that depend on
 * other variables (`var(…)`) are skipped: the dashboard does not load the site's theme.
 * When the accent is a hex colour, the text on it (`--admin-on-accent`) is chosen dark or
 * light for contrast, unless the theme sets it.
 * @param {string} cssText
 * @returns {Record<string, string>} Dashboard custom properties.
 */
export function adminThemeTokens(cssText) {
  const tokens = {};
  const withoutComments = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, body] of withoutComments.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const [, name, rawValue] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) {
      const value = rawValue.trim();
      if (!value || value.includes('var(')) continue;
      if (name.startsWith('--admin-')) tokens[name] = value;
      else if (ADMIN_TOKEN_MAP[name] && !(ADMIN_TOKEN_MAP[name] in tokens)) tokens[ADMIN_TOKEN_MAP[name]] = value;
    }
  }
  if (tokens['--admin-accent'] && !tokens['--admin-on-accent']) {
    const l = luminance(tokens['--admin-accent']);
    if (l !== null) tokens['--admin-on-accent'] = l > 0.35 ? '#141517' : '#ffffff';
  }
  return tokens;
}

const VIRTUAL_ID = 'virtual:admin-theme';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/**
 * Vite plugin: `import tokens from 'virtual:admin-theme'` gives the dashboard tokens read
 * from custom/theme.css at build time (an empty object without a custom theme).
 * @param {{root?: string}} [options]
 */
export function createAdminThemePlugin({ root = process.cwd() } = {}) {
  const themeFile = resolve(root, 'custom/theme.css');
  return {
    name: 'admin-theme',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const tokens = existsSync(themeFile) ? adminThemeTokens(readFileSync(themeFile, 'utf8')) : {};
      return `export default ${JSON.stringify(tokens)};`;
    },
  };
}
