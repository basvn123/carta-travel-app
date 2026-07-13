import React from 'react';

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
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the details in the console for reporting/debugging.
    console.error('App crashed:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
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
