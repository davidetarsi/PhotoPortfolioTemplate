/**
 * Move the Vite-loaded theme after CSS attached by a lazily loaded slot.
 * Only moves it when another stylesheet follows: re-inserting a link can make the
 * browser re-apply it, so an already-last theme is left alone.
 */
export function keepCustomThemeLast() {
  if (typeof document === 'undefined') return;
  const theme = document.querySelector('link[rel="stylesheet"][data-custom-theme]');
  if (!theme) return;
  const last = [...document.querySelectorAll('link[rel="stylesheet"], style')].at(-1);
  if (last !== theme) last.after(theme);
}
