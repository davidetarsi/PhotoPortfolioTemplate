/**
 * Minimal landing: site name and a plain list of albums.
 * Shows the contract only — style it from custom/theme.css (F2).
 */
export default {
  async mount(container, { data }) {
    const { site, albums } = await data;

    const main = document.createElement('main');
    main.className = 'page-main';
    const inner = document.createElement('div');
    inner.className = 'container';

    const h1 = document.createElement('h1');
    h1.className = 'section-heading';
    h1.textContent = site.name;

    const list = document.createElement('ul');
    for (const album of albums ?? []) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `/${album.slug}`;
      a.textContent = album.title;
      li.appendChild(a);
      list.appendChild(li);
    }

    inner.append(h1, list);
    main.appendChild(inner);
    container.replaceChildren(main);
    return { destroy() { container.replaceChildren(); } };
  },
};
