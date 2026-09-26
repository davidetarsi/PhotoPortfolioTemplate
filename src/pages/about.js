import '../styles/main.css';
import { siteConfig } from '../../config/site.config.js';
import { texts } from '../../config/texts.config.js';
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
  return {
    site: resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl }),
    configRes,
  };
});
const chromeMount = owner.track(sitePromise.then(({ site }) => {
  if (owner.destroyed) return;
  return mountChrome({ site, texts, owner });
}));

// The sitekey arrives at runtime, just like r2PublicUrl: this is how values
// produced by Terraform and written to wrangler.json reach the browser.
// The build value serves as fallback if config fetch fails.
// The form is built HERE, not earlier: if created above, it would receive
// only the build value, and the chain terraform → wrangler.json → form
// would break silently without warning.
const { site, configRes } = await sitePromise;
const turnstileSitekey = configRes.ok ? configRes.data.turnstileSitekey : siteConfig.turnstileSitekey;
document.getElementById('about-form')
  .appendChild(createContactForm({ ...siteConfig, turnstileSitekey }, texts));
await chromeMount;
if (!owner.destroyed) owner.ready({ site });
