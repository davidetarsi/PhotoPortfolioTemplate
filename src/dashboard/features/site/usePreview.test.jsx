import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { usePreview } from './usePreview.js';

afterEach(cleanup);

let preview;
function Frame() {
  preview = usePreview();
  return <iframe ref={preview.frameRef} title="preview" />;
}

function setup() {
  render(<Frame />);
  const frame = document.querySelector('iframe');
  const posted = vi.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});
  const ready = (source = frame.contentWindow, origin = window.location.origin) =>
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'preview:ready' }, origin, source })); });
  return { frame, posted, ready };
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
