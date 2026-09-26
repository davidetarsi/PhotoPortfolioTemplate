import '../styles/footer.css';
import { html } from '../shared/html.js';

/**
 * Renders the site footer with copyright and social links.
 * @param {HTMLElement} container - Element to render into.
 * @param {object} texts - UI text strings (copyright from texts.footer.copyright).
 * @param {object} social - Social media links as {platform: url}.
 */
export function renderFooter(container, texts, social = {}) {
  const links = Object.entries(social).filter(([, url]) => typeof url === 'string' && url.trim());
  container.innerHTML = html`
    <footer class="site-footer">
      <span class="site-footer__copyright"></span>
      ${links.length ? html`<nav class="site-footer__links"></nav>` : ''}
    </footer>
  `;
  container.querySelector('.site-footer__copyright').textContent = texts.footer.copyright;
  if (links.length) {
    const nav = container.querySelector('.site-footer__links');
    for (const [key, url] of links) {
      const a = document.createElement('a');
      a.className = 'site-footer__link';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = key.charAt(0).toUpperCase() + key.slice(1);
      nav.appendChild(a);
    }
  }
}
