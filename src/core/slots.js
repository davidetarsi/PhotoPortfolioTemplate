/**
 * Resolves replaceable parts of the site ("slots").
 * Pure: receives defaults, fork overrides and contracts, touches no global.
 * Errors name custom/slots.js because that is the only file a fork edits.
 *
 * @param {Record<string, object>} defaults - Template implementations, one per slot.
 * @param {Record<string, Function>} overrides - Lazy loaders from custom/slots.js.
 * @param {Record<string, 'mount'|'create'>} contracts - Known slots and their method.
 * @returns {(name: string) => Promise<object>} Resolver.
 */
export function createSlotResolver(defaults, overrides, contracts) {
  const known = Object.keys(contracts);

  for (const name of known) {
    if (!defaults[name]) {
      throw new Error(`Template bug: no default implementation for slot "${name}".`);
    }
  }
  for (const [name, loader] of Object.entries(overrides ?? {})) {
    if (!known.includes(name)) {
      throw new Error(`custom/slots.js: unknown slot "${name}". Known slots: ${known.join(', ')}.`);
    }
    if (typeof loader !== 'function') {
      throw new Error(`custom/slots.js: slot "${name}" must be a loader, e.g. () => import('./my-component.js').`);
    }
  }

  return async function slot(name) {
    if (!known.includes(name)) throw new Error(`Unknown slot "${name}".`);
    const loader = overrides?.[name];
    if (!loader) return defaults[name];
    let loaded;
    try {
      loaded = await loader();
    } catch (error) {
      throw new Error(`custom/slots.js: slot "${name}" failed to load: ${error?.message ?? error}`, { cause: error });
    }
    const impl = loaded?.default ?? loaded;
    const method = contracts[name];
    if (typeof impl?.[method] !== 'function') {
      throw new Error(`custom/slots.js: slot "${name}" must export default { ${method}(…) }.`);
    }
    return impl;
  };
}
