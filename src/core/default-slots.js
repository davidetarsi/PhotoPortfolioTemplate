// The template's implementation of every slot declared in contracts.js.
export { landing } from '../components/Landing.js';
import { renderNav } from '../components/Nav.js';
import { renderFooter } from '../components/Footer.js';
import { renderGrid } from '../components/PhotoGrid.js';
import { createLightbox } from '../components/Lightbox.js';

function mountWithCleanup(container, render) {
  render();
  return { destroy() { container.replaceChildren(); } };
}

export const nav = {
  mount(container, { site, texts }) {
    return mountWithCleanup(container, () => renderNav(container, site, texts));
  },
};

export const footer = {
  mount(container, { site, texts }) {
    return mountWithCleanup(container, () => renderFooter(container, texts, site.social));
  },
};

export const photoGrid = {
  mount(container, { photos, onPhotoClick }) {
    return mountWithCleanup(container, () => renderGrid(container, photos, onPhotoClick));
  },
};

export const lightbox = {
  create(photos, { onClose } = {}) {
    return createLightbox(photos, { onClose });
  },
};
