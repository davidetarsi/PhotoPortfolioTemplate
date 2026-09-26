import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const owner = { track: vi.fn(value => Promise.resolve(value)), ready: vi.fn(), destroy: vi.fn() };
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
});
