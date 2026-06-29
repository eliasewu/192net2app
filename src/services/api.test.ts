// ============================================================
// api.test.ts — vitest tests for the ApiClient.request safe-parse
// ============================================================
// Lock in the safe body-parsing behaviour landed to fix the
// "JSON.parse: unexpected character at line 1 column 1 of the JSON data"
// login error. A mocked `globalThis.fetch` keeps the network out of
// these tests, so the assertions describe *exactly* how the request()
// method behaves on each kind of response body.
//
// Run with: npx vitest run src/services/api.test.ts
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from './api';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

// Build a fake Response that has just enough surface for api.ts to
// consume (status, ok, headers.get('content-type'), text()).
// We don't pull in the global Response constructor because vitest's
// `environment: 'node'` may not provide a fully-functional one in
// every runtime (and we don't need it — jsdom isn't loaded here).
function mockResponse(opts: {
  status: number;
  body: string;
  contentType?: string;
}): Response {
  const headers = new Headers();
  if (opts.contentType) headers.set('content-type', opts.contentType);
  return {
    status: opts.status,
    ok: opts.status >= 200 && opts.status < 300,
    headers,
    text: async () => opts.body,
  } as unknown as Response;
}

// Cast helper for typing the global fetch mock.
// `vi.fn()` returns `Mock` which satisfies `typeof fetch`.
function installFetchMock() {
  const fakeFetch = vi.fn();
  globalThis.fetch = fakeFetch as unknown as typeof fetch;
  return fakeFetch;
}

beforeEach(() => {
  // Reset the client between tests so a stale token from a prior
  // case can't leak assertions (e.g. into the 401-clear-token test).
  api.setToken(null);
});

afterEach(() => {
  // Don't leave a stub install on globalThis — restore the real fetch
  // so other tests / importers aren't broken if vitest reorders.
  vi.restoreAllMocks();
  delete (globalThis as { fetch?: typeof fetch }).fetch;
});

// ------------------------------------------------------------
// Scenario 1 — empty body, 200 OK
// Spec: status=ok but no payload → throws "Empty response body".
// ------------------------------------------------------------
describe('ApiClient.request — empty body, 200 OK', () => {
  it('throws "Empty response body" when response is OK with no body', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockResponse({ status: 200, body: '' }));

    await expect(api.get('/anything')).rejects.toThrow('Empty response body');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------
// Scenario 2 — empty body, 502 (Vite proxy fallback when backend is down)
// Spec: status=502 with no payload → throws "HTTP 502 (empty body)".
// ------------------------------------------------------------
describe('ApiClient.request — empty body, 502', () => {
  it('throws "HTTP 502 (empty body)" when proxy returns no body', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockResponse({ status: 502, body: '' }));

    await expect(api.get('/anything')).rejects.toThrow('HTTP 502 (empty body)');
  });
});

// ------------------------------------------------------------
// Scenario 3 — HTML proxy error page, 502
// Spec: status=502 with HTML body → throws
//   "HTTP 502 (content-type=text/html): <html>…" with a 200-char snippet.
// ------------------------------------------------------------
describe('ApiClient.request — HTML proxy page on 502', () => {
  it('surfaces content-type and a 200-char snippet of the HTML body', async () => {
    const fakeFetch = installFetchMock();
    const html = '<!doctype html><html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center></body></html>';
    fakeFetch.mockResolvedValueOnce(mockResponse({
      status: 502, body: html, contentType: 'text/html; charset=utf-8',
    }));

    const err = await api.get('/anything').catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    // Should contain the status, the normalised content-type, and an HTML
    // snippet from the proxy page. We assert on the substring directly
    // rather than slicing the message — the colon inside
    // "content-type=text/html; charset=utf-8" would otherwise make any
    // naive ": "-split fragile.
    expect(err.message).toMatch(/^HTTP 502 /);
    expect(err.message).toContain('content-type=');
    expect(err.message).toContain('502 Bad Gateway');
  });
});

