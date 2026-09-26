import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted: vi.mock factories are hoisted above plain declarations.
const { mount, slot } = vi.hoisted(() => {
  const mount = vi.fn(async () => ({ destroy() {} }));
  return { mount, slot: vi.fn(async () => ({ mount })) };
});

vi.mock('../core/custom-slots.js', () => ({ slot }));
vi.mock('../providers/data.js', () => ({
  fetchSite: vi.fn(async () => ({ ok: true, data: { name: 'Runtime', bio: '', hero: null, social: {} } })),
  fetchAlbums: vi.fn(async () => ({ ok: true, data: [] })),
  fetchConfig: vi.fn(async () => ({ ok: true, data: { r2PublicUrl: 'https://pub-test.r2.dev' } })),
}));
vi.mock('../utils/validateConfig.js', () => ({ validateSiteConfig: vi.fn() }));
vi.mock('../components/Nav.js', () => ({ renderNav: vi.fn() }));
vi.mock('../components/Footer.js', () => ({ renderFooter: vi.fn() }));

describe('home page delegates to the landing slot', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<nav id="site-nav"></nav><div id="landing"></div><footer id="site-footer"></footer>';
  });

  it('mounts the resolved slot in #landing with texts and a data promise', async () => {
    await import('./index.js');
    expect(slot).toHaveBeenCalledWith('landing');
    expect(mount).toHaveBeenCalledTimes(1);
    const [container, ctx] = mount.mock.calls[0];
    expect(container.id).toBe('landing');
    expect(ctx.texts.landing).toBeDefined();
    const data = await ctx.data;
    expect(data.site.name).toBe('Runtime');
    expect(data.albums).toEqual([]);
    expect(data.albumsError).toBeNull();
    expect(data.r2PublicUrl).toBe('https://pub-test.r2.dev');
  });
});
