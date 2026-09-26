import { describe, it, expect, vi, beforeEach } from 'vitest';
import { texts } from '../../../config/texts.config.js';
import { renderAdminAlbum } from './album.js';

const MANIFEST = [
  { name: 'a.webp', width: 1, height: 1 },
  { name: 'b.webp', width: 1, height: 1 },
];

function makeCtx(over = {}) {
  return {
    slug: 'sport',
    albums: [{ slug: 'sport', title: 'Sport', description: '', coverName: null }],
    site: { name: 'D', bio: '', hero: null, social: {} },
    r2PublicUrl: 'https://pub.r2.dev',
    api: {
      putManifest: vi.fn(async () => {}), putAlbums: vi.fn(async () => {}),
      deletePhoto: vi.fn(async () => {}), uploadPhoto: vi.fn(async () => {}),
    },
    navigate: vi.fn(),
    deps: {
      attachSortable: vi.fn(),
      fetchManifest: vi.fn(async () => ({ ok: true, data: structuredClone(MANIFEST) })),
      prompt: vi.fn(() => null),
      confirm: vi.fn(() => true),
      attachBeforeUnloadGuard: vi.fn(() => vi.fn()), // ritorna una funzione detach fittizia
      runBatch: vi.fn(async () => ({ uploaded: [], failed: [], manifest: MANIFEST })),
      makeProcessFile: vi.fn(async () => async () => ({ blob: 'B', width: 1, height: 1 })),
    },
    ...over,
  };
}
const flush = () => new Promise(r => setTimeout(r, 0));

