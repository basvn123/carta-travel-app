import React, { Suspense, lazy } from 'react';
import { IconButton } from '../../components/ui/index.js';
import { ArrowLeftIcon, CloseIcon } from '../../components/Icons.jsx';

// The map is the stage's backdrop, not its content: loaded after the sheet,
// and the sheet works without it.
const TripMap = lazy(() => import('../../map/TripMap.jsx').then((m) => ({ default: m.TripMap })));

/**
 * PlanStage (T654): the planner's one layout, after the Polarsteps planner.
 * A map of Europe (or of the trip so far) fills the screen, and the step
 * sits on a white sheet in front of it: on a phone the sheet rises from the
 * bottom over the lower part of the map with a grab handle; from 769 px it is
 * a card standing on the left of the map. The map is decoration here, so it
 * is hidden from assistive tech and takes no pointer.
 *
 *   bar       round buttons over the map, top right (settings, share)
 *   stops     the trip's stops, drawn on the map when there are any
 *   wide      a wider card on desktop, for steps that hold a list of places
 */
export function PlanStage({ bar = null, stops = [], wide = false, sheetLabel, children }) {
  return (
    <div className={`pf-stage${wide ? ' is-wide' : ''}`}>
      <div className="pf-map" aria-hidden="true">
        <Suspense fallback={<div className="pf-map-still" />}>
          <TripMap
            stops={stops}
            basemap="record"
            scrollZoom={false}
            showRoute={stops.length > 1}
            padBottom={0}
            easeToSelected={false}
          />
        </Suspense>
      </div>
      {bar && <div className="pf-bar">{bar}</div>}
      <section className="pf-sheet" aria-label={sheetLabel}>
        <span className="pf-handle" aria-hidden="true" />
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
