import { describe, expect, it } from 'vitest';
import { linkKind, linkLabel, normalizeLinks } from './site-links.js';

const texts = { links: { email: 'Email', website: 'Website' } };

describe('linkKind', () => {
  it('recognises networks by host, with or without www', () => {
    expect(linkKind('https://instagram.com/davidetarsi')).toBe('instagram');
    expect(linkKind('https://www.behance.net/x')).toBe('behance');
    expect(linkKind('https://twitter.com/x')).toBe('x');
    expect(linkKind('https://bsky.app/profile/x')).toBe('bluesky');
    expect(linkKind('https://youtu.be/abc')).toBe('youtube');
    expect(linkKind('https://github.com/davidetarsi')).toBe('github');
  });
  it('mailto: is email; any other address is a website', () => {
    expect(linkKind('mailto:me@example.com')).toBe('email');
    expect(linkKind('https://davidetarsi.com')).toBe('website');
    expect(linkKind('not a url')).toBe('website');
  });
});

describe('linkLabel', () => {
  it('uses the label when there is one, else the name of the kind', () => {
    expect(linkLabel({ url: 'https://github.com/x', label: ' Codice ' }, texts)).toBe('Codice');
    expect(linkLabel({ url: 'https://instagram.com/x' }, texts)).toBe('Instagram');
    expect(linkLabel({ url: 'mailto:a@b.c' }, texts)).toBe('Email');
    expect(linkLabel({ url: 'https://example.com' }, texts)).toBe('Website');
    expect(linkLabel({ url: 'https://example.com' }, {})).toBe('https://example.com');
  });
});

describe('normalizeLinks', () => {
  it('keeps links when the site has them', () => {
    const links = [{ url: 'https://github.com/x' }];
    expect(normalizeLinks({ links, social: { instagram: 'https://instagram.com/y' } })).toBe(links);
  });
  it('converts the old social object, skipping empty addresses', () => {
    expect(normalizeLinks({ social: { instagram: ' https://instagram.com/y ', flickr: '' } }))
      .toEqual([{ url: 'https://instagram.com/y' }]);
  });
  it('drops old social addresses that are not https:// or mailto:', () => {
    expect(normalizeLinks({ social: { a: 'javascript:alert(1)', b: 'http://x.y', c: 'https://ok.example' } }))
      .toEqual([{ url: 'https://ok.example' }]);
  });
  it('no links and no social: an empty list', () => {
    expect(normalizeLinks({})).toEqual([]);
    expect(normalizeLinks(undefined)).toEqual([]);
  });
});
