import { describe, expect, it } from 'vitest';
import { customPageInputs, expandCollection, reservedSlugsOf, validateCustomPages } from './customPages.js';

const exists = () => true;
const validate = pages => validateCustomPages(pages, { fileExists: exists });

describe('validateCustomPages', () => {
  it('normalizes a single page, a two-segment single page and a collection', () => {
    expect(validate([
      { path: '/archive', html: 'custom/pages/archive.html' },
      { path: '/projects', html: 'custom/pages/projects.html' },
      { path: '/projects/:slug', html: 'custom/pages/project.html', entries: [] },
      { path: '/info/credits', html: 'custom/pages/credits.html' },
    ])).toEqual([
      { kind: 'single', path: '/archive', html: 'custom/pages/archive.html', name: 'archive', outFile: 'archive.html' },
      { kind: 'single', path: '/projects', html: 'custom/pages/projects.html', name: 'projects', outFile: 'projects.html' },
      { kind: 'collection', path: '/projects/:slug', html: 'custom/pages/project.html', name: 'projects-collection', prefix: 'projects', entries: [] },
      { kind: 'single', path: '/info/credits', html: 'custom/pages/credits.html', name: 'info-credits', outFile: 'info/credits.html' },
    ]);
  });

  it('accepts entries given as a function', () => {
    const entries = () => [];
    expect(validate([{ path: '/p/:slug', html: 'custom/pages/p.html', entries }])[0].entries).toBe(entries);
  });

  it.each([
    ['/', /"\/" is the home page/],
    ['/about', /template uses/],
    ['/admin/x', /template uses/],
    ['/album', /template uses/],
    ['/index', /template uses/],
    ['/api', /template uses/],
    ['/assets/x', /template uses/],
    ['archive', /must start with/],
    ['/Archive', /lowercase letters/],
    ['/a/b/c', /one or two segments/],
    ['/:slug', /":slug" must be the second of two segments/],
    ['/:slug/x', /":slug" must be the second of two segments/],
    ['/archive/', /lowercase letters/],
  ])('rejects path %s', (path, message) => {
    expect(() => validate([{ path, html: 'custom/pages/x.html' }])).toThrow(message);
  });

  it('prefixes every message with the config file name', () => {
    expect(() => validate([{ path: '/', html: 'custom/pages/x.html' }])).toThrow(/^custom\/pages\.config\.js: /);
  });

  it('rejects a config that is not an array', () => {
    expect(() => validate({ path: '/x' })).toThrow(/export default` an array/);
  });

  it.each(['index.html', 'custom/pages/x.htm', 'custom/pages/../../index.html', 'custom/x.html'])(
    'rejects html %s', html => {
      expect(() => validate([{ path: '/x', html }])).toThrow(/custom\/pages\//);
    },
  );

  it('rejects a missing html file, naming it', () => {
    expect(() => validateCustomPages([{ path: '/x', html: 'custom/pages/x.html' }], { fileExists: () => false }))
      .toThrow(/custom\/pages\/x\.html/);
  });

  it('rejects a path declared twice', () => {
    expect(() => validate([
      { path: '/x', html: 'custom/pages/x.html' },
      { path: '/x', html: 'custom/pages/y.html' },
    ])).toThrow(/"\/x" is declared twice/);
  });

  it('rejects an html file used by two pages', () => {
    expect(() => validate([
      { path: '/x', html: 'custom/pages/x.html' },
      { path: '/y', html: 'custom/pages/x.html' },
    ])).toThrow(/used by two pages/);
  });

  it('rejects a collection without entries and a single page with entries', () => {
    expect(() => validate([{ path: '/c/:slug', html: 'custom/pages/c.html' }])).toThrow(/is a collection: add entries/);
    expect(() => validate([{ path: '/c', html: 'custom/pages/c.html', entries: [] }])).toThrow(/only collections take entries/);
  });

  it('rejects a two-segment single page under a collection prefix', () => {
    expect(() => validate([
      { path: '/projects/:slug', html: 'custom/pages/project.html', entries: [] },
      { path: '/projects/about-us', html: 'custom/pages/about-us.html' },
    ])).toThrow(/collides with the collection/);
  });
});

describe('expandCollection', () => {
  const page = { kind: 'collection', path: '/projects/:slug', prefix: 'projects' };

  it('produces one output per entry with its meta', () => {
    expect(expandCollection(page, [
      { slug: 'sea-sentinels', title: 'Sea Sentinels', description: 'App', image: 'https://x/y.webp' },
      { slug: 'bare', title: 'Bare' },
    ])).toEqual([
      {
        outFile: 'projects/sea-sentinels.html',
        url: '/projects/sea-sentinels',
        meta: { PAGE_TITLE: 'Sea Sentinels', PAGE_DESCRIPTION: 'App', PAGE_IMAGE: 'https://x/y.webp', PAGE_URL: '/projects/sea-sentinels', PAGE_SLUG: 'sea-sentinels' },
      },
      {
        outFile: 'projects/bare.html',
        url: '/projects/bare',
        meta: { PAGE_TITLE: 'Bare', PAGE_DESCRIPTION: '', PAGE_IMAGE: '', PAGE_URL: '/projects/bare', PAGE_SLUG: 'bare' },
      },
    ]);
  });

  it('rejects entries that are not an array', () => {
    expect(() => expandCollection(page, { slug: 'a' })).toThrow(/must be an array/);
  });

  it('rejects invalid or duplicate slugs and a missing title', () => {
    expect(() => expandCollection(page, [{ slug: 'Bad Slug', title: 'x' }])).toThrow(/slug "Bad Slug"/);
    expect(() => expandCollection(page, [{ slug: 'a', title: 'x' }, { slug: 'a', title: 'y' }])).toThrow(/"a" is declared twice/);
    expect(() => expandCollection(page, [{ slug: 'a', title: ' ' }])).toThrow(/needs a title/);
  });
});

describe('reservedSlugsOf / customPageInputs', () => {
  const pages = [
    { kind: 'single', path: '/archive', html: 'custom/pages/archive.html', name: 'archive', outFile: 'archive.html' },
    { kind: 'single', path: '/projects', html: 'custom/pages/projects.html', name: 'projects', outFile: 'projects.html' },
    { kind: 'collection', path: '/projects/:slug', html: 'custom/pages/project.html', name: 'projects-collection', prefix: 'projects', entries: [] },
  ];

  it('reserves unique first segments', () => {
    expect(reservedSlugsOf(pages)).toEqual(['archive', 'projects']);
  });

  it('maps each page to a build input', () => {
    expect(customPageInputs(pages, p => `/abs/${p}`)).toEqual({
      'page-archive': '/abs/custom/pages/archive.html',
      'page-projects': '/abs/custom/pages/projects.html',
      'page-projects-collection': '/abs/custom/pages/project.html',
    });
  });
});
