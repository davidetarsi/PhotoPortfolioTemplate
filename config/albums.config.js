// Initial albums seed: used by the public fallback while R2 has no albums.json
// and on first `npm run migrate`. After that, the source of truth is the
// manifest on R2, managed by the dashboard.
// Re-running `migrate` after using the dashboard will overwrite its work.
export const albums = [
  {
    slug: 'album-name',
    title: 'Titolo Album',
    description: 'Descrizione breve dell\'album.',
    coverName: '',  // cover filename inside album, e.g. 'cover.webp'. Empty string = no cover.
  },
];
