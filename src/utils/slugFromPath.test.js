import { describe, expect, it } from 'vitest';
import { slugFromPath } from './slugFromPath.js';

describe('slugFromPath', () => {
  it.each([
    ['/projects/sea-sentinels', 'sea-sentinels'],
    ['/projects/sea-sentinels/', 'sea-sentinels'],
    ['/projects/sea-sentinels.html', 'sea-sentinels'],
  ])('reads the slug of %s', (pathname, slug) => {
    expect(slugFromPath('/projects/:slug', pathname)).toBe(slug);
  });

  it.each(['/projects', '/other/sea', '/projects/a/b', '/projects/Bad'])('returns null for %s', pathname => {
    expect(slugFromPath('/projects/:slug', pathname)).toBeNull();
  });

  it('rejects a pattern that is not /prefix/:slug', () => {
    expect(() => slugFromPath('/projects', '/projects')).toThrow(/"\/prefix\/:slug"/);
  });
});
