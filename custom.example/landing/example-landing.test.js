import { describe, expect, it } from 'vitest';
import landing from './example-landing.js';

const texts = { album: { error: { network: 'Rete assente', unknown: 'Errore' } } };
const site = { name: 'Nome', bio: '', heroUrl: null, social: {} };

const mountWith = async data => {
  const container = document.createElement('div');
  await landing.mount(container, { texts, data: Promise.resolve({ site, albumsError: null, r2PublicUrl: 'https://photos.example.com', ...data }) });
  return container;
};

describe('example landing', () => {
  it('links every album, with its cover when it has one', async () => {
    const container = await mountWith({
      albums: [
        { slug: 'sport', title: 'Sport', description: '', coverName: 'c.webp' },
        { slug: 'viaggi', title: 'Viaggi', description: '', coverName: null },
      ],
    });
    const sport = container.querySelector('a[href="/sport"]');
    expect(sport.textContent).toBe('Sport');
    expect(sport.querySelector('img').getAttribute('src')).toBe('https://photos.example.com/sport/c.webp');
    const viaggi = container.querySelector('a[href="/viaggi"]');
    expect(viaggi.textContent).toBe('Viaggi');
    expect(viaggi.querySelector('img')).toBeNull();
  });

  it('shows the error message when the albums could not be loaded', async () => {
    const container = await mountWith({ albums: null, albumsError: 'NETWORK' });
    expect(container.querySelector('p').textContent).toBe('Rete assente');
    expect(container.querySelector('a')).toBeNull();
  });
});
