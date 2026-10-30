import React from 'react';
import { Button, Chip, ChipGroup } from '../components/ui/index.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { ArrowRightIcon, ExternalIcon, MapPinIcon } from '../components/Icons.jsx';
import { mapsSearchUrl } from '../lib/destInfo.js';
import { safeUrl } from '../lib/format.js';
import { activityLink } from '../lib/activityAffiliates.js';
import { poiLabelWord } from '../lib/rating.js';
import { featureHref, linkOpener } from '../lib/featureHref.js';
import { minutesText } from '../lib/journeys.js';
import { MemberPlaces } from './MemberPlaces.jsx';
import { DestTrack } from './DestTrack.jsx';
import { OutdoorTile } from './DestTiles.jsx';
import { DestRouteGpx } from './DestRouteGpx.jsx';
import { PSection, PBlock } from './PageTemplate.jsx';
import { cleanName, fmtKm, thumb500 } from './destParts.js';

const DestMap = React.lazy(() => import('./DestMap.jsx'));

/**
 * The place page's What to see and Around sections (T912, the owner's
 * approved one-page spec, 2026-10-30; was the Nearby tab, T499).
 *
 * What to see: the sights as a numbered list (a photograph or a pin glyph,
 * the kind and the distance from the centre), the same numbers on the map
 * beside it from 700 px; "A day on foot" from d.walk (the stops in walking
 * order, the minutes between them, the length and the hours with the
 * visits); then the things to do, as a plain list.
 *
 * Around: the day trips (score, time and the way), the kinds of outdoor
 * place in reach with their counts as choice chips over a track of tiles,
 * the route files (GPX) and, inside an area, its villages.
 *
 * Nothing here prints a missing value: a row without data is left out, a
 * kind with nothing in reach is not named (the owner removed "No peak, lake
 * or beach within 20 km", 2026-10-30).
 */
const SIGHTS_FIRST = 7;
const DO_FIRST = 6;

function Thumb({ src }) {
  const [bad, setBad] = React.useState(false);
  if (!src || bad) {
    return <span className="pt-thumb is-blank" aria-hidden="true"><MapPinIcon size={18} /></span>;
  }
  return <img className="pt-thumb" src={src} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} />;
}

/** "A day on foot": the walk's stops with the minutes between them. */
function OnFoot({ walk, t, lang }) {
  const stops = (walk?.stops || []).filter((s) => s?.name);
  if (stops.length < 2) return null;
  const n1 = (v) => Number(v).toLocaleString(lang, { maximumFractionDigits: 1 });
  const sum = Number.isFinite(walk.km) && Number.isFinite(walk.visit_h)
    ? t('destx.onFootSum', { km: n1(walk.km), h: n1(walk.visit_h) })
    : Number.isFinite(walk.km) ? t('destx.onFootKm', { km: n1(walk.km) }) : '';
  return (
    <PBlock title={t('destx.onFoot')} className="pt-onfoot">
      <ol className="pt-steps">
        {stops.map((s, i) => (
          <li key={s.id || `${i}:${s.name}`}>
            {i > 0 && Number.isFinite(s.min) && (
              <span className="pt-step-gap">
                <span className="sr-only">{t('destx.walkThen', { n: Math.round(s.min) })}</span>
                <span aria-hidden="true">{`${Math.round(s.min)} min`}</span>
                <ArrowRightIcon size={12} />
              </span>
            )}
            <b>{cleanName(s.name)}</b>
          </li>
        ))}
      </ol>
      {sum && <p className="pt-muted">{sum}</p>}
    </PBlock>
  );
}

