import { describe, expect, it } from 'vitest';
import { texts } from './texts.config.js';
import { texts as textsIt } from './texts.it.js';

// Every key path of a texts object, e.g. 'admin.album.cover'.
function keyPaths(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object' ? keyPaths(value, path) : [path];
  });
}

describe('Italian preset', () => {
  it('has exactly the keys of the English texts', () => {
    expect(keyPaths(textsIt).sort()).toEqual(keyPaths(texts).sort());
  });
});
