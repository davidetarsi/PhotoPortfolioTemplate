import '/src/api/base.css';
import { fetchAlbums, resolveAlbums, texts } from '/src/api/index.js';
import { mountChrome } from './chrome.js';

mountChrome();

const list = document.getElementById('archive-list');
const albums = resolveAlbums(await fetchAlbums(), []);
if (albums === null) {
  list.replaceWith(Object.assign(document.createElement('p'), { textContent: texts.album.error.unknown }));
} else {
  for (const album of albums) {
    const link = Object.assign(document.createElement('a'), { href: `/${album.slug}`, textContent: album.title });
    const item = document.createElement('li');
    item.appendChild(link);
    list.appendChild(item);
  }
}
