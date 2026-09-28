import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * The dashboard's side of the preview protocol (spec, "Anteprima" and "Protocollo
 * dell'anteprima, lato dashboard"). The preview is the real site in an iframe of the same
 * origin, reading the draft:
 * - `field(name, value)` shows a text as it is typed (`preview:field`), before it is saved;
 * - `focus(name | null)` scrolls to a field and outlines it, or removes the outline;
 * - `reload()` makes the page read the draft again, after a change that is not a text;
 * - `forget(name)` stops sending a text again once it is saved (after Discard it would
 *   otherwise come back into the page).
 * The page says `preview:ready` each time it (re)loads, possibly more than once: every time
 * the texts typed and not yet saved, and the focused field, are sent again. Messages are
 * accepted only from the iframe itself, on this origin.
 * @returns {{frameRef: {current: HTMLIFrameElement|null}, field: Function, focus: Function, forget: Function, reload: Function}}
 */
export function usePreview() {
  const frameRef = useRef(null);
  const live = useRef(new Map()); // field → text typed, sent again on every ready
  const focused = useRef(null);

  const post = useCallback(message => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    const onMessage = event => {
      if (event.origin !== window.location.origin || !frameRef.current || event.source !== frameRef.current.contentWindow) return;
      if (event.data?.type !== 'preview:ready') return;
      for (const [name, value] of live.current) post({ type: 'preview:field', field: name, value });
      if (focused.current) post({ type: 'preview:focus', field: focused.current });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  return useMemo(() => ({
    frameRef,
    field(name, value) {
      live.current.set(name, value);
      post({ type: 'preview:field', field: name, value });
    },
    focus(name) {
      focused.current = name;
      post({ type: 'preview:focus', field: name });
    },
    forget(name) {
      live.current.delete(name);
    },
    reload() {
      // After a reload the page shows what is saved: the texts typed are sent again on ready.
      post({ type: 'preview:reload' });
    },
  }), [post]);
}
