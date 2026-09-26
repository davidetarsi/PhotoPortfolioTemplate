import { describe, expect, it } from 'vitest';
import { isExpectedBuildWarning } from './buildWarnings.js';

describe('isExpectedBuildWarning', () => {
  it('accepts the ineffective dynamic import of the slot registry by the public API', () => {
    expect(isExpectedBuildWarning({
      code: 'INEFFECTIVE_DYNAMIC_IMPORT',
      id: '/work/site/src/core/custom-slots.js',
    })).toBe(true);
  });

  it('keeps the same warning for any other module', () => {
    expect(isExpectedBuildWarning({
      code: 'INEFFECTIVE_DYNAMIC_IMPORT',
      id: '/work/site/custom/landing/my-landing.js',
    })).toBe(false);
  });

  it('keeps every other warning about the slot registry', () => {
    expect(isExpectedBuildWarning({
      code: 'CIRCULAR_DEPENDENCY',
      id: '/work/site/src/core/custom-slots.js',
    })).toBe(false);
    expect(isExpectedBuildWarning({ code: 'INEFFECTIVE_DYNAMIC_IMPORT' })).toBe(false);
  });
});
