/**
 * The only module code in custom/ may import. Everything else in src/ is internal
 * and may change in any template update. Removing or renaming an export here is a
 * breaking change for forks: note it in docs/upgrading.md. Adding one is safe.
 */
export { albumsToCards } from '../pages/home-logic.js';
