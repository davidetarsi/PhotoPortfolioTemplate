import './example-landing.css';

/**
 * Minimal landing: site name and a plain list of albums.
 * Shows the contract only. A landing can import its own stylesheet, as this one does.
 */
export default {
  async mount(container, { texts, data }) {
    const { site, albums, albumsError } = await data;

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
      for (const album of albums) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `/${album.slug}`;
        a.textContent = album.title;
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
