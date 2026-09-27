import '../styles/nav.css';
import { html } from '../shared/html.js';

/**
 * Renders the site navigation bar.
 * @param {HTMLElement} container - Element to render into.
 * @param {object} siteConfig - Site config with name property.
 * @param {object} texts - UI text strings.
 */
export function renderNav(container, siteConfig, texts) {
  container.innerHTML = html`
    <nav class="site-nav">
      <a href="/" class="site-nav__brand" data-field="site.name"></a>
      <div class="site-nav__links">
        <a href="/about"></a>
      </div>
    </nav>
  `;
  container.querySelector('.site-nav__brand').textContent = siteConfig.name;
  container.querySelector('.site-nav__links a').textContent = texts.nav.aboutLabel;
}
