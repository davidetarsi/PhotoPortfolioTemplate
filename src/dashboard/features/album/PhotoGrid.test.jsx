import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { texts } from '../../../../config/texts.config.js';
import { PhotoGrid } from './PhotoGrid.jsx';

const t = texts.admin.album;

describe('PhotoGrid', () => {
  it('disables cover selection and photo deletion while publishing', () => {
    render(<PhotoGrid slug="notte" photos={[{ name: 'a.webp' }]} coverName={null} reordering={false} disabled
      onMove={vi.fn()} onCover={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: `${t.coverAsButton} · Photo 1` }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: `${t.deletePhoto} · Photo 1` }).disabled).toBe(true);
  });
});
