import { describe, it, expect, vi } from 'vitest';
import { texts } from '../../config/texts.config.js';
import { formatText } from '../utils/formatText.js';
import { createAlbum } from './album-creation.js';

vi.mock('virtual:custom-pages', () => ({ CUSTOM_PAGE_SLUGS: ['archive'] }));

function makeCtx(albums = []) {
  return {
    albums,
    api: { putAlbums: vi.fn(async () => {}) },
  };
}

describe('createAlbum', () => {
  it('titolo valido → putAlbums con il nuovo album, ok:true con lo slug', async () => {
    const ctx = makeCtx([{ slug: 'sport', title: 'Sport', description: '', coverName: null }]);
    const result = await createAlbum('Viaggi 2026', ctx);
    expect(result).toEqual({ ok: true, slug: 'viaggi-2026' });
    expect(ctx.api.putAlbums).toHaveBeenCalledWith([
      { slug: 'sport', title: 'Sport', description: '', coverName: null },
      { slug: 'viaggi-2026', title: 'Viaggi 2026', description: '', coverName: null },
    ]);
    expect(ctx.albums).toHaveLength(2);
  });

  it('titolo vuoto (anche solo spazi) → ok:false, nessuna chiamata API', async () => {
    const ctx = makeCtx();
    const result = await createAlbum('   ', ctx);
    expect(result).toEqual({ ok: false, error: texts.admin.albums.titleInvalid });
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
  });

  it('slug riservato → ok:false con messaggio dedicato', async () => {
    const ctx = makeCtx();
    const result = await createAlbum('Admin', ctx);
    expect(result).toEqual({ ok: false, error: formatText(texts.admin.albums.titleReserved, { slug: 'admin' }) });
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
  });

  it('slug già esistente → ok:false con messaggio dedicato', async () => {
    const ctx = makeCtx([{ slug: 'sport', title: 'Sport', description: '', coverName: null }]);
    const result = await createAlbum('Sport', ctx);
    expect(result).toEqual({ ok: false, error: formatText(texts.admin.albums.exists, { slug: 'sport' }) });
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
  });

  it('trimma il titolo prima di salvarlo e di derivare lo slug', async () => {
    const ctx = makeCtx();
    const result = await createAlbum('  Montagne  ', ctx);
    expect(result).toEqual({ ok: true, slug: 'montagne' });
    expect(ctx.albums[0].title).toBe('Montagne');
  });

  it('slug di un file del template (album, index) → ok:false con messaggio dedicato', async () => {
    const ctx = makeCtx();
    expect(await createAlbum('Album', ctx)).toEqual({ ok: false, error: formatText(texts.admin.albums.titleReserved, { slug: 'album' }) });
    expect(await createAlbum('Index', ctx)).toEqual({ ok: false, error: formatText(texts.admin.albums.titleReserved, { slug: 'index' }) });
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
  });

  it('slug preso da una pagina di custom/pages.config.js → ok:false con messaggio dedicato', async () => {
    const ctx = makeCtx();
    const result = await createAlbum('Archive', ctx);
    expect(result).toEqual({ ok: false, error: formatText(texts.admin.albums.titleReserved, { slug: 'archive' }) });
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
  });
});
