import React from 'react';
import { Button, Chip, ChipGroup } from '../components/ui/index.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { ArrowRightIcon, BusIcon, CalendarIcon, CarIcon, CompassIcon, ExternalIcon, MapPinIcon, SparkIcon, TrainIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { mapsSearchUrl } from '../lib/destInfo.js';
import { cleanBlurb, safeUrl } from '../lib/format.js';
import { activityLink } from '../lib/activityAffiliates.js';
import { poiLabelWord } from '../lib/rating.js';
import { featureHref, linkOpener } from '../lib/featureHref.js';
import { minutesText } from '../lib/journeys.js';
import { visitLength } from '../lib/nearby.js';
import { MemberPlaces } from './MemberPlaces.jsx';
import { FeaturePhoto, LAYER_ICON } from './AroundHere.jsx';
import { StoryCard, StoryRail } from './StoryRail.jsx';
import { NearPage } from './NearPage.jsx';
import { PSection, PBlock } from './PageTemplate.jsx';
import { DO_TYPE_KEYS, cleanName, fmtKm, thumb500 } from './destParts.js';
import { scrollBehavior } from '../lib/motion.js';
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
    requestAnimationFrame(() => cardRefs.current[i]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: scrollBehavior() }));
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

/**
 * The day trips from a place (T1036, owner: "more professional, more clean,
 * more simple ... for every day trip a clean image"): the Explore rail of
 * photo cards (StoryRail + StoryCard) in the dossier's own order (its rank,
 * the composed route last). On the photograph the trip itself (time and
 * mode, "about" where the time is modelled rather than routed, or "4-day
 * route") and the score; under it the name, how far and how long it wants
 * (lib/nearby.js visitLength, the rule the place's own page uses), and the
 * one line it is known for where the catalogue has a real one.
 *
 * No filter: the data holds the fastest way there, not whether a car is
 * needed, so "no car needed" could not be told honestly (register T1036-a).
 */
const TRIP_MODE_ICON = { train: TrainIcon, car: CarIcon, bus: BusIcon, plane: PlaneIcon };

function DayTrips({ trips, city, t, onSelect, onOpenItin }) {
  return (
    <StoryRail id="pt-trips-rail" headingLevel={3} t={t} className="dt-rail" title={t('dt.title', { city })}>
      {trips.map((tr) => {
        const route = tr.kind === 'composed_trip';
        const href = route ? null : featureHref('dest', tr);
        const open = route ? () => onOpenItin?.(tr.id) : linkOpener(() => onSelect?.(tr.id));
        const mins = tr.travel?.minutes;
        const time = Number.isFinite(mins) ? minutesText(mins) : null;
        const mode = tr.travel?.mode ? t(`mode.${tr.travel.mode}`) : null;
        // The pill stays short enough for a phone card (owner: the sentence
        // was cut off): the mode's icon and the time, "~" where the time is
        // modelled; the whole sentence for a screen reader.
        const routed = tr.travel?.source === 'routed';
        const ModeIcon = TRIP_MODE_ICON[tr.travel?.mode];
        const status = route ? t('dest.tripDays', { n: tr.days || 0 })
          : time ? (
            <>
              {ModeIcon && <ModeIcon size={14} className="dt-mode" />}
              <span aria-hidden="true">{routed ? time : t('dt.approx', { time })}</span>
              <span className="sr-only">{mode ? t(routed ? 'destx.tripBy' : 'dt.byAbout', { time, mode }) : time}</span>
            </>
          ) : null;
        const stay = route ? null : visitLength({ place: { visit_h: tr.visit_h } });
        const facts = [
          !route && tr.dist_km != null ? `${tr.dist_km} km` : null,
          stay ? (stay.days < 1 ? t('dt.half') : stay.days === 1 ? t('dt.full') : t('dt.days', { n: stay.n })) : null,
        ].filter(Boolean).join(', ');
        const blurb = cleanBlurb(tr.blurb);
        return (
          <StoryCard key={tr.key || tr.id}
            photo={<FeaturePhoto src={tr.image?.url || null} lat={tr.lat} lon={tr.lon} />}
            status={status}
            score={tr.rating?.score != null ? <ScoreChip rating={tr.rating} size="sm" /> : null}
            title={cleanName(tr.name)}
            href={href || undefined}
            onOpen={open}
            meta={(facts || blurb) ? (
              <>
                {facts && <span className="dt-facts">{facts}</span>}
                {blurb && <span className="dt-blurb">{blurb}</span>}
              </>
            ) : null}
          />
        );
      })}
    </StoryRail>
  );
}

/**
 * Around (T1033, owner: "only the tabs must be visible at first ... when you
 * click on one you go to a detailed page"): one photo tile per kind with
 * something in reach (the kind's best photograph, its icon, its name and
 * count), each opening the kind's own page (NearPage); then the day trips
 * (DayTrips, the Explore rail) and, inside an area, its villages. The kinds come from the registry
 * (lib/destOverview.js AROUND_KINDS).
 */
export function DestAround({ p }) {
  const { t, city, cats, members, memberFocus, onOpenFeature, onSelect, onOpenItin } = p;
  const [openKey, setOpenKey] = React.useState(null);
  const trips = cats.find((c) => c.key === 'trips');
  const all = cats.filter((c) => c.key !== 'trips' && c.count > 0);
  const open = all.find((c) => c.key === openKey) || null;
  if (!trips?.count && !all.length && !members?.length) return null;
  return (
    <PSection id="pt-around" title={t('dest.aroundTitle', { city })}>
      {all.length > 0 && (
        <ul className="ar-tiles" aria-label={t('dest.aroundChipsAria', { city })}>
          {all.map((c) => {
            const Icon = LAYER_ICON[c.layer] || CompassIcon;
            const shot = c.all.find((f) => f.thumb)?.thumb || null;
            return (
              <li key={c.key}>
                <button type="button" className={`ar-tile${shot ? ' has-photo' : ''}`} aria-haspopup="dialog"
                  onClick={() => setOpenKey(c.key)}>
                  {shot && <img src={shot} alt="" loading="lazy" decoding="async" />}
                  <span className="ar-tile-ico" aria-hidden="true"><Icon size={20} /></span>
                  <span className="ar-tile-txt">
                    <b>{t(`dest.aroundKind.${c.key}`)}</b>
                    <small>{c.count}</small>
                  </span>
                  <span className="ar-tile-go" aria-hidden="true"><ArrowRightIcon size={18} /></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <NearPage cat={open} city={city} t={t} onOpenFeature={onOpenFeature} onClose={() => setOpenKey(null)} />
      )}
      {trips?.count > 0 && (
        <DayTrips trips={trips.rows} city={city} t={t} onSelect={onSelect} onOpenItin={onOpenItin} />
      )}
      {members?.length > 0 && (
        <PBlock title={t('dest.membersInside', { city })}>
          <MemberPlaces members={members} focusName={memberFocus} t={t} />
        </PBlock>
      )}
    </PSection>
  );
}
