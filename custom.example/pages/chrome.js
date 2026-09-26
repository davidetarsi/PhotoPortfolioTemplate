import { fetchConfig, fetchSite, resolveSiteContent, siteConfig, slot, texts } from '/src/api/index.js';

/** Resolves site content and mounts the template (or overridden) nav and footer. */
export async function mountChrome() {
  const [siteRes, configRes] = await Promise.all([fetchSite(), fetchConfig()]);
  const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;
  const site = resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl });
  await Promise.all(['nav', 'footer'].map(async name => {
    const component = await slot(name);
    component.mount(document.getElementById(`site-${name}`), { site, texts });
  }));
  return { site, r2PublicUrl };
}
