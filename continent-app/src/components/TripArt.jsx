import React from 'react';
import '../styles/98-trip-art.css';

/*
 * TripArt (T990): what stands where a trip has no photograph yet, and on the
 * empty My trips tabs and the signed-out Together page. Not a picture: map
 * geometry. Contour lines, a dashed route with its start and end, on one of
 * three Carta grounds (umber, lagoon, ink) picked from the seed, so a list of
 * new trips is not one brown wall. An icon, when given, sits on a light disc
 * in the middle. Purely decorative: the words beside it carry the meaning.
 *
 *   seed       any string (a trip id): the same trip keeps the same ground
 *   tone       'umber' | 'lagoon' | 'ink', overrides the seed
 *   icon       optional element for the disc
 *   compact    a small thumbnail: no contours, the route only
 */
const TONES = ['umber', 'lagoon', 'ink'];

function toneOf(seed) {
  const n = [...String(seed || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return TONES[n % TONES.length];
}

// One closed contour, scaled around its own centre for each ring.
const RING = 'M40 120 C 38 74, 112 48, 150 86 S 136 170, 86 164 S 42 150, 40 120 Z';
const RINGS = [1, 0.76, 0.52, 0.3];

export function TripArt({ seed = '', tone = null, icon = null, compact = false, className = '' }) {
  const t = tone || toneOf(seed);
  return (
    <span className={`trip-art is-${t}${compact ? ' is-compact' : ''} ${className}`.trim()} aria-hidden="true">
      <svg className="trip-art-svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        {!compact && (
          <g className="trip-art-contours">
            {RINGS.map((k) => (
              <path key={k} d={RING} transform={`translate(96 112) scale(${k}) translate(-96 -112)`} />
            ))}
            {RINGS.slice(0, 3).map((k) => (
              <path key={`b${k}`} d={RING} transform={`translate(176 18) scale(${k * 0.7}) translate(-96 -112)`} />
            ))}
          </g>
        )}
        <path className="trip-art-route" pathLength="1" d="M18 178 C 58 160, 62 118, 104 122 S 150 70, 182 34" />
        <circle className="trip-art-from" cx="18" cy="178" r={compact ? 9 : 6} />
        <circle className="trip-art-to" cx="182" cy="34" r={compact ? 11 : 7} />
      </svg>
      {icon && <span className="trip-art-disc">{icon}</span>}
    </span>
  );
}
