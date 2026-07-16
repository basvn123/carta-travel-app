import React, { useState } from 'react';
import { PlaneIcon, CarIcon } from '../components/TransportIcons.jsx';
import { PLANE_REACH_KM } from '../lib/runtime_pricing.js';

/**
 * What the markers on the browse map mean. The rows change with the travel mode,
 * because the mode changes what a marker can be:
 *
 *   plane - only destinations you can actually fly to are labelled with a price.
 *           Ones you'd have to drive to drop to a hollow dot, so a drive price is
 *           never mistaken for a flight price.
 *   car   - every road-reachable destination is labelled; islands keep a flight
 *           price, since driving there isn't a thing.
 */
export function MapLegend({ transportMode = 'plane', counts = {} }) {
  // Open on a desktop map, folded away on a phone where it would cover it.
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 880,
  );
  const plane = transportMode === 'plane';

  return (
    <div className={`map-legend ${open ? '' : 'is-collapsed'}`}>
      <button
        className="legend-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? 'Hide the legend' : 'Show the legend'}
      >
        <span>Legend</span>
        <span className="legend-chev">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="legend-body">
          <div className="legend-row">
            <span className="legend-pill"><PlaneIcon size={10} /><i>€000</i></span>
            <span className="legend-text">
              <b>Flight</b>
              <em>Airport within {PLANE_REACH_KM} km; last leg by shuttle or rental car</em>
            </span>
          </div>

          {plane ? (
            <div className="legend-row">
              <span className="legend-swatch"><i className="pin-dot is-caronly" /></span>
              <span className="legend-text">
                <b>No flight{counts.carOnly ? ` (${counts.carOnly})` : ''}</b>
                <em>Drivable, but no Ryanair airport near it. Switch to Travel by car to price it</em>
              </span>
            </div>
          ) : (
            <div className="legend-row">
              <span className="legend-pill"><CarIcon size={10} /><i>€000</i></span>
              <span className="legend-text">
                <b>Drive</b>
                <em>Fuel + tolls in your own car, there and back</em>
              </span>
            </div>
          )}

          <div className="legend-row">
            <span className="legend-swatch"><i className="pin-dot is-unreach" /></span>
            <span className="legend-text">
              <b>Unreachable{counts.unreachable ? ` (${counts.unreachable})` : ''}</b>
              <em>No Ryanair flight and too far to drive</em>
            </span>
          </div>

          <div className="legend-sep" />

          <div className="legend-row">
            <span className="legend-pill is-deal"><i>€000</i></span>
            <span className="legend-text"><b>Deal</b><em>Cheapest 25% of what's on screen</em></span>
          </div>
          <div className="legend-row">
            <span className="legend-pill is-gem"><i>€000</i></span>
            <span className="legend-text"><b>Hidden gem</b><em>A town, not an airport city</em></span>
          </div>
        </div>
      )}
    </div>
  );
}
