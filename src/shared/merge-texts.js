import { EDITABLE_TEXT_KEYS } from './content-rules.js';

/**
 * The interface copy with the dashboard's overrides applied.
 * Only keys in EDITABLE_TEXT_KEYS are taken; an empty or missing override keeps the
 * value of config/texts.config.js. The input objects are not modified.
 * @param {object} texts - Copy from config/texts.config.js.
 * @param {Record<string, string>} [overrides] - site.texts, keyed by dotted path.
 * @returns {object} A new texts object.
 */
export function mergeTexts(texts, overrides = {}) {
  const merged = structuredClone(texts);
  for (const key of EDITABLE_TEXT_KEYS) {
    const value = overrides?.[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const path = key.split('.');
    const last = path.pop();
    const parent = path.reduce((node, part) => node?.[part], merged);
    if (parent && typeof parent[last] === 'string') parent[last] = value;
  }
  return merged;
}
