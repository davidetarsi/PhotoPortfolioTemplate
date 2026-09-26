import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted: vi.mock factories are hoisted above plain declarations.
const { mount, slot, chrome, owner, startPage } = vi.hoisted(() => {
  const mount = vi.fn(async () => ({ destroy() {} }));
  const owner = {
    track: vi.fn(value => Promise.resolve(value)),
    ready: vi.fn(),
    destroy: vi.fn(),
  };
  const startPage = vi.fn(() => owner);
  return { mount, slot: vi.fn(async () => ({ mount })), chrome: vi.fn(async () => {}), owner, startPage };
});

vi.mock('../core/custom-slots.js', () => ({ slot }));
vi.mock('../core/chrome.js', () => ({ mountChrome: chrome }));
vi.mock('../core/page.js', () => ({ startPage }));
vi.mock('../providers/data.js', () => ({
  fetchSite: vi.fn(async () => ({ ok: true, data: { name: 'Runtime', bio: '', hero: null, social: {} } })),
  fetchAlbums: vi.fn(async () => ({ ok: true, data: [] })),
  fetchConfig: vi.fn(async () => ({ ok: true, data: { r2PublicUrl: 'https://pub-test.r2.dev' } })),
}));
vi.mock('../utils/validateConfig.js', () => ({ validateSiteConfig: vi.fn() }));
vi.mock('../components/Nav.js', () => ({ renderNav: vi.fn() }));
vi.mock('../components/Footer.js', () => ({ renderFooter: vi.fn() }));

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

describe('home page delegates to the landing slot', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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

  it('starts chrome while landing is pending and emits ready after both mounts settle', async () => {
    const landingLoader = deferred();
    let finishLanding;
    mount.mockImplementationOnce(() => new Promise(resolve => { finishLanding = resolve; }));
    slot.mockImplementationOnce(() => landingLoader.promise);
    const loadingPage = import('./index.js');
    await vi.waitFor(() => expect(chrome).toHaveBeenCalledOnce());
    expect(mount).not.toHaveBeenCalled();
    expect(owner.ready).not.toHaveBeenCalled();

    landingLoader.resolve({ mount });
    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    expect(owner.ready).not.toHaveBeenCalled();
    finishLanding({ destroy() {} });
    await loadingPage;

    expect(owner.ready).toHaveBeenCalledWith({ site: expect.objectContaining({ name: 'Runtime' }) });
  });
});
