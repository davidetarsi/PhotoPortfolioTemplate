import { describe, expect, it, vi } from 'vitest';
import { devRouteFallback } from './devRouteFallback.js';

function responseDouble() {
  return {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  };
}

describe('devRouteFallback', () => {
  it('returns JSON 404 for runtime data API routes', () => {
    const response = responseDouble();
    const next = vi.fn();

    devRouteFallback({ url: '/api/data/albums?fresh=1' }, response, next);

    expect(response.statusCode).toBe(404);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
      error: 'Runtime data API is unavailable in the Vite development server',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['/album-name?preview=1', '/album-name/?preview=1'])
    ('rewrites a clean album slug with or without trailing slash and keeps the query string', url => {
      const request = { url };
      const response = responseDouble();
      const next = vi.fn();

      devRouteFallback(request, response, next);

      expect(request.url).toBe('/album.html?preview=1');
      expect(next).toHaveBeenCalledOnce();
      expect(response.end).not.toHaveBeenCalled();
    });

  it.each(['/api/contact', '/assets/logo.svg', '/about', '/about/', '/admin', '/contatti', '/'])(
    'passes through non-data route %s', url => {
      const request = { url };
      const response = responseDouble();
      const next = vi.fn();

      devRouteFallback(request, response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(request.url).toBe(url);
      expect(response.end).not.toHaveBeenCalled();
    },
  );
});
