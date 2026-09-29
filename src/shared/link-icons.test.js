import { describe, expect, it } from 'vitest';
import { LINK_KINDS } from './site-links.js';
import { createLinkIcon, linkIcon } from './link-icons.js';

describe('linkIcon', () => {
  it('has an icon for every kind of link', () => {
    for (const kind of [...Object.keys(LINK_KINDS), 'email', 'website']) {
      const icon = linkIcon(kind);
      expect(icon.d.length, kind).toBeGreaterThan(10);
    }
    expect(linkIcon('instagram').filled).toBe(true);
    expect(linkIcon('email').filled).toBe(false);
    expect(linkIcon('unknown')).toEqual(linkIcon('website'));
  });

  it('builds a decorative SVG for pages without React', () => {
    const svg = createLinkIcon('github');
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path').getAttribute('fill')).toBe('currentColor');
    expect(createLinkIcon('website').querySelector('path').getAttribute('stroke')).toBe('currentColor');
  });
});
