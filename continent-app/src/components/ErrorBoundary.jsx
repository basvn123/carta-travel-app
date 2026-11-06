import React from 'react';
import { Button } from './Button.jsx';
import { ErrorBlock } from './StateBlocks.jsx';
import { tOutsideProvider as tr } from '../i18n/index.jsx';
import { reportClientCrash } from '../planner/edgeFailure.js';
import { maybeThrowSeeded } from '../lib/seedError.js';
import { captureError } from '../lib/errorReporter.js';

// Signatures browsers use when a dynamically-imported chunk can't be fetched, // almost always a stale bundle after a redeploy. Safari: "Importing a module
// script failed."; Chrome: "Failed to fetch dynamically imported module";
// Firefox: "error loading dynamically imported module". Vite, for a CSS chunk
// (T1000): "Unable to preload CSS for /assets/...".
const CHUNK_ERROR_RE = /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|unable to preload css/i;
const CHUNK_RELOAD_KEY = 'continent.chunkReloaded.v1';

function isChunkLoadError(error) {
  return CHUNK_ERROR_RE.test(String(error?.message || error || ''));
}

/**
 * Top-level crash guard. A render error anywhere below here would otherwise
 * blank the whole app (React unmounts the tree on an uncaught error); instead
 * we catch it and show a recoverable panel: one sentence that says what
 * happened and what to do, in the language stored on the device. The raw
 * error text goes to the console above and nowhere else (T401); the traveller
 * never reads a stack. "Try again" re-mounts the subtree; "Reload" does a hard
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
        // A stale tab picking up a fresh build is not a crash of this build,
        // and the reload would cut the request off anyway.
        return;
      }
      // If we already reloaded once and it still failed, the chunk is genuinely
      // broken, fall through to the crash panel below instead of looping.
    }

    // The crash panel is about to show. Record that it happened, before the
    // traveller sees it, the way the AI wrappers record a failed call (T071).
    // Fire and forget, never throws; nothing about the error itself is sent.
    reportClientCrash();
    captureError(error, { source: 'boundary', name: 'app' });
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
      <div className="crash-screen">
        <div className="crash-card">
          <h1 className="crash-title">{tr('crash.title')}</h1>
          <ErrorBlock
            message={tr('crash.message')}
            onRetry={() => window.location.reload()}
            retryLabel={tr('crash.reload')}
            retryVariant="primary"
          >
            <Button size="sm" onClick={() => this.setState({ error: null })}>
              {tr('crash.retry')}
            </Button>
          </ErrorBlock>
        </div>
      </div>
    );
  }
}

/**
 * A local crash guard (T1106, H13). Wraps one screen, section or card so a
 * render error in it stays in it: the rest of the app keeps working and the
 * traveller sees one short sentence and, where it helps, "Try again" in the
 * spot where the content was. Same reporting as the top-level guard; the raw
 * error goes to the console only.
 *
 * - `name`: which part it guards. Names the console line and lets the seeded
 *   error helper (lib/seedError.js) target it in tests and `npm run dev`.
 * - `resetKey`: when it changes the boundary clears itself (a new route, a new
 *   trip), so one bad trip does not keep a screen broken for the next.
 * - `compact`: a card-sized message instead of a section-sized one.
 * - A stale-chunk failure is re-thrown on purpose, so the top-level guard
 *   reloads the fresh build once, as before.
 */
export class SectionBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = () => this.setState({ error: null });
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`Section crashed (${this.props.name || 'unnamed'}):`, error, info?.componentStack);
    if (!isChunkLoadError(error)) {
      reportClientCrash();
      captureError(error, { source: 'boundary', name: this.props.name || 'unnamed' });
    }
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    const { name, compact, children } = this.props;
    if (!error) {
      return <>{name ? <SeededThrow name={name} /> : null}{children}</>;
    }
    if (isChunkLoadError(error)) throw error;
    return (
      <div className={`section-crash${compact ? ' is-compact' : ''}`} data-crash-section={name || undefined}>
        <ErrorBlock
          message={tr(compact ? 'crash.card' : 'crash.section')}
          onRetry={this.retry}
          retryLabel={tr('crash.retry')}
        />
      </div>
    );
  }
}

function SeededThrow({ name }) {
  maybeThrowSeeded(name);
  return null;
}
