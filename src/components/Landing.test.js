import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./Hero.js', () => ({ renderHero: vi.fn() }));

const texts = {
  landing: { albumsSectionHeading: 'Album' },
  album: { error: { network: 'Rete assente', unknown: 'Errore' } },
};
const site = { name: 'Nome', bio: '', heroUrl: null, social: {} };
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

describe('default landing slot', () => {
  let container;
  beforeEach(() => {
    document.body.innerHTML = '<div id="landing"></div>';
    container = document.getElementById('landing');
  });

  it('shows heading and skeletons before data arrives', async () => {
    const { landing } = await import('./Landing.js');
    const d = deferred();
    const mounted = landing.mount(container, { texts, data: d.promise });

    expect(container.querySelector('#albums-heading').textContent).toBe('Album');
    expect(container.querySelectorAll('.album-card__skeleton')).toHaveLength(2);
    expect(container.querySelector('#hero')).not.toBeNull();

    d.resolve({ site, albums: [], albumsError: null, r2PublicUrl: 'https://pub-test.r2.dev' });
    await mounted;
    expect(container.querySelectorAll('.album-card__skeleton')).toHaveLength(0);
  });

  it('renders one card per album', async () => {
    const { landing } = await import('./Landing.js');
    const albums = [{ slug: 'sport', title: 'Sport', description: '', coverName: null }];
    await landing.mount(container, {
      texts,
      data: Promise.resolve({ site, albums, albumsError: null, r2PublicUrl: 'https://pub-test.r2.dev' }),
    });
    expect(container.querySelector('a.album-card[href="/sport"]')).not.toBeNull();
  });

  it('shows the network message when albums could not be loaded', async () => {
    const { landing } = await import('./Landing.js');
    await landing.mount(container, {
      texts,
      data: Promise.resolve({ site, albums: null, albumsError: 'NETWORK', r2PublicUrl: undefined }),
    });
    expect(container.querySelector('.page-error').textContent).toBe('Rete assente');
  });

  it('shows the generic message for any other load error', async () => {
    const { landing } = await import('./Landing.js');
    await landing.mount(container, {
      texts,
      data: Promise.resolve({ site, albums: null, albumsError: 'MALFORMED', r2PublicUrl: undefined }),
    });
    expect(container.querySelector('.page-error').textContent).toBe('Errore');
  });

  it('destroy empties its container', async () => {
    const { landing } = await import('./Landing.js');
    const handle = await landing.mount(container, {
      texts,
      data: Promise.resolve({ site, albums: [], albumsError: null, r2PublicUrl: undefined }),
    });
    handle.destroy();
    expect(container.children).toHaveLength(0);
  });
});
