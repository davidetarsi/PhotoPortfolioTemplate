import { useEffect, useId, useRef } from 'react';
import './ui.css';

/**
 * A modal panel on the browser's own <dialog>: it keeps the focus inside, closes with Esc
 * and gives the focus back when it closes. On a phone it rises from the bottom; on a wider
 * screen it is centred. Open and closed are driven by `open`; Esc, the backdrop, or the
 * browser closing the dialog by itself call `onClose`, and the parent decides.
 * @param {{open: boolean, onClose: Function, title: string, children: any, className?: string,
 *   role?: string, describedBy?: string, dismissible?: boolean}} props
 *   `dismissible: false` ignores Esc and the backdrop (while an action is running).
 */
export function Sheet({ open, onClose, title, children, className = '', role, describedBy, dismissible = true }) {
  const ref = useRef(null);
  const titleId = useId();
  // The latest `open`, for the browser's own "close" event.
  const openRef = useRef(open);
  openRef.current = open;

  // A <dialog> is opened with a method, not an attribute: this is where React talks to the DOM.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dash-sheet ${className}`.trim()}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      // Esc: the browser fires "cancel"; the parent closes by changing `open`.
      onCancel={event => { event.preventDefault(); if (dismissible) onClose(); }}
      // Some browsers close the dialog anyway (a second Esc): keep the parent in step.
      onClose={() => { if (openRef.current) onClose(); }}
      // A click on the backdrop lands on the dialog element itself.
      onClick={event => { if (dismissible && event.target === ref.current) onClose(); }}
    >
      <div className="dash-sheet__body">
        <h2 id={titleId} className="dash-sheet__title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
