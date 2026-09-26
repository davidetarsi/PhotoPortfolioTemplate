import '../styles/admin.css';
import { siteConfig } from '../../config/site.config.js';
import { adminConfig } from '../../config/admin.config.js';
import { texts } from '../../config/texts.config.js';
import { validateSiteConfig } from '../utils/validateConfig.js';
import { fetchSite, fetchAlbums, fetchManifest, fetchConfig } from '../providers/data.js';
import { adminApi } from '../admin/api.js';
import { parseAdminHash } from '../admin/router.js';
import { attachSortable } from '../admin/sortable.js';
import { renderAdminHome } from '../admin/views/home.js';
import { renderAdminAlbum } from '../admin/views/album.js';
import { renderMessages } from '../admin/views/messages.js';
import { runBatch, attachBeforeUnloadGuard } from '../admin/upload-manager.js';
import { processFile } from '../admin/pipeline.js';
import { makeProcessDeps } from '../admin/encoder.js';
import { showPreview } from '../admin/preview.js';
import { resolveAdminAlbums } from '../admin/bootstrap.js';
import { html } from '../shared/html.js';

validateSiteConfig(siteConfig);
const root = document.getElementById('admin-root');
document.body.style.setProperty('--admin-bg-image', `url(${adminConfig.backgroundImageUrl})`);
document.body.classList.add('admin-body');
root.innerHTML = html`<p class="admin-status">${texts.admin.common.loading}</p>`;

const [siteRes, albumsRes, configRes] = await Promise.all([fetchSite(), fetchAlbums(), fetchConfig()]);
const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;
const adminAlbums = resolveAdminAlbums(albumsRes);

// First startup: _site/site.json may not exist yet → start with editable build defaults.
const ctx = {
  site: siteRes.ok
    ? siteRes.data
    : { name: siteConfig.name, bio: siteConfig.bio ?? '', hero: null, social: {} },
  albums: adminAlbums.albums,
  r2PublicUrl,
  api: adminApi,
  navigate: hash => { window.location.hash = hash; },
  deps: {
    attachSortable,
    fetchManifest,
    prompt: window.prompt.bind(window),
    confirm: window.confirm.bind(window),
    showPreview,
    runBatch,
    attachBeforeUnloadGuard,
    makeProcessFile: async () => {
      const deps = await makeProcessDeps();
      return file => processFile(file, deps);
    },
  },
};

function renderRoute() {
  const route = parseAdminHash(window.location.hash);
  if (route.view === 'album') renderAdminAlbum(root, Object.assign(ctx, { slug: route.slug }));
  else if (route.view === 'messages') renderMessages(root, { ...ctx.deps, api: adminApi, confirm: window.confirm.bind(window), say: (msg, err) => { if (err) console.error(msg); else console.log(msg); } }, texts);
  else renderAdminHome(root, ctx);
}
window.addEventListener('hashchange', renderRoute);
if (!adminAlbums.ok) {
  root.innerHTML = html`<p class="admin-status">${texts.admin.albums.loadError}</p>`;
} else {
  renderRoute();
}
