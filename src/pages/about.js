import '../styles/main.css';
import { siteConfig } from '../../config/site.config.js';
import { texts } from '../../config/texts.config.js';
import { mergeTexts } from '../shared/merge-texts.js';
import { validateSiteConfig } from '../utils/validateConfig.js';
import { fetchSite, fetchConfig } from '../providers/data.js';
import { resolveSiteContent } from './home-logic.js';
import { createContactForm } from '../components/ContactForm.js';
import { mountChrome } from '../core/chrome.js';
import { startPage } from '../core/page.js';

validateSiteConfig(siteConfig);
const owner = startPage('about');

document.getElementById('about-heading').textContent = texts.about.heading;
document.getElementById('about-body').textContent = texts.about.body;

const sitePromise = Promise.all([fetchSite(), fetchConfig()]).then(([siteRes, configRes]) => {
  const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;
  const site = resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl });
  return { site, configRes, pageTexts: mergeTexts(texts, site.texts) };
});
const chromeMount = owner.track(sitePromise.then(({ site, pageTexts }) => {
  if (owner.destroyed) return;
  return mountChrome({ site, texts: pageTexts, owner });
}));

// The sitekey arrives at runtime, just like r2PublicUrl: this is how values
// produced by Terraform and written to wrangler.json reach the browser.
// The build value serves as fallback if config fetch fails.
// The form is built HERE, not earlier: if created above, it would receive
// only the build value, and the chain terraform → wrangler.json → form
// would break silently without warning.
const { site, configRes, pageTexts } = await sitePromise;
if (!owner.destroyed) {
  // Texts edited from the dashboard replace the defaults shown while loading.
  document.getElementById('about-heading').textContent = pageTexts.about.heading;
  document.getElementById('about-body').textContent = pageTexts.about.body;
  const turnstileSitekey = configRes.ok ? configRes.data.turnstileSitekey : siteConfig.turnstileSitekey;
  document.getElementById('about-form')
    .appendChild(createContactForm({ ...siteConfig, turnstileSitekey }, pageTexts));
  await chromeMount;
  if (!owner.destroyed) owner.ready({ site });
}
