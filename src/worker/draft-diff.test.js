// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { diffDraft } from './draft-diff.js';

const site = { name: 'Davide', bio: '', hero: null, links: [] };
const album = (slug, extra = {}) => ({ slug, title: slug, description: '', coverName: null, ...extra });
const photo = name => ({ name, width: 4, height: 3 });
const state = (albums, manifests = {}, s = site) => ({ site: s, albums, manifests: new Map(Object.entries(manifests)) });

describe('diffDraft', () => {
  it('no changes when the draft equals the published site', () => {
    const pub = state([album('notte')], { notte: [photo('a.webp')] });
    expect(diffDraft(pub, state([album('notte')], { notte: [photo('a.webp')] }))).toEqual([]);
  });

  it('reports site, added, changed and removed albums', () => {
    const pub = state([album('notte'), album('sport')], { notte: [], sport: [] });
    const eff = state([album('notte', { title: 'Notte in montagna' }), album('viaggio')], { notte: [], viaggio: [] },
      { ...site, bio: 'Nuova bio' });
    expect(diffDraft(pub, eff)).toEqual([
      { type: 'site' },
      { type: 'album-changed', slug: 'notte' },
      { type: 'album-added', slug: 'viaggio' },
      { type: 'album-removed', slug: 'sport' },
    ]);
  });

  it('counts photos added and removed, and notices a new order', () => {
    const pub = state([album('notte')], { notte: [photo('a.webp'), photo('b.webp'), photo('c.webp')] });
    const eff = state([album('notte')], { notte: [photo('c.webp'), photo('a.webp'), photo('d.webp'), photo('e.webp')] });
    expect(diffDraft(pub, eff)).toEqual([
      { type: 'photos-added', slug: 'notte', count: 2 },
      { type: 'photos-removed', slug: 'notte', count: 1 },
      { type: 'photos-reordered', slug: 'notte' },
    ]);
  });

  it('notices albums put in a new order, ignoring added and removed ones', () => {
    const pub = state([album('a'), album('b'), album('c')], { a: [], b: [], c: [] });
    expect(diffDraft(pub, state([album('b'), album('a'), album('c')], { a: [], b: [], c: [] })))
      .toEqual([{ type: 'albums-reordered' }]);
    expect(diffDraft(pub, state([album('a'), album('c')], { a: [], c: [] })))
      .toEqual([{ type: 'album-removed', slug: 'b' }]);
  });

  it('the order of the keys of an object is not a change', () => {
    const pub = state([album('notte')], { notte: [photo('a.webp')] });
    const reordered = { links: [], hero: null, bio: '', name: 'Davide' };
    const eff = state([{ coverName: null, description: '', title: 'notte', slug: 'notte' }],
      { notte: [{ height: 3, width: 4, name: 'a.webp' }] }, reordered);
    expect(diffDraft(pub, eff)).toEqual([]);
  });

  it('a first installation: nothing published yet', () => {
    const pub = { site: null, albums: [], manifests: new Map() };
    const eff = state([album('notte')], { notte: [photo('a.webp')] });
    expect(diffDraft(pub, eff)).toEqual([
      { type: 'site' },
      { type: 'album-added', slug: 'notte' },
      { type: 'photos-added', slug: 'notte', count: 1 },
    ]);
  });
});
