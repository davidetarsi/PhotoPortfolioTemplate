import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Sheet } from './Sheet.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { installDialogPolyfill } from '../test-utils.jsx';

beforeAll(installDialogPolyfill);

describe('Sheet', () => {
  it('opens and closes with its `open` prop', () => {
    const { rerender } = render(<Sheet open={false} onClose={() => {}} title="Titolo">body</Sheet>);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.open).toBe(false);
    rerender(<Sheet open onClose={() => {}} title="Titolo">body</Sheet>);
    expect(dialog.open).toBe(true);
    expect(screen.getByRole('heading', { name: 'Titolo' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Titolo' })).toBe(dialog);
    rerender(<Sheet open={false} onClose={() => {}} title="Titolo">body</Sheet>);
    expect(dialog.open).toBe(false);
  });

  it('Esc and a click on the backdrop ask the parent to close; a click inside does not', () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="T"><button type="button">inside</button></Sheet>);
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    fireEvent.click(screen.getByRole('button', { name: 'inside' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('selecting text inside and releasing on the backdrop does not close it', () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="T"><input aria-label="field" /></Sheet>);
    const dialog = screen.getByRole('dialog');
    fireEvent.pointerDown(screen.getByLabelText('field'));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  it('confirm and cancel call their handlers; busy disables both', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const props = { open: true, title: 'Sicuro?', body: 'Testo', confirmLabel: 'Elimina', cancelLabel: 'Indietro', onConfirm, onCancel };
    const { rerender } = render(<ConfirmDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(<ConfirmDialog {...props} busy />);
    expect(screen.getByRole('button', { name: 'Elimina' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Indietro' }).disabled).toBe(true);
  });
});
