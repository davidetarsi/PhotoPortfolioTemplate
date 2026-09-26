import { describe, expect, it } from 'vitest';
import { wranglerConfigPath } from './wranglerConfigPath.js';

describe('wranglerConfigPath', () => {
  it('uses the site own wrangler.json when it exists', () => {
    expect(wranglerConfigPath(path => path === 'wrangler.json')).toBe('wrangler.json');
  });

  it('falls back to wrangler.example.json in the template, which ships no wrangler.json', () => {
    expect(wranglerConfigPath(() => false)).toBe('wrangler.example.json');
  });
});
