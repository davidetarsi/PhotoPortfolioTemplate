import { describe, expect, it, vi } from 'vitest';
import { customPagesPlugin } from './customPagesPlugin.js';

const single = { kind: 'single', path: '/archive', html: 'custom/pages/archive.html', name: 'archive', outFile: 'archive.html' };
const collection = (entries) => ({ kind: 'collection', path: '/projects/:slug', html: 'custom/pages/project.html', name: 'projects-collection', prefix: 'projects', entries });
const asset = source => ({ type: 'asset', source });

function run(pages, bundle) {
  const emitted = [];
  const ctx = {
    emitFile: vi.fn(file => emitted.push(file)),
    error: message => { throw new Error(message); },
  };
  return customPagesPlugin(pages).generateBundle.handler.call(ctx, {}, bundle).then(() => emitted);
}

describe('customPagesPlugin', () => {
  it('serves the reserved first segments as a virtual module', () => {
    const plugin = customPagesPlugin([single, collection([])]);
    const id = plugin.resolveId('virtual:custom-pages');
    expect(id).toBe('\0virtual:custom-pages');
    expect(plugin.load(id)).toBe('export const CUSTOM_PAGE_SLUGS = ["archive","projects"];');
    expect(plugin.resolveId('other')).toBeNull();
    expect(plugin.load('other')).toBeNull();
  });

  it('serves an empty list without pages', () => {
    const plugin = customPagesPlugin([]);
    expect(plugin.load(plugin.resolveId('virtual:custom-pages'))).toBe('export const CUSTOM_PAGE_SLUGS = [];');
  });

  it('moves a single page to its public path', async () => {
    const bundle = { 'custom/pages/archive.html': asset('<h1>Archive</h1>'), 'index.html': asset('home') };
    const emitted = await run([single], bundle);
    expect(emitted).toEqual([{ type: 'asset', fileName: 'archive.html', source: '<h1>Archive</h1>' }]);
    expect(Object.keys(bundle)).toEqual(['index.html']);
  });

  it('expands a collection, from an array or an async function', async () => {
    const source = '<title>{{PAGE_TITLE}}</title>';
    for (const entries of [
      [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }],
      async () => [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }],
    ]) {
      const bundle = { 'custom/pages/project.html': asset(source) };
      const emitted = await run([collection(entries)], bundle);
      expect(emitted.map(f => [f.fileName, f.source])).toEqual([
        ['projects/a.html', '<title>A</title>'],
        ['projects/b.html', '<title>B</title>'],
      ]);
      expect(bundle).toEqual({});
    }
  });

  it('fails the build when a declared page was not built', async () => {
    await expect(run([single], {})).rejects.toThrow('custom/pages.config.js: custom/pages/archive.html was not built.');
  });
});
