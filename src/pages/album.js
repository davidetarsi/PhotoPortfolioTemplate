import '../styles/main.css';
import { siteConfig } from '../../config/site.config.js';
import { albums as buildAlbums } from '../../config/albums.config.js';
import { texts } from '../../config/texts.config.js';
import { validateSiteConfig } from '../utils/validateConfig.js';
import { fetchSite, fetchAlbums, fetchManifest, fetchConfig } from '../providers/data.js';
import { photosFromManifest } from '../providers/r2.js';
import { resolveSiteContent, resolveAlbums } from './home-logic.js';
import { resolveAlbumPage } from './album-logic.js';
import { renderSkeletons } from '../components/PhotoGrid.js';
import { mountChrome } from '../core/chrome.js';
import { startPage } from '../core/page.js';
import { emit } from '../core/events.js';
import { slot } from '../core/custom-slots.js';

validateSiteConfig(siteConfig);
const owner = startPage('album');

const gridEl = document.getElementById('photo-grid');
renderSkeletons(gridEl, 12);

const slug = window.location.pathname.replace(/^\/|\/$/g, '');

// The URL provides the slug. Start all requests together so the chrome can mount as
// soon as site data is known, even when album or manifest data is slower.
const sitePromise = Promise.all([fetchSite(), fetchConfig()]).then(([siteRes, configRes]) => {
  const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;
  return {
    site: resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl }),
    r2PublicUrl,
  };
});
const albumsPromise = fetchAlbums();
const manifestPromise = fetchManifest(slug);
const chromeMount = owner.track(sitePromise.then(({ site }) => {
  if (owner.destroyed) return;
  return mountChrome({ site, texts, owner });
}));

function showMessage(text, withHomeLink = false) {
  const p = document.createElement('p');
  p.className = 'photo-grid__error';
  p.textContent = text;
  gridEl.replaceChildren(p);
  if (withHomeLink) {
    const link = document.createElement('a');
    link.href = '/';
    link.textContent = texts.album.notFoundLink;
    gridEl.appendChild(link);
  }
}

const [siteData, albumsRes, manifestRes] = await Promise.all([sitePromise, albumsPromise, manifestPromise]);
const { site, r2PublicUrl } = siteData;
const hasPublicUrl = typeof r2PublicUrl === 'string' && r2PublicUrl.trim().length > 0;
const resolvedAlbums = resolveAlbums(albumsRes, buildAlbums);
const albumsForPage = resolvedAlbums === null ? albumsRes : { ok: true, data: resolvedAlbums };
const albumPage = resolveAlbumPage(slug, albumsForPage, manifestRes);

let contentMount = Promise.resolve();
if (albumPage.kind === 'not_found') {
  document.getElementById('album-title').textContent = '';
  showMessage(texts.album.notFound, true);
} else if (albumPage.kind === 'error') {
  showMessage(albumPage.code === 'network' ? texts.album.error.network : texts.album.error.unknown);
} else {
  document.title = `${albumPage.album.title} — ${site.name}`;
  document.getElementById('album-title').textContent = albumPage.album.title;
  if (albumPage.kind === 'empty') {
    showMessage(texts.album.empty);
  } else if (!hasPublicUrl) {
    showMessage(texts.album.error.noImage);
  } else {
    const photos = photosFromManifest(albumPage.entries, slug, r2PublicUrl);
    contentMount = (async () => {
      const lightboxModule = await slot('lightbox');
      if (owner.destroyed) return;
      const lightbox = lightboxModule.create(photos, {
        onClose(index) { emit('photo:close', { index, photo: photos[index] }); },
      });
      owner.track(lightbox);
      const gridModule = await slot('photoGrid');
      if (owner.destroyed) return;
      return gridModule.mount(gridEl, {
        photos,
        texts,
        onPhotoClick(index, triggerEl) {
          lightbox.open(index, triggerEl);
          emit('photo:open', { index, photo: photos[index] });
        },
      });
    })().catch(error => {
      showMessage(texts.album.error.unknown);
      throw error;
    });
  }
}

const trackedContentMount = owner.track(contentMount);
await Promise.all([trackedContentMount, chromeMount]);
if (!owner.destroyed) {
  owner.ready({ site, ...(albumPage.album ? { album: albumPage.album } : {}) });
}
