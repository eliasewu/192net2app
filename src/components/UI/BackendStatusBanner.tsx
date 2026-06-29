// ====================================================================
// src/components/UI/BackendStatusBanner.tsx
// --------------------------------------------------------------------
// Sticky red banner shown across every route when the backend API is
// unreachable. Subscribes to the connection-state singleton in
// `src/services/api.ts`. The intent is operational, not decorative:
//
//   * When nginx's upstream (Node.js on :3001) goes down, the Login
//     page's ~17 parallel /api/* fetches each throw a
//     `Failed to fetch /clients: HTTP 502 …` error and the developer
//     console fills with redundant red text. Instead, this banner
//     shows one clear signal: "Backend unreachable. Last error:
//     Upstream gateway (502). 17 attempts. Refresh to retry."
//
//   * When the backend comes back, the banner vanishes on the next
//     successful request. No manual dismissal needed.
//
// Don't render when status === 'unknown' or 'up' (most of the time).
// ====================================================================

import { useEffect, useState } from 'react';
import {
  onConnectionState,
  getConnectionState,
  type ConnectionDownReason,
  type ConnectionState,
} from '../../services/api';

const REASON_LABEL: Record<ConnectionDownReason, string> = {
  network: 'Network error (cannot reach the server)',
  gateway: 'Upstream gateway unreachable (502)',
  unavailable: 'Service unavailable (503 / 504)',
};

function formatElapsed(seconds: number): string {
  if (seconds < 60)   return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
}

export default function BackendStatusBanner() {
  // Seed from the singleton so the very first render reflects the
  // current state without waiting for an effect cycle.
  const [state, setState] = useState<ConnectionState>(getConnectionState());
  // Tick once per second so the "first seen Xs ago" label visibly
  // ages without depending on a network transition. Cheap because
  // only this component re-renders on each tick.
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    // One-time subscribe on mount. setState identity is stable in
    // React, so the listener callback we registered at this render
    // remains the same one that fires on each transition.
    return onConnectionState(setState);
  }, []);

  // Tick once per second ONLY while the banner is open, so a healthy
  // session has zero idle React work from this component. The
  // dependency on `state.status` re-arms the interval on every
  // up→down edge and disarms it on down→up via the cleanup.
  useEffect(() => {
    if (state.status !== 'down') return;
    const tickId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickId);
  }, [state.status]);

  if (state.status !== 'down') return null;

  const sinceSec = Math.floor((Date.now() - state.firstSeenAt) / 1000);
  const lastSec  = Math.floor((Date.now() - state.lastSeenAt)  / 1000);

  return (
    <div
      // `role="status"` + `aria-live="polite"` (NOT `role="alert"` /
      // `aria-live="assertive"`) so screen readers announce at the
      // next pause instead of aborting the user's current flow.
      // `role="alert"` would imply `aria-live="assertive"` already,
      // so explicit assertive is doubly loud — don't do that.
      role="status"
      aria-live="polite"
      data-testid="backend-status-banner"
      className="fixed top-0 inset-x-0 z-50 bg-red-50 border-b border-red-300 text-red-900 px-4 py-2 text-sm flex items-center justify-between shadow"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <span
          className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0"
          aria-hidden
        />
        <strong className="whitespace-nowrap">Backend unreachable.</strong>
        <span className="whitespace-nowrap">
          {REASON_LABEL[state.reason]}
          {state.httpStatus ? ` (HTTP ${state.httpStatus})` : ''}
        </span>
        <span className="text-red-700 whitespace-nowrap">
          &middot; {state.attemptCount}{' '}
          {state.attemptCount === 1 ? 'attempt' : 'attempts'}
          &middot; first seen {formatElapsed(sinceSec)}
          &middot; most recent {formatElapsed(lastSec)}
        </span>
      </div>
      <button
        type="button"
        onClick={() => location.reload()}
        // `location.reload()` is destructive (clears auth token,
        // scroll, form inputs) — call it what it is. Title discloses
        // the trade-off so a power user is not surprised.
        title="Reload the page — discards in-progress work, re-fires API calls"
        className="ml-4 px-3 py-1 bg-white border border-red-300 rounded text-xs font-medium hover:bg-red-100 flex-shrink-0"
      >
        Reload
      </button>
    </div>
  );
}
