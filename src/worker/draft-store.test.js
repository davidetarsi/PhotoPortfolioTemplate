// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readJson, deletePrefix, listKeys } from './draft-store.js';
import { makeFakeBucket } from './test-helpers.js';

describe('draft-store', () => {
  it('readJson: a missing key is null, a broken file is an error', async () => {
    const bucket = makeFakeBucket({ 'ok.json': { a: 1 } });
    bucket.store.set('broken.json', { text: '{not json' });
    expect(await readJson(bucket, 'ok.json')).toEqual({ a: 1 });
    expect(await readJson(bucket, 'missing.json')).toBeNull();
    await expect(readJson(bucket, 'broken.json')).rejects.toThrow();
  });

  it('deletePrefix removes every key under a prefix, past one page of results', async () => {
    const files = Object.fromEntries(Array.from({ length: 2500 }, (_, i) => [`draft/${String(i).padStart(4, '0')}.json`, '{}']));
    const bucket = makeFakeBucket({ ...files, 'other/keep.json': '{}' });
    expect(await deletePrefix(bucket, 'draft/')).toBe(2500);
    expect(await listKeys(bucket, 'draft/')).toEqual([]);
    expect(bucket.store.has('other/keep.json')).toBe(true);
  });
});
