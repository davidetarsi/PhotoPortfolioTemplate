import { afterEach, describe, expect, it } from 'vitest';
import { keepCustomThemeLast } from './custom-theme.js';

afterEach(() => { document.head.innerHTML = ''; });

describe('lazy custom theme order', () => {
  it('moves the existing theme link after CSS added by a lazy slot without duplicating it', () => {
    document.head.innerHTML = `
      <link rel="stylesheet" href="/assets/base.css">
      <link rel="stylesheet" href="/assets/theme.css" data-custom-theme>
      <link rel="stylesheet" href="/assets/lazy.css">
    `;

    keepCustomThemeLast();

    const stylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')];
    expect(stylesheets.map(link => link.getAttribute('href')))
      .toEqual(['/assets/base.css', '/assets/lazy.css', '/assets/theme.css']);
    expect(document.querySelectorAll('link[data-custom-theme]')).toHaveLength(1);
  });

  it('leaves the theme link in place when it is already the last stylesheet', () => {
    document.head.innerHTML = `
      <link rel="stylesheet" href="/assets/base.css">
      <link rel="stylesheet" href="/assets/theme.css" data-custom-theme>
      <link rel="modulepreload" href="/assets/lazy.js">
    `;
    const observer = new MutationObserver(() => {});
    observer.observe(document.head, { childList: true });

    keepCustomThemeLast();

    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it('moves the theme after a style element injected in development', () => {
    document.head.innerHTML = `
      <link rel="stylesheet" href="/custom/theme.css" data-custom-theme>
      <style data-vite-dev-id="/custom/photo-grid/grid.css">.grid {}</style>
    `;

    keepCustomThemeLast();

    const sheets = [...document.querySelectorAll('link[rel="stylesheet"], style')];
    expect(sheets.at(-1).hasAttribute('data-custom-theme')).toBe(true);
  });

  it('does nothing when no custom theme link exists', () => {
    document.head.innerHTML = '<link rel="stylesheet" href="/assets/base.css">';

    expect(() => keepCustomThemeLast()).not.toThrow();
    expect(document.head.querySelectorAll('link')).toHaveLength(1);
  });
});
