/**
 * Where the dashboard shows a photo: the Worker's preview route, behind Access, which serves
 * the photo waiting to be published when there is one, else the published one.
 * @param {string} slug
 * @param {string} name
 */
export function photoSrc(slug, name) {
  return `/api/admin/preview/photo/${slug}/${encodeURIComponent(name)}`;
}
