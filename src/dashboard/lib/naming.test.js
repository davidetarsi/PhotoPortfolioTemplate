import { describe, it, expect } from 'vitest';
import { normalizeFilename, assignUniqueName } from './naming.js';

describe('normalizeFilename', () => {
  it('minuscole, spazi→trattini, charset sicuro, estensione .webp', () => {
    expect(normalizeFilename('IMG_001.JPG')).toBe('img_001.webp');
    expect(normalizeFilename('Foto Vacanze (1).png')).toBe('foto-vacanze-1.webp');
    expect(normalizeFilename('già.webp')).toBe('gi.webp');
    expect(normalizeFilename('...')).toBe('foto.webp');
  });
});

describe('assignUniqueName', () => {
  it('nome libero → invariato; occupato → suffissi -2, -3', () => {
    expect(assignUniqueName('a.webp', new Set())).toBe('a.webp');
    expect(assignUniqueName('a.webp', new Set(['a.webp']))).toBe('a-2.webp');
    expect(assignUniqueName('a.webp', new Set(['a.webp', 'a-2.webp']))).toBe('a-3.webp');
  });
});
