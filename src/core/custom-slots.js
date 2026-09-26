/**
 * Connects the resolver to the fork's optional custom/slots.js.
 * import.meta.glob returns {} when the file does not exist: forks without
 * custom/ need no configuration and see the template defaults.
 */
import { createSlotResolver, overridesFrom } from './slots.js';
import { SLOT_CONTRACTS } from './contracts.js';
import * as defaults from './default-slots.js';

const found = import.meta.glob('/custom/slots.js', { eager: true });
const customModule = Object.values(found)[0];

export const slot = createSlotResolver({ ...defaults }, overridesFrom(customModule), SLOT_CONTRACTS);
