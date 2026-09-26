import { describe, expect, it, vi } from 'vitest';
import photoGrid from './example-photo-grid.js';

describe('example photo grid', () => {
  it('renders lazy grid images, delegates open, and clears on destroy', () => {
    const container = document.createElement('div');
    const onPhotoClick = vi.fn();
    const photos = [{ name: 'one.webp', gridUrl: 'https://photos.example/one.webp', width: 80, height: 100 }];

    const handle = photoGrid.mount(container, { photos, onPhotoClick });

    const button = container.querySelector('.example-photo-grid__item');
    expect(button.querySelector('img').src).toBe(photos[0].gridUrl);
    button.click();
    expect(onPhotoClick).toHaveBeenCalledWith(0, button);
    handle.destroy();
    expect(container.childElementCount).toBe(0);
  });
});
