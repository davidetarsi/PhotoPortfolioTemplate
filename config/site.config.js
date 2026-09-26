/**
 * Initial seed for site identity: the site and the dashboard start from it until the
 * first save from /admin. After that, name, bio, hero and social are edited from the
 * dashboard and R2 is the source of truth. `language` sets <html lang> and the date
 * format of the dashboard ('it' together with config/texts.it.js for Italian).
 */
export const siteConfig = {
  name: 'Photographer Name',
  bio: 'A short description of the photographer.',
  language: 'en',
  heroImage: null,  // after upload: { album: 'album-name', name: 'photo.webp' }
  social: {
    // instagram: 'https://instagram.com/...',
  },
  provider: 'r2',
  // Optional chaining: this file is imported by vite.config.js (Node environment)
  // where import.meta.env does not exist. Optional chaining prevents the error.
  r2PublicUrl: import.meta.env?.VITE_R2_PUBLIC_URL,
};
