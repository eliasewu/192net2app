// ====================================================================
// scripts/browser-status-banner.js
// --------------------------------------------------------------------
// Paste-into-DevTools bookmarklet. Monkey-patches window.fetch so a
// 502/503/504 storm on /login page mount (currently ~17 parallel
// /api/* calls hitting an unreachable upstream) collapses into ONE
// sticky red banner instead of 17 indistinguishable `Failed to fetch
// /clients: HTTP 502` errors in the dev console.
//
// Self-contained. No network. No build step. Survives SPA route
// changes via pushState/replaceState/popstate hooks and a
// MutationObserver that re-mounts the banner node when the host
// rebuilds the DOM.
//
// Usage (any one of these):
//   1) Open http://192.95.36.154/login (or any page where the banner
//      makes sense), then paste the contents of this file into the
//      browser DevTools console and press Enter.
//   2) Save this file as a snippet and add it as a bookmark:
//        Name:    "Backend status banner"
//        URL:     javascript:(function(){ /* minified copy below */ })()
//   3) Run it once at app boot from a customized devtools snippet.
// ====================================================================

(function () {
  'use strict';

  // -------- guard rails: bail if already installed ----------------
  if (window.__net2app_status_banner_installed__) {
    console.info('[net2app status banner] already installed; not re-attaching.');
    return;
  }

  // -------- feature-detect -------------------------------------
  // Bail BEFORE touching any state or DOM. If anything required
  // is missing, the partial-install guard above would still mark
  // us installed for the rest of the page's lifetime and prevent
  // retries. Better to fail loud + immediately.
  var missing = [];
  if (typeof window.fetch !== 'function')         missing.push('fetch');
  if (typeof window.MutationObserver !== 'function') missing.push('MutationObserver');
  if (typeof window.setInterval !== 'function')  missing.push('setInterval');
  if (typeof window.addEventListener !== 'function') missing.push('addEventListener');
  if (missing.length) {
    console.warn('[net2app status banner] missing required APIs: ' + missing.join(', ') + '; not installing.');
    return;
  }

  window.__net2app_status_banner_installed__ = true;

  // Track disposable state so destroy() can fully uninstall.
  var originalFetchRef = null;
  var tickerHandle = null;
  var observerRef = null;
  var pagehideHandler = null;

  // -------- types / constants -----------------------------------
  // Identical state machine to src/services/api.ts so the on-screen
  // contract matches the React banner exactly.
  //   unknown -> initial; never rendered.
  //   up      -> backend reachable; banner hidden.
  //   down    -> banner shown with reason, attemptCount, and ages.
  const REASON_LABEL = {
    network:     'Network error (cannot reach the server)',
    gateway:     'Upstream gateway unreachable (502)',
    unavailable: 'Service unavailable (503 / 504)',
  };
  const HOST_ID = '__net2app_status_banner_host__';
  const STYLE_ID = '__net2app_status_banner_style__';

  // -------- singleton state -------------------------------------
  const state = {
    status: 'unknown',
    reason: null,
    httpStatus: null,
    message: null,
    firstSeenAt: 0,
    lastSeenAt: 0,
    attemptCount: 0,
  };

  // Helper: format a duration in seconds as relative "ago" text.
  function formatElapsed(seconds) {
    if (seconds < 60)   return seconds + 's ago';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's ago';
    return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm ago';
  }

  // -------- idempotent state updater ----------------------------
  // Same semantics as src/services/api.ts setConnectionState():
  //   down -> down: bump counter + lastSeenAt in place, NO render.
  //   up   -> up  : no-op.
  //   else        : broadcast (render).
  function updateState(next) {
    const prev = state;
    if (next.status === 'down' && prev.status === 'down') {
      state.reason       = next.reason       || prev.reason;
      state.httpStatus   = (next.httpStatus != null) ? next.httpStatus : prev.httpStatus;
      state.message      = next.message      || prev.message;
      state.firstSeenAt  = prev.firstSeenAt;
      state.lastSeenAt   = next.lastSeenAt;
      state.attemptCount = prev.attemptCount + 1;
      // Silent counter bump -- update the on-screen counts in-place
      // without recreating the banner (cheaper, and avoids React-style
      // re-render storms when 17 parallel 502s land in the same tick).
      updateBannerTextInPlace();
      return;
    }
    if (next.status === 'up' && prev.status === 'up') return;
    // Real transition: copy fields then render.
    state.status        = next.status;
    state.reason        = next.reason        || null;
    state.httpStatus    = (next.httpStatus != null) ? next.httpStatus : null;
    state.message       = next.message       || null;
    state.firstSeenAt   = next.firstSeenAt   || Date.now();
    state.lastSeenAt    = next.lastSeenAt    || Date.now();
    state.attemptCount  = next.attemptCount  || 1;
    render();
  }

  // -------- monkey patch: window.fetch --------------------------
  // Forward ALL args + return ONE new promise so callers' .then /
  // .catch chains are unaffected. We use the two-argument .then
  // form (not .then().catch()) because the latter creates an orphan
  // promise: when the original rejects and we re-throw inside .catch,
  // that orphan promise fires an Uncaught (in promise) warning -- the
  // exact kind of console noise this script is meant to reduce.
  // The two-arg .then(onFulfilled, onRejected) returns a single new
  // promise owned by the caller, so any re-throw propagates cleanly.
  originalFetchRef = window.fetch.bind(window);
  window.fetch = function patchedFetch(input, init) {
    return originalFetchRef(input, init).then(function (response) {
      // Anything in {502,503,504} is nginx/proxy telling us the
      // upstream API is unreachable / overloaded / in maintenance.
      // Categorically distinct from a 4xx (logical, app-alive) error.
      if (response && response.status === 502) {
        updateState({
          status: 'down',
          reason: 'gateway',
          httpStatus: 502,
          message: 'Upstream gateway unreachable (502)',
          lastSeenAt: Date.now(),
        });
      } else if (response && (response.status === 503 || response.status === 504)) {
        updateState({
          status: 'down',
          reason: 'unavailable',
          httpStatus: response.status,
          message: 'Service unavailable (HTTP ' + response.status + ')',
          lastSeenAt: Date.now(),
        });
      } else {
        // ANY other HTTP code (incl. 401, 404, 500 POSTGRES_ERROR, etc.)
        // proves the backend process answered -> mark up.
        updateState({ status: 'up' });
      }
      return response;
    }, function (err) {
      // fetch() threw -- DNS, ECONNREFUSED, TLS, CORS preflight. The
      // backend is categorically unreachable from our origin.
      updateState({
        status: 'down',
        reason: 'network',
        message: (err && err.message) ? err.message : 'Network error',
        lastSeenAt: Date.now(),
      });
      // Re-throw so the caller's rejection chain still fires. Because
      // we're using the two-arg .then, this rejection propagates
      // through the SAME promise we return (no orphan).
      throw err;
    });
  };

  // -------- CSS: inject once, scoped by ID ----------------------
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = ''
      + '#' + HOST_ID + '{'
      +   'position:fixed;top:0;left:0;right:0;z-index:2147483647;'
      +   'background:#fef2f2;border-bottom:1px solid #fca5a5;'
      +   'color:#7f1d1d;padding:8px 16px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;'
      +   'display:flex;align-items:center;justify-content:space-between;'
      +   'box-shadow:0 1px 3px rgba(0,0,0,.06);'
      + '}'
      + '#' + HOST_ID + ' .nsb-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}'
      + '#' + HOST_ID + ' .nsb-dot{'
      +   'display:inline-block;width:8px;height:8px;border-radius:50%;'
      +   'background:#dc2626;animation:nsb-pulse 1.4s ease-in-out infinite;'
      +   'flex-shrink:0;'
      + '}'
      + '#' + HOST_ID + ' .nsb-strong{font-weight:600;white-space:nowrap}'
      + '#' + HOST_ID + ' .nsb-reason,#' + HOST_ID + ' .nsb-stats{white-space:nowrap}'
      + '#' + HOST_ID + ' .nsb-stats{color:#991b1b}'
      + '#' + HOST_ID + ' .nsb-btn{'
      +   'margin-left:16px;padding:4px 10px;background:#fff;'
      +   'border:1px solid #fca5a5;border-radius:4px;'
      +   'font-size:11px;font-weight:600;color:#7f1d1d;cursor:pointer;'
      +   'flex-shrink:0;'
      + '}'
      + '#' + HOST_ID + ' .nsb-btn:hover{background:#fee2e2}'
      + '@keyframes nsb-pulse{0%,100%{opacity:1}50%{opacity:.4}}'
      + '@media (prefers-reduced-motion:reduce){'
      +   '#' + HOST_ID + ' .nsb-dot{animation:none}'
      + '}';
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // -------- DOM render ------------------------------------------
  function el(tag, opts, children) {
    opts = opts || {};
    const e = document.createElement(tag);
    if (opts.id) e.id = opts.id;
    if (opts.cls) e.className = opts.cls;
    if (opts.attrs) for (const k in opts.attrs) e.setAttribute(k, opts.attrs[k]);
    if (opts.text != null) e.textContent = opts.text;
    if (opts.on) for (const k in opts.on) e.addEventListener(k, opts.on[k]);
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = el('div', {
        id: HOST_ID,
        attrs: { role: 'status', 'aria-live': 'polite' },
      });
      // Appended last to body so it's drawn over the SPA root.
      (document.body || document.documentElement).appendChild(host);
    }
    return host;
  }

  function render() {
    ensureStyles();
    if (state.status !== 'down') {
      const existing = document.getElementById(HOST_ID);
      if (existing) existing.remove();
      return;
    }
    const host = ensureHost();
    // Wipe children then rebuild (cheap; this only runs on
    // up<->down transitions, NOT on every parallel 502).
    while (host.firstChild) host.removeChild(host.firstChild);
    const row = el('div', { cls: 'nsb-row' });
    row.appendChild(el('span', { cls: 'nsb-dot', attrs: { 'aria-hidden': 'true' } }));
    row.appendChild(el('span', { cls: 'nsb-strong', text: 'Backend unreachable.' }));
    row.appendChild(el('span', {
      cls: 'nsb-reason',
      text: REASON_LABEL[state.reason] + (state.httpStatus ? ' (HTTP ' + state.httpStatus + ')' : ''),
    }));
    const stats = el('span', { cls: 'nsb-stats', attrs: { 'data-testid': 'nsb-stats' } });
    row.appendChild(stats);
    host.appendChild(row);
    const btn = el('button', {
      cls: 'nsb-btn',
      attrs: { type: 'button', title: 'Reload the page -- discards in-progress work, re-fires API calls' },
      text: 'Reload',
      on: { click: function () { window.location.reload(); } },
    });
    host.appendChild(btn);
    updateBannerTextInPlace();
    startTickerIfNeeded();
  }

  // -- in-place text update for the silent-counter path ----
  function updateBannerTextInPlace() {
    if (state.status !== 'down') return;
    const host = document.getElementById(HOST_ID);
    if (!host) { render(); return; }
    const stats = host.querySelector('[data-testid="nsb-stats"]');
    if (stats) {
      const sinceSec = Math.floor((Date.now() - state.firstSeenAt) / 1000);
      const lastSec  = Math.floor((Date.now() - state.lastSeenAt)  / 1000);
      const attemptWord = state.attemptCount === 1 ? 'attempt' : 'attempts';
      // Use textContent (NOT innerHTML) so a hostile /api/* response
      // cannot XSS the banner via the count line.
      stats.textContent = '\u00b7 ' + state.attemptCount + ' ' + attemptWord
        + ' \u00b7 first seen ' + formatElapsed(sinceSec)
        + ' \u00b7 most recent ' + formatElapsed(lastSec);
    }
  }

  // -- ticker: re-render the in-place text once per second ONLY
  //    while the banner is open, so a healthy session has zero idle
  //    cost from this script.
  function startTickerIfNeeded() {
    if (tickerHandle != null) return;
    tickerHandle = setInterval(function () {
      if (state.status !== 'down') {
        clearInterval(tickerHandle);
        tickerHandle = null;
        return;
      }
      updateBannerTextInPlace();
    }, 1000);
  }

  // -- SPA survival: the React app may re-render and detach our
  //    host node. A MutationObserver on <body> catches that and
  //    re-mounts the banner from the singleton state.
  observerRef = new MutationObserver(function () {
    if (state.status === 'down' && !document.getElementById(HOST_ID)) {
      render();
    }
  });
  function attachObserver() {
    if (document.body) observerRef.observe(document.body, { childList: true });
    else setTimeout(attachObserver, 50);
  }
  attachObserver();

  // -- on hard navigation / tab close, drop the ticker ---
  pagehideHandler = function () {
    if (tickerHandle != null) { clearInterval(tickerHandle); tickerHandle = null; }
  };
  window.addEventListener('pagehide', pagehideHandler);

  // -- for tests / devtools, expose a tiny API on window --
  window.__net2app_status_banner__ = {
    state: function () { return Object.assign({}, state); },
    setUp:   function () { updateState({ status: 'up' }); },
    simulateGateway: function () {
      updateState({
        status: 'down', reason: 'gateway', httpStatus: 502,
        message: 'Upstream gateway unreachable (502)',
        lastSeenAt: Date.now(),
      });
    },
    reset: function () {
      state.status = 'unknown';
      var existing = document.getElementById(HOST_ID);
      if (existing) existing.remove();
    },
    // Full uninstall: sever the fetch monkey-patch, disconnect the
    // observer, drop the ticker, remove the pagehide listener, clear
    // the banner DOM, and reset the install flag so a follow-up
    // paste-in of this snippet installs cleanly.
    destroy: function () {
      if (originalFetchRef) window.fetch = originalFetchRef;
      if (observerRef) observerRef.disconnect();
      if (tickerHandle != null) { clearInterval(tickerHandle); tickerHandle = null; }
      if (pagehideHandler) window.removeEventListener('pagehide', pagehideHandler);
      var existing = document.getElementById(HOST_ID);
      if (existing) existing.remove();
      var styleEl = document.getElementById(STYLE_ID);
      if (styleEl) styleEl.remove();
      window.__net2app_status_banner_installed__ = false;
    },
  };

  console.info('[net2app status banner] installed. Open network tab, expect ONE banner instead of N console errors.');
})();
