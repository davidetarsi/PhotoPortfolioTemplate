import '../styles/main.css';
import { siteConfig } from '../../config/site.config.js';
import { albums as buildAlbums } from '../../config/albums.config.js';
import { texts } from '../../config/texts.config.js';
import { validateSiteConfig } from '../utils/validateConfig.js';
import { fetchSite, fetchAlbums, fetchConfig } from '../providers/data.js';
import { resolveSiteContent, resolveAlbums } from './home-logic.js';
import { renderNav } from '../components/Nav.js';
import { renderFooter } from '../components/Footer.js';
import { slot } from '../core/custom-slots.js';

validateSiteConfig(siteConfig);

// Fetching stays here, not in the slot: every landing — template or custom/ —
// receives the same resolved data, with the same seed fallback rules.
const data = (async () => {
  const [siteRes, albumsRes, configRes] = await Promise.all([fetchSite(), fetchAlbums(), fetchConfig()]);
  const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;
  const site = resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl });
  const albums = resolveAlbums(albumsRes, buildAlbums);
  return { site, albums, albumsError: albums === null ? albumsRes.error : null, r2PublicUrl };
})();

const landing = await slot('landing');
const mounted = landing.mount(document.getElementById('landing'), { texts, data });

const { site } = await data;
renderNav(document.getElementById('site-nav'), { name: site.name }, texts);
renderFooter(document.getElementById('site-footer'), texts, site.social);
await mounted;
