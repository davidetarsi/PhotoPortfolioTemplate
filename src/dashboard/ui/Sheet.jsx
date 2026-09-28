import { useEffect, useId, useRef } from 'react';
import './ui.css';

/**
 * A modal panel on the browser's own <dialog>: it keeps the focus inside, closes with Esc
 * and gives the focus back when it closes. On a phone it rises from the bottom; on a wider
 * screen it is centred. Open and closed are driven by `open`; Esc or the backdrop call
 * `onClose`, and the parent decides.
 * @param {{open: boolean, onClose: Function, title: string, children: any, className?: string}} props
 */
export function Sheet({ open, onClose, title, children, className = '' }) {
  const ref = useRef(null);
  const titleId = useId();

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
      aria-labelledby={titleId}
      // Esc: the browser fires "cancel"; the parent closes by changing `open`.
      onCancel={event => { event.preventDefault(); onClose(); }}
      // A click on the backdrop lands on the dialog element itself.
      onClick={event => { if (event.target === ref.current) onClose(); }}
    >
      <div className="dash-sheet__body">
        <h2 id={titleId} className="dash-sheet__title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
