import { describe, expect, it, vi } from 'vitest';
import { createDevRouteFallback, devRouteFallback } from './devRouteFallback.js';

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

  it.each(['/api/contact', '/assets/logo.svg', '/about', '/about/', '/admin', '/album', '/index', '/'])(
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

  it('treats /contatti as an ordinary album slug', () => {
    const request = { url: '/contatti' };
    devRouteFallback(request, responseDouble(), vi.fn());
    expect(request.url).toBe('/album.html');
  });
});

describe('createDevRouteFallback with custom pages', () => {
  const middleware = createDevRouteFallback({
    customPages: [
      { kind: 'single', path: '/archive', html: 'custom/pages/archive.html', name: 'archive', outFile: 'archive.html' },
      { kind: 'single', path: '/info/credits', html: 'custom/pages/credits.html', name: 'info-credits', outFile: 'info/credits.html' },
      { kind: 'collection', path: '/projects/:slug', html: 'custom/pages/project.html', name: 'projects-collection', prefix: 'projects', entries: [] },
    ],
  });
  const route = url => {
    const request = { url };
    const next = vi.fn();
    middleware(request, responseDouble(), next);
    expect(next).toHaveBeenCalledOnce();
    return request.url;
  };

  it.each([
    ['/archive', '/custom/pages/archive.html'],
    ['/archive/?x=1', '/custom/pages/archive.html?x=1'],
    ['/info/credits', '/custom/pages/credits.html'],
    ['/projects/sea-sentinels', '/custom/pages/project.html'],
    ['/projects/sea-sentinels/?x=1', '/custom/pages/project.html?x=1'],
  ])('serves %s from %s', (url, expected) => {
    expect(route(url)).toBe(expected);
  });

  it('keeps album slugs and invalid collection slugs as before', () => {
    expect(route('/sport')).toBe('/album.html');
    expect(route('/projects/Bad')).toBe('/projects/Bad');
    expect(route('/projects/a/b')).toBe('/projects/a/b');
  });

  it('treats the bare collection prefix as an album slug, like production', () => {
    expect(route('/projects')).toBe('/album.html');
  });
});
