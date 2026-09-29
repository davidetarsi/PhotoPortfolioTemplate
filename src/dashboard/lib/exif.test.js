import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractCapturedAt } from './exif.js';

vi.mock('exifr', () => ({ parse: vi.fn() }));
import { parse } from 'exifr';

describe('extractCapturedAt', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('ritorna epoch ms da DateTimeOriginal quando presente', async () => {
    const date = new Date('2025-06-14T18:42:00Z');
    parse.mockResolvedValue({ DateTimeOriginal: date });
    const result = await extractCapturedAt({});
    expect(result).toBe(date.getTime());
  });

  it('ritorna undefined se DateTimeOriginal manca', async () => {
    parse.mockResolvedValue({});
    expect(await extractCapturedAt({})).toBeUndefined();
  });

  it('ritorna undefined se parse() non trova EXIF (risolve undefined/null)', async () => {
    parse.mockResolvedValue(undefined);
    expect(await extractCapturedAt({})).toBeUndefined();
  });

  it('ritorna undefined se parse() lancia — mai un\'eccezione propagata', async () => {
    parse.mockRejectedValue(new Error('file corrotto'));
    await expect(extractCapturedAt({})).resolves.toBeUndefined();
  });

  it('ritorna undefined se DateTimeOriginal non è una Date valida', async () => {
    parse.mockResolvedValue({ DateTimeOriginal: 'non-una-data' });
    expect(await extractCapturedAt({})).toBeUndefined();
  });
});
