import { describe, expect, it } from 'vitest';
import { createSlotResolver } from './slots.js';

const contracts = { landing: 'mount', lightbox: 'create' };
const defaults = {
  landing: { mount: () => ({}) },
  lightbox: { create: () => ({ open() {}, close() {}, destroy() {} }) },
};

describe('createSlotResolver', () => {
  it('resolves the template default when custom/ overrides nothing', async () => {
    const slot = createSlotResolver(defaults, {}, contracts);
    expect(await slot('landing')).toBe(defaults.landing);
  });

  it('resolves an override exported as a module default', async () => {
    const custom = { mount: () => ({}) };
    const slot = createSlotResolver(defaults, { landing: async () => ({ default: custom }) }, contracts);
    expect(await slot('landing')).toBe(custom);
  });

  it('accepts an override loader that returns the implementation directly', async () => {
    const custom = { mount: () => ({}) };
    const slot = createSlotResolver(defaults, { landing: async () => custom }, contracts);
    expect(await slot('landing')).toBe(custom);
  });

  it('keeps defaults for slots custom/ does not override', async () => {
    const slot = createSlotResolver(defaults, { landing: async () => ({ mount() {} }) }, contracts);
    expect(await slot('lightbox')).toBe(defaults.lightbox);
  });

  it('rejects an unknown override name at creation, naming the known slots', () => {
    expect(() => createSlotResolver(defaults, { langing: async () => ({}) }, contracts))
      .toThrow(/custom\/slots\.js.*"langing".*landing, lightbox/);
  });

  it('rejects an override that is not a loader function', () => {
    expect(() => createSlotResolver(defaults, { landing: { mount() {} } }, contracts))
      .toThrow(/custom\/slots\.js.*"landing".*\(\) => import/);
  });

  it('rejects an implementation that misses its contract method', async () => {
    const slot = createSlotResolver(defaults, { lightbox: async () => ({ default: { mount() {} } }) }, contracts);
    await expect(slot('lightbox')).rejects.toThrow(/"lightbox".*create\(/);
  });

  it('rejects an unknown slot name asked by template code', async () => {
    const slot = createSlotResolver(defaults, {}, contracts);
    await expect(slot('sidebar')).rejects.toThrow(/Unknown slot "sidebar"/);
  });

  it('refuses defaults that do not cover every declared slot', () => {
    expect(() => createSlotResolver({ landing: defaults.landing }, {}, contracts))
      .toThrow(/default implementation.*"lightbox"/);
  });
});
