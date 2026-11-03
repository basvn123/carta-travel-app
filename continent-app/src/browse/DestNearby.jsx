import React from 'react';
import { Button, Chip, ChipGroup } from '../components/ui/index.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { ArrowRightIcon, CalendarIcon, CompassIcon, ExternalIcon, MapPinIcon, SparkIcon } from '../components/Icons.jsx';
import { mapsSearchUrl } from '../lib/destInfo.js';
import { safeUrl } from '../lib/format.js';
import { activityLink } from '../lib/activityAffiliates.js';
import { natureRating, poiLabelWord } from '../lib/rating.js';
import { AROUND_CAP } from '../lib/destOverview.js';
import { CLASS_KEY as WATER_KEY } from '../components/WaterQualityBadge.jsx';
import { featureHref, linkOpener } from '../lib/featureHref.js';
import { minutesText } from '../lib/journeys.js';
import { MemberPlaces } from './MemberPlaces.jsx';
import { FeaturePhoto } from './AroundHere.jsx';
import { StoryCard, StoryRail } from './StoryRail.jsx';
import { trailClimbUp, gradeLabelKey } from '../lib/trailStory.js';
import { clock } from '../lib/routeEffort.js';
import { PSection, PBlock } from './PageTemplate.jsx';
import { DO_TYPE_KEYS, cleanName, fmtKm, thumb500 } from './destParts.js';
import { isResizable, thumbAt } from '../lib/heroImage.js';

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
 * Around: the kinds of outdoor place in reach as choice chips with their
 * counts, how far as steps, the kind's places as the Explore rail's photo
 * cards (T1033); then the day trips and, inside an area, its villages.
 *
 * Nothing here prints a missing value: a row without data is left out, a
 * kind with nothing in reach is not named (the owner removed "No peak, lake
 * or beach within 20 km", 2026-10-30).
 */
// Cards shown before Show all from 700 px; the CSS hides the rest with
// .spots:not(.is-all) > .spot:nth-child(n + 7), so the two change together.
const SPOTS_FIRST = 6;
const DO_ICON = { activity: CompassIcon, experience: SparkIcon, festival: CalendarIcon };

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
  const cardRefs = React.useRef([]);
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

  // One row per sight for its card and its pin: the card's 500 px photo,
  // the pin's 120 px one (a 40 px frame at 2x), the pipeline's fact first.
  const sights = highlights.map((h) => {
    const url = h.image?.url || null;
    const thumb = thumb500(url) || h.photo || null;
    return { ...h, thumb, pin: url && isResizable(url) ? thumbAt(url, 120) : thumb, text: h.fact || h.desc || null };
  });
  const pick = (i) => {
    setFocus(i);
    if (i >= SPOTS_FIRST) setAllSights(true);
    // The card comes into view in its row (a swipe row on a phone).
    requestAnimationFrame(() => cardRefs.current[i]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }));
  };
  return (
    <PSection id="pt-see" title={t('destx.jump.see')}>
      {highlights.length > 0 && (
        <>
          <ol className={`spots is-sights${allSights ? ' is-all' : ''}`} aria-label={t('destx.jump.see')}>
            {sights.map((h, i) => (
              <SpotCard key={h.id || `${i}:${h.name}`} refEl={(el) => { cardRefs.current[i] = el; }}
                n={i + 1}
                img={h.thumb}
                chip={h.label === 'must_see' ? poiLabelWord(t, h.label) : null}
                name={h.name}
                meta={[
                  h.label && h.label !== 'must_see' ? poiLabelWord(t, h.label) : null,
                  h.kind && lang === 'en' ? h.kind : null,
                  h.dist_km != null ? t('destx.fromCentre', { km: fmtKm(h.dist_km) }) : null,
                ].filter(Boolean).join(', ')}
                text={h.text}
                active={focus === i || hover === i}
                onEnter={() => setHover(i)}
                onLeave={() => setHover((c) => (c === i ? null : c))}
                onPick={() => setFocus(i)}
                pickLabel={t('ai.showOnMap', { name: h.name })}
              />
            ))}
          </ol>
          {highlights.length > SPOTS_FIRST && (
            <Button variant="secondary" size="sm" className="spots-more" aria-expanded={allSights}
              onClick={() => setAllSights((v) => !v)}>
              {allSights ? t('dest.showLess') : t('destx.showAllSights', { n: highlights.length })}
            </Button>
          )}
          {hasMap && (
            <div className="pt-mapbox spots-map" ref={slotRef}>
              {mapOn ? (
                <React.Suspense fallback={<div className="place-map place-map-wait dmap" />}>
                  <DestMap
                    place={{ lat, lon, name: city }}
                    highlights={sights}
                    active="highlights"
                    focus={focus}
                    hover={hover}
                    onHoverHighlight={setHover}
                    height={420}
                    onPickHighlight={pick}
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
        </>
      )}

      <OnFoot walk={walk} t={t} lang={lang} />

      {doRows.length > 0 && (
        <PBlock title={t('dest.doTitle')} className="pt-do">
          <ul className={`spots is-do${allDo ? ' is-all' : ''}`} aria-label={t('dest.doTitle')}>
            {doRows.map((item) => {
              const href = item.link && safeUrl(item.link) ? activityLink(safeUrl(item.link), 'dest-do') : null;
              return (
                <SpotCard key={item.key}
                  img={item.photo}
                  icon={DO_ICON[item.type] || CompassIcon}
                  name={item.name}
                  meta={DO_TYPE_KEYS[item.type] ? t(DO_TYPE_KEYS[item.type]) : ''}
                  text={item.detail && lang === 'en' ? item.detail : null}
                  href={href}
                />
              );
            })}
          </ul>
          {doRows.length > SPOTS_FIRST && (
            <Button variant="secondary" size="sm" className="spots-more" aria-expanded={allDo} onClick={() => setAllDo((v) => !v)}>
              {allDo ? t('dest.showLess') : t('rail.seeAllPlain')}
            </Button>
          )}
        </PBlock>
      )}
    </PSection>
  );
}

/**
 * One card for a sight and for a thing to do (T1032, owner: "the same style
 * ... bigger images ... swipe on a phone"): the photograph on top (4:3), its
 * number when the map shows it, the Must-see chip on it; then the name, one
 * line of what it is and where, and the short description. A thing to do
 * without a photograph of its own shows its kind's icon on the warm ground,
 * never somebody else's picture. A sight's name selects it on the map; a
 * thing to do's name opens its booking page when it has one.
 */
function SpotCard({ refEl, n, img, icon, chip, name, meta, text, href, active, onEnter, onLeave, onPick, pickLabel }) {
  const [bad, setBad] = React.useState(false);
  const photo = img && !bad;
  const Glyph = icon || MapPinIcon;
  return (
    <li ref={refEl} className={`spot${active ? ' is-active' : ''}`} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="spot-media">
        {photo
          ? <img src={img} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} />
          : <span className="spot-ph" aria-hidden="true"><Glyph size={28} /></span>}
        {n != null && <span className="spot-n" aria-hidden="true">{n}</span>}
        {chip && <span className="spot-chip">{chip}</span>}
      </div>
      <div className="spot-body">
        <h3 className="spot-name">
          {onPick ? (
            <button type="button" className="spot-hit" onClick={onPick} onFocus={onEnter} onBlur={onLeave} aria-label={pickLabel}>{name}</button>
          ) : href ? (
            <a className="spot-hit" href={href} target="_blank" rel="noreferrer">{name}</a>
          ) : name}
        </h3>
        {meta && <p className="spot-meta">{meta}</p>}
        {text && <p className="spot-text">{text}</p>}
      </div>
    </li>
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

/** How far to look (T1033): plain steps over each row's distance from the
 *  centre; a step that shows nothing new, or nothing, is left out. The
 *  widest chip is the real reach of the rows (the dossier looks 20 km out
 *  for every kind, further for a few peaks, lakes and beaches). */
const RADII = [5, 10, 25];

/** The one or two facts a kind is chosen on (the research: length, climb and
 *  time for a route; height for a peak; the water for a lake or a beach),
 *  then how far and which way. A fact the row lacks is left out. */
function kindFacts(f, style, t) {
  const bits = [];
  if (style === 'route') {
    if (f.km_len != null) bits.push(t('dest.trackLong', { km: Math.round(f.km_len) }));
    const up = trailClimbUp(f);
    if (up != null && up >= 20) bits.push(t('dest.ascentUp', { m: Math.round(up) }));
    const mins = f.duration_min ?? f.dur?.min;
    if (mins != null) bits.push(clock(mins));
  } else if (style === 'height' && f.elev_m != null) {
    bits.push(t('ar.high', { m: Math.round(f.elev_m).toLocaleString(t.lang || 'en') }));
  }
  if (f.km != null) bits.push(`${fmtKm(f.km)}${f.bearing ? ` ${f.bearing}` : ''}`);
  return bits.join(', ');
}

/** The pill on the photograph: a route's grade, or a lake's or a beach's
 *  bathing water. */
function kindStatus(f, style, t) {
  if (style === 'route') {
    const g = gradeLabelKey(f);
    return g ? t(g) : null;
  }
  if (style === 'water' && WATER_KEY[f.water]) return t('ar.water', { q: t(WATER_KEY[f.water]) });
  return null;
}

/**
 * Around (T1033, owner: "one tab where I can click on walks, rides, lakes,
 * beaches ... the specific detail pages of that destination"). The kinds
 * come from the registry (lib/destOverview.js AROUND_KINDS): a chip each for
 * every kind with something in reach, with its count; then how far, as
 * plain steps; then the kind's places as the Explore rail's photo cards
 * (StoryRail, StoryCard: the photograph with its pills, the words on the
 * page under it, no box), each opening its own page. Nearest first.
 */
export function DestAround({ p }) {
  const {
    t, city, cats, aroundKey, setAroundKey, members, memberFocus,
    onOpenFeature, onSelect, onOpenItin,
  } = p;
  const [radius, setRadius] = React.useState(null);
  const trips = cats.find((c) => c.key === 'trips');
  const all = cats.filter((c) => c.key !== 'trips' && c.count > 0);
  const cur = all.find((c) => c.key === aroundKey) || all[0] || null;
  // Every row of the kind, nearest first; the steps worth offering (each
  // shows something, and fewer than the step above it); the reach of all.
  const near = cur ? [...cur.all].sort((x, y) => (x.km ?? 99) - (y.km ?? 99)) : [];
  const reach = Math.ceil(Math.max(0, ...near.map((f) => f.km ?? 0)));
  const steps = [];
  let above = near.length;
  for (const km of [...RADII].reverse()) {
    const n = near.filter((f) => f.km != null && f.km <= km).length;
    if (km < reach && n > 0 && n < above) { steps.unshift(km); above = n; }
  }
  const r = steps.includes(radius) ? radius : null;
  const rows = (r == null ? near : near.filter((f) => f.km != null && f.km <= r)).slice(0, AROUND_CAP);
  if (!trips?.count && !all.length && !members?.length) return null;
  return (
    <PSection id="pt-around" title={t('dest.aroundTitle', { city })}>
      {cur && (
        <div className="ar">
          <ChipGroup label={t('dest.aroundChipsAria', { city })} className="ar-kinds">
            {all.map((c) => (
              <Chip key={c.key} kind="choice" selected={c.key === cur.key} onClick={() => { setAroundKey(c.key); setRadius(null); }}>
                {t(`dest.aroundKind.${c.key}`)}
                <span className="pt-count-n">{c.count}</span>
              </Chip>
            ))}
          </ChipGroup>
          {steps.length > 0 && (
            <ChipGroup label={t('ar.howFar')} className="ar-radius">
              {steps.map((km) => (
                <Chip key={km} kind="choice" size="sm" selected={r === km} onClick={() => setRadius(km)}>
                  {t('ar.within', { km })}
                </Chip>
              ))}
              <Chip kind="choice" selected={r == null} onClick={() => setRadius(null)}>{t('ar.within', { km: reach })}</Chip>
            </ChipGroup>
          )}
          <StoryRail key={cur.key} id="pt-around-rail" headingLevel={3} t={t} className="ar-rail"
            title={t('ar.near', { kind: t(`dest.aroundKind.${cur.key}`), city })}>
            {rows.map((f) => {
              const ref = { id: f.id, cc: f.cc };
              const href = onOpenFeature ? featureHref(f.layer, ref) : null;
              const rating = natureRating(f);
              return (
                <StoryCard key={f.key}
                  photo={<FeaturePhoto src={f.thumb} lat={f.lat} lon={f.lon} />}
                  status={kindStatus(f, cur.facts, t)}
                  score={rating?.score != null ? <ScoreChip rating={rating} size="sm" /> : null}
                  title={cleanName(f.name)}
                  href={href || undefined}
                  onOpen={onOpenFeature
                    ? (href ? linkOpener(() => onOpenFeature(f.layer, ref)) : () => onOpenFeature(f.layer, ref))
                    : undefined}
                  meta={kindFacts(f, cur.facts, t)}
                />
              );
            })}
          </StoryRail>
        </div>
      )}
      {trips?.count > 0 && (
        <PBlock title={t('dest.aroundKind.trips')}>
          <ul className="pt-trips">
            {trips.rows.map((tr) => <TripRow key={tr.key} tr={tr} t={t} onSelect={onSelect} onOpenItin={onOpenItin} />)}
          </ul>
        </PBlock>
      )}
      {members?.length > 0 && (
        <PBlock title={t('dest.membersInside', { city })}>
          <MemberPlaces members={members} focusName={memberFocus} t={t} />
        </PBlock>
      )}
    </PSection>
  );
}
