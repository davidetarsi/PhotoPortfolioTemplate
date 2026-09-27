// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { albumsToRuntime, siteToRuntime } from './migrate.js';
import { albums } from '../config/albums.config.js';
import { validateAlbumsShape, validateSiteShape } from '../src/shared/content-rules.js';
import { siteConfig } from '../config/site.config.js';

describe('albumsToRuntime', () => {
  it('legge coverName direttamente', () => {
    const legacy = [{ slug: 'sport', title: 'Sport', description: 'd', coverName: 'c.webp' }];
    expect(albumsToRuntime(legacy)).toEqual({
      albums: [{ slug: 'sport', title: 'Sport', description: 'd', coverName: 'c.webp' }],
    });
  });
  it('coverName assente → coverName null; description assente → stringa vuota', () => {
    expect(albumsToRuntime([{ slug: 'x', title: 'X' }]))
      .toEqual({ albums: [{ slug: 'x', title: 'X', description: '', coverName: null }] });
  });
  it('coverName assente diventa null', () => {
    const out = albumsToRuntime([{ slug: 'a', title: 'A', description: '' }]);
    expect(out.albums[0].coverName).toBeNull();
  });

  it('coverName stringa vuota diventa null: e il valore del seed', () => {
    const out = albumsToRuntime([{ slug: 'a', title: 'A', description: '', coverName: '' }]);
    expect(out.albums[0].coverName).toBeNull();
  });

  it('anche il seed del sito produce dati che il sito accetta', () => {
    expect(validateSiteShape(siteToRuntime(siteConfig)).ok).toBe(true);
  });

  it('il seed del template produce dati che il sito accetta', () => {
    // Regressione: con `??` invece di `||` la stringa vuota sopravviveva e
    // validateAlbumsShape rifiutava i dati appena migrati, lasciando la home
    // in errore al primo avvio di chi installa il template.
    const out = albumsToRuntime(albums);
    expect(validateAlbumsShape(out).ok).toBe(true);
  });
});

describe('siteToRuntime', () => {
  it('builds site.json with a referential hero and the seed links', () => {
    const cfg = {
      name: 'Davide', bio: 'Bio',
      heroImage: { album: 'sport', name: 'hero.webp' },
      links: [{ url: 'https://instagram.com/x' }, { url: 'mailto:a@b.c', label: 'Scrivimi' }],
    };
    expect(siteToRuntime(cfg)).toEqual({
      name: 'Davide', bio: 'Bio',
      hero: { album: 'sport', name: 'hero.webp' },
      links: [{ url: 'https://instagram.com/x' }, { url: 'mailto:a@b.c', label: 'Scrivimi' }],
    });
  });

  it('converts an old social object into links, skipping empty values', () => {
    const cfg = { name: 'Davide', social: { instagram: 'https://instagram.com/x', vuoto: undefined } };
    expect(siteToRuntime(cfg).links).toEqual([{ url: 'https://instagram.com/x' }]);
  });
});
