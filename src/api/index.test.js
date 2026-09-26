import { describe, expect, it } from 'vitest';
import * as api from './index.js';
import { albumsToCards } from '../pages/home-logic.js';

describe('public API for custom/', () => {
  it('exports exactly the documented surface', () => {
    // Pinned on purpose: removing or renaming an export breaks forks and must be a
    // deliberate change, announced in docs/upgrading.md. Adding one is safe.
    expect(Object.keys(api).sort()).toEqual(['albumsToCards']);
  });

  it('albumsToCards is the template helper: cards with a cover URL', () => {
    expect(api.albumsToCards).toBe(albumsToCards);
    expect(api.albumsToCards(
      [{ slug: 'sport', title: 'Sport', description: 'Gare', coverName: 'c.webp' }],
      'https://photos.example.com',
    )).toEqual([
      { slug: 'sport', title: 'Sport', description: 'Gare', coverUrl: 'https://photos.example.com/sport/c.webp' },
    ]);
  });
});