export function DestSee({ p }) {
  const { t, lang, city, lat, lon, highlights, doRows, scrollRef, d } = p;
  const [allSights, setAllSights] = React.useState(false);
  const [allDo, setAllDo] = React.useState(false);
  const [focus, setFocus] = React.useState(null);
  const [hover, setHover] = React.useState(null);
  const slotRef = React.useRef(null);
  // The map mounts when its slot comes near the view (T429): it would
  // otherwise hold a WebGL context for a part nobody has scrolled to.
  const [mapOn, setMapOn] = React.useState(false);
  const hasMap = highlights.some((h) => h.lat != null) || (lat != null && lon != null);
  React.useEffect(() => {
    if (mapOn || !hasMap) return undefined;
    const el = slotRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver !== 'function') { setMapOn(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setMapOn(true); io.disconnect(); }
    }, { root: scrollRef.current, rootMargin: '300px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [mapOn, hasMap, scrollRef]);

  const walk = d?.walk || null;
  const hasWalk = (walk?.stops || []).filter((s) => s?.name).length >= 2;
  if (!highlights.length && !doRows.length && !hasWalk) return null;

  const sights = allSights ? highlights : highlights.slice(0, SIGHTS_FIRST);
  const dos = allDo ? doRows : doRows.slice(0, DO_FIRST);
  return (
    <PSection id="pt-see" title={t('destx.jump.see')}>
      {highlights.length > 0 && (
        <div className={`pt-see${hasMap ? ' has-map' : ''}`}>
          <ol className="pt-sights">
            {sights.map((h, i) => (
              <li key={h.id || `${i}:${h.name}`}
                className={`${focus === i ? 'is-focus' : ''}${hover === i ? ' is-hover' : ''}`.trim() || undefined}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((c) => (c === i ? null : c))}>
                <span className="pt-num" aria-hidden="true">{i + 1}</span>
                <Thumb src={thumb500(h.image?.url) || h.photo || null} />
                <span className="pt-sight-text">
                  <b>{h.name}</b>
                  <small>
                    {[
                      h.label ? poiLabelWord(t, h.label) : null,
                      h.kind && lang === 'en' ? h.kind : null,
                      h.dist_km != null ? t('destx.fromCentre', { km: fmtKm(h.dist_km) }) : null,
                    ].filter(Boolean).join(', ')}
                  </small>
                </span>
              </li>
            ))}
          </ol>
          {hasMap && (
            <div className="pt-mapbox" ref={slotRef}>
              {mapOn ? (
                <React.Suspense fallback={<div className="place-map place-map-wait dmap" />}>
                  <DestMap
                    place={{ lat, lon, name: city }}
                    highlights={highlights}
                    active="highlights"
                    focus={focus}
                    hover={hover}
                    onHoverHighlight={setHover}
                    height={340}
                    onPickHighlight={(i) => { setFocus(i); if (i >= SIGHTS_FIRST) setAllSights(true); }}
                  />
                </React.Suspense>
              ) : <div className="place-map place-map-wait dmap" />}
              {lat != null && lon != null && (
                <a className="pt-maplink" href={mapsSearchUrl(lat, lon)} target="_blank" rel="noreferrer">
                  <ExternalIcon size={14} />
                  <span>{t('explore.openMaps')}</span>
                </a>
              )}
            </div>
          )}
        </div>
      )}
      {highlights.length > SIGHTS_FIRST && (
        <Button variant="secondary" size="sm" className="pt-more" aria-expanded={allSights}
          onClick={() => setAllSights((v) => !v)}>
          {allSights ? t('dest.showLess') : t('destx.showAllSights', { n: highlights.length })}
        </Button>
      )}

      <OnFoot walk={walk} t={t} lang={lang} />

      {doRows.length > 0 && (
        <PBlock title={t('dest.doTitle')} className="pt-do">
          <ul className="pt-dolist">
            {dos.map((item) => {
              const href = item.link && safeUrl(item.link) ? activityLink(safeUrl(item.link), 'dest-do') : null;
              return (
                <li key={item.key}>
                  <Thumb src={item.photo} />
                  <span className="pt-sight-text">
                    <b>{href ? <a href={href} target="_blank" rel="noreferrer">{item.name}</a> : item.name}</b>
                    {item.detail && lang === 'en' && <small>{item.detail}</small>}
                  </span>
                </li>
              );
            })}
          </ul>
          {doRows.length > DO_FIRST && (
            <Button variant="quiet" size="sm" className="pt-more" aria-expanded={allDo} onClick={() => setAllDo((v) => !v)}>
              {allDo ? t('dest.showLess') : t('rail.seeAllPlain')}
            </Button>
          )}
        </PBlock>
      )}
    </PSection>
  );
}

/** A day trip: a catalogue place (a link to its page) or a composed trip. */
function TripRow({ tr, t, onSelect, onOpenItin }) {
  const itin = tr.kind === 'composed_trip';
  const href = itin ? null : featureHref('dest', tr);
  const open = itin ? () => onOpenItin?.(tr.id) : linkOpener(() => onSelect?.(tr.id));
  const time = Number.isFinite(tr.travel?.minutes) ? minutesText(tr.travel.minutes) : null;
  const line = itin ? t('dest.tripDays', { n: tr.days || 0 })
    : [
      time && tr.travel?.mode ? t('destx.tripBy', { time, mode: t(`mode.${tr.travel.mode}`) }) : time,
      tr.dist_km != null ? `${tr.dist_km} km` : null,
    ].filter(Boolean).join(', ');
  const name = cleanName(tr.name);
  return (
    <li className="pt-trip">
      {href
        ? <a className="pt-trip-name" href={href} onClick={open}>{name}</a>
        : <Button variant="quiet" size="sm" className="pt-trip-name" onClick={open}>{name}</Button>}
      {tr.rating?.score != null && <ScoreChip rating={tr.rating} size="sm" />}
      {line && <small>{line}</small>}
    </li>
  );
}

export function DestAround({ p }) {
  const {
    t, city, cats, aroundKey, setAroundKey, aroundKm, routeRows, members, memberFocus,
    onOpenFeature, onSelect, onOpenItin,
  } = p;
  const trips = cats.find((c) => c.key === 'trips');
  const kinds = cats.filter((c) => c.key !== 'trips' && c.count > 0);
  const cur = kinds.find((c) => c.key === aroundKey) || kinds[0] || null;
  const gpx = [...(routeRows?.hiking || []), ...(routeRows?.cycling || [])]
    .some((r) => Number.isInteger(Number(r.id)) && r.name);
  if (!trips?.count && !kinds.length && !gpx && !members?.length) return null;
  return (
    <PSection id="pt-around" title={t('dest.aroundTitle', { city })}
      note={kinds.length ? t('destx.aroundNote', { km: aroundKm }) : null}>
      {trips?.count > 0 && (
        <PBlock title={t('dest.aroundKind.trips')}>
          <ul className="pt-trips">
            {trips.rows.map((tr) => <TripRow key={tr.key} tr={tr} t={t} onSelect={onSelect} onOpenItin={onOpenItin} />)}
          </ul>
        </PBlock>
      )}
      {cur && (
        <DestTrack
          key={cur.key}
          id="pt-around-track"
          level={3}
          title={t(`dest.aroundKind.${cur.key}`)}
          lead={(
            <ChipGroup label={t('dest.aroundChipsAria', { city })} className="pt-counts">
              {kinds.map((c) => (
                <Chip key={c.key} kind="choice" selected={c.key === cur.key} onClick={() => setAroundKey(c.key)}>
                  {t(`dest.aroundKind.${c.key}`)}
                  <span className="pt-count-n">{c.count}</span>
                </Chip>
              ))}
            </ChipGroup>
          )}
          items={cur.rows}
          t={t}
          render={(row) => <OutdoorTile f={row} t={t} onOpenFeature={onOpenFeature} />}
        />
      )}
      {gpx && <DestRouteGpx routes={routeRows} t={t} />}
      {members?.length > 0 && (
        <PBlock title={t('dest.membersInside', { city })}>
          <MemberPlaces members={members} focusName={memberFocus} t={t} />
        </PBlock>
      )}
    </PSection>
  );
}
