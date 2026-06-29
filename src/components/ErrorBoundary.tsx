// ============================================================
// ErrorBoundary.tsx — class-component React error boundary
// ============================================================
// Wraps <Login /> (and any other public route that can explode mid-
// render). When a render-phase/constructor/lifecycle error is thrown
// inside the wrapped subtree, this boundary catches it and renders
// a clean, branded fallback instead of:
//   - leaving the user staring at a blank/crashed page
//   - surfacing a cryptic error.message
//   - unmounting the AuthProvider/AuthContext above it
//
// Notes on scope:
// - React requires error boundaries to be a class component
//   (static getDerivedStateFromError/componentDidCatch are class-only;
//   no functional equivalent at the React core level).
// - This boundary does NOT catch:
//     * event handlers in children — those need their own try/catch
//     * async errors not re-thrown inside render
//     * errors thrown inside the boundary itself (its own fallback)
//   Those are intentional and documented in the fallback UI.
// - The full component stack is only shown in development to avoid
//   leaking implementation/file paths to end users in production.
// ============================================================
import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Override the headline shown in the fallback UI. */
  title?: string;
  /** Override the friendly subtitle explaining what happened. */
  description?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  // Called during the render phase; must be a pure state update so
  // React can re-render the fallback UI before any side effects.
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  // Called after the fallback is committed. Used for logging and to
  // stash the component stack into state so the rendered fallback can
  // show it (in dev only).
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught render-phase error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  // Reset internal error state so children re-render fresh.
  // Bound as an arrow property so it's safe to pass directly to onClick.
  reset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const { error, errorInfo } = this.state;
    const { title, description } = this.props;

    // Show the component stack only in development so prod users never
    // see file paths or framework internals.
    const isDev =
      typeof import.meta !== 'undefined' &&
      Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div
          role="alert"
          aria-live="assertive"
          className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20 text-center"
        >
          <div className="bg-red-500/20 p-4 rounded-2xl inline-block mb-5">
            <AlertCircle size={48} className="text-red-300" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {title ?? 'Something went wrong'}
          </h1>
          <p className="text-blue-200 mb-6">
            {description ?? "We couldn't load this page. Please try again, or reload if the issue persists."}
          </p>

          {(error || (isDev && errorInfo)) && (
            <details className="text-left mb-6 bg-black/20 rounded-xl border border-white/10 p-4">
              <summary className="cursor-pointer text-blue-200 text-sm font-medium select-none">
                Technical details
              </summary>
              <div className="mt-3 text-red-200/80 text-xs font-mono space-y-2 break-words">
                {error?.name && (
                  <div>
                    <span className="text-blue-300">Type:</span> {error.name}
                  </div>
                )}
                {error?.message && (
                  <div>
                    <span className="text-blue-300">Message:</span> {error.message}
                  </div>
                )}
                {isDev && errorInfo?.componentStack && (
                  <div>
                    <span className="text-blue-300">Stack:</span>
                    <pre className="whitespace-pre-wrap mt-1 text-[11px] leading-snug">
                      {errorInfo.componentStack.slice(0, 800)}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={this.reset}
              autoFocus
              className="flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-xl transition-all"
            >
              <RefreshCw size={16} /> Try Again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl border border-white/20 transition-all"
            >
              <RefreshCw size={16} /> Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
