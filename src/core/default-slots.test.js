import { describe, expect, it, vi } from 'vitest';
import * as defaults from './default-slots.js';
import { SLOT_CONTRACTS } from './contracts.js';

const texts = {
  nav: { aboutLabel: 'About' },
  footer: { copyright: '© Test' },
};

describe('template default slot adapters', () => {
  it('declares all five page slots with their contracts', () => {
    expect(SLOT_CONTRACTS).toEqual({
      landing: 'mount', nav: 'mount', footer: 'mount', photoGrid: 'mount', lightbox: 'create',
    });
    for (const name of Object.keys(SLOT_CONTRACTS)) expect(defaults[name]).toBeTruthy();
  });

  it('passes nav and footer contexts to the existing renderers and clears on destroy', () => {
    const site = { name: 'Test Site', social: { instagram: 'https://example.com' } };
    const navContainer = document.createElement('div');
    const footerContainer = document.createElement('div');
    const nav = defaults.nav.mount(navContainer, { site, texts });
    const footer = defaults.footer.mount(footerContainer, { site, texts });

    expect(navContainer.querySelector('.site-nav__brand').textContent).toBe('Test Site');
    expect(footerContainer.querySelector('.site-footer__link').href).toBe('https://example.com/');
    nav.destroy();
    footer.destroy();
    expect(navContainer.childElementCount).toBe(0);
    expect(footerContainer.childElementCount).toBe(0);
  });

  it('passes photos and click callback to the grid and clears on destroy', () => {
    const container = document.createElement('div');
    const onPhotoClick = vi.fn();
    const handle = defaults.photoGrid.mount(container, {
      photos: [{ name: 'lake.jpg', gridUrl: '/lake.webp', width: 4, height: 3 }], texts, onPhotoClick,
    });

    container.querySelector('.photo-grid__item').click();

    expect(container.querySelector('img').alt).toBe('lake.jpg');
    expect(onPhotoClick).toHaveBeenCalledWith(0, container.querySelector('.photo-grid__item'));
    handle.destroy();
    expect(container.childElementCount).toBe(0);
  });

  it('creates the default lightbox with the onClose callback', () => {
    const onClose = vi.fn();
    const lightbox = defaults.lightbox.create([{ name: 'lake.jpg', fullUrl: '/lake.webp' }], { onClose });
    lightbox.open(0);
    lightbox.close();
    lightbox.destroy();

    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(0);
  });
});
