import '../styles/footer.css';
import { html } from '../shared/html.js';
import { linkLabel } from '../shared/site-links.js';

/**
 * Renders the site footer with copyright and the site's links.
 * @param {HTMLElement} container - Element to render into.
 * @param {object} texts - UI text strings (texts.footer.copyright, texts.links).
 * @param {Array<{url: string, label?: string}>} links - The site's links, in order.
 */
export function renderFooter(container, texts, links = []) {
  container.innerHTML = html`
    <footer class="site-footer">
      <span class="site-footer__copyright"></span>
      ${links.length ? html`<nav class="site-footer__links"></nav>` : ''}
    </footer>
  `;
  container.querySelector('.site-footer__copyright').textContent = texts.footer.copyright;
  if (links.length) {
    const nav = container.querySelector('.site-footer__links');
    for (const link of links) {
      const a = document.createElement('a');
      a.className = 'site-footer__link';
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = linkLabel(link, texts);
      nav.appendChild(a);
    }
  }
}
