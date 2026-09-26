import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSite: vi.fn(),
  fetchAlbums: vi.fn(),
  fetchManifest: vi.fn(),
  fetchConfig: vi.fn(),
  slot: vi.fn(),
  renderSkeletons: vi.fn(),
  renderGrid: vi.fn(),
  createLightbox: vi.fn(),
  renderNav: vi.fn(),
  renderFooter: vi.fn(),
}));

vi.mock('../providers/data.js', () => mocks);
vi.mock('../utils/validateConfig.js', () => ({ validateSiteConfig: vi.fn() }));
vi.mock('../components/Nav.js', () => ({ renderNav: mocks.renderNav }));
vi.mock('../components/Footer.js', () => ({ renderFooter: mocks.renderFooter }));
vi.mock('../components/PhotoGrid.js', () => ({ renderSkeletons: mocks.renderSkeletons, renderGrid: mocks.renderGrid }));
vi.mock('../components/Lightbox.js', () => ({ createLightbox: mocks.createLightbox }));
vi.mock('../core/custom-slots.js', () => ({ slot: mocks.slot }));

describe('album bootstrap from the build seed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    window.history.replaceState({}, '', '/album-name');
    document.body.innerHTML = `
      <nav id="site-nav"></nav>
      <h1 id="album-title"></h1>
      <div id="photo-grid"></div>
      <footer id="site-footer"></footer>
    `;
    mocks.fetchSite.mockResolvedValue({
      ok: true,
      data: { name: 'Runtime', bio: '', hero: null, social: {} },
    });
    mocks.fetchAlbums.mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    mocks.fetchManifest.mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    mocks.fetchConfig.mockResolvedValue({
      ok: true,
      data: { r2PublicUrl: 'https://pub-test.r2.dev' },
    });
    mocks.slot.mockImplementation(async name => {
      const defaults = await import('../core/default-slots.js');
      return defaults[name];
    });
    mocks.createLightbox.mockReturnValue({ open: vi.fn(), close: vi.fn(), destroy: vi.fn() });
  });

  it('recognizes the seeded album and renders the empty-album state', async () => {
    await import('./album.js');

    expect(document.getElementById('album-title').textContent).toBe('Titolo Album');
    expect(document.querySelector('.photo-grid__error')).not.toBeNull();
    expect(document.querySelector('#photo-grid a[href="/"]')).toBeNull();
  });

  it('shows an explicit no-image state when the manifest exists but the public URL is absent', async () => {
    mocks.fetchConfig.mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    mocks.fetchManifest.mockResolvedValue({
      ok: true,
      data: [{ name: 'photo.webp', width: 100, height: 100 }],
    });

    await import('./album.js');

    expect(document.querySelector('.photo-grid__error').textContent)
      .toBe('Le immagini non sono disponibili senza un URL pubblico R2.');
    expect(document.querySelector('#photo-grid img')).toBeNull();
  });

  it('emits photo events and readiness with the resolved album data', async () => {
    const { on } = await import('../core/events.js');
    const opened = vi.fn();
    const closed = vi.fn();
    const ready = vi.fn();
    const off = [on('photo:open', opened), on('photo:close', closed), on('page:ready', ready)];
    const photo = { name: 'photo.webp', width: 100, height: 80 };
    mocks.fetchAlbums.mockResolvedValue({ ok: true, data: [{ slug: 'album-name', title: 'Titolo Album', description: '', coverName: null }] });
    mocks.fetchManifest.mockResolvedValue({ ok: true, data: [photo] });

    await import('./album.js');

    const [, , onPhotoClick] = mocks.renderGrid.mock.calls[0];
    onPhotoClick(0, document.createElement('figure'));
    mocks.createLightbox.mock.calls[0][1].onClose(0);

    expect(opened).toHaveBeenCalledWith({ index: 0, photo: expect.objectContaining({ name: 'photo.webp' }) });
    expect(closed).toHaveBeenCalledWith({ index: 0, photo: expect.objectContaining({ name: 'photo.webp' }) });
    expect(ready).toHaveBeenCalledWith(expect.objectContaining({ page: 'album', album: expect.objectContaining({ slug: 'album-name' }) }));
    off.forEach(unsubscribe => unsubscribe());
  });

  it('keeps chrome and reports a failed custom photo slot without rejecting the page entry', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fetchAlbums.mockResolvedValue({ ok: true, data: [{ slug: 'album-name', title: 'Album', description: '', coverName: null }] });
    mocks.fetchManifest.mockResolvedValue({ ok: true, data: [{ name: 'photo.webp', width: 100, height: 80 }] });
    mocks.slot.mockImplementation(async name => {
      if (name === 'photoGrid') throw new Error('custom grid failed');
      const defaults = await import('../core/default-slots.js');
      return defaults[name];
    });

    await expect(import('./album.js')).resolves.toBeDefined();

    expect(document.querySelector('#site-nav')).not.toBeNull();
    expect(document.querySelector('.photo-grid__error')?.textContent).toBeTruthy();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('mounts chrome before the manifest resolves and waits before page readiness', async () => {
    let resolveManifest;
    mocks.fetchManifest.mockReturnValue(new Promise(resolve => { resolveManifest = resolve; }));
    const { on } = await import('../core/events.js');
    const ready = vi.fn();
    const off = on('page:ready', ready);
    const loadingPage = import('./album.js');

    await vi.waitFor(() => expect(mocks.renderNav).toHaveBeenCalledOnce());
    expect(ready).not.toHaveBeenCalled();
    resolveManifest({ ok: false, error: 'NOT_FOUND' });
    await loadingPage;

    expect(ready).toHaveBeenCalledWith(expect.objectContaining({ page: 'album', album: expect.objectContaining({ slug: 'album-name' }) }));
    off();
  });
});
