// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_LINK_LABEL } from '../../shared/content-rules.js';
import { checkLink, completeLinkUrl } from './links.js';

describe('completeLinkUrl', () => {
  it('adds https:// to a bare address and mailto: to an email', () => {
    expect(completeLinkUrl(' instagram.com/davide ')).toBe('https://instagram.com/davide');
    expect(completeLinkUrl('davide@example.com')).toBe('mailto:davide@example.com');
    expect(completeLinkUrl('https://x.com/d')).toBe('https://x.com/d');
    expect(completeLinkUrl('http://old.example')).toBe('http://old.example');
  });
});

describe('checkLink', () => {
  it('accepts https:// and mailto:, with or without a label', () => {
    expect(checkLink('github.com/d', '')).toEqual({ ok: true, link: { url: 'https://github.com/d' } });
    expect(checkLink('github.com/d', ' Codice ')).toEqual({ ok: true, link: { url: 'https://github.com/d', label: 'Codice' } });
  });

  it('refuses another scheme, an empty address or a label too long', () => {
    expect(checkLink('http://old.example', '')).toEqual({ ok: false, problem: 'url' });
    expect(checkLink('  ', '')).toEqual({ ok: false, problem: 'url' });
    expect(checkLink('a b.com', '')).toEqual({ ok: false, problem: 'url' });
    expect(checkLink('github.com/d', 'x'.repeat(MAX_LINK_LABEL + 1))).toEqual({ ok: false, problem: 'label' });
  });
});
