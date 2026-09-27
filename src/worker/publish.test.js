// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { publishStep } from './publish.js';
import { makeFakeBucket } from './test-helpers.js';

const site = { name: 'Davide', bio: '', hero: null, links: [] };
const album = (slug, extra = {}) => ({ slug, title: slug, description: '', coverName: null, ...extra });
const photo = name => ({ name, width: 4, height: 3 });

// Published: album "notte" with a.webp and b.webp; album "sport" with s.webp.
const publishedFiles = () => ({
  '_site/site.json': site,
  '_data/albums.json': { albums: [album('notte'), album('sport')] },
  'notte/manifest.json': [photo('a.webp'), photo('b.webp')],
  'notte/a.webp': 'A', 'notte/b.webp': 'B',
  'sport/manifest.json': [photo('s.webp')],
  'sport/s.webp': 'S',
});
const makeEnv = (privateFiles = {}) => ({
  BUCKET: makeFakeBucket(publishedFiles()),
  PRIVATE_BUCKET: makeFakeBucket(privateFiles),
});
const text = (bucket, key) => bucket.store.get(key)?.text;
const json = (bucket, key) => JSON.parse(text(bucket, key));

describe('publishStep', () => {
  it('without a draft there is nothing to do', async () => {
    const env = makeEnv();
    expect(await publishStep(env)).toEqual({ done: true, copied: 0, remaining: 0 });
    expect(json(env.BUCKET, '_data/albums.json').albums).toHaveLength(2);
  });

  it('publishes a full draft: new photos, manifests, albums, site; then removes the draft', async () => {
    const env = makeEnv({
      'draft/site.json': { ...site, bio: 'Nuova bio', hero: { album: 'notte', name: 'c.webp' } },
      'draft/albums.json': { albums: [album('notte', { coverName: 'c.webp' })] }, // sport removed
      'draft/albums/notte/manifest.json': [photo('c.webp'), photo('a.webp')], // b removed, c new
      'staging/notte/c.webp': 'C',
    });

    expect(await publishStep(env)).toEqual({ done: true, copied: 1, remaining: 0 });

    expect(text(env.BUCKET, 'notte/c.webp')).toBe('C');
    expect(env.BUCKET.store.get('notte/c.webp').contentType).toBe('image/webp');
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['c.webp', 'a.webp']);
    expect(json(env.BUCKET, '_data/albums.json')).toEqual({ albums: [album('notte', { coverName: 'c.webp' })] });
    expect(json(env.BUCKET, '_site/site.json').bio).toBe('Nuova bio');
    // Cleanup: b.webp taken out, the whole "sport" album removed; a.webp stays.
    expect(env.BUCKET.store.has('notte/b.webp')).toBe(false);
    expect(env.BUCKET.store.has('notte/a.webp')).toBe(true);
    expect([...env.BUCKET.store.keys()].some(key => key.startsWith('sport/'))).toBe(false);
    // Closed: nothing left in the private bucket.
    expect(env.PRIVATE_BUCKET.store.size).toBe(0);
  });

  it('never deletes files that were not in a manifest', async () => {
    const env = makeEnv({ 'draft/albums/notte/manifest.json': [photo('a.webp')] });
    env.BUCKET.store.set('notte/legacy.jpg', { text: 'L' });
    await publishStep(env);
    expect(env.BUCKET.store.has('notte/legacy.jpg')).toBe(true);
    expect(env.BUCKET.store.has('notte/b.webp')).toBe(false);
  });

  it('copies at most photosPerStep photos per call and writes nothing else until all are in place', async () => {
    const names = ['c', 'd', 'e'].map(n => `${n}.webp`);
    const env = makeEnv({
      'draft/albums/notte/manifest.json': [photo('a.webp'), ...names.map(photo)],
      ...Object.fromEntries(names.map(n => [`staging/notte/${n}`, n])),
    });

    expect(await publishStep(env, { photosPerStep: 2 })).toEqual({ done: false, copied: 2, remaining: 1 });
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['a.webp', 'b.webp']);
    expect(env.PRIVATE_BUCKET.store.has('draft/albums/notte/manifest.json')).toBe(true);

    expect(await publishStep(env, { photosPerStep: 2 })).toEqual({ done: true, copied: 1, remaining: 0 });
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['a.webp', ...names]);
  });

  it('refuses a draft that would publish missing photos, and writes nothing', async () => {
    const env = makeEnv({
      'draft/site.json': { ...site, hero: { album: 'notte', name: 'zzz.webp' } },
      'draft/albums/notte/manifest.json': [photo('a.webp'), photo('ghost.webp')],
    });
    const before = JSON.stringify([...env.BUCKET.store]);

    expect(await publishStep(env)).toEqual({ problems: [
      { slug: 'notte', name: 'ghost.webp', reason: 'PHOTO_MISSING' },
      { slug: 'notte', name: 'zzz.webp', reason: 'HERO_NOT_IN_ALBUM' },
    ] });
    expect(JSON.stringify([...env.BUCKET.store])).toBe(before);
  });

  it('refuses a cover that is not in its album', async () => {
    const env = makeEnv({ 'draft/albums.json': { albums: [album('notte', { coverName: 's.webp' }), album('sport')] } });
    expect(await publishStep(env)).toEqual({ problems: [{ slug: 'notte', name: 's.webp', reason: 'COVER_NOT_IN_ALBUM' }] });
  });

  it('resumes after stopping between the writes and the deletions', async () => {
    const env = makeEnv({ 'draft/albums/notte/manifest.json': [photo('a.webp')] });
    const realDelete = env.BUCKET.delete;
    env.BUCKET.delete = async () => { throw new Error('interrupted'); };
    await expect(publishStep(env)).rejects.toThrow('interrupted');
    // The manifest is already published, but the note of what to delete survived.
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['a.webp']);
    expect(json(env.PRIVATE_BUCKET, 'draft/cleanup.json').keys).toEqual(['notte/b.webp']);

    env.BUCKET.delete = realDelete;
    expect(await publishStep(env)).toEqual({ done: true, copied: 0, remaining: 0 });
    expect(env.BUCKET.store.has('notte/b.webp')).toBe(false);
    expect(env.PRIVATE_BUCKET.store.size).toBe(0);
  });

  it('does not delete a photo that an earlier note names but the draft wants again', async () => {
    const env = makeEnv({
      'draft/albums/notte/manifest.json': [photo('a.webp'), photo('b.webp')],
      'draft/cleanup.json': { prefixes: ['notte/'], keys: ['notte/b.webp'] },
    });
    await publishStep(env);
    expect(env.BUCKET.store.has('notte/b.webp')).toBe(true);
    expect(env.BUCKET.store.has('notte/a.webp')).toBe(true);
  });

  it('a first installation: publishes an album and a site that did not exist', async () => {
    const env = { BUCKET: makeFakeBucket(), PRIVATE_BUCKET: makeFakeBucket({
      'draft/site.json': site,
      'draft/albums.json': { albums: [album('notte')] },
      'draft/albums/notte/manifest.json': [photo('a.webp')],
      'staging/notte/a.webp': 'A',
    }) };
    expect(await publishStep(env)).toEqual({ done: true, copied: 1, remaining: 0 });
    expect(json(env.BUCKET, '_site/site.json')).toEqual(site);
    expect(json(env.BUCKET, '_data/albums.json').albums).toHaveLength(1);
    expect(text(env.BUCKET, 'notte/a.webp')).toBe('A');
  });
});
