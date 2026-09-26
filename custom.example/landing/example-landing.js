import './example-landing.css';
import { albumsToCards } from '/src/api/index.js';

/**
 * Minimal landing: site name and the albums with their covers.
 * Shows the contract and the public API. A landing can import its own stylesheet, as this one does.
 */
export default {
  async mount(container, { texts, data }) {
    const { site, albums, albumsError, r2PublicUrl } = await data;

    const main = document.createElement('main');
    main.className = 'page-main example-landing';
    const inner = document.createElement('div');
    inner.className = 'container';

    const h1 = document.createElement('h1');
    h1.className = 'section-heading';
    h1.textContent = site.name;
    inner.appendChild(h1);

    if (albums === null) {
      // ctx.data never rejects: a failed load arrives as albums === null plus albumsError.
      const p = document.createElement('p');
      p.textContent = albumsError === 'NETWORK' ? texts.album.error.network : texts.album.error.unknown;
      inner.appendChild(p);
    } else {
      const list = document.createElement('ul');
      for (const card of albumsToCards(albums, r2PublicUrl)) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `/${card.slug}`;
        if (card.coverUrl) {
          const img = document.createElement('img');
          img.src = card.coverUrl;
          img.alt = '';
          img.loading = 'lazy';
          a.appendChild(img);
        }
        a.append(card.title);
        li.appendChild(a);
        list.appendChild(li);
      }
      inner.appendChild(list);
    }

    main.appendChild(inner);
    container.replaceChildren(main);
    return { destroy() { container.replaceChildren(); } };
  },
};
