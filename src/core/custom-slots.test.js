import { describe, expect, it } from 'vitest';
import { landing } from '../components/Landing.js';
import { SLOT_CONTRACTS } from './contracts.js';

const hasCustom = Object.keys(import.meta.glob('/custom/slots.js')).length > 0;

describe('custom slots wiring', () => {
  // The template ships custom.example/ but never custom/: resolving the default here
  // also proves that the example is never picked up.
  it.skipIf(hasCustom)('resolves the template landing when custom/ is absent', async () => {
    const { slot } = await import('./custom-slots.js');
    expect(await slot('landing')).toBe(landing);
  });

  // Runs only in forks. An invalid custom/slots.js fails npm test — and therefore the
  // deploy — instead of breaking the page in front of visitors.
  it.runIf(hasCustom)('custom/slots.js is valid: every slot resolves', async () => {
    const { slot } = await import('./custom-slots.js');
    for (const name of Object.keys(SLOT_CONTRACTS)) {
      await expect(slot(name)).resolves.toBeTruthy();
    }
  });
});
