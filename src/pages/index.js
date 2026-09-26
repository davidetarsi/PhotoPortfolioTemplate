import '../styles/main.css';
import { siteConfig } from '../../config/site.config.js';
import { albums as buildAlbums } from '../../config/albums.config.js';
import { texts } from '../../config/texts.config.js';
import { validateSiteConfig } from '../utils/validateConfig.js';
import { fetchSite, fetchAlbums, fetchConfig } from '../providers/data.js';
import { resolveSiteContent, resolveAlbums } from './home-logic.js';
import { slot } from '../core/custom-slots.js';
import { mountChrome } from '../core/chrome.js';
import { startPage } from '../core/page.js';

validateSiteConfig(siteConfig);
const owner = startPage('home');

// Fetching stays here, not in the slot: every landing — template or custom/ —
// receives the same resolved data, with the same seed fallback rules.
const data = (async () => {
  const [siteRes, albumsRes, configRes] = await Promise.all([fetchSite(), fetchAlbums(), fetchConfig()]);
  const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;
  const site = resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl });
  const albums = resolveAlbums(albumsRes, buildAlbums);
  return { site, albums, albumsError: albums === null ? albumsRes.error : null, r2PublicUrl };
})();

const landingMount = owner.track(slot('landing').then(landing => {
  if (owner.destroyed) return;
  return landing.mount(document.getElementById('landing'), { texts, data });
}));

const chromeMount = owner.track(data.then(({ site }) => {
  if (owner.destroyed) return;
  return mountChrome({ site, texts, owner });
}));

await Promise.all([landingMount, chromeMount]);
const { site } = await data;
owner.ready({ site });
