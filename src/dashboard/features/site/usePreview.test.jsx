import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { usePreview } from './usePreview.js';

afterEach(cleanup);

let preview;
function Frame({ draftVersion, fieldOpen }) {
  preview = usePreview({ draftVersion, fieldOpen });
  return <iframe ref={preview.frameRef} title="preview" />;
}

function setup(props = {}) {
  const view = render(<Frame {...props} />);
  const frame = document.querySelector('iframe');
  const posted = vi.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});
  const ready = (source = frame.contentWindow, origin = window.location.origin) =>
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'preview:ready' }, origin, source })); });
  return { frame, posted, ready, rerender: next => view.rerender(<Frame {...next} />) };
}

describe('usePreview', () => {
  it('sends each text as it is typed, and the focus, to the page on this origin', () => {
    const { posted } = setup();
    preview.field('site.bio', 'Fotografo');
    preview.focus('site.bio');
    expect(posted.mock.calls).toEqual([
      [{ type: 'preview:field', field: 'site.bio', value: 'Fotografo' }, window.location.origin],
      [{ type: 'preview:focus', field: 'site.bio' }, window.location.origin],
    ]);
  });

  it('on every ready sends again the texts not saved and the focused field', () => {
    const { posted, ready } = setup();
    preview.field('site.name', 'D');
    preview.field('site.name', 'Davide');
    preview.focus('site.name');
    posted.mockClear();
    ready();
    ready();
    const once = [
      [{ type: 'preview:field', field: 'site.name', value: 'Davide' }, window.location.origin],
      [{ type: 'preview:focus', field: 'site.name' }, window.location.origin],
    ];
    expect(posted.mock.calls).toEqual([...once, ...once]);
  });

  it('a text forgotten after its save is not sent again; no focus after leaving the field', () => {
    const { posted, ready } = setup();
    preview.field('site.name', 'Davide');
    preview.focus('site.name');
    preview.forget('site.name');
    preview.focus(null);
    posted.mockClear();
    ready();
    expect(posted).not.toHaveBeenCalled();
  });

  it('clears an invalid live value and reloads the saved draft when the field closes', () => {
    const { posted, ready } = setup();
    preview.field('site.name', '');
    posted.mockClear();
    preview.reset('site.name');
    expect(posted.mock.calls).toEqual([
      [{ type: 'preview:reload' }, window.location.origin],
    ]);
    posted.mockClear();
    ready();
    expect(posted).not.toHaveBeenCalled();
  });

  it('reloads after the saved draft changes while no field is open', () => {
    const { posted, rerender } = setup({ draftVersion: 1, fieldOpen: false });
    posted.mockClear();
    rerender({ draftVersion: 2, fieldOpen: false });
    expect(posted).toHaveBeenCalledWith({ type: 'preview:reload' }, window.location.origin);
  });

  it('does not reload the iframe for draft changes while a field is open', () => {
    const { posted, rerender } = setup({ draftVersion: 1, fieldOpen: true });
    posted.mockClear();
    rerender({ draftVersion: 2, fieldOpen: true });
    expect(posted).not.toHaveBeenCalled();
  });

  it('ignores a ready from another window or another origin', () => {
    const { posted, ready } = setup();
    preview.field('site.name', 'Davide');
    posted.mockClear();
    ready(window);
    ready(undefined, 'https://evil.example');
    expect(posted).not.toHaveBeenCalled();
  });

  it('asks the page to read the draft again', () => {
    const { posted } = setup();
    preview.reload();
    expect(posted).toHaveBeenCalledWith({ type: 'preview:reload' }, window.location.origin);
  });
});
