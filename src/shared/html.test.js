import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('stringifies non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
