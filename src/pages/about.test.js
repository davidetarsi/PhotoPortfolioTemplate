import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const owner = {
    destroyed: false,
    track: vi.fn(value => Promise.resolve(value)),
    ready: vi.fn(),
    destroy() { this.destroyed = true; },
  };
  return {
    fetchSite: vi.fn(),
    fetchConfig: vi.fn(),
    startPage: vi.fn(() => owner),
    owner,
    mountChrome: vi.fn(async () => {}),
    createContactForm: vi.fn(() => document.createElement('form')),
  };
});

vi.mock('../providers/data.js', () => ({ fetchSite: mocks.fetchSite, fetchConfig: mocks.fetchConfig }));
vi.mock('../utils/validateConfig.js', () => ({ validateSiteConfig: vi.fn() }));
vi.mock('../core/page.js', () => ({ startPage: mocks.startPage }));
vi.mock('../core/chrome.js', () => ({ mountChrome: mocks.mountChrome }));
vi.mock('../components/ContactForm.js', () => ({ createContactForm: mocks.createContactForm }));

describe('about page lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.owner.destroyed = false;
    document.body.innerHTML = '<nav id="site-nav"></nav><h1 id="about-heading"></h1><p id="about-body"></p><div id="about-form"></div><footer id="site-footer"></footer>';
    mocks.fetchSite.mockResolvedValue({ ok: true, data: { name: 'Runtime', bio: '', hero: null, social: {} } });
    mocks.fetchConfig.mockResolvedValue({ ok: true, data: { r2PublicUrl: 'https://pub-test.r2.dev' } });
  });

  it('starts chrome from resolved site data and signals ready after content setup', async () => {
    await import('./about.js');

    expect(mocks.startPage).toHaveBeenCalledWith('about');
    expect(mocks.mountChrome).toHaveBeenCalledWith(expect.objectContaining({ site: expect.objectContaining({ name: 'Runtime' }) }));
    expect(document.querySelector('#about-heading').textContent).toBeTruthy();
    expect(document.querySelector('#about-form form')).not.toBeNull();
    expect(mocks.owner.ready).toHaveBeenCalledWith({ site: expect.objectContaining({ name: 'Runtime' }) });
  });

  it('shows the heading and text edited from the dashboard', async () => {
    mocks.fetchSite.mockResolvedValue({ ok: true, data: {
      name: 'Runtime', bio: '', hero: null, texts: { 'about.heading': 'Scrivimi', 'about.body': 'Per lavori su commissione.' },
    } });
    await import('./about.js');

    expect(document.querySelector('#about-heading').textContent).toBe('Scrivimi');
    expect(document.querySelector('#about-body').textContent).toBe('Per lavori su commissione.');
    expect(mocks.mountChrome).toHaveBeenCalledWith(expect.objectContaining({
      texts: expect.objectContaining({ about: expect.objectContaining({ heading: 'Scrivimi' }) }),
    }));
  });

  it('skips contact form setup when the page is disposed before site data resolves', async () => {
    let resolveSite;
    mocks.fetchSite.mockReturnValue(new Promise(resolve => { resolveSite = resolve; }));
    const loadingPage = import('./about.js');
    await Promise.resolve();
    mocks.owner.destroy();
    resolveSite({ ok: true, data: { name: 'Runtime', bio: '', hero: null, social: {} } });

    await loadingPage;

    expect(mocks.createContactForm).not.toHaveBeenCalled();
    expect(mocks.owner.ready).not.toHaveBeenCalled();
  });
});
