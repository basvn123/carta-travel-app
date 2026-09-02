import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { count } from '../lib/format.js';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { loadCycling } from '../lib/cycling.js';
import { loadCycleFamily, loadCycleRoute, loadCycleTour, gpxCredit }
  from '../lib/cycling.js';
import {
  agreementLine, bailoutLine, bikeLine, countryPhrase, listedLine, overnightLine, paceLine, safetyLine, seasonLine, stageLine, surfaceLine, trafficFreeLine, whyLines,
} from '../lib/cycleStory.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  ArrowLeftIcon, CameraIcon, BikeIcon, TrainIcon, ClockIcon,
} from '../components/Icons.jsx';

/**
 * The cycling page: one route, or one tour composed over routes.
 *
 * A TOUR is the thing worth opening, and this page is built around the
 * question a tour has to answer that no incumbent answers: what is each day,
 * where does it end, and is there a bed there. So the stage list is not a
 * summary underneath the photograph, it is the page. Every figure on it was
 * measured on that day's own slice of the route, not inherited from the route
 * as a whole, which is why "day three is 84 km with 620 m of climbing, ending
 * at Kinlochleven where fourteen places take a booking, and the nearest
 * station is 18 km away" is a sentence this app can write and a generated
 * itinerary cannot.
 *
 * A ROUTE is the catalogue entry underneath: the line, what it is surfaced
 * with, how much traffic is on it, and whether the official source draws the
 * same line we do.
 *
 * Three things this page is careful about.
 *
 *   A listed route has no score, so there is no score chip and no scenic
 *   figure, and the card says why in one line. The wire omits the key; this
 *   never invents one back (invariant 9).
 *
 *   The GPX carries its own credit. A rendered map is a produced work and may
 *   be licensed freely; a GPX export is a database extract and ODbL travels
 *   with it, so the download writes the attribution into the file's own
 *   <copyright> and <desc> rather than relying on a footer somewhere else.
 *
 *   The safety figure is named as a house measure out loud. The ECF's own
 *   OSM-based methodology computes infrastructure ratios and deliberately
 *   declines to define a safety score, so there is no standard being claimed.
 *
 * No maplibre here, the same call the beach, lake and mountain pages make:
 * this is opened from a list and read on a phone, and a map library to draw
 * one line would be the heaviest thing on the page. The line is drawn as an
 * inline SVG from the geometry already in the wire.
 */

// The month names the mountain layer already ships in all six languages.
// A seventh copy of "January" would only be a seventh thing to translate.
const MONTHS = ['mtn.monthJan', 'mtn.monthFeb', 'mtn.monthMar', 'mtn.monthApr',
  'mtn.monthMay', 'mtn.monthJun', 'mtn.monthJul', 'mtn.monthAug',
  'mtn.monthSep', 'mtn.monthOct', 'mtn.monthNov', 'mtn.monthDec'];

/** The route line as an inline path, fitted to a 320x120 box. */
function linePath(geometry, w = 320, h = 120, pad = 6) {
  const parts = geometry && geometry.type === 'MultiLineString'
    ? geometry.coordinates
    : geometry && geometry.type === 'LineString' ? [geometry.coordinates] : [];
  const pts = parts.flat();
  if (pts.length < 2) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // Latitude degrees are longer than longitude degrees away from the equator,
  // so a raw lon/lat box draws Scotland squashed. One cosine keeps it honest.
  const kx = Math.cos(((minY + maxY) / 2) * Math.PI / 180) || 1;
  const spanX = Math.max(1e-6, (maxX - minX) * kx);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const ox = (w - spanX * scale) / 2;
  const oy = (h - spanY * scale) / 2;
  const px = (x) => ox + (x - minX) * kx * scale;
  const py = (y) => h - (oy + (y - minY) * scale);
  return parts
    .filter((part) => part.length > 1)
    .map((part) => part
      .map(([x, y], i) => `${i ? 'L' : 'M'}${px(x).toFixed(1)} ${py(y).toFixed(1)}`)
      .join(''))
    .join(' ');
}

