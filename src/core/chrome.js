import { slot } from './custom-slots.js';

/** Resolve and mount nav and footer independently, but wait for both to settle. */
export async function mountChrome({ site, texts, owner }) {
  const mountOne = async name => {
    if (owner.destroyed) return;
    const implementation = await slot(name);
    if (owner.destroyed) return;
    return implementation.mount(
      document.getElementById(`site-${name}`),
      { site, texts },
    );
  };

  await Promise.all([
    owner.track(mountOne('nav')),
    owner.track(mountOne('footer')),
  ]);
}
