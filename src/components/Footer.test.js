import { describe, it, expect, beforeEach } from 'vitest';
import { renderFooter } from './Footer.js';

describe('renderFooter', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); });

  it('renders the copyright text from texts.footer', () => {
    renderFooter(container, { footer: { copyright: '© 2026' } });
    expect(container.querySelector('.site-footer__copyright').textContent).toBe('© 2026');
  });

  it('renders a footer element', () => {
    renderFooter(container, { footer: { copyright: '© 2026' } });
    expect(container.querySelector('footer')).not.toBeNull();
  });

  it('without links, renders no link list', () => {
    renderFooter(container, { footer: { copyright: '© 2026' } });
    expect(container.querySelector('.site-footer__links')).toBeNull();
    renderFooter(container, { footer: { copyright: '© 2026' } }, []);
    expect(container.querySelector('.site-footer__links')).toBeNull();
  });

  it('renders one link per entry, in order, labelled by kind or by its own label', () => {
    const texts = { footer: { copyright: '© 2026' }, links: { email: 'Email', website: 'Website' } };
    renderFooter(container, texts, [
      { url: 'https://instagram.com/x' },
      { url: 'https://github.com/x', label: 'Codice' },
      { url: 'mailto:a@b.c' },
    ]);
    const links = [...container.querySelectorAll('.site-footer__link')];
    expect(links.map(a => a.getAttribute('href'))).toEqual(['https://instagram.com/x', 'https://github.com/x', 'mailto:a@b.c']);
    expect(links.map(a => a.textContent)).toEqual(['Instagram', 'Codice', 'Email']);
  });

  it('shows the icon of each kind of link, hidden from screen readers', () => {
    renderFooter(container, { footer: { copyright: '© 2026' } }, [{ url: 'https://instagram.com/x' }, { url: 'mailto:a@b.c' }]);
    const icons = [...container.querySelectorAll('.site-footer__link svg')];
    expect(icons).toHaveLength(2);
    expect(icons.every(svg => svg.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(icons[0].querySelector('path').getAttribute('fill')).toBe('currentColor');
    expect(icons[1].querySelector('path').getAttribute('fill')).toBe('none');
  });
});