/** Build a GPX with the credit inside the file, and hand it to the browser. */
function downloadGpx(route) {
  const credit = gpxCredit(route);
  const geometry = (route.osm && route.osm.geometry) || null;
  const parts = geometry && geometry.type === 'MultiLineString'
    ? geometry.coordinates
    : geometry && geometry.type === 'LineString' ? [geometry.coordinates] : [];
  if (!parts.length) return;
  const esc = (s) => String(s || '').replace(/[<>&]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const segs = parts.map((part) => (
    `  <trkseg>\n${part
      .map(([lon, lat]) => `   <trkpt lat="${lat}" lon="${lon}"/>`)
      .join('\n')}\n  </trkseg>`
  )).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Carta" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata>
  <name>${esc(route.name)}</name>
  <desc>${esc(credit.author)}</desc>
  <copyright author="${esc(credit.author)}">
   ${credit.licenseUrl ? `<license>${esc(credit.licenseUrl)}</license>` : ''}
  </copyright>
 </metadata>
 <trk>
  <name>${esc(route.name)}</name>
  <desc>${esc(credit.author)}</desc>
${segs}
 </trk>
</gpx>`;
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(route.name || 'route').replace(/[^\w-]+/g, '_')}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function Photos({ images }) {
  if (!images || !images.length) return null;
  return (
    <div className="cycle-gallery" data-testid="cycle-gallery">
      {images.slice(0, 6).map((img) => (
        <figure key={img.url} className="cycle-shot">
          <img src={img.thumb || img.url} alt={img.title || ''} loading="lazy" />
          <figcaption>
            <CameraIcon size={12} />
            {' '}
            {[img.author, img.license].filter(Boolean).join(', ')}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Stages({ stages, t }) {
  if (!stages || !stages.length) return null;
  return (
    <ol className="cycle-stages" data-testid="cycle-stages">
      {stages.map((s) => (
        <li key={s.d} className="cycle-stage" data-testid="cycle-stage">
          <p className="cycle-stage-day">{`${t('cycle.stagesTitle')} ${s.d}`}</p>
          <p className="cycle-stage-line">{stageLine(s, t)}</p>
          <p className="cycle-stage-sleep">{overnightLine(s.to, t)}</p>
          <p className="cycle-stage-meta">
            {[
              s.paved_share != null
                && `${Math.round(s.paved_share * 100)}% ${t('cycle.surfaceAllPaved').toLowerCase()}`,
              s.traffic_free_share != null
                && trafficFreeLine({ traffic_free_share: s.traffic_free_share }, t),
              s.safety != null && safetyLine({ score: s.safety, known_share: 1 }, t),
            ].filter(Boolean).join(', ')}
          </p>
          <p className="cycle-stage-bail">
            <TrainIcon size={12} />
            {' '}
            {bailoutLine(s.bailout, t)}
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * A EUROVELO FAMILY is its own kind of page and therefore its own component.
 * In OSM a EuroVelo is one relation PER COUNTRY SECTION under a superroute,
 * so this is a manifest of the sections that make one continental route up,
 * not a route: there is no geometry to draw, no score, and none of the route
 * page's hooks apply. Folding it into CyclePage as an early return broke the
 * rules of hooks, which was the design telling us it is a different thing.
 */
export function CycleFamilyPage({ familyRef, onClose }) {
  const { t } = useI18n();
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadCycleFamily(familyRef).then((got) => {
      if (!live) return;
      setFamily(got);
      setLoading(false);
    });
    return () => { live = false; };
  }, [familyRef]);

  // A EUROVELO FAMILY is its own kind of page: a manifest of the country
  // sections that make one continental route up, not a route itself. It
  // renders before the route branch because there is no geometry to draw and
  // nothing below this point applies to it.
    return (
      <div className="cycle-page" data-testid="cycle-family-page">
        <button type="button" className="cycle-close" onClick={onClose}
                aria-label={t('common.close')}>{'×'}</button>
        {loading && <p className="places-empty">{'…'}</p>}
        {!loading && !family && <p className="places-empty">{t('cycle.familyGone')}</p>}
        {!loading && family && (
          <>
            <h2 className="cycle-title">{family.ref}</h2>
            <p className="cycle-sub">
              {t('cycle.familySummary', {
                km: count(family.km),
                sections: family.n_sections,
                countries: countryPhrase(family.countries.length, t),
              })}
            </p>
            {family.ecf_agreement != null && (
              <p className="cycle-note">
                {t('cycle.familyEcf',
                   { pct: Math.round(family.ecf_agreement * 100) })}
              </p>
            )}
            <p className="places-bandhead">{t('cycle.familySections')}</p>
            <ul className="cycle-famlist">
              {(family.sections || []).map((sec) => (
                <li key={sec.id} className="cycle-famitem">
                  <CountryFlag cc={sec.cc} />
                  <span className="cycle-famitem-name">
                    {sec.name || `${sec.cc} ${sec.km} km`}
                  </span>
                  <span className="cycle-famitem-km">{sec.km} km</span>
                  {!sec.published && (
                    <span className="cycle-famitem-un">
                      {t('cycle.familyUnpublished')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="cycle-credit">{family.attribution}</p>
          </>
        )}
      </div>
    );
}


export function CyclePage({ routeId, tourSlug, country, countryName,
                            onClose, onOpenNeighbour }) {
  const { t } = useI18n();
  const [route, setRoute] = useState(null);
  const [tour, setTour] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const jobs = [
      tourSlug ? loadCycleTour(tourSlug) : Promise.resolve(null),
      routeId ? loadCycleRoute(routeId) : Promise.resolve(null),
    ];
    Promise.all(jobs).then(([gotTour, gotRoute]) => {
      if (!live) return;
      setTour(gotTour);
      // A tour opened on its own still wants its first route's surface and
      // credit, which is where the geometry and the licence actually live.
      if (!gotRoute && gotTour && (gotTour.routes || []).length) {
        loadCycleRoute(gotTour.routes[0]).then((r) => { if (live) setRoute(r); });
      } else {
        setRoute(gotRoute);
      }
      setLoading(false);
    });
    return () => { live = false; };
  }, [routeId, tourSlug]);

  // The country-file row carries the cross-layer nb ids; the detail file
  // does not. Cached fetch, usually already warm from the list the reader
  // came from.
  const [wireRow, setWireRow] = useState(null);
  useEffect(() => {
    let live = true;
    if (!country) { setWireRow(null); return undefined; }
    loadCycling(country).then((d) => {
      if (!live || !d) return;
      const want = tourSlug || routeId;
      const hit = tourSlug
        ? (d.tours || []).find((x) => x.slug === tourSlug)
        : [...d.routes, ...d.listed].find((x) => String(x.id) === String(routeId));
      if (hit && want) setWireRow(hit);
    });
    return () => { live = false; };
  }, [country, routeId, tourSlug]);

  const monthName = useMemo(() => (m) => t(MONTHS[(m - 1) % 12]), [t]);

  const carta = (route && route.carta) || {};
  const path = useMemo(
    () => linePath((tour && tour.geometry) || (route && route.osm && route.osm.geometry)),
    [tour, route],
  );
  const why = useMemo(() => whyLines(carta.reasons, t), [carta.reasons, t]);
  const rated = Boolean(route && route.t === 'r');

  return (
    <div className="cycle-page" data-testid="cycle-page">
      <header className="cycle-head">
        <button type="button" className="cycle-back" onClick={onClose}>
          <ArrowLeftIcon size={16} />
        </button>
        <div className="cycle-title">
          <h1 data-testid="cycle-name">
            {(tour && tour.title) || (route && route.name) || '…'}
          </h1>
          <p className="cycle-sub">
            <CountryFlag cc={(tour && tour.country) || (route && route.country) || country} />
            {' '}
            {countryName}
            {route && route.ref ? `, ${route.ref}` : ''}
          </p>
        </div>
        {rated && carta.score != null && (
          <span data-testid="cycle-score"><ScoreChip rating={carta.score} /></span>
        )}
      </header>

      {loading && <p className="places-empty">{'…'}</p>}

      {!loading && !route && !tour && (
        <p className="places-empty">{t('cycle.emptyCountry')}</p>
      )}

      {path && (
        <svg className="cycle-line" viewBox="0 0 320 120" role="img"
          aria-label={t('cycle.openRoute')} data-testid="cycle-line">
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}

      {tour && (
        <section className="cycle-tour" data-testid="cycle-tour">
          <p className="cycle-facts">
            <ClockIcon size={13} />
            {' '}
            {t('cycle.days', { n: tour.days })}
            {', '}
            {`${Math.round(tour.km)} km`}
            {tour.asc != null ? `, ${tour.asc} m` : ''}
          </p>
          <p className="cycle-pace">{paceLine(tour.pace, t)}</p>
          <p className="cycle-bike">
            <BikeIcon size={13} />
            {' '}
            {bikeLine(tour.bike, t)}
          </p>
          {seasonLine(tour.season, t, monthName) && (
            <p className="cycle-season" data-testid="cycle-season">
              {seasonLine(tour.season, t, monthName)}
            </p>
          )}
          <h2>{t('cycle.stagesTitle')}</h2>
          <Stages stages={tour.stages} t={t} />
          {tour.checks && (
            <details className="cycle-checks" data-testid="cycle-checks">
              <summary>{t('cycle.checksTitle')}</summary>
              <p>{t('cycle.checksNote')}</p>
              <ul>
                {(tour.checks.passed || []).map((c) => <li key={c}>{c}</li>)}
              </ul>
            </details>
          )}
        </section>
      )}

      {route && (
        <section className="cycle-route" data-testid="cycle-route">
          {!rated && <p className="cycle-unrated">{listedLine(t)}</p>}
          {why.length > 0 && (
            <>
              <h2>{t('cycle.whyTitle')}</h2>
              <ul className="cycle-why" data-testid="cycle-why">
                {why.map((line) => <li key={line.text}>{line.text}</li>)}
              </ul>
            </>
          )}

          <h2>{t('cycle.safetyTitle')}</h2>
          <p className="cycle-surface" data-testid="cycle-surface">
            {surfaceLine(carta.surface, t)}
          </p>
          {trafficFreeLine(carta.surface, t) && (
            <p className="cycle-free">{trafficFreeLine(carta.surface, t)}</p>
          )}
          {bikeLine(carta.surface && carta.surface.bike, t) && (
            <p className="cycle-bike">{bikeLine(carta.surface.bike, t)}</p>
          )}
          <p className="cycle-safety" data-testid="cycle-safety">
            {safetyLine(carta.safety, t)}
          </p>
          <p className="cycle-safety-note">{t('cycle.safetyHouse')}</p>
          {agreementLine(carta.agreement, t) && (
            <p className="cycle-agree" data-testid="cycle-agree">
              {agreementLine(carta.agreement, t)}
            </p>
          )}

          <Photos images={carta.images} />

          <button type="button" className="cycle-gpx" data-testid="cycle-gpx"
            onClick={() => downloadGpx(route)}>
            {t('cycle.gpx')}
          </button>
          {wireRow && (
            <NearbyOutdoors
              row={wireRow}
              cc={country}
              headings={{ trail: 'nb.cycle.trail', peak: 'nb.cycle.peak', lake: 'nb.cycle.lake', beach: 'nb.cycle.beach' }}
              onOpen={onOpenNeighbour}
            />
          )}

          <p className="places-credit" data-testid="cycle-credit">
            {(route.osm && route.osm.attribution) || t('cycle.sourceNote')}
          </p>
          <p className="places-credit">{t('cycle.sourceNote')}</p>
        </section>
      )}
    </div>
  );
}

export default CyclePage;
