/**
 * The only module code in custom/ may import. Everything else in src/ is internal
 * and may change in any template update. Removing or renaming an export here, or
 * changing its arguments or what it returns, is a breaking change for forks: note it
 * in docs/upgrading.md. Adding an export, or a field to an object it returns, is safe.
 */
export { albumsToCards } from '../pages/home-logic.js';
