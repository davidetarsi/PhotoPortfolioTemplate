import { describe, it, expect, vi, beforeEach } from 'vitest';
import { texts } from '../../../config/texts.config.js';
import { renderAdminHome, buildPendingSite } from './home.js';

const SITE = { name: 'Davide', bio: 'Bio', hero: null, social: { instagram: '' } };
const ALBUMS = [
  { slug: 'sport', title: 'Sport', description: '', coverName: null },
  { slug: 'viaggi', title: 'Viaggi', description: '', coverName: null },
];

function makeCtx(over = {}) {
  return {
    site: structuredClone(SITE),
    albums: structuredClone(ALBUMS),
    r2PublicUrl: 'https://pub.r2.dev',
    api: {
      putSite: vi.fn(async () => {}), putAlbums: vi.fn(async () => {}),
      deleteAlbum: vi.fn(async () => {}),
    },
    navigate: vi.fn(),
    deps: {
      attachSortable: vi.fn(), // cattura onMove
      fetchManifest: vi.fn(async () => ({ ok: true, data: [] })),
      prompt: vi.fn(() => null),
      showPreview: vi.fn(),
    },
    ...over,
  };
}

describe('buildPendingSite', () => {
  const currentSite = { name: 'Vecchio', bio: 'Vecchia bio', hero: { album: 'sport', name: 'a.webp' }, social: { instagram: 'https://old', twitter: 'https://x' } };

  it('costruisce l\'oggetto con i nuovi valori, trimma name e instagram ma non bio', () => {
    const result = buildPendingSite({ name: '  Nuovo  ', bio: '  Bio con spazi  ', instagram: '  https://new  ' }, currentSite);
    expect(result.name).toBe('Nuovo');
    expect(result.bio).toBe('  Bio con spazi  ');
    expect(result.social.instagram).toBe('https://new');
  });

  it('la hero passa invariata da currentSite, non fa parte dei valori nuovi', () => {
    const result = buildPendingSite({ name: 'X', bio: '', instagram: '' }, currentSite);
    expect(result.hero).toEqual({ album: 'sport', name: 'a.webp' });
  });

  it('keeps links and page texts, which this form does not edit', () => {
    const site = { ...currentSite, links: [{ url: 'https://github.com/x' }], texts: { 'about.heading': 'Scrivimi' } };
    const result = buildPendingSite({ name: 'X', bio: '', instagram: '' }, site);
    expect(result.links).toEqual([{ url: 'https://github.com/x' }]);
    expect(result.texts).toEqual({ 'about.heading': 'Scrivimi' });
  });

  it('social preserva le altre chiavi oltre instagram', () => {
    const result = buildPendingSite({ name: 'X', bio: '', instagram: 'https://new' }, currentSite);
    expect(result.social).toEqual({ instagram: 'https://new', twitter: 'https://x' });
  });
});

