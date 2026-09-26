import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { showPreview, hidePreview } from './preview.js';

// NOTA: rispetto al brief originale, aggiunto `footer.copyright` — showPreview
// chiama anche renderFooter(), che accede a texts.footer.copyright senza
// optional chaining (src/components/Footer.js:11). Il fixture del brief
// aveva solo `landing`, causando un TypeError in ogni test. Placeholder
// '© 2026' allineato alla convenzione già usata in Footer.test.js.
// album.* servono a renderAlbumView, che riusa resolveAlbumPage/texts esattamente
// come src/pages/album.js.
// admin.site.preview e admin.site.previewClose servono al Task 2 (stringhe della dashboard).
const texts = {
  landing: { heroSubtitle: 'Sottotitolo statico.', albumsSectionHeading: 'Album' },
  footer: { copyright: '© 2026' },
  album: {
    notFound: 'Album non trovato.',
    empty: 'Nessuna foto trovata in questo album.',
    error: { network: 'Errore di rete.', unknown: 'Errore sconosciuto.' },
  },
  admin: { site: { preview: 'Anteprima', previewClose: 'Chiudi' }, common: { allAlbums: '← Tutti gli album' } },
};
const ALBUMS = [
  { slug: 'sport', title: 'Sport', description: '', coverName: 'cover.webp' },
  { slug: 'viaggi', title: 'Viaggi', description: '', coverName: null },
];
const pending = {
  name: 'Davide', bio: 'La mia bio', heroUrl: 'https://x/img.webp',
  social: { instagram: 'https://instagram.com/x' },
  albums: ALBUMS, r2PublicUrl: 'https://pub.r2.dev',
};

