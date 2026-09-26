import { describe, expect, it } from 'vitest';
import { resolveAdminAlbums } from './bootstrap.js';

describe('resolveAdminAlbums', () => {
  it('uses the stored albums when they exist', () => {
    const albums = [{ slug: 'sport', title: 'Sport', description: '', coverName: null }];
    expect(resolveAdminAlbums({ ok: true, data: albums })).toEqual({ ok: true, albums });
  });

  it('starts from an empty list on a new installation, where albums.json does not exist yet', () => {
    expect(resolveAdminAlbums({ ok: false, error: 'NOT_FOUND' })).toEqual({ ok: true, albums: [] });
  });

  it.each(['NETWORK', 'UNKNOWN', 'MALFORMED'])('reports %s as an error, never as an empty list', error => {
    expect(resolveAdminAlbums({ ok: false, error })).toEqual({ ok: false, albums: [] });
  });
});
