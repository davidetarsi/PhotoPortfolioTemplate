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

  it('a waiting photo wins over a public file with the same name', async () => {
    // Left behind by an interrupted publication: notte/c.webp is public but in no manifest.
    const env = makeEnv({
      'draft/albums/notte/manifest.json': [photo('a.webp'), photo('b.webp'), photo('c.webp')],
      'staging/notte/c.webp': 'NEW',
    });
    env.BUCKET.store.set('notte/c.webp', { text: 'OLD', contentType: 'image/webp' });
    expect(await publishStep(env)).toEqual({ done: true, copied: 1, remaining: 0 });
    expect(text(env.BUCKET, 'notte/c.webp')).toBe('NEW');
  });

  it('removes each waiting photo once copied, so a repeated step does not copy it again', async () => {
    const env = makeEnv({
      'draft/albums/notte/manifest.json': [photo('a.webp'), photo('c.webp'), photo('d.webp')],
      'staging/notte/c.webp': 'C', 'staging/notte/d.webp': 'D',
    });
    expect(await publishStep(env, { photosPerStep: 1 })).toEqual({ done: false, copied: 1, remaining: 1 });
    expect(env.PRIVATE_BUCKET.store.has('staging/notte/c.webp')).toBe(false);
    expect(json(env.PRIVATE_BUCKET, 'draft/copied.json')).toEqual(['notte/c.webp']);
    expect(await publishStep(env, { photosPerStep: 1 })).toEqual({ done: true, copied: 1, remaining: 0 });
  });

  it('deletes a photo copied by an earlier step that the draft has dropped since', async () => {
    const env = makeEnv({
      'draft/albums/notte/manifest.json': [photo('a.webp'), photo('b.webp'), photo('c.webp')],
      'staging/notte/c.webp': 'C',
    });
    // An earlier step copied c and was interrupted; then c is taken out of the draft.
    env.BUCKET.store.set('notte/c.webp', { text: 'C', contentType: 'image/webp' });
    env.PRIVATE_BUCKET.store.delete('staging/notte/c.webp');
    env.PRIVATE_BUCKET.store.set('draft/copied.json', { text: JSON.stringify(['notte/c.webp']) });
    env.PRIVATE_BUCKET.store.set('draft/albums/notte/manifest.json', { text: JSON.stringify([photo('a.webp'), photo('b.webp')]) });

    expect(await publishStep(env)).toEqual({ done: true, copied: 0, remaining: 0 });
    expect(env.BUCKET.store.has('notte/c.webp')).toBe(false);
    expect(env.BUCKET.store.has('notte/b.webp')).toBe(true);
  });

  it('keeps draft files saved while the last step was running', async () => {
    const env = makeEnv({ 'draft/albums/notte/manifest.json': [photo('a.webp')] });
    const realPut = env.BUCKET.put.bind(env.BUCKET);
    let saved = false;
    env.BUCKET.put = async (key, value, opts) => {
      if (!saved) {
        saved = true; // an autosave and an upload land during the publication
        await env.PRIVATE_BUCKET.put('draft/albums/viaggio/manifest.json', '[]');
        await env.PRIVATE_BUCKET.put('staging/notte/e.webp', 'E');
      }
      return realPut(key, value, opts);
    };
    expect(await publishStep(env)).toEqual({ done: true, copied: 0, remaining: 0 });
    expect(env.PRIVATE_BUCKET.store.has('draft/albums/notte/manifest.json')).toBe(false);
    expect(env.PRIVATE_BUCKET.store.has('draft/albums/viaggio/manifest.json')).toBe(true);
    expect(env.PRIVATE_BUCKET.store.has('staging/notte/e.webp')).toBe(true);
  });

  it('a waiting photo removed after the check: reports it instead of failing', async () => {
    const env = makeEnv({
      'draft/albums/notte/manifest.json': [photo('a.webp'), photo('c.webp')],
      'staging/notte/c.webp': 'C',
    });
    const realGet = env.PRIVATE_BUCKET.get.bind(env.PRIVATE_BUCKET);
    env.PRIVATE_BUCKET.get = async key => (key === 'staging/notte/c.webp' ? null : realGet(key));
    expect(await publishStep(env)).toEqual({ problems: [{ slug: 'notte', name: 'c.webp', reason: 'PHOTO_MISSING' }] });
    expect(env.BUCKET.store.has('notte/c.webp')).toBe(false);
  });

  it('a new album without photos gets an empty manifest', async () => {
    const env = makeEnv({ 'draft/albums.json': { albums: [album('notte'), album('sport'), album('vuoto')] } });
    await publishStep(env);
    expect(json(env.BUCKET, 'vuoto/manifest.json')).toEqual([]);
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['a.webp', 'b.webp']);
  });

  it('resumes after stopping in the middle of a batch of copies', async () => {
    const env = makeEnv({
      'draft/albums/notte/manifest.json': [photo('a.webp'), photo('c.webp'), photo('d.webp')],
      'staging/notte/c.webp': 'C', 'staging/notte/d.webp': 'D',
    });
    const realPut = env.BUCKET.put.bind(env.BUCKET);
    let puts = 0;
    env.BUCKET.put = async (key, value, opts) => {
      if (++puts === 2) throw new Error('interrupted');
      return realPut(key, value, opts);
    };
    await expect(publishStep(env)).rejects.toThrow('interrupted');
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['a.webp', 'b.webp']);

    env.BUCKET.put = realPut;
    expect(await publishStep(env)).toEqual({ done: true, copied: 1, remaining: 0 });
    expect(text(env.BUCKET, 'notte/c.webp')).toBe('C');
    expect(text(env.BUCKET, 'notte/d.webp')).toBe('D');
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['a.webp', 'c.webp', 'd.webp']);
  });

  it('resumes after stopping between the manifests and the album list', async () => {
    const env = makeEnv({
      'draft/albums.json': { albums: [album('notte')] },
      'draft/albums/notte/manifest.json': [photo('a.webp')],
    });
    const realPut = env.BUCKET.put.bind(env.BUCKET);
    env.BUCKET.put = async (key, value, opts) => {
      if (key === '_data/albums.json') throw new Error('interrupted');
      return realPut(key, value, opts);
    };
    await expect(publishStep(env)).rejects.toThrow('interrupted');
    env.BUCKET.put = realPut;
    expect(await publishStep(env)).toEqual({ done: true, copied: 0, remaining: 0 });
    expect(json(env.BUCKET, '_data/albums.json').albums.map(a => a.slug)).toEqual(['notte']);
    expect([...env.BUCKET.store.keys()].some(key => key.startsWith('sport/'))).toBe(false);
    expect(env.BUCKET.store.has('notte/b.webp')).toBe(false);
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
