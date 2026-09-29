import { describe, expect, it } from 'vitest';
import { photoCount, summarizeManifest } from './album-summary.js';

describe('summarizeManifest', () => {
  it('summarizes an empty or populated manifest', () => {
    expect(summarizeManifest([])).toEqual({ photoCount: 0, firstPhoto: null });
    expect(summarizeManifest([{ name: 'cover.webp' }, { name: 'second.webp' }]))
      .toEqual({ photoCount: 2, firstPhoto: 'cover.webp' });
  });
});

describe('photoCount', () => {
  it('formats empty, singular, and plural photo counts', () => {
    expect(photoCount(0)).toBe('No photos yet');
    expect(photoCount(1)).toBe('1 photo');
    expect(photoCount(3)).toBe('3 photos');
  });
});
