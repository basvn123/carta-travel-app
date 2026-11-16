/*
 * The state parts (G1, house style 2026-11, DESIGN.md "States"): one way to
 * say loading, empty, error and "Not yet" on every screen.
 *
 *   <StateBlock kind="empty" title="No place fits" action={<Button>Clear all</Button>} />
 *   <StateBlock kind="error" title="..." text="..." action={<Button>Try again</Button>} />
 *   <StateBlock kind="loading" />           three blazes painting, announced politely
 *   <Skeleton w="60%" h={18} />              a still band the size of what comes
 *   <NotYet />                               the missing figure, out of every sum
 *   <WorldTile world="water" />              the missing photo: a world tint with a blaze
 *
 * Empty states name the space and give the action; errors say what happened
 * and what to do in one sentence; no apology, no "Error:" prefix.
 */
import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Blaze } from './Blaze.jsx';

export function StateBlock({ kind = 'empty', title, text, action, center = false, className = '' }) {
  const { t } = useI18n();
  const cls = ['hs-state', `is-${kind}`, center && 'is-center', className].filter(Boolean).join(' ');
  if (kind === 'loading') {
    return (
      <div className={cls} role="status" aria-live="polite">
        <span className="hs-wait" aria-hidden="true"><Blaze size="sm" /><Blaze size="sm" /><Blaze size="sm" /></span>
        <span className="sr-only">{title || t('state.loading')}</span>
      </div>
    );
  }
  return (
    <div className={cls} role={kind === 'error' ? 'alert' : undefined}>
      {kind === 'empty' && <Blaze size="lg" state="blank" />}
      {title && <p className="hs-state-title">{title}</p>}
      {text && <p className="hs-state-text">{text}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 16, className = '' }) {
  return <span className={`hs-skeleton ${className}`.trim()} style={{ width: w, height: h }} aria-hidden="true" />;
}

export function NotYet({ className = '' }) {
  const { t } = useI18n();
  return <span className={`hs-notyet ${className}`.trim()}>{t('price.notMeasured')}</span>;
}

export function WorldTile({ world = 'rock', className = '' }) {
  return (
    <span className={`hs-world ${className}`.trim()} data-world={world} aria-hidden="true">
      <Blaze size="lg" state="rest" />
    </span>
  );
}