describe('showPreview / hidePreview', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    // NOTA: rispetto al brief originale, aggiunta la classe admin-preview.
    // currentPreviewEl() in preview.js cerca deliberatamente il contenitore
    // vivo via document.querySelector('.admin-preview') ad ogni keydown
    // (invece di chiudersi su un riferimento stantio — vedi commento in
    // preview.js). In produzione questa classe sta già nel markup che
    // home.js (Task 3) renderizza; qui va replicata sul contenitore di
    // test, altrimenti la query non trova mai nulla e Escape/Tab non
    // intervengono mai.
    container.className = 'admin-preview';
    container.hidden = true;
    document.body.replaceChildren(container);
  });
  afterEach(() => { document.body.replaceChildren(); });

  it('mostra il contenitore e renderizza titolo, sottotitolo (bio) e link social', () => {
    showPreview(container, pending, texts);
    expect(container.hidden).toBe(false);
    expect(container.querySelector('.hero__title').textContent).toBe('Davide');
    expect(container.querySelector('.hero__subtitle').textContent).toBe('La mia bio');
    expect(container.querySelector('.site-footer__link').getAttribute('href')).toBe('https://instagram.com/x');
  });

  it('renderizza la griglia album — anteprima completa, non solo hero+footer', () => {
    showPreview(container, pending, texts);
    expect(container.querySelector('.section-heading').textContent).toBe('Album');
    const cards = container.querySelectorAll('.admin-preview__albums .album-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.album-card__title').textContent).toBe('Sport');
    expect(cards[0].querySelector('.album-card__img').getAttribute('src')).toBe('https://pub.r2.dev/sport/cover.webp');
    expect(cards[1].querySelector('.album-card__img')).toBeNull(); // nessuna coverName → nessuna img
  });

  it('senza albums (default []) non esplode, griglia vuota', () => {
    const { albums, ...rest } = pending;
    showPreview(container, rest, texts);
    expect(container.querySelectorAll('.admin-preview__albums .album-card')).toHaveLength(0);
  });

  it('sposta il focus sul tasto Chiudi', () => {
    showPreview(container, pending, texts);
    expect(document.activeElement).toBe(container.querySelector('.admin-preview__close'));
  });

  it('hidePreview nasconde e svuota il contenitore', () => {
    showPreview(container, pending, texts);
    hidePreview(container);
    expect(container.hidden).toBe(true);
    expect(container.innerHTML).toBe('');
  });

  it('click sul tasto Chiudi chiama hidePreview', () => {
    showPreview(container, pending, texts);
    container.querySelector('.admin-preview__close').click();
    expect(container.hidden).toBe(true);
  });

  it('Escape chiude solo quando il contenitore è visibile', () => {
    // overlay chiuso: Escape non deve fare nulla (niente da verificare se non l'assenza di errori)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(container.hidden).toBe(true);

    showPreview(container, pending, texts);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(container.hidden).toBe(true);
    expect(container.innerHTML).toBe('');
  });

  it('il listener keydown è agganciato una sola volta anche dopo molte show/hide ripetute', () => {
    const spy = vi.spyOn(document, 'addEventListener');
    showPreview(container, pending, texts);
    hidePreview(container);
    showPreview(container, pending, texts);
    hidePreview(container);
    showPreview(container, pending, texts);
    const keydownCalls = spy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownCalls.length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });

  it('Tab sull\'ultimo elemento focusabile (link social) torna al primo (Chiudi) — anello, non snap-back', () => {
    showPreview(container, pending, texts); // pending ha instagram → un link social presente
    const closeBtn = container.querySelector('.admin-preview__close');
    const link = container.querySelector('.site-footer__link');
    expect(link).not.toBeNull(); // pre-condizione: il test non ha senso senza un link da raggiungere

    link.focus();
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(closeBtn);
    expect(tabEvent.defaultPrevented).toBe(true);
  });

  it('Shift+Tab sul primo elemento (Chiudi) va all\'ultimo (link social) — anello nell\'altra direzione', () => {
    showPreview(container, pending, texts);
    const closeBtn = container.querySelector('.admin-preview__close');
    const link = container.querySelector('.site-footer__link');

    closeBtn.focus();
    const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(shiftTabEvent);
    expect(document.activeElement).toBe(link);
    expect(shiftTabEvent.defaultPrevented).toBe(true);
  });

  it('Tab NON ai bordi (nessun social, solo il tasto Chiudi) non interviene — non c\'è nulla da ciclare', () => {
    const noSocial = { ...pending, social: {} };
    showPreview(container, noSocial, texts);
    expect(container.querySelector('.site-footer__link')).toBeNull(); // un solo elemento focusabile: Chiudi

    const closeBtn = container.querySelector('.admin-preview__close');
    closeBtn.focus();
    // Chiudi è sia primo che ultimo: Tab in avanti deve comunque tenerlo lì (anello di un solo elemento)
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(closeBtn);
  });
});

