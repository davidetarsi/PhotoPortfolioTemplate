import { describe, expect, it } from 'vitest';
import { texts } from '../../../../config/texts.config.js';
import { newAlbum } from './new-album.js';

const t = texts.admin.albums;

describe('newAlbum', () => {
  it('gives the address of a new album from its title', () => {
    expect(newAlbum('  Notte in montagna ', [])).toEqual({
      ok: true, album: { slug: 'notte-in-montagna', title: 'Notte in montagna', description: '', coverName: null },
    });
  });

  it('refuses a title with no letters or digits to build an address from', () => {
    for (const title of ['', '   ', '!!!']) expect(newAlbum(title, [])).toEqual({ ok: false, error: t.titleInvalid });
  });

  it('refuses an address that is taken or reserved', () => {
    expect(newAlbum('Notte', [{ slug: 'notte' }]).ok).toBe(false);
    expect(newAlbum('Admin', []).ok).toBe(false);
  });
});