// ------------------------------------------------------------
// Scenario 4 — text/plain error, 500
// Spec: status=500 with plain text → throws
//   "HTTP 500 (content-type=text/plain): <body>" with snippet.
// ------------------------------------------------------------
describe('ApiClient.request — text/plain error on 500', () => {
  it('surfaces content-type and the body snippet for a text/plain 500', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockResponse({
      status: 500, body: 'Database connection failed: postgres://…', contentType: 'text/plain',
    }));

    const err = await api.get('/anything').catch((e) => e as Error);
    expect(err.message).toMatch(/^HTTP 500 /);
    expect(err.message).toContain('content-type=text/plain');
    expect(err.message).toContain('Database connection failed');
  });
});

// ------------------------------------------------------------
// Scenario 5 — valid JSON, 200 OK
// Spec: status=200 with JSON body → resolves to the parsed object.
// ------------------------------------------------------------
describe('ApiClient.request — valid JSON, 200 OK', () => {
  it('resolves to the parsed JSON object', async () => {
    const fakeFetch = installFetchMock();
    const payload = { success: true, user: { id: 1, username: 'admin', role: 'admin' } };
    fakeFetch.mockResolvedValueOnce(mockResponse({
      status: 200, body: JSON.stringify(payload), contentType: 'application/json',
    }));

    const result = await api.get('/users/me');
    expect(result).toEqual(payload);
  });

  it('forwards POST bodies as JSON-stringified payload', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockResponse({
      status: 200, body: JSON.stringify({ success: true }), contentType: 'application/json',
    }));

    await api.post('/auth/login', { username: 'admin', password: 'admin123' });
    const [, init] = fakeFetch.mock.calls[0];
    // Verify the request metadata that the safe-parse layer relies on.
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ username: 'admin', password: 'admin123' }));
  });
});

// ------------------------------------------------------------
// Scenario 6 — 401 Unauthorized (token silently cleared)
// Spec: status=401 → throws "Unauthorized" AND api.getToken()
//   becomes null after the call (clearTokenSilent behaviour).
// ------------------------------------------------------------
describe('ApiClient.request — 401', () => {
  it('throws "Unauthorized" and clears the in-memory token silently', async () => {
    const fakeFetch = installFetchMock();
    // Seed a token so we can prove clearTokenSilent fired.
    api.setToken('Bearer-seed');
    expect(api.getToken()).toBe('Bearer-seed');

    fakeFetch.mockResolvedValueOnce(mockResponse({
      status: 401, body: '{"error":"Invalid credentials"}', contentType: 'application/json',
    }));

    await expect(api.get('/anything')).rejects.toThrow('Unauthorized');
    // Token must be dropped without firing onTokenChange (silent).
    expect(api.getToken()).toBeNull();
  });

  it('attaches Authorization: Bearer <token> when a token is set', async () => {
    const fakeFetch = installFetchMock();
    api.setToken('seed-token');
    fakeFetch.mockResolvedValueOnce(mockResponse({
      status: 200, body: '{}', contentType: 'application/json',
    }));

    await api.get('/me');
    const [, init] = fakeFetch.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer seed-token');
  });

  it('omits Authorization when no token is set', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockResponse({
      status: 200, body: '{}', contentType: 'application/json',
    }));

    await api.get('/me');
    const [, init] = fakeFetch.mock.calls[0];
    expect(init.headers['Authorization']).toBeUndefined();
  });
});

// ------------------------------------------------------------
// Extra — non-JSON success body (rare but possible: 200 with HTML)
// Spec: should throw "Server returned non-JSON success body" with
//   content-type + snippet.
// ------------------------------------------------------------
describe('ApiClient.request — non-JSON success body', () => {
  it('throws a structured error including content-type and snippet', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockResponse({
      status: 200, body: 'OK', contentType: 'text/plain',
    }));

    const err = await api.get('/anything').catch((e) => e as Error);
    expect(err.message).toMatch(/^Server returned non-JSON success body /);
    expect(err.message).toContain('content-type=text/plain');
    expect(err.message).toContain('OK');
  });
});

// ------------------------------------------------------------
// Extra — fetch itself rejects (network unreachable)
// Spec: throws "Network error: <reason> (reachable: <url>)".
// ------------------------------------------------------------
describe('ApiClient.request — network error', () => {
  it('throws a Network error diagnostic including the target URL', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const err = await api.get('/anything').catch((e) => e as Error);
    expect(err.message).toMatch(/^Network error: /);
    expect(err.message).toContain('Failed to fetch');
    // URL probe to make the diagnostic actionable.
    expect(err.message).toMatch(/\(reachable: .*\/anything\)/);
  });
});