describe('renderAdminHome', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); document.body.replaceChildren(container); });

  it('renderizza form sito e lista album', () => {
    renderAdminHome(container, makeCtx());
    expect(container.querySelector('[name="site-name"]').value).toBe('Davide');
    expect(container.querySelectorAll('.admin-album-row')).toHaveLength(2);
  });

  it('opens a site saved with links and no social', () => {
    renderAdminHome(container, makeCtx({ site: { name: 'Davide', bio: '', hero: null, links: [{ url: 'https://github.com/x' }] } }));
    expect(container.querySelector('[name="site-instagram"]').value).toBe('');
  });

  it('labels the hero picker with the configured copy', () => {
    renderAdminHome(container, makeCtx());
    expect(container.querySelector('.admin-hero > span').textContent).toBe(texts.admin.site.heroLabel);
  });

  it('include la top bar senza back-link', async () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    expect(container.querySelector('.admin-topbar')).not.toBeNull();
    expect(container.querySelector('.admin-back')).toBeNull();
  });

  it('salva il sito con i valori del form', async () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    container.querySelector('[name="site-name"]').value = 'Nuovo Nome';
    container.querySelector('.admin-save-site').click();
    await vi.waitFor(() => expect(ctx.api.putSite).toHaveBeenCalled());
    expect(ctx.api.putSite.mock.calls[0][0].name).toBe('Nuovo Nome');
    expect(ctx.api.putSite.mock.calls[0][0].hero).toBeNull(); // hero preservato
  });

  it('tasto Anteprima chiama deps.showPreview con i valori correnti del form, senza toccare l\'API', () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    container.querySelector('[name="site-name"]').value = 'Nome Bozza';
    container.querySelector('[name="site-bio"]').value = 'Bio bozza';
    container.querySelector('[name="site-instagram"]').value = 'https://instagram.com/bozza';
    container.querySelector('.admin-preview-btn').click();

    expect(ctx.deps.showPreview).toHaveBeenCalledTimes(1);
    const [previewEl, data, , showPreviewDeps] = ctx.deps.showPreview.mock.calls[0];
    expect(previewEl.className).toBe('admin-preview');
    expect(data).toEqual({
      name: 'Nome Bozza', bio: 'Bio bozza', heroUrl: null,
      social: { instagram: 'https://instagram.com/bozza' },
      albums: ctx.albums, r2PublicUrl: 'https://pub.r2.dev',
    });
    expect(ctx.api.putSite).not.toHaveBeenCalled();
    expect(showPreviewDeps).toBe(ctx.deps); // serve fetchManifest per aprire un album dentro l'anteprima
  });

  it('crea un album: slugify, putAlbums e navigate', async () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    container.querySelector('[name="new-album-title"]').value = 'Street Photo';
    container.querySelector('.admin-create-album').click();
    await vi.waitFor(() => expect(ctx.api.putAlbums).toHaveBeenCalled());
    const sent = ctx.api.putAlbums.mock.calls[0][0];
    expect(sent[2]).toEqual({ slug: 'street-photo', title: 'Street Photo', description: '', coverName: null });
    await vi.waitFor(() => expect(ctx.navigate).toHaveBeenCalledWith('#/album/street-photo'));
  });

  it('rifiuta slug riservato o duplicato senza chiamare l\'API, badge errore attivo', async () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    container.querySelector('[name="new-album-title"]').value = 'Admin';
    container.querySelector('.admin-create-album').click();
    await Promise.resolve();
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
    expect(container.querySelector('.admin-status').textContent).not.toBe('');
    expect(container.querySelector('.admin-status__badge').textContent).toBe(texts.admin.status.error);
    expect(container.querySelector('.admin-status__badge').classList.contains('admin-status__badge--error')).toBe(true);
    container.querySelector('[name="new-album-title"]').value = 'Sport';
    container.querySelector('.admin-create-album').click();
    await Promise.resolve();
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
  });

  it('scelta hero: click su una foto del picker salva, re-renderizza e mostra il messaggio', async () => {
    const ctx = makeCtx();
    ctx.deps.fetchManifest = vi.fn(async () => ({ ok: true, data: [{ name: 'a.webp' }, { name: 'b.webp' }] }));
    renderAdminHome(container, ctx);
    container.querySelector('[name="hero-album"]').value = 'sport';
    container.querySelector('[name="hero-album"]').dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(container.querySelectorAll('.admin-hero__choice')).toHaveLength(2));

    container.querySelectorAll('.admin-hero__choice')[1].click();
    await vi.waitFor(() => expect(ctx.api.putSite).toHaveBeenCalled());
    expect(ctx.api.putSite.mock.calls[0][0].hero).toEqual({ album: 'sport', name: 'b.webp' });

    // Il re-render ricrea .admin-status: il messaggio deve comparire sul nodo nuovo, non perdersi.
    expect(container.querySelector('.admin-status__text').textContent).toBe(texts.admin.site.heroUpdated);
    expect(container.querySelector('.admin-status__badge').textContent).toBe(texts.admin.status.lastAction);
  });

  it('salvataggio riuscito mostra il badge "Ultima azione eseguita", non errore', async () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    container.querySelector('.admin-save-site').click();
    await vi.waitFor(() => expect(ctx.api.putSite).toHaveBeenCalled());
    expect(container.querySelector('.admin-status__badge').textContent).toBe(texts.admin.status.lastAction);
    expect(container.querySelector('.admin-status__badge').classList.contains('admin-status__badge--error')).toBe(false);
  });

  it('riordino via sortable → putAlbums con l\'ordine nuovo', async () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    const onMove = ctx.deps.attachSortable.mock.calls[0][1];
    onMove(0, 1);
    await vi.waitFor(() => expect(ctx.api.putAlbums).toHaveBeenCalled());
    expect(ctx.api.putAlbums.mock.calls[0][0].map(a => a.slug)).toEqual(['viaggi', 'sport']);
  });

  it('cancellazione: richiede il nome esatto via prompt', async () => {
    const ctx = makeCtx();
    ctx.deps.prompt = vi.fn(() => 'Sport'); // nome giusto
    renderAdminHome(container, ctx);
    container.querySelectorAll('.admin-delete-album')[0].click();
    await vi.waitFor(() => expect(ctx.api.deleteAlbum).toHaveBeenCalledWith('sport'));
    // nome sbagliato → nessuna chiamata
    const ctx2 = makeCtx();
    ctx2.deps.prompt = vi.fn(() => 'sbagliato');
    renderAdminHome(container, ctx2);
    container.querySelectorAll('.admin-delete-album')[0].click();
    await Promise.resolve();
    expect(ctx2.api.deleteAlbum).not.toHaveBeenCalled();
  });
});