describe('renderAdminAlbum', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); document.body.replaceChildren(container); });

  it('carica il manifest e renderizza le foto con URL pubblici', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    const imgs = container.querySelectorAll('.admin-photo__img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute('src')).toBe('https://pub.r2.dev/sport/a.webp');
  });

  it('include la top bar con back-link', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    expect(container.querySelector('.admin-topbar')).not.toBeNull();
    expect(container.querySelector('.admin-back')).not.toBeNull();
  });

  it('manifest 404 (album nuovo) → griglia vuota, nessun errore', async () => {
    const ctx = makeCtx();
    ctx.deps.fetchManifest = vi.fn(async () => ({ ok: false, error: 'NOT_FOUND' }));
    renderAdminAlbum(container, ctx);
    await flush();
    expect(container.querySelectorAll('.admin-photo')).toHaveLength(0);
    expect(container.querySelector('.admin-dropzone')).not.toBeNull();
  });

  it('riordino → putManifest con ordine nuovo', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    const onMove = ctx.deps.attachSortable.mock.calls[0][1];
    onMove(0, 1);
    await vi.waitFor(() => expect(ctx.api.putManifest).toHaveBeenCalled());
    expect(ctx.api.putManifest.mock.calls[0][1].map(e => e.name)).toEqual(['b.webp', 'a.webp']);
  });

  it('click su "Cover" aggiorna solo lo stato locale (bordino), NON chiama putAlbums finché non premi Salva', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click();
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.admin-photo__cover')[1].classList.contains('admin-photo__cover--selected')).toBe(true);
  });

  it('bottone Salva scrive description+coverName pending in un\'unica putAlbums', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('[name="album-description"]').value = 'Nuova descrizione';
    container.querySelector('[name="album-description"]').dispatchEvent(new Event('input'));
    container.querySelectorAll('.admin-photo__cover')[1].click();
    container.querySelector('.admin-save-album').click();
    await vi.waitFor(() => expect(ctx.api.putAlbums).toHaveBeenCalledTimes(1));
    const saved = ctx.api.putAlbums.mock.calls[0][0].find(a => a.slug === 'sport');
    expect(saved.description).toBe('Nuova descrizione');
    expect(saved.coverName).toBe('b.webp');
  });

  it('campo descrizione è precompilato con la description corrente dell\'album', async () => {
    const ctx = makeCtx({ albums: [{ slug: 'sport', title: 'Sport', description: 'Bio esistente', coverName: null }] });
    renderAdminAlbum(container, ctx);
    await flush();
    expect(container.querySelector('[name="album-description"]').value).toBe('Bio esistente');
  });

  it('al render, il badge cover selezionato è già sulla foto con coverName corrente', async () => {
    const ctx = makeCtx({ albums: [{ slug: 'sport', title: 'Sport', description: '', coverName: 'b.webp' }] });
    renderAdminAlbum(container, ctx);
    await flush();
    const covers = container.querySelectorAll('.admin-photo__cover');
    expect(covers[0].classList.contains('admin-photo__cover--selected')).toBe(false);
    expect(covers[1].classList.contains('admin-photo__cover--selected')).toBe(true);
  });

  it('click su Cover sposta il bordino selezionato sulla foto cliccata', async () => {
    const ctx = makeCtx({ albums: [{ slug: 'sport', title: 'Sport', description: '', coverName: 'a.webp' }] });
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click();
    const covers = container.querySelectorAll('.admin-photo__cover');
    expect(covers[0].classList.contains('admin-photo__cover--selected')).toBe(false);
    expect(covers[1].classList.contains('admin-photo__cover--selected')).toBe(true);
  });

  it('elimina foto (confirm) → deletePhoto e rimozione dalla griglia', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__delete')[0].click();
    await vi.waitFor(() => expect(ctx.api.deletePhoto).toHaveBeenCalledWith('sport', 'a.webp'));
    expect(container.querySelectorAll('.admin-photo')).toHaveLength(1);
  });

  it('attachSortable è chiamato una sola volta, non ad ogni renderPhotos()', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    expect(ctx.deps.attachSortable).toHaveBeenCalledTimes(1);
    // elimina una foto → renderPhotos() rigira di nuovo: NON deve riattaccare
    container.querySelectorAll('.admin-photo__delete')[0].click();
    await vi.waitFor(() => expect(ctx.api.deletePhoto).toHaveBeenCalled());
    expect(ctx.deps.attachSortable).toHaveBeenCalledTimes(1);
  });

  it('selezione file → runBatch cablato su api e manifest corrente', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    const input = container.querySelector('.admin-dropzone input[type="file"]');
    Object.defineProperty(input, 'files', { value: [{ name: 'x.jpg', type: 'image/jpeg' }] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(ctx.deps.runBatch).toHaveBeenCalled());
    const args = ctx.deps.runBatch.mock.calls[0][0];
    expect(args.existingManifest.map(e => e.name)).toEqual(['a.webp', 'b.webp']);
    await args.uploadPhoto('n.webp', 'BLOB');
    expect(ctx.api.uploadPhoto).toHaveBeenCalledWith('sport', 'n.webp', 'BLOB');
    await args.putManifest([]);
    expect(ctx.api.putManifest).toHaveBeenCalledWith('sport', []);
  });

  it('"Ordina per data" riordina per capturedAt/uploadedAt, foto legacy senza data vanno per prime (fallback 0)', async () => {
    const ctx = makeCtx();
    ctx.deps.fetchManifest = vi.fn(async () => ({
      ok: true,
      data: [
        { name: 'recente.webp', width: 1, height: 1, capturedAt: 1700000002000 },
        { name: 'legacy.webp', width: 1, height: 1 }, // né capturedAt né uploadedAt
        { name: 'vecchia.webp', width: 1, height: 1, uploadedAt: 1700000001000 },
      ],
    }));
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('.admin-sort-date').click();
    await vi.waitFor(() => expect(ctx.api.putManifest).toHaveBeenCalled());
    expect(ctx.api.putManifest.mock.calls[0][1].map(e => e.name)).toEqual(['legacy.webp', 'vecchia.webp', 'recente.webp']);
  });

  it('"Ordina per data" con due foto legacy (entrambe fallback 0) mantiene l\'ordine relativo — sort stabile', async () => {
    const ctx = makeCtx();
    ctx.deps.fetchManifest = vi.fn(async () => ({
      ok: true,
      data: [
        { name: 'b.webp', width: 1, height: 1 },
        { name: 'a.webp', width: 1, height: 1 },
      ],
    }));
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('.admin-sort-date').click();
    await vi.waitFor(() => expect(ctx.api.putManifest).toHaveBeenCalled());
    expect(ctx.api.putManifest.mock.calls[0][1].map(e => e.name)).toEqual(['b.webp', 'a.webp']); // invariato
  });

  it('modifica pending (cover) + click "Tutti gli album" senza conferma → non naviga, chiede conferma', async () => {
    const ctx = makeCtx();
    ctx.deps.confirm = vi.fn(() => false); // utente annulla
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click(); // sporca lo stato
    const backLink = container.querySelector('.admin-back');
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    backLink.dispatchEvent(evt);
    expect(ctx.deps.confirm).toHaveBeenCalledWith(texts.admin.album.unsavedChanges);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('modifica pending + click "Tutti gli album" con conferma → naviga (non preventDefault)', async () => {
    const ctx = makeCtx();
    ctx.deps.confirm = vi.fn(() => true);
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click();
    const backLink = container.querySelector('.admin-back');
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    backLink.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('nessuna modifica pending → click "Tutti gli album" naviga senza chiedere conferma', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    const backLink = container.querySelector('.admin-back');
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    backLink.dispatchEvent(evt);
    expect(ctx.deps.confirm).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it('modifica pending → aggancia la guardia beforeunload; Salva la stacca', async () => {
    const ctx = makeCtx();
    const detach = vi.fn();
    ctx.deps.attachBeforeUnloadGuard = vi.fn(() => detach);
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click();
    expect(ctx.deps.attachBeforeUnloadGuard).toHaveBeenCalledTimes(1);
    container.querySelector('.admin-save-album').click();
    await vi.waitFor(() => expect(ctx.api.putAlbums).toHaveBeenCalled());
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('modifiche pending multiple non riattaccano la guardia più volte', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[0].click();
    container.querySelectorAll('.admin-photo__cover')[1].click();
    expect(ctx.deps.attachBeforeUnloadGuard).toHaveBeenCalledTimes(1);
  });

  it('modifica pending + hashchange (Back/Forward o navigate(), non il back-link) stacca comunque la guardia beforeunload', async () => {
    const ctx = makeCtx();
    const detach = vi.fn();
    ctx.deps.attachBeforeUnloadGuard = vi.fn(() => detach);
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click(); // sporca lo stato, aggancia la guardia
    expect(ctx.deps.attachBeforeUnloadGuard).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('hashchange')); // router in admin.js farebbe repaint qui, senza mai chiamare clearDirty()
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('hashchange senza modifica pending non fa nulla (nessuna guardia agganciata da staccare)', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    expect(() => window.dispatchEvent(new Event('hashchange'))).not.toThrow();
    expect(ctx.deps.attachBeforeUnloadGuard).not.toHaveBeenCalled();
  });

  it('il controllo ordina mostra label "Ordina per:" e valore "Data"', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    expect(container.querySelector('.admin-sort-date__label').textContent).toBe(texts.admin.album.sortBy);
    expect(container.querySelector('.admin-sort-date__value').textContent).toBe(texts.admin.album.date);
  });

  it('default: vista griglia, bottone griglia attivo (aria-pressed)', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    expect(container.querySelector('.admin-view-toggle__btn--grid').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.admin-view-toggle__btn--list').getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelectorAll('.admin-photo')).toHaveLength(2);
    expect(container.querySelectorAll('.admin-photo-row')).toHaveLength(0);
  });

  it('click su toggle lista: passa a righe, aggiorna aria-pressed su entrambi i bottoni', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('.admin-view-toggle__btn--list').click();
    expect(container.querySelector('.admin-view-toggle__btn--list').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.admin-view-toggle__btn--grid').getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelectorAll('.admin-photo-row')).toHaveLength(2);
    expect(container.querySelectorAll('.admin-photo')).toHaveLength(0);
  });

  it('vista lista mostra nome file e data formattata quando capturedAt è presente', async () => {
    const ctx = makeCtx({
      deps: {
        attachSortable: vi.fn(),
        fetchManifest: vi.fn(async () => ({ ok: true, data: [
          { name: 'a.webp', width: 1, height: 1, capturedAt: new Date('2025-06-14T00:00:00Z').getTime() },
        ] })),
        prompt: vi.fn(() => null), confirm: vi.fn(() => true),
        attachBeforeUnloadGuard: vi.fn(() => vi.fn()),
        runBatch: vi.fn(async () => ({ uploaded: [], failed: [], manifest: [] })),
        makeProcessFile: vi.fn(async () => async () => ({})),
      },
    });
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('.admin-view-toggle__btn--list').click();
    const row = container.querySelector('.admin-photo-row');
    expect(row.querySelector('.admin-photo-row__name').textContent).toBe('a.webp');
    expect(row.querySelector('.admin-photo-row__date').textContent).toBe('06/14/2025');
  });

  it('vista lista mostra "—" per foto legacy senza capturedAt né uploadedAt', async () => {
    const ctx = makeCtx({
      deps: {
        attachSortable: vi.fn(),
        fetchManifest: vi.fn(async () => ({ ok: true, data: [{ name: 'legacy.webp', width: 1, height: 1 }] })),
        prompt: vi.fn(() => null), confirm: vi.fn(() => true),
        attachBeforeUnloadGuard: vi.fn(() => vi.fn()),
        runBatch: vi.fn(async () => ({ uploaded: [], failed: [], manifest: [] })),
        makeProcessFile: vi.fn(async () => async () => ({})),
      },
    });
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('.admin-view-toggle__btn--list').click();
    expect(container.querySelector('.admin-photo-row__date').textContent).toBe('—');
  });

  it('vista lista: click su Cover seleziona la riga', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('.admin-view-toggle__btn--list').click();
    container.querySelector('.admin-photo-row .admin-photo-row__cover').click();
    expect(container.querySelector('.admin-photo-row__cover--selected')).not.toBeNull();
  });

  it('vista lista: click su Elimina (confermato) rimuove la riga', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('.admin-view-toggle__btn--list').click();
    expect(container.querySelectorAll('.admin-photo-row')).toHaveLength(2);
    container.querySelector('.admin-photo-row .admin-photo-row__delete').click();
    await flush();
    expect(container.querySelectorAll('.admin-photo-row')).toHaveLength(1);
  });

  it('la dropzone mostra i vincoli di formato e dimensione', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    expect(container.querySelector('.admin-dropzone__constraints').textContent).toBe(texts.admin.album.dropzoneConstraints);
  });

  it('header album: emoji icona presente, nessuna label visibile "Sottotitolo" (solo aria-label)', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    expect(container.querySelector('.admin-album-header__icon').textContent).toBe('📷');
    expect(container.querySelector('[name="album-description"]').getAttribute('aria-label')).toBe(texts.admin.album.subtitleLabel);
    expect(container.textContent).not.toContain(`${texts.admin.album.subtitleLabel} `);
  });

  it('header album: il titolo resta dentro il nuovo wrapper, invariato nel contenuto', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    expect(container.querySelector('.admin-album-header__text h2').textContent).toBe('Sport');
  });
});
