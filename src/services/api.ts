// API Configuration
// Use absolute URL so calls succeed regardless of dev server origin.
// The backend (server.cjs) listens on port 3000; Vite dev server proxies
// /api -> :3000 as a backup.
const API_BASE_URL = (typeof window !== 'undefined' && window.location?.origin)
  ? window.location.origin.replace(/\/$/, '') + '/api'
  : 'http://localhost:3000/api';

const TOKEN_KEY = 'net2app_auth_token';

// ==================== Connection-state pub-sub ====================
// Single source of truth for "is the Net2App backend reachable?".
// Surfaced by <BackendStatusBanner /> so a 502 storm on /login page
// mount (currently ~17 parallel /api/* fetches all hitting an
// unreachable upstream) collapses into ONE red banner instead of 17
// indistinguishable console errors. Subscribers register via
// onConnectionState(); setConnectionState() broadcasts only on
// real transitions to avoid React re-render storms.
//
// Idempotency: when state.status === 'down' and a new down signal
// arrives, we bump attemptCount + lastSeenAt *without* broadcasting.
// This is the difference between "first 502 of a session" (banner
// appears, fires one render) and "every subsequent parallel 502"
// (silent counter increment, no extra render).
// ==================================================================
export type ConnectionDownReason = 'network' | 'gateway' | 'unavailable';

export type ConnectionState =
  | { status: 'unknown' }
  | { status: 'up' }
  | {
      status: 'down';
      reason: ConnectionDownReason;
      httpStatus?: number;
      message: string;
      firstSeenAt: number;
      lastSeenAt: number;
      attemptCount: number;
    };

let connectionState: ConnectionState = { status: 'unknown' };
const connectionListeners = new Set<(s: ConnectionState) => void>();

export function getConnectionState(): ConnectionState {
  return connectionState;
}

export function onConnectionState(cb: (s: ConnectionState) => void): () => void {
  connectionListeners.add(cb);
  // Fire immediately so consumers never render against stale
  // 'unknown' before the first transition rolls in.
  try { cb(connectionState); } catch { /* swallow listener errors */ }
  return () => { connectionListeners.delete(cb); };
}

