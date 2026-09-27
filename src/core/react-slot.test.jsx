import { describe, expect, it } from 'vitest';
import { createSlotResolver } from './slots.js';

const contracts = { landing: 'mount' };
const defaults = { landing: { mount: () => ({}) } };

describe('a slot written in React', () => {
  it('mounts through the slot contract and unmounts on destroy', async () => {
    const slot = createSlotResolver(defaults, { landing: () => import('./fixtures/react-landing.jsx') }, contracts);
    const landing = await slot('landing');
    const container = document.createElement('div');
    const data = Promise.resolve({
      site: { name: 'Davide <b>Tarsi</b>' },
      albums: [{ slug: 'notte', title: 'Notte in montagna' }, { slug: 'viaggio', title: 'Viaggio' }],
    });

    const handle = await landing.mount(container, { texts: {}, data });

    // JSX escapes text: the name is shown, never parsed as HTML.
    expect(container.querySelector('h1').textContent).toBe('Davide <b>Tarsi</b>');
    expect(container.querySelector('h1 b')).toBeNull();
    expect([...container.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Notte in montagna', 'Viaggio']);

    handle.destroy();
    expect(container.childNodes).toHaveLength(0);
  });
});
