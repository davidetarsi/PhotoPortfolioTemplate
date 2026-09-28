import { useId } from 'react';
import { Button } from './Button.jsx';
import { Sheet } from './Sheet.jsx';

/**
 * Asks before a destructive action, in the page (the browser's confirm() is not used).
 * While `busy`, neither the buttons nor Esc nor the backdrop do anything.
 * @param {{open: boolean, title: string, body: string, confirmLabel: string, cancelLabel: string,
 *   onConfirm: Function, onCancel: Function, busy?: boolean}} props
 */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, onConfirm, onCancel, busy = false }) {
  const bodyId = useId();
  return (
    <Sheet open={open} onClose={onCancel} title={title} className="dash-confirm"
      role="alertdialog" describedBy={bodyId} dismissible={!busy}>
      <p id={bodyId} className="dash-confirm__body">{body}</p>
      <div className="dash-confirm__actions">
        <Button onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
      </div>
    </Sheet>
  );
}
