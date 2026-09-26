import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { customPageInputs, validateCustomPages } from './customPages.js';
import { customPagesPlugin } from './customPagesPlugin.js';

const roots = [];
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

describe('custom pages in a real Vite build', () => {
  it('writes single pages and collection entries at their public path', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'f3-custom-pages-')));
    roots.push(root);
    mkdirSync(join(root, 'custom/pages'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<!doctype html><html><head></head><body><script type="module" src="/main.js"></script></body></html>');
    writeFileSync(join(root, 'main.js'), 'document.title = "home";');
    writeFileSync(join(root, 'custom/pages/archive.html'), '<!doctype html><html><head><title>Archive</title></head><body><script type="module" src="/custom/pages/archive.js"></script></body></html>');
    writeFileSync(join(root, 'custom/pages/archive.js'), 'document.body.dataset.page = "archive";');
    writeFileSync(join(root, 'custom/pages/project.html'), '<!doctype html><html><head><title>{{PAGE_TITLE}}</title>\n<meta property="og:image" content="{{PAGE_IMAGE}}">\n</head><body></body></html>');

    const pages = validateCustomPages([
      { path: '/archive', html: 'custom/pages/archive.html' },
      { path: '/projects/:slug', html: 'custom/pages/project.html', entries: async () => [{ slug: 'one', title: 'One & only' }] },
    ], { fileExists: p => existsSync(join(root, p)) });

    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [customPagesPlugin(pages)],
      build: {
        outDir: join(root, 'dist'),
        rollupOptions: { input: { main: join(root, 'index.html'), ...customPageInputs(pages, p => join(root, p)) } },
      },
    });

    const archive = readFileSync(join(root, 'dist/archive.html'), 'utf8');
    expect(archive).toMatch(/<script type="module" crossorigin src="\/assets\/page-archive-[^"]+\.js"><\/script>/);
    expect(readFileSync(join(root, 'dist/projects/one.html'), 'utf8')).toContain('<title>One &amp; only</title>');
    expect(readFileSync(join(root, 'dist/projects/one.html'), 'utf8')).not.toContain('og:image');
    expect(existsSync(join(root, 'dist/custom'))).toBe(false);
  });
});
