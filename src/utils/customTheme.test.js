import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createCustomThemePlugins, customThemeRollupInput } from './customTheme.js';

const temporaryRoots = [];

function fixtureRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'f2-custom-theme-')));
  temporaryRoots.push(root);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><html><head></head><body><script type="module" src="/src/main.js"></script></body></html>');
  writeFileSync(join(root, 'admin.html'), '<!doctype html><html><head></head><body><script type="module" src="/src/admin.js"></script></body></html>');
  writeFileSync(join(root, 'src/main.js'), "import './base.css'; import('./lazy.js');");
  writeFileSync(join(root, 'src/base.css'), '.base { color: black; }');
  writeFileSync(join(root, 'src/lazy.js'), "import './lazy.css'; export const ready = true;");
  writeFileSync(join(root, 'src/lazy.css'), '.lazy-slot { --loaded: yes; }');
  writeFileSync(join(root, 'src/admin.js'), "import './admin.css';");
  writeFileSync(join(root, 'src/admin.css'), '.admin { color: black; }');
  return root;
}

async function buildFixture(root, customTheme) {
  const themeFile = join(root, 'custom/theme.css');
  const input = {
    index: join(root, 'index.html'),
    admin: join(root, 'admin.html'),
    ...(customTheme ? customThemeRollupInput(themeFile) : {}),
  };
  await build({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: createCustomThemePlugins({ root, themeFile }),
    build: {
      outDir: join(root, 'dist'),
      assetsInlineLimit: 0,
      rollupOptions: { input },
    },
  });
}

afterEach(() => {
  while (temporaryRoots.length) rmSync(temporaryRoots.pop(), { recursive: true, force: true });
});

describe('custom theme Vite integration', () => {
  it('emits imported theme CSS last on public HTML, keeps admin isolated, and processes lazy CSS/assets', async () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'custom'));
    writeFileSync(join(root, 'custom/theme.css'), "@import './imported.css'; .custom-nav { background-image: url('./texture.svg'); }");
    writeFileSync(join(root, 'custom/imported.css'), '.theme-imported { --processed: yes; }');
    writeFileSync(join(root, 'custom/texture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path fill="#123456" d="M0 0h2v2H0z"/></svg>');

    await buildFixture(root, true);

    const publicHtml = readFileSync(join(root, 'dist/index.html'), 'utf8');
    const adminHtml = readFileSync(join(root, 'dist/admin.html'), 'utf8');
    const stylesheets = [...publicHtml.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(([tag]) => tag);
    const themeLink = stylesheets.find(tag => tag.includes('data-custom-theme'));
    const themeCss = readdirSync(join(root, 'dist/assets')).find(name => name.startsWith('theme-') && name.endsWith('.css'));
    const lazyCss = readdirSync(join(root, 'dist/assets')).find(name => name.startsWith('lazy-') && name.endsWith('.css'));
    const emittedSvg = readdirSync(join(root, 'dist/assets')).find(name => name.endsWith('.svg'));

    expect(customThemeRollupInput(join(root, 'custom/theme.css'))).toEqual({ theme: join(root, 'custom/theme.css') });
    expect(themeLink).toContain(`/assets/${themeCss}`);
    expect(stylesheets.at(-1)).toBe(themeLink);
    expect(adminHtml).not.toContain('data-custom-theme');
    expect(adminHtml).not.toContain(themeCss);
    expect(themeCss).toBeTruthy();
    expect(readFileSync(join(root, 'dist/assets', themeCss), 'utf8')).toContain('.theme-imported');
    expect(readFileSync(join(root, 'dist/assets', themeCss), 'utf8')).toContain(`/${basename(emittedSvg)}`);
    expect(lazyCss).toBeTruthy();
    expect(readFileSync(join(root, 'dist/assets', lazyCss), 'utf8')).toContain('.lazy-slot');
    expect(publicHtml).not.toContain(lazyCss);
  });

  it('omits the theme input and link when custom/theme.css is absent', async () => {
    const root = fixtureRoot();
    await buildFixture(root, false);
    expect(customThemeRollupInput(join(root, 'custom/theme.css'))).toEqual({});
    expect(readFileSync(join(root, 'dist/index.html'), 'utf8')).not.toContain('data-custom-theme');
    expect(readdirSync(join(root, 'dist/assets')).some(name => name.startsWith('theme-') && name.endsWith('.css'))).toBe(false);
  });
});
