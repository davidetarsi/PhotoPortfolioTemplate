// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { adminThemeTokens } from './adminTheme.js';

describe('adminThemeTokens', () => {
  it('maps the site tokens of :root to dashboard tokens', () => {
    const css = `
      /* the site's theme */
      :root {
        --color-bg: #f8f3e6;
        --color-text: #15304a;
        --color-accent: #b0245f;
        --font-heading: 'Fraunces', serif;
        --space-md: 1rem;
      }
      .card { --color-bg: red; }`;
    expect(adminThemeTokens(css)).toEqual({
      '--admin-bg': '#f8f3e6',
      '--admin-ink': '#15304a',
      '--admin-accent': '#b0245f',
      '--admin-on-accent': '#ffffff',
      '--admin-font-display': "'Fraunces', serif",
      // A light background: light scheme and status colours readable on it.
      '--admin-scheme': 'light',
      '--admin-ok': '#2e7d4f',
      '--admin-danger': '#b3261e',
    });
  });

  it('a dark site theme stays dark and keeps the default status colours', () => {
    expect(adminThemeTokens(':root { --color-bg: #101112; --color-text: #ece7de; }')).toEqual({
      '--admin-bg': '#101112', '--admin-ink': '#ece7de', '--admin-scheme': 'dark',
    });
  });

  it('the site error colour is the dashboard danger colour', () => {
    expect(adminThemeTokens(':root { --color-bg: #f8f3e6; --color-error: #9b1c1c; }')['--admin-danger']).toBe('#9b1c1c');
  });

  it('reads only top-level :root rules, the last value winning as in CSS', () => {
    const css = `
      :root { --color-accent: #111111; }
      @media (prefers-color-scheme: dark) { :root { --color-accent: #222222; } }
      [data-theme="x"] :root { --color-accent: #333333; }
      :root { --color-accent: #444444; }`;
    expect(adminThemeTokens(css)['--admin-accent']).toBe('#444444');
  });

  it('takes --admin-* tokens as they are, and they win over the mapped ones', () => {
    const css = ':root { --color-accent: #e3b341; --admin-accent: #123456; --admin-on-accent: #eeeeee; }';
    expect(adminThemeTokens(css)).toEqual({ '--admin-accent': '#123456', '--admin-on-accent': '#eeeeee' });
  });

  it('chooses dark text on a light accent', () => {
    expect(adminThemeTokens(':root { --color-accent: #e3b341; }')['--admin-on-accent']).toBe('#141517');
    expect(adminThemeTokens(':root { --color-accent: #fc0; }')['--admin-on-accent']).toBe('#141517');
  });

  it('skips values that depend on other variables; colours it cannot read get no computed text colour', () => {
    expect(adminThemeTokens(':root { --color-bg: var(--paper); --color-accent: hsl(0 0% 1%); }'))
      .toEqual({ '--admin-accent': 'hsl(0 0% 1%)' });
  });

  it('reads :root in a selector list and inside @layer', () => {
    expect(adminThemeTokens(':root, html { --color-accent: #111111; }')['--admin-accent']).toBe('#111111');
    expect(adminThemeTokens('@layer base, theme; @layer theme { :root { --color-accent: #222222; } }')['--admin-accent']).toBe('#222222');
  });

  it('tells light from dark with rgb() colours, or from the text when the background cannot be read', () => {
    expect(adminThemeTokens(':root { --color-bg: rgb(248 243 230); }')['--admin-scheme']).toBe('light');
    expect(adminThemeTokens(':root { --color-bg: rgb(16, 17, 18); }')['--admin-scheme']).toBe('dark');
    expect(adminThemeTokens(':root { --color-bg: oklch(97% 0.02 90); --color-text: #15304a; }')['--admin-scheme']).toBe('light');
    expect(adminThemeTokens(':root { --color-accent: rgb(176 36 95); }')['--admin-on-accent']).toBe('#ffffff');
  });

  it('no :root, no tokens', () => {
    expect(adminThemeTokens('.x { color: red; }')).toEqual({});
    expect(adminThemeTokens('')).toEqual({});
  });
});
