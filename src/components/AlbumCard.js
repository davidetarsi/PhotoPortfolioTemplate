import '../styles/album-card.css';
import '../../theme/card.css';
import { html } from '../shared/html.js';

/**
 * Creates an album card element for display in the album grid.
 * @param {{slug: string, title: string, description: string, coverUrl: string|null}} card - Card data.
 * @returns {HTMLElement} Link element styled as an album card.
 */
export function createAlbumCard({ slug, title, description, coverUrl }) {
  const a = document.createElement('a');
  a.className = 'album-card';
  a.href = `/${slug}`;

  const imgHtml = coverUrl ? html`<img class="album-card__img" alt="" loading="lazy">` : '';
  const descHtml = description ? html`<p class="album-card__desc"></p>` : '';

  a.innerHTML = html`
    <div class="album-card__cover">${imgHtml}</div>
    <div class="album-card__info">
      <h3 class="album-card__title"></h3>
      ${descHtml}
    </div>
  `;

  if (coverUrl) a.querySelector('.album-card__img').setAttribute('src', coverUrl);
  a.querySelector('.album-card__title').textContent = title;
  if (description) a.querySelector('.album-card__desc').textContent = description;

  return a;
}
