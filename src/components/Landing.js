import { renderHero } from './Hero.js';
import { createAlbumCard } from './AlbumCard.js';
import { albumsToCards } from '../pages/home-logic.js';

/**
 * Default "landing" slot: hero, section heading, album cards.
 * Skeletons appear synchronously; content replaces them when `data` resolves.
 */
export const landing = {
  /**
   * @param {HTMLElement} container - The #landing element.
   * @param {{texts: object, data: Promise<object>}} ctx - UI texts and the home data promise.
   * @returns {Promise<{destroy: Function}>} Handle.
   */
  async mount(container, { texts, data }) {
    container.innerHTML = `
      <section id="hero"></section>
      <main class="page-main">
        <div class="container">
          <h2 id="albums-heading" class="section-heading"></h2>
          <div id="album-cards" class="album-cards"></div>
        </div>
      </main>
    `;
    container.querySelector('#albums-heading').textContent = texts.landing.albumsSectionHeading;
    const cardsEl = container.querySelector('#album-cards');
    cardsEl.innerHTML = '<div class="album-card__skeleton"></div><div class="album-card__skeleton"></div>';

    const { site, albums, albumsError, r2PublicUrl } = await data;
    renderHero(container.querySelector('#hero'), site, texts);

    cardsEl.innerHTML = '';
    if (albums === null) {
      const p = document.createElement('p');
      p.className = 'page-error';
      p.textContent = albumsError === 'NETWORK' ? texts.album.error.network : texts.album.error.unknown;
      cardsEl.appendChild(p);
    } else {
      albumsToCards(albums, r2PublicUrl).forEach(card => cardsEl.appendChild(createAlbumCard(card)));
    }

    return { destroy() { container.replaceChildren(); } };
  },
};