function setConnectionState(s: ConnectionState): void {
  const prev = connectionState;
  if (s.status === 'down' && prev.status === 'down') {
    // Same status — bump counters quietly, no broadcast.
    // TypeScript narrows prev to the down branch inside this block.
    connectionState = {
      status: 'down',
      reason: s.reason ?? prev.reason,
      httpStatus: s.httpStatus ?? prev.httpStatus,
      message: s.message ?? prev.message,
      firstSeenAt: prev.firstSeenAt,
      lastSeenAt: s.lastSeenAt,
      attemptCount: prev.attemptCount + 1,
    };
    return;
  }
  if (s.status === 'up' && prev.status === 'up') {
    return; // idempotent — backend reached, still reached
  }
  // Real transition: copy and broadcast.
  connectionState = s;
  for (const cb of connectionListeners) {
    try { cb(connectionState); } catch { /* swallow listener errors */ }
  }
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  // Notify subscribers when the token changes so consumers (e.g.
  // DataContext) can re-fetch data right after login and clear it on logout.
  private tokenListeners: Set<(token: string | null) => void> = new Set();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // Restore token from localStorage on init so it survives page refreshes.
    try {
      const saved = localStorage.getItem(TOKEN_KEY);
      if (saved) this.token = saved;
    } catch { /* localStorage unavailable (SSR / private browsing) */ }
  }

  getToken(): string | null { return this.token; }

  setToken(token: string | null) {
    const prev = this.token;
    this.token = token;
    // Persist to localStorage so the session survives page refreshes.
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* localStorage unavailable */ }
    // Fire only on an actual change to avoid redundant reloads.
    if (prev !== token) {
      for (const cb of this.tokenListeners) {
        try { cb(token); } catch (e) { /* swallow listener errors */ }
      }
    }
  }

  // Silent token clear: drop the token WITHOUT firing onTokenChange.
  // Use this when a single request 401s — it's an auth failure on a
  // specific endpoint, not a deliberate logout by the user. Firing
  // onTokenChange here would call clearAll() and wipe the entire
  // DataContext state on one transient 401.
  clearTokenSilent(): void {
    this.token = null;
    // Also remove from localStorage so expired tokens don't persist
    // across page refreshes (the constructor would re-read them).
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  }

  // Subscribe to token changes. Returns an unsubscribe function.
  onTokenChange(cb: (token: string | null) => void): () => void {
    this.tokenListeners.add(cb);
    return () => { this.tokenListeners.delete(cb); };
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
    };
    if (options.headers) Object.assign(headers, options.headers);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
    } catch (e: any) {
      // fetch() threw — DNS, ECONNREFUSED, TLS, CORS preflight fail, etc.
      // Even when the service is being DEBUGGED (no nginx, dev preview,
      // wrong origin), this surfaces a single visible signal so the
      // operator stops wondering "is it me or the prod box?".
      setConnectionState({
        status: 'down',
        reason: 'network',
        message: (e && e.message) ? e.message : 'Network error',
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
        attemptCount: 1,
      });
      throw new Error(`Network error: ${e.message || 'fetch failed'} (reachable: ${this.baseUrl}${endpoint})`);
    }
    // ---- infra-level signal dedupe (502/503/504) -----------------
    // Anything in {502,503,504} is nginx/proxy telling us the
    // upstream API is unreachable / overloaded / in maintenance —
    // categorically distinct from a 4xx (logical, app-alive) error.
    // We map this to ONE global "backend down" state transition
    // before the rest of the response is parsed, so the 17 parallel
    // /api/* calls on /login page mount don't each emit their own
    // "Failed to fetch /clients: HTTP 502 …" line to the console.
    {
      let infra: { reason: ConnectionDownReason; httpStatus: number; message: string } | null = null;
      if (response.status === 502) {
        infra = { reason: 'gateway', httpStatus: 502, message: 'Upstream gateway unreachable (502)' };
      } else if (response.status === 503 || response.status === 504) {
        infra = { reason: 'unavailable', httpStatus: response.status, message: `Service unavailable (HTTP ${response.status})` };
      }
      if (infra) {
        setConnectionState({
          status: 'down',
          reason: infra.reason,
          httpStatus: infra.httpStatus,
          message: infra.message,
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
          attemptCount: 1,
        });
      } else {
        // Any other HTTP response — even 4xx like a 401 — proves
        // nginx reached the backend and got *something* back, so the
        // API platform is alive.
        setConnectionState({ status: 'up' });
      }
    }
    // 401: drop the token without firing onTokenChange to avoid wiping
    // the entire dataset on one transient/auth-failed request.
    if (response.status === 401) { this.clearTokenSilent(); throw new Error('Unauthorized'); }

    // SAFER body handling: read the body as text *first* (always works regardless
    // of content-type) and only attempt JSON.parse() on a non-empty payload.
    // Previously this method called `response.json()` unconditionally, which
    // throws `SyntaxError: Unexpected token …` whenever the response body is
    // empty or non-JSON (e.g. a Vite dev proxy returning a 502 HTML error page,
    // a text/plain default error page, or an empty 204 No Content). The
    // SyntaxError surfaced verbatim in the Login page as
    //   JSON.parse: unexpected character at line 1 column 1 of the JSON data
    // which was confusing for end users.
    const text = await response.text();
    if (!text) {
      if (!response.ok) throw new Error(`HTTP ${response.status} (empty body)`);
      throw new Error('Empty response body');
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (_parseErr) {
      // Body is not JSON. Surface a readable diagnostic that includes a
      // 200-char snippet of the body so contributors can spot, say, an HTML
      // proxy-fallback page or a plain-text gateway error.
      const snippet = text.slice(0, 200).replace(/\s+/g, ' ');
      const ctype = response.headers.get('content-type') || 'unknown';
      if (response.ok) {
        throw new Error(`Server returned non-JSON success body (content-type=${ctype}): ${snippet}`);
      }
      throw new Error(`HTTP ${response.status} (content-type=${ctype}): ${snippet}`);
    }
    return parsed;
  }

  get(endpoint: string): Promise<any> { return this.request(endpoint, { method: 'GET' }); }
  post(endpoint: string, data?: any): Promise<any> { return this.request(endpoint, { method: 'POST', body: data ? JSON.stringify(data) : undefined }); }
  put(endpoint: string, data?: any): Promise<any> { return this.request(endpoint, { method: 'PUT', body: data ? JSON.stringify(data) : undefined }); }
  delete(endpoint: string): Promise<any> { return this.request(endpoint, { method: 'DELETE' }); }
}

export const api = new ApiClient(API_BASE_URL);
export const apiClient = api;
