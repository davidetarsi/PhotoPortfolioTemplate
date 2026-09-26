import '../styles/hero.css';
import { html } from '../shared/html.js';

/**
 * Renders the hero section with background image, name, and bio.
 * @param {HTMLElement} container - Element to render into.
 * @param {{name: string, bio: string, heroUrl: string|null}} site - Site data.
 * @param {object} texts - UI text strings.
 */
export function renderHero(container, { name, bio, heroUrl }, texts) {
  const imgHtml = heroUrl ? html`<img class="hero__bg" alt="" fetchpriority="high" decoding="sync">` : '';
  container.innerHTML = html`
    <div class="hero__inner">
      ${imgHtml}
      <div class="hero__content">
        <h1 class="hero__title"></h1>
        <p class="hero__subtitle"></p>
      </div>
    </div>
  `;
  if (heroUrl) {
    container.querySelector('.hero__bg').setAttribute('src', heroUrl);
  }
  container.querySelector('.hero__title').textContent = name;
  container.querySelector('.hero__subtitle').textContent = bio?.trim() ? bio : texts.landing.heroSubtitle;
}
