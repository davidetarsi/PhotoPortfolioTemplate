// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './client.js';

const res = (body, status = 200) => new Response(JSON.stringify(body), { status });

describe('request', () => {
  it('sends JSON and returns the answer', async () => {
    const fetchImpl = vi.fn(async () => res({ ok: true }));
    expect(await request('/api/admin/draft/site', { method: 'PUT', json: { name: 'D' }, fetchImpl })).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith('/api/admin/draft/site', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"name":"D"}',
    });
  });

  it('an error answer becomes an ApiError with status and body', async () => {
    const fetchImpl = async () => res({ error: 'PUBLISH_IN_PROGRESS' }, 409);
    const error = await request('/api/admin/draft', { method: 'DELETE', fetchImpl }).catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.body).toEqual({ error: 'PUBLISH_IN_PROGRESS' });
    expect(error.message).toBe('PUBLISH_IN_PROGRESS');
  });

  it('a network failure is an ApiError with status 0', async () => {
    const error = await request('/x', { fetchImpl: async () => { throw new TypeError('down'); } }).catch(e => e);
    expect(error.status).toBe(0);
    expect(error.body.error).toBe('NETWORK');
  });

  it('an answer that is not JSON still reports its status', async () => {
    const error = await request('/x', { fetchImpl: async () => new Response('<html>', { status: 502 }) }).catch(e => e);
    expect(error.status).toBe(502);
    expect(error.message).toBe('HTTP 502');
  });
});
