// Copy this folder to custom/ to activate it. Only the slots listed here are replaced;
// every other part of the site keeps the template implementation.
import landing from './landing/example-landing.js';

export default {
  // This static edge intentionally exercises the public API import cycle.
  landing: () => landing,
  // This lazy edge demonstrates chunked slot loading and its stylesheet.
  photoGrid: () => import('./photo-grid/example-photo-grid.js'),
};
