// Runs once per page entry. Return cleanup for every long-lived subscription.
export default function setup({ on, page }) {
  const off = on('page:ready', ({ site }) => {
    console.info(`[site] ${page} ready for ${site.name}`);
  });
  return () => off();
}
