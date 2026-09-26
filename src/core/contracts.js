/**
 * Every slot the template knows, with the method its implementation must expose.
 * 'mount'  → mount(container, ctx) returning { destroy?() } (or a promise of it)
 * 'create' → create(items, ctx) returning an instance
 * Adding a slot here without a default in default-slots.js fails at startup.
 */
export const SLOT_CONTRACTS = {
  landing: 'mount',
};
