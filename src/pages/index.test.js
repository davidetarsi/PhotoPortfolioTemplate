import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSite: vi.fn(),
  fetchAlbums: vi.fn(),
  fetchConfig: vi.fn(),
}));

vi.mock('../providers/data.js', () => mocks);
vi.mock('../utils/validateConfig.js', () => ({ validateSiteConfig: vi.fn() }));
vi.mock('../components/Nav.js', () => ({ renderNav: vi.fn() }));
vi.mock('../components/Footer.js', () => ({ renderFooter: vi.fn() }));
vi.mock('../components/Hero.js', () => ({ renderHero: vi.fn() }));
// This test covers the home page with the template's own parts. Pinning every slot to its
// default keeps it true in a fork whose custom/ replaces them; custom-slots.test.js checks the fork's slots.
vi.mock('../core/custom-slots.js', async () => {
  const defaults = await import('../core/default-slots.js');
  return { slot: async name => defaults[name] };
});

describe('home album bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = `
      <nav id="site-nav"></nav>
      <div id="landing"></div>
      <footer id="site-footer"></footer>
    `;
    mocks.fetchSite.mockResolvedValue({
      ok: true,
      data: { name: 'Runtime', bio: '', hero: null, social: {} },
    });
    mocks.fetchConfig.mockResolvedValue({
      ok: true,
      data: { r2PublicUrl: 'https://pub-test.r2.dev' },
    });
  });

  it('shows the default landing skeleton before runtime data resolves', async () => {
    let resolveAlbums;
    mocks.fetchAlbums.mockReturnValue(new Promise(resolve => { resolveAlbums = resolve; }));
    const loadingPage = import('./index.js');

    await vi.waitFor(() => expect(document.querySelector('.album-card__skeleton')).not.toBeNull());
    resolveAlbums({ ok: true, data: [] });
    await loadingPage;

    expect(document.querySelector('.album-card__skeleton')).toBeNull();
  });

  it('renders the real seed card when albums.json is missing', async () => {
    mocks.fetchAlbums.mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    await import('./index.js');

    const card = document.querySelector('a.album-card[href="/nome-album"]');
    expect(card).not.toBeNull();
    expect(card.querySelector('.album-card__title').textContent).toBe('Titolo Album');
    expect(document.querySelector('.page-error')).toBeNull();
  });

  it('keeps malformed runtime data visible instead of hiding it behind the seed', async () => {
    mocks.fetchAlbums.mockResolvedValue({ ok: false, error: 'MALFORMED' });
    await import('./index.js');

    expect(document.querySelector('.album-card')).toBeNull();
    expect(document.querySelector('.page-error')).not.toBeNull();
  });
});
