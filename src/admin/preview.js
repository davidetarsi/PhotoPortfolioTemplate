// Site form preview overlay. Reuses renderHero/renderFooter/createAlbumCard/
// PhotoGrid/Lightbox/resolveAlbumPage — the same functions as the public site —
// so the preview is never a parallel reimplementation that can drift. The header
// (title + Close) stays fixed: only .admin-preview__content changes between
// landing and album views.
import '../styles/main.css'; // .container, .section-heading (layout condiviso con index.html/album.html)
import { texts } from '../../config/texts.config.js';
import { renderHero } from '../components/Hero.js';
import { renderFooter } from '../components/Footer.js';
import { createAlbumCard } from '../components/AlbumCard.js';
import { renderSkeletons, renderGrid } from '../components/PhotoGrid.js';
import { createLightbox } from '../components/Lightbox.js';
import { albumsToCards } from '../pages/home-logic.js';
import { resolveAlbumPage } from '../pages/album-logic.js';
import { photosFromManifest } from '../providers/r2.js';
import { html } from '../shared/html.js';

let _keyboardBound = false;
// Incremented on every view change: an in-flight manifest fetch that resolves
// after the user returns to landing (or opens another album, or closes preview)
// compares its token and surrenders instead of writing to an inactive view.
let _renderToken = 0;
// Last lightbox created when entering an album view: createLightbox has no way
// to replace itself — must be explicitly torn down before opening another,
// otherwise DOM nodes accumulate in document.body for every album visited in
// the same preview session.
let _activeLightbox = null;

function teardownLightbox() {
  if (!_activeLightbox) return;
  _activeLightbox.destroy();
  _activeLightbox = null;
}

function currentPreviewEl() {
  return document.querySelector('.admin-preview');
}

// Queries focusable elements every time (doesn't cache): they change between
// landing view (album-card, social links) and album view (back, grid photos).
function focusableElements(el) {
  return [...el.querySelectorAll('button, a[href]')];
}

function ensureKeyboardHandling() {
  if (_keyboardBound) return;
  _keyboardBound = true;
  document.addEventListener('keydown', e => {
    const el = currentPreviewEl();
    if (!el || el.hidden) return;
    if (e.key === 'Escape') {
      hidePreview(el);
      return;
    }
    if (e.key !== 'Tab') return;
    // Loop between first and last focusable — intervenes only at boundaries.
    // In between, Tab moves normally, without preventDefault.
    const focusable = focusableElements(el);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

/**
 * Shows the site preview overlay in the admin panel.
 * Sets up keyboard handling and renders the initial landing view.
 * @param {HTMLElement} container - The container for the preview overlay.
 * @param {Object} data - The site data to preview (name, bio, albums, etc.).
 * @param {Object} textsArg - Localization strings.
 * @param {Object} deps - Dependencies for rendering.
 * @param {Function} deps.fetchManifest - Function to fetch album manifests.
 */
export function showPreview(container, data, textsArg, deps) {
  ensureKeyboardHandling();
  container.innerHTML = html`
    <div class="admin-preview__header">
      <h2>${textsArg.admin.site.preview}</h2>
      <button class="admin-preview__close" type="button">${textsArg.admin.site.previewClose}</button>
    </div>
    <div class="admin-preview__content"></div>
  `;
  container.querySelector('.admin-preview__close').addEventListener('click', () => hidePreview(container));
  renderLandingView(container, data, textsArg, deps);
  container.hidden = false;
  container.querySelector('.admin-preview__close').focus();
}

function renderLandingView(container, data, textsArg, deps) {
  _renderToken++;
  teardownLightbox();
  const { name, bio, heroUrl, social, albums = [], r2PublicUrl } = data;
  const content = container.querySelector('.admin-preview__content');
  content.innerHTML = html`
    <div class="admin-preview__hero"></div>
    <div class="container">
      <h2 class="section-heading"></h2>
      <div class="admin-preview__albums album-cards"></div>
    </div>
    <div class="admin-preview__footer"></div>
  `;
  renderHero(content.querySelector('.admin-preview__hero'), { name, bio, heroUrl }, textsArg);
  content.querySelector('.section-heading').textContent = textsArg.landing.albumsSectionHeading;
  const cardsEl = content.querySelector('.admin-preview__albums');
  albumsToCards(albums, r2PublicUrl).forEach(card => {
    const cardEl = createAlbumCard(card);
    cardEl.addEventListener('click', e => {
      e.preventDefault(); // Inside the preview, no real navigation: only content changes.
      renderAlbumView(container, card.slug, data, textsArg, deps);
    });
    cardsEl.appendChild(cardEl);
  });
  renderFooter(content.querySelector('.admin-preview__footer'), textsArg, social);
}

async function renderAlbumView(container, slug, data, textsArg, deps) {
  const token = ++_renderToken;
  teardownLightbox();
  const { albums = [], r2PublicUrl, social } = data;
  const content = container.querySelector('.admin-preview__content');
  content.innerHTML = html`
    <p><button type="button" class="admin-back admin-preview__back">${textsArg.admin.common.allAlbums}</button></p>
    <div class="container">
      <h2 class="section-heading"></h2>
      <div class="admin-preview__photo-grid photo-grid"></div>
    </div>
    <div class="admin-preview__footer"></div>
  `;
  content.querySelector('.admin-preview__back').addEventListener('click', () => renderLandingView(container, data, textsArg, deps));
  renderFooter(content.querySelector('.admin-preview__footer'), textsArg, social);

  const gridEl = content.querySelector('.admin-preview__photo-grid');
  renderSkeletons(gridEl, 12);

  const manifestRes = await deps.fetchManifest(slug);
  if (token !== _renderToken) return; // View changed while fetch was in flight.

  const page = resolveAlbumPage(slug, { ok: true, data: albums }, manifestRes);
  const titleEl = content.querySelector('.section-heading');

  if (page.kind === 'not_found') {
    titleEl.textContent = '';
    gridEl.innerHTML = html`<p class="photo-grid__error">${textsArg.album.notFound}</p>`;
  } else {
    titleEl.textContent = page.album.title;
    if (page.kind === 'empty') {
      gridEl.innerHTML = html`<p class="photo-grid__error">${textsArg.album.empty}</p>`;
    } else if (page.kind === 'error') {
      gridEl.innerHTML = html`<p class="photo-grid__error">${page.code === 'network' ? textsArg.album.error.network : textsArg.album.error.unknown}</p>`;
    } else {
      const photos = photosFromManifest(page.entries, slug, r2PublicUrl);
      const lb = createLightbox(photos);
      _activeLightbox = lb;
      renderGrid(gridEl, photos, (i, triggerEl) => lb.open(i, triggerEl));
    }
  }
}

/**
 * Hides and cleans up the site preview overlay.
 * Increments render token and tears down any active lightbox.
 * @param {HTMLElement} container - The preview container to hide.
 */
export function hidePreview(container) {
  _renderToken++;
  teardownLightbox();
  container.hidden = true;
  container.innerHTML = '';
}
