import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLightbox } from './Lightbox.js';

const photos = [
  { name: '01.jpg', gridUrl: 'g1', fullUrl: 'https://example.com/f1.jpg' },
  { name: '02.jpg', gridUrl: 'g2', fullUrl: 'https://example.com/f2.jpg' },
  { name: '03.jpg', gridUrl: 'g3', fullUrl: 'https://example.com/f3.jpg' },
];

describe('createLightbox', () => {
  let lb;
  beforeEach(() => {
    document.body.innerHTML = '';
    lb = createLightbox(photos);
  });
  afterEach(() => { document.body.innerHTML = ''; });

  it('appends a .lightbox element to body', () => {
    expect(document.querySelector('.lightbox')).not.toBeNull();
  });

  it('is hidden by default (aria-hidden=true, no open class)', () => {
    const el = document.querySelector('.lightbox');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.classList.contains('lightbox--open')).toBe(false);
  });

  it('open() adds lightbox--open class and sets aria-hidden=false', () => {
    lb.open(0);
    const el = document.querySelector('.lightbox');
    expect(el.classList.contains('lightbox--open')).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBe('false');
  });

  it('open(index) loads fullUrl of the given photo into the img', () => {
    lb.open(1);
    expect(document.querySelector('.lightbox__img').src).toBe('https://example.com/f2.jpg');
  });

  it('destroy() chiude e rimuove il nodo .lightbox dal body', () => {
    lb.open(0);
    lb.destroy();
    expect(document.querySelector('.lightbox')).toBeNull();
  });

  it('close() removes lightbox--open and sets aria-hidden=true', () => {
    lb.open(0);
    lb.close();
    const el = document.querySelector('.lightbox');
    expect(el.classList.contains('lightbox--open')).toBe(false);
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('clicking the close button closes the lightbox', () => {
    lb.open(0);
    document.querySelector('.lightbox__close').click();
    expect(document.querySelector('.lightbox').classList.contains('lightbox--open')).toBe(false);
  });

  it('clicking the prev button goes to the previous photo', () => {
    lb.open(1);
    document.querySelector('.lightbox__prev').click();
    expect(document.querySelector('.lightbox__img').src).toBe('https://example.com/f1.jpg');
  });

  it('clicking the next button advances to the next photo', () => {
    lb.open(0);
    document.querySelector('.lightbox__next').click();
    expect(document.querySelector('.lightbox__img').src).toBe('https://example.com/f2.jpg');
  });

  it('Escape key closes the lightbox', () => {
    lb.open(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.lightbox').classList.contains('lightbox--open')).toBe(false);
  });

  it('ArrowRight advances to the next photo', () => {
    lb.open(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.querySelector('.lightbox__img').src).toBe('https://example.com/f2.jpg');
  });

  it('ArrowLeft goes to the previous photo', () => {
    lb.open(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.querySelector('.lightbox__img').src).toBe('https://example.com/f1.jpg');
  });

  it('ArrowRight wraps from the last photo to the first', () => {
    lb.open(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.querySelector('.lightbox__img').src).toBe('https://example.com/f1.jpg');
  });

  it('clicking the lightbox backdrop closes the lightbox', () => {
    lb.open(0);
    const el = document.querySelector('.lightbox');
    el.click();
    expect(el.classList.contains('lightbox--open')).toBe(false);
  });

  it.each([
    ['Escape', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))],
    ['close button', () => document.querySelector('.lightbox__close').click()],
    ['backdrop', () => document.querySelector('.lightbox').click()],
    ['destroy', () => lb.destroy()],
  ])('calls onClose once when %s closes an open lightbox', (_, close) => {
    const onClose = vi.fn();
    lb.destroy();
    lb = createLightbox(photos, { onClose });
    lb.open(1);

    close();
    lb.close();

    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(1);
  });

  it('does not call onClose when the lightbox is already closed', () => {
    const onClose = vi.fn();
    lb.destroy();
    lb = createLightbox(photos, { onClose });

    lb.close();
    lb.destroy();

    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes the document keyboard handler on destroy', () => {
    const onClose = vi.fn();
    lb.destroy();
    lb = createLightbox(photos, { onClose });
    lb.open(0);
    lb.destroy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('.lightbox')).toBeNull();
  });
});
