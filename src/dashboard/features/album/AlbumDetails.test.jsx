import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { texts } from '../../../../config/texts.config.js';
import { AlbumDetails } from './AlbumDetails.jsx';

const t = texts.admin.album;

describe('AlbumDetails', () => {
  it('restores the latest saved title when a blank title is blurred after a refetch', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AlbumDetails album={{ slug: 'notte', title: 'Notte', description: '' }} onChange={onChange} />);
    const input = screen.getByLabelText(t.titleLabel);

    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: '' } });
    rerender(<AlbumDetails album={{ slug: 'notte', title: 'Notte aggiornata', description: '' }} onChange={onChange} />);
    fireEvent.blur(input);

    expect(input.value).toBe('Notte aggiornata');
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ title: '' }));
  });
});
