/** Move the Vite-loaded theme after CSS attached by a lazily loaded slot. */
export function keepCustomThemeLast() {
  if (typeof document === 'undefined') return;
  const theme = document.querySelector('link[rel="stylesheet"][data-custom-theme]');
  if (theme?.parentNode) theme.parentNode.appendChild(theme);
}
