import React from 'react';

// Signatures browsers use when a dynamically-imported chunk can't be fetched, // almost always a stale bundle after a redeploy. Safari: "Importing a module
// script failed."; Chrome: "Failed to fetch dynamically imported module";
// Firefox: "error loading dynamically imported module".
const CHUNK_ERROR_RE = /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module/i;
const CHUNK_RELOAD_KEY = 'continent.chunkReloaded.v1';

function isChunkLoadError(error) {
  return CHUNK_ERROR_RE.test(String(error?.message || error || ''));
}

/**
 * Top-level crash guard. A render error anywhere below here would otherwise
 * blank the whole app (React unmounts the tree on an uncaught error); instead
 * we catch it, show a recoverable panel, and surface the actual message so it
 * can be reported. "Try again" re-mounts the subtree; "Reload" does a hard
 * refresh (which also picks up a newer build if the crash was a stale bundle).
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reloading: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the details in the console for reporting/debugging.
    console.error('App crashed:', error, info?.componentStack);

    // A stale-bundle chunk failure is recoverable by loading the fresh build.
    // Auto-reload once (guarded against a loop) so the user never has to tap
    // through the crash panel for what is really just an out-of-date tab.
    if (isChunkLoadError(error)) {
      let alreadyReloaded = false;
      try { alreadyReloaded = !!window.sessionStorage.getItem(CHUNK_RELOAD_KEY); } catch {}
      if (!alreadyReloaded) {
        try { window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1'); } catch {}
        this.setState({ reloading: true });
        window.location.reload();
      }
      // If we already reloaded once and it still failed, the chunk is genuinely
      // broken, fall through to the crash panel below instead of looping.
    }
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;

    // Mid-reload for a stale chunk: keep the fallback quiet until the fresh
    // build takes over, rather than flashing the crash panel for a frame.
    if (reloading) {
      return <div className="loading-screen"><div className="pulse" /></div>;
    }
    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <h1 className="crash-title">Something went wrong</h1>
          <p className="crash-lead">
            The app hit an unexpected error. Your trips are saved on this device, so a
            reload usually fixes it.
          </p>
          <pre className="crash-detail">{String(error?.message || error)}</pre>
          <div className="crash-actions">
            <button className="crash-btn primary" onClick={() => window.location.reload()}>
              Reload the app
            </button>
            <button className="crash-btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
