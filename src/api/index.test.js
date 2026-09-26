import { describe, expect, it } from 'vitest';
import * as api from './index.js';

describe('public API for custom/', () => {
  it('exports exactly the documented surface', () => {
    // Pinned on purpose: removing or renaming an export breaks forks and must be a
    // deliberate change, announced in docs/upgrading.md. Adding one is safe.
    expect(Object.keys(api).sort()).toEqual(['albumsToCards']);
  });

  // What docs/slots.md promises about each export. Forks rely on it: change these
  // tests only together with a note in docs/upgrading.md.
  describe('albumsToCards', () => {
    const r2PublicUrl = 'https://photos.example.com';

    it('returns one card per album, with the full URL of its cover', () => {
      expect(api.albumsToCards(
        [{ slug: 'sport', title: 'Sport', description: 'Gare', coverName: 'c.webp' }],
        r2PublicUrl,
      )).toEqual([
        { slug: 'sport', title: 'Sport', description: 'Gare', coverUrl: 'https://photos.example.com/sport/c.webp' },
      ]);
    });

    it('gives coverUrl null when the album has no cover', () => {
      const [card] = api.albumsToCards([{ slug: 'viaggi', title: 'Viaggi', description: '', coverName: '' }], r2PublicUrl);
      expect(card.coverUrl).toBeNull();
    });

    it('gives coverUrl null when r2PublicUrl is missing', () => {
      const [card] = api.albumsToCards([{ slug: 'sport', title: 'Sport', description: '', coverName: 'c.webp' }], undefined);
      expect(card.coverUrl).toBeNull();
    });
  });
});
