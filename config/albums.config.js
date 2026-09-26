// Initial albums seed: shown by the public site while R2 has no albums.json, and
// copied to R2 by the optional `npm run migrate`. After the first album saved from
// the dashboard, R2 is the source of truth.
export const albums = [
  {
    slug: 'album-name',
    title: 'Album Title',
    description: 'A short description of the album.',
    coverName: '',  // cover filename inside album, e.g. 'cover.webp'. Empty string = no cover.
  },
];
