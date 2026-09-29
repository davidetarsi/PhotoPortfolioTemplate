import { afterEach, describe, expect, it, vi } from 'vitest';

const { mounts } = vi.hoisted(() => ({ mounts: [] }));

vi.mock('/src/api/index.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchSite: vi.fn(),
    fetchConfig: vi.fn(),
    resolveSiteContent: vi.fn(),
    slot: vi.fn(),
  };
});

import { fetchConfig, fetchSite, resolveSiteContent, slot, texts } from '/src/api/index.js';
import { mountChrome } from './chrome.js';

afterEach(() => {
  vi.clearAllMocks();
  mounts.length = 0;
});

describe('example chrome', () => {
  const prepare = site => {
    fetchSite.mockResolvedValue({ ok: true, data: site });
    fetchConfig.mockResolvedValue({ ok: true, data: { r2PublicUrl: 'https://photos.example.com' } });
    resolveSiteContent.mockReturnValue(site);
    slot.mockImplementation(async () => ({
      mount: (_element, context) => mounts.push(context.texts),
    }));
  };

  it('passes editable site text to both navigation and footer', async () => {
    const site = { texts: { 'about.heading': 'Get in touch' } };
    prepare(site);

    await mountChrome();

    expect(mounts).toEqual([
      expect.objectContaining({ about: expect.objectContaining({ heading: 'Get in touch' }) }),
      expect.objectContaining({ about: expect.objectContaining({ heading: 'Get in touch' }) }),
    ]);
  });

  it.each([
    ['missing', undefined],
    ['blank', { 'about.heading': '   ' }],
  ])('keeps config copy when the %s override is supplied', async (_label, overrides) => {
    const site = { ...(overrides === undefined ? {} : { texts: overrides }) };
    prepare(site);

    await mountChrome();

    expect(mounts).toHaveLength(2);
    expect(mounts[0].about.heading).toBe(texts.about.heading);
    expect(mounts[1].about.heading).toBe(texts.about.heading);
  });
});
