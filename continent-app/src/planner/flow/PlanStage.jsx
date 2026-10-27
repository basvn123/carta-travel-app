import React from 'react';
import { IconButton } from '../../components/ui/index.js';
import { ArrowLeftIcon, CloseIcon } from '../../components/Icons.jsx';

/**
 * PlanStage (T654, T748): the planner's one layout. The step sits on the
 * Plan place's warm paper: straight on it on a phone, on a white card
 * centred on the page from 769 px. T654 put a map of Europe behind it; it
 * showed no stops on any step, so T748 took it out (owner 2026-10-27).
 *
 *   bar       round buttons, top right (settings, share)
 *   wide      a wider card on desktop, for steps that hold a list of places
 */
export function PlanStage({ bar = null, wide = false, sheetLabel, children }) {
  return (
    <div className={`pf-stage${wide ? ' is-wide' : ''}`}>
      {bar && <div className="pf-bar">{bar}</div>}
      <section className="pf-sheet" aria-label={sheetLabel}>
        {children}
      </section>
    </div>
  );
}

/**
 * The head of a step on the sheet: a round back control on the left, the
 * position in the middle, a close on the right (Polarsteps' question sheet).
 * Either side may be absent; the middle stays centred.
 */
export function SheetHead({ onBack, backLabel, onClose, closeLabel, position = '' }) {
  return (
    <div className="pf-head">
      <span className="pf-head-side">
        {onBack && (
          <IconButton tone="surface" label={backLabel} onClick={onBack} className="pf-round">
            <ArrowLeftIcon size={18} />
          </IconButton>
        )}
      </span>
      <span className="pf-head-pos">{position}</span>
      <span className="pf-head-side is-end">
        {onClose && (
          <IconButton tone="surface" label={closeLabel} onClick={onClose} className="pf-round">
            <CloseIcon size={16} />
          </IconButton>
        )}
      </span>
    </div>
  );
}