describe('anteprima: apertura album senza uscire dalla preview', () => {
  let container, deps;
  const MANIFEST = [{ name: 'a.webp', width: 4, height: 3 }, { name: 'b.webp', width: 1, height: 1 }];

  beforeEach(() => {
    container = document.createElement('div');
    container.className = 'admin-preview';
    container.hidden = true;
    document.body.replaceChildren(container);
    deps = { fetchManifest: vi.fn(async () => ({ ok: true, data: structuredClone(MANIFEST) })) };
  });
  afterEach(() => { document.body.replaceChildren(); });

  it('click su una album-card NON naviga (preventDefault) e mostra la vista album, header invariato', async () => {
    showPreview(container, pending, texts, deps);
    const headerBefore = container.querySelector('.admin-preview__header').outerHTML;

    const card = container.querySelector('.admin-preview__albums .album-card');
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    card.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);

    await vi.waitFor(() => expect(deps.fetchManifest).toHaveBeenCalledWith('sport'));
    await vi.waitFor(() => expect(container.querySelectorAll('.photo-grid__item')).toHaveLength(2));

    // Header — titolo "Anteprima" + Chiudi — resta esattamente lo stesso nodo/contenuto.
    expect(container.querySelector('.admin-preview__header').outerHTML).toBe(headerBefore);
    expect(container.querySelector('.section-heading').textContent).toBe('Sport');
  });

  it('vista album: bottone "Tutti gli album" torna alla landing (griglia album di nuovo visibile)', async () => {
    showPreview(container, pending, texts, deps);
    container.querySelector('.admin-preview__albums .album-card').click();
    await vi.waitFor(() => expect(container.querySelectorAll('.photo-grid__item')).toHaveLength(2));

    container.querySelector('.admin-preview__back').click();
    expect(container.querySelectorAll('.admin-preview__albums .album-card')).toHaveLength(2);
    expect(container.querySelector('.photo-grid__item')).toBeNull();
  });

  it('album vuoto (manifest 404) mostra il messaggio "empty", non un errore', async () => {
    deps.fetchManifest = vi.fn(async () => ({ ok: false, error: 'NOT_FOUND' }));
    showPreview(container, pending, texts, deps);
    container.querySelector('.admin-preview__albums .album-card').click();
    await vi.waitFor(() => expect(container.querySelector('.photo-grid__error')).not.toBeNull());
    expect(container.querySelector('.photo-grid__error').textContent).toBe(texts.album.empty);
    expect(container.querySelector('.section-heading').textContent).toBe('Sport');
  });

  it('foto cliccata apre la lightbox con l\'URL corretto', async () => {
    showPreview(container, pending, texts, deps);
    container.querySelector('.admin-preview__albums .album-card').click();
    await vi.waitFor(() => expect(container.querySelectorAll('.photo-grid__item')).toHaveLength(2));

    container.querySelectorAll('.photo-grid__item')[1].click();
    const lightbox = document.querySelector('.lightbox');
    expect(lightbox.classList.contains('lightbox--open')).toBe(true);
    expect(lightbox.querySelector('.lightbox__img').src).toBe('https://pub.r2.dev/sport/b.webp');
  });

  it('cambiare album smonta la lightbox precedente — non se ne accumulano', async () => {
    showPreview(container, pending, texts, deps);
    container.querySelector('.admin-preview__albums .album-card').click();
    await vi.waitFor(() => expect(container.querySelectorAll('.photo-grid__item')).toHaveLength(2));
    container.querySelector('.photo-grid__item').click(); // apre la lightbox del primo album

    container.querySelector('.admin-preview__back').click();
    const cards = container.querySelectorAll('.admin-preview__albums .album-card');
    cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(deps.fetchManifest).toHaveBeenCalledWith('viaggi'));
    await vi.waitFor(() => expect(container.querySelectorAll('.photo-grid__item')).toHaveLength(2));

    expect(document.querySelectorAll('.lightbox')).toHaveLength(1); // non 2
  });

  it('hidePreview smonta anche la lightbox aperta, non resta in document.body', async () => {
    showPreview(container, pending, texts, deps);
    container.querySelector('.admin-preview__albums .album-card').click();
    await vi.waitFor(() => expect(container.querySelectorAll('.photo-grid__item')).toHaveLength(2));
    container.querySelector('.photo-grid__item').click();
    expect(document.querySelector('.lightbox')).not.toBeNull();

    hidePreview(container);
    expect(document.querySelector('.lightbox')).toBeNull();
  });

  it('fetch manifest lenta: se nel frattempo si torna alla landing, la risposta tardiva non riscrive la vista', async () => {
    let resolveFetch;
    deps.fetchManifest = vi.fn(() => new Promise(r => { resolveFetch = r; }));
    showPreview(container, pending, texts, deps);
    container.querySelector('.admin-preview__albums .album-card').click();
    await vi.waitFor(() => expect(deps.fetchManifest).toHaveBeenCalled());

    container.querySelector('.admin-preview__back').click(); // torna alla landing prima che la fetch risolva
    resolveFetch({ ok: true, data: structuredClone(MANIFEST) });
    await new Promise(r => setTimeout(r, 0));

    // Deve essere rimasti sulla landing: nessuna griglia foto comparsa sopra le card.
    expect(container.querySelectorAll('.admin-preview__albums .album-card')).toHaveLength(2);
    expect(container.querySelector('.photo-grid__item')).toBeNull();
  });
});
