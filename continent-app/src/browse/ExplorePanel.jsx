import React from 'react';
import { knownFor } from '../lib/knownFor.js';
import { ScoreChip, HiddenGemTag, tierClass } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CrowdingBadge, crowdBadgeWorthShowing } from '../components/CrowdingBadge.jsx';
import { ClimateStrip, MONTHS_SHORT, fmtMonthRanges } from './ClimateStrip.jsx';
import { TrailsNearby } from '../components/TrailsNearby.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { CostReceipt } from '../components/CostSummary.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { RatingBreakdown } from './RatingBreakdown.jsx';
import { safeUrl } from '../lib/format.js';
import { fetchActivitiesFull } from '../lib/appData.js';
import { useDestInfo, mapsNavUrl, mapsSearchUrl } from '../lib/destInfo.js';
import { useForecast } from '../lib/weather.js';
import { packingList, packMonth } from '../lib/packing.js';
import { cheapestStayMonths } from '../lib/costIndex.js';
import { nearbyPlaces, visitLength, haversineKm } from '../lib/nearby.js';
import { flightSearchLink, staySearchLink } from '../lib/transportLinks.js';
import { useI18n } from '../i18n/index.jsx';
import {
  InfoIcon, TreeIcon, PersonIcon, CalendarIcon, MapPinIcon, CameraIcon,
  ParkingIcon, MusicIcon, SunIcon, PartSunIcon, CloudIcon, FogIcon,
  RainIcon, DrizzleIcon, SnowIcon, StormIcon, ClockIcon, CompassIcon,
  ShoeIcon, SwimIcon, BootIcon, PlugIcon, BottleIcon, JacketIcon,
  BackpackIcon, ReceiptIcon, StarIcon, CheckIcon, BedIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

/**
 * The Explore page's destination panel: what a place IS, not what it costs to
 * fly to. Replaces the fare receipt that used to live here (DetailPanel), now
 * that the Explore page has stepped away from all-in trip pricing.
 *
 * The order is the order a person decides in, which is not the order the data
 * arrived in:
 *
 *   identity      the photo, the name, the score and its tier
 *   what a day    the cost receipt: bed, food, the day, and where those
 *   costs         numbers came from. The product's core claim, said in euros
 *                 rather than in a 0-10 index that could not carry it
 *                 (see lib/costIndex.js for the full reckoning)
 *   about         the guide lead, how long the place is worth, its nature
 *   where it is   a real map with the town pinned and its sights on it,
 *                 followed by the sights as a list you can navigate to
 *   what is near  the other catalogue destinations worth pairing with it,
 *                 with the distance, because "what else is around" is the
 *                 question that actually turns a place into a trip
 *   when to go    climate normals, the cheap months, the crowd fact
 *   this week     the live forecast
 *   the score     how the rating was built, at the model's own weights
 *   practical     parking, events, what to pack
 *
 * Every section states its source or its absence, and a section with nothing
 * to say is not rendered at all. An empty block that apologises for being
 * empty is worse than no block: it spends a reader's attention to tell them
 * nothing, and it makes the sections that DO have data look less trustworthy
 * by association.
 *
 * The phone bottom-sheet mechanics (half/full snap, drag grip) are carried
 * over from the old panel unchanged.
 */

// maplibre and its stylesheet stay out of the Explore bundle until a reader
// actually opens a destination.
const PlaceMap = React.lazy(() => import('./PlaceMap.jsx'));

const WEATHER_GLYPH = {
  sun: SunIcon, partsun: PartSunIcon, cloud: CloudIcon, fog: FogIcon,
  drizzle: DrizzleIcon, rain: RainIcon, snow: SnowIcon, storm: StormIcon,
};

const PACK_GLYPH = {
  shoes: ShoeIcon, daypack: BackpackIcon, sun: SunIcon, bottle: BottleIcon,
  swim: SwimIcon, rain: RainIcon, winter: SnowIcon, layers: JacketIcon,
  evening: JacketIcon, modest: JacketIcon, boots: BootIcon, plug: PlugIcon,
};

// "City, 1.2M" style line from the GeoNames slice (population + settlement).
// A population of 0 is a missing measurement, not a ghost town, so it is left
// out rather than printed.
const popLine = (g) => {
  if (!g) return '';
  const settle = g.settlement ? g.settlement.charAt(0).toUpperCase() + g.settlement.slice(1) : '';
  const n = g.population;
  const pop = !(n > 0) ? ''
    : n >= 1_000_000 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 10_000 ? `${Math.round(n / 1000)}k`
    : n.toLocaleString('en-GB');
  return [settle, pop].filter(Boolean).join(', ');
};

const fmtDist = (m) => (m >= 950 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);
const fmtKm = (km) => (km < 0.95 ? `${Math.round((km * 1000) / 10) * 10} m` : `${km.toFixed(1)} km`);

// "Rome (Fiumicino)" -> "Rome": the gateway parenthetical was fare-era
// routing detail, and this panel is about the place.
const baseCity = (name) => (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

function SectionTitle({ icon: Icon, children, aside }) {
  return (
    <div className="section-title section-title-iconed">
      {Icon && <Icon size={12} />} {children}
      {aside && <span className="section-title-aside">{aside}</span>}
    </div>
  );
}

/** Parking spot row: what it is, whether it costs money, how far, and a
 *  navigation link that points at the measured coordinate. */
function ParkingSpot({ spot, kind, t }) {
  const feeKey = spot.fee === 'no' ? 'explore.parkFree'
    : spot.fee === 'yes' ? 'explore.parkPaid' : 'explore.parkFeeUnknown';
  const typeKey = spot.type ? `explore.parkType.${spot.type}` : null;
  return (
    <div className={`xp-park ${kind === 'best' ? 'is-best' : ''}`}>
      <div className="xp-park-main">
        <span className="xp-park-kind">{t(`explore.park.${kind}`)}</span>
        <span className="xp-park-name">{spot.name || t('explore.parkUnnamed')}</span>
        <span className="xp-park-facts">
          <span className={`xp-park-fee ${spot.fee === 'no' ? 'free' : ''}`}>{t(feeKey)}</span>
          {typeKey && <span>{t(typeKey)}</span>}
          {spot.cap != null && <span className="mono">{t('explore.parkSpaces', { n: spot.cap })}</span>}
          <span className="mono">{fmtDist(spot.dist_m)}</span>
        </span>
      </div>
      <a
        className="xp-park-nav"
        href={mapsNavUrl(spot.lat, spot.lon)}
        target="_blank"
        rel="noreferrer"
        title={t('explore.parkNavTitle')}
      >
        {t('explore.parkNav')}
      </a>
    </div>
  );
}

export function ExplorePanel({
  destination, data, indices, onClose, isFavorite, onToggleFavorite, onSelect,
  choices, onOpenLifestyle,
}) {
  const { t, lang } = useI18n();

  // The panel is a page, not a drawer you have to hold. On a phone it covers
  // the screen; on a desktop it stays the side panel the map layout is built
  // around. Either way there is one way out and it is always on screen: the
  // cross in the bar.
  //
  // What used to be here was a bottom sheet with a half snap, a drag grip and
  // a fling-to-dismiss. It was 60 lines of pointer arithmetic to reach content
  // that is now simply on screen, and the half snap meant everything below the
  // first card began its life off the bottom of the phone.
  const panelRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const closeRef = React.useRef(null);
  // Whether the reader has scrolled past the photograph. The bar is
  // transparent over the hero and solid under it, so the cross never sits on
  // an unpredictable background.
  const [stuck, setStuck] = React.useState(false);
  const [showAllShots, setShowAllShots] = React.useState(false);

  React.useEffect(() => {
    setStuck(false);
    setShowAllShots(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [destination?.id]);

  // Escape closes it, on every width. A full screen surface with no keyboard
  // way out is a trap for anyone not using a touchscreen.
  React.useEffect(() => {
    if (!destination) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // A dropdown or a lightbox inside the panel answers for its own Escape.
      if (panelRef.current?.querySelector('.dropdown-menu')) return;
      e.stopPropagation();
      onClose?.();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [destination, onClose]);

  const onScroll = (e) => {
    const next = e.currentTarget.scrollTop > 120;
    setStuck((cur) => (cur === next ? cur : next));
  };

  // Lazy layers: the country's parking/events file, this week's weather, the
  // full POI list. All fetched only while a destination is actually open.
  const info = useDestInfo(destination);
  const lat = destination?.city_lat ?? destination?.lat;
  const lon = destination?.city_lon ?? destination?.lon;
  const forecast = useForecast(lat, lon, !!destination);

  const [pois, setPois] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    setPois(null);
    if (!destination?.id) return undefined;
    fetchActivitiesFull().then((all) => {
      if (live) setPois(all?.[destination.id] || []);
    });
    return () => { live = false; };
  }, [destination?.id]);

  // The photographs the sights themselves carry, best-rated first and deduped
  // by file: the same Commons image fronts two entries often enough (a church
  // and its square) that a strip without this shows the same picture twice.
  const shots = React.useMemo(() => {
    const seen = new Set();
    return (pois || [])
      .filter((p) => p.img && p.name)
      .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
      .filter((p) => (seen.has(p.img) ? false : seen.add(p.img)))
      .slice(0, 24);
  }, [pois]);

  // The other catalogue places worth pairing with this one. One linear scan
  // of 3,038 rows, so it is memoised on the destination rather than cached.
  const nearby = React.useMemo(
    () => (destination && data ? nearbyPlaces(destination, data.destinations) : []),
    [destination, data],
  );

  if (!destination) {
    return <div className="panel dest-panel" aria-hidden="true" />;
  }

  const image = destination.image;
  const cost = indices?.get?.(destination.id) || null;
  // The receipt says what it assumed, in the same words the Explore toolbar
  // pill uses, so the two never look like separate settings.
  const profileKey = matchProfile(choices?.lifestyle || {});
  const lifestyleLine = t('cost.atLifestyle', {
    profile: profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom'),
    stay: t(`stay.${cost?.stayTier || choices?.stay_tier || 'home'}`).toLowerCase(),
  });
  const aboutLine = popLine(destination.geonames);
  const kf = knownFor(destination);
  const cheapMonths = cheapestStayMonths(destination);
  const month = packMonth(destination);
  const packs = packingList(destination, month);
  const city = baseCity(destination.city);
  const stayLen = visitLength(destination);
  // A gateway record can carry the AIRPORT's Wikivoyage lead ("... is the
  // main airport of Rome"), which is the wrong About for a destination page.
  const guideText = destination.guide?.text
    && !(destination.tier === 'airport' && /airport/i.test(destination.guide.text.slice(0, 120)))
    ? destination.guide.text : null;

  // The POI shortlist: best-rated first, heritage as tiebreak, capped so the
  // section stays a read rather than a database dump.
  const topPois = (pois || [])
    .filter((p) => p.name)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || (b.heritage === true) - (a.heritage === true))
    .slice(0, 10);


  // Where the page hands over. Both are searches rather than deep links: a
  // destination page knows the place and nothing else, no origin and no dates.
  const flightsHref = flightSearchLink({ iata: destination.iata, city });
  const staysHref = staySearchLink({ city, country: destination.country });

  const parking = info && !info.missing ? info.parking : null;
  const events = info && !info.missing ? (info.events || []) : [];

  const fmtDay = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { weekday: 'short', timeZone: 'UTC' })
        .format(new Date(iso + 'T00:00:00Z'));
    } catch { return iso.slice(5); }
  };

  return (
    <div
      ref={panelRef}
      className="panel dest-panel explore-panel open"
      role="dialog"
      aria-modal="true"
      aria-label={city}
    >
      {/* The bar: transparent over the photograph, solid once the reader has
          scrolled past it, and carrying the name only while the hero's own
          name is off screen. The cross never moves, which is the whole point
          of it being here rather than on the picture. */}
      <div className={`dsheet-bar ${stuck ? 'is-stuck' : ''}`}>
        <span className="dsheet-bar-name">{city}</span>
        <button
          className="panel-close"
          onClick={onClose}
          ref={closeRef}
          aria-label={t('detail.close')}
          title={t('detail.backToList')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      <div className="dest-panel-scroll" ref={scrollRef} onScroll={onScroll}>
        {/* Identity: the photograph, the verdict on it, and underneath, in one
            card, what the place is and the two things you can do with it. */}
        <div className="xp-hero-card">
          {image?.url && (
            <div className="panel-hero">
              <HeroImage
                url={image.url}
                city={city}
                iso2={destination.iso2}
                className="panel-hero-img"
                maxWidth={1280}
                sizes="(max-width: 768px) 100vw, 720px"
                eager
              />
              <div className="panel-hero-shade" />
              <div className="xp-hero-badges">
                {destination.rating?.score != null && <ScoreChip rating={destination.rating} size="lg" />}
                {crowdBadgeWorthShowing(destination) && (
                  <CrowdingBadge crowding={destination.crowding} t={t} size="lg" />
                )}
              </div>
              {safeUrl(image.page) && (
                <a className="panel-hero-credit" href={safeUrl(image.page)} target="_blank" rel="noreferrer"
                  title={image.credit ? t('detail.wikipediaCredit', { credit: image.credit }) : t('detail.wikipediaSource')}>
                  Wikipedia
                </a>
              )}
            </div>
          )}

          <div className={`panel-header ${image?.url ? 'has-hero' : ''}`}>
            {!image?.url && destination.rating?.score != null && (
              <div className="xp-hero-badges is-inline">
                <ScoreChip rating={destination.rating} size="lg" />
                {crowdBadgeWorthShowing(destination) && (
                  <CrowdingBadge crowding={destination.crowding} t={t} size="lg" />
                )}
              </div>
            )}
            <h2 className="panel-city">{city}</h2>
            <div className="panel-country">
              {destination.country}
              {aboutLine && <span className="panel-via">{aboutLine}</span>}
            </div>
            {(destination.rating?.label || destination.rating?.hidden_gem || swimRelevant(destination)) && (
              <div className="panel-rating-row">
                {destination.rating?.label && (
                  <span className={`rating-label ${tierClass(destination.rating)}`}>
                    {destination.rating.label}
                  </span>
                )}
                {destination.rating?.hidden_gem && <HiddenGemTag size="lg" />}
                {swimRelevant(destination) && (
                  <WaterQualityBadge bathing={destination.bathing_water} t={t} size="lg" />
                )}
              </div>
            )}
            {kf && <p className="panel-knownfor">{kf}</p>}
            {stayLen && (
              <p className="xp-hero-stay">
                <ClockIcon size={13} />
                <span>{t(stayLen.key, { n: stayLen.n })}</span>
              </p>
            )}

            <div className="panel-action-row">
              {onToggleFavorite && (
                <button
                  className={`panel-fav ${isFavorite ? 'on' : ''}`}
                  onClick={onToggleFavorite}
                  aria-label={isFavorite ? t('detail.removeShortlist') : t('detail.addShortlist')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
                    fill={isFavorite ? 'currentColor' : 'none'}
                    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                    <polygon points="12 2 15.1 8.6 22 9.3 16.8 14 18.3 21 12 17.3 5.7 21 7.2 14 2 9.3 8.9 8.6" />
                  </svg>
                  <span>{isFavorite ? t('detail.shortlisted') : t('detail.shortlist')}</span>
                </button>
              )}
              <a
                className="panel-fav xp-open-maps"
                href={mapsSearchUrl(lat, lon)}
                target="_blank"
                rel="noreferrer"
              >
                <MapPinIcon size={15} />
                <span>{t('explore.openMaps')}</span>
              </a>
            </div>
          </div>
        </div>

        {/* The place in photographs, from the sights themselves rather than
            from one hero the eye has already read. Only where the harvest
            found more than a couple: two thumbnails is a gap, not a gallery. */}
        {shots.length >= 3 && (
          <div className="dsheet-card">
            <SectionTitle
              icon={CameraIcon}
              aside={(
                <button
                  type="button"
                  className="xp-shots-toggle"
                  onClick={() => setShowAllShots((v) => !v)}
                >
                  {showAllShots ? t('explore.highlightsFewer') : t('explore.highlightsAll')}
                </button>
              )}
            >
              {t('explore.highlightsTitle')}
            </SectionTitle>
            <div className={`xp-shots ${showAllShots ? 'is-all' : ''}`}>
              {(showAllShots ? shots : shots.slice(0, 6)).map((p) => (
                <figure className="xp-shot" key={p.img}>
                  <img src={p.img} alt="" loading="lazy" />
                  <figcaption>{p.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}



        {/* Where it is. Its own card, because the map answers a different
            question from the list under it: whether the sights cluster or
            sprawl, which is what decides whether the place is a walking day. */}
        <div className="dsheet-card">
          <SectionTitle icon={MapPinIcon}>{t('explore.sightsTitle')}</SectionTitle>
          <React.Suspense fallback={<div className="place-map place-map-wait" style={{ height: 208 }} />}>
            <PlaceMap lat={lat} lon={lon} city={city} pois={topPois} />
          </React.Suspense>
        </div>

        {/* What is in walking reach of the centre, named, with a way to
            navigate to each one. */}
        <div className="dsheet-card">
          <SectionTitle icon={CompassIcon}>{t('explore.aroundTitle')}</SectionTitle>
          {pois == null ? (
            <p className="footnote">{'…'}</p>
          ) : topPois.length === 0 ? (
            <p className="footnote">{t('explore.aroundNone')}</p>
          ) : (
            <ul className="xp-pois">
              {topPois.map((p, i) => {
                const km = (p.lat != null && lat != null) ? haversineKm(lat, lon, p.lat, p.lon) : null;
                return (
                  <li key={`${p.name}|${i}`} className="xp-poi">
                    <span className="xp-poi-main">
                      <span className="xp-poi-name">{p.name}</span>
                      <span className="xp-poi-sub">
                        {p.kind && <span>{p.kind}</span>}
                        {km != null && <span className="mono">{fmtKm(km)}</span>}
                      </span>
                    </span>
                    {p.lat != null && (
                      <a
                        className="xp-poi-map"
                        href={mapsSearchUrl(p.lat, p.lon)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t('explore.poiMapAria', { name: p.name })}
                        title={t('explore.poiMapAria', { name: p.name })}
                      >
                        <MapPinIcon size={13} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <TrailsNearby destination={destination} />
        </div>

        {/* What else is within a day's reach, from the same catalogue, so
            every suggestion is a place you can open and price. */}
        {nearby.length > 0 && (
          <div className="dsheet-card">
            <SectionTitle icon={CompassIcon}>{t('explore.nearbyTitle')}</SectionTitle>
            <ul className="xp-nearby">
              {nearby.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="xp-near"
                    onClick={() => onSelect?.(n.id)}
                    disabled={!onSelect}
                  >
                    <HeroImage
                      url={n.image}
                      city={n.city}
                      iso2={n.iso2}
                      className="xp-near-img"
                      maxWidth={250}
                      sizes="64px"
                    />
                    <span className="xp-near-main">
                      <span className="xp-near-name">{n.city}</span>
                      <span className="xp-near-sub">
                        {n.rating?.label || n.country}
                      </span>
                    </span>
                    <span className="xp-near-km mono">{Math.round(n.km)} km</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="xp-source">{t('explore.nearbyNote')}</p>
          </div>
        )}

        {/* When to go: climate normals, the stay-price seasonality and the
            crowding fact, all independent of any fare. */}
        <div className="dsheet-card">
          <SectionTitle icon={CalendarIcon}>{t('explore.whenTitle')}</SectionTitle>
          {destination.climate ? (
            <ClimateStrip climate={destination.climate} />
          ) : (
            <p className="footnote">{t('explore.whenNoClimate')}</p>
          )}
          {cheapMonths && (
            <p className="xp-when-fact">
              {t('explore.whenCheapStay', { months: fmtMonthRanges(cheapMonths) })}
            </p>
          )}
          {crowdBadgeWorthShowing(destination) && destination.crowding?.label && (
            <p className="xp-when-fact">{t('explore.whenCrowds', { label: destination.crowding.label })}</p>
          )}
        </div>

        {/* This week, live. States its source; renders nothing invented. */}
        {forecast !== null && (
          <div className="dsheet-card">
            <SectionTitle icon={SunIcon}>{t('explore.weatherTitle')}</SectionTitle>
            {forecast === undefined ? (
              <p className="footnote">{'…'}</p>
            ) : (
              <>
                <div className="xp-weather">
                  {forecast.map((d) => {
                    const Glyph = WEATHER_GLYPH[d.kind] || CloudIcon;
                    return (
                      <div key={d.date} className="xp-wday" title={`${d.date}`}>
                        <span className="xp-wday-name">{fmtDay(d.date)}</span>
                        <Glyph size={17} className="xp-wday-icon" />
                        <span className="xp-wday-hi">{d.hi != null ? `${Math.round(d.hi)}°` : ''}</span>
                        <span className="xp-wday-lo">{d.lo != null ? `${Math.round(d.lo)}°` : ''}</span>
                        {d.rainPct != null && d.rainPct >= 30 && (
                          <span className="xp-wday-rain mono">{`${d.rainPct}%`}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="xp-source">{t('explore.weatherCredit')}</p>
              </>
            )}
          </div>
        )}


        {/* What a day here costs, in euros, with its provenance. */}
        {cost?.dayEur != null && (
          <div className="dsheet-card">
            <SectionTitle icon={ReceiptIcon}>{t('cost.title')}</SectionTitle>
            <CostReceipt
              cost={cost}
              t={t}
              lifestyleLabel={lifestyleLine}
              onOpenLifestyle={onOpenLifestyle}
            />
          </div>
        )}
        {/* Trip insights: the argument behind the score, then the two facts
            that decide how long a stay is worth. The score used to hold a
            card of its own two screens further down, where nobody who had
            already read the number went looking for it. */}
        {(destination.rating?.score != null || guideText || stayLen
          || destination.nature?.nearest?.name) && (
          <div className="dsheet-card">
            <SectionTitle icon={StarIcon}>{t('explore.insightsTitle')}</SectionTitle>
            {destination.rating?.score != null && (
              <RatingBreakdown rating={destination.rating} meta={data?.meta} t={t} />
            )}
            {guideText && (
              <p className="panel-about-guide">
                {guideText}
                {safeUrl(destination.guide.url) && (
                  <> <a className="panel-about-guide-link" href={safeUrl(destination.guide.url)}
                    target="_blank" rel="noreferrer">{t('detail.readGuide')}</a></>
                )}
              </p>
            )}
            {destination.nature?.nearest?.name && (
              <div className="panel-about-fact">
                <TreeIcon size={13} />
                <span>
                  {t('detail.nearestNature')}: {destination.nature.nearest.name}
                  {destination.nature.nearest.kind ? ` (${destination.nature.nearest.kind})` : ''}
                  {destination.nature.nearest.dist_km != null ? `, ${destination.nature.nearest.dist_km} km` : ''}
                </span>
              </div>
            )}
          </div>
        )}
        {/* Where to park. The key ask: a concrete spot, its fee fact, and a
            navigation link, from the OSM harvest. */}
        <div className="dsheet-card">
          <SectionTitle icon={ParkingIcon}>{t('explore.parkTitle')}</SectionTitle>
          {info === undefined ? (
            <p className="footnote">{'…'}</p>
          ) : info?.missing ? (
            <p className="footnote">{t('explore.parkNotBuilt')}</p>
          ) : !parking ? (
            <p className="footnote">{t('explore.parkNone')}</p>
          ) : (
            <>
              {parking.best && <ParkingSpot spot={parking.best} kind="best" t={t} />}
              {parking.free && <ParkingSpot spot={parking.free} kind="free" t={t} />}
              {parking.park_ride && <ParkingSpot spot={parking.park_ride} kind="park_ride" t={t} />}
              {parking.n > 1 && (
                <p className="xp-source">{t('explore.parkMore', { n: parking.n })}</p>
              )}
              <p className="xp-source">{t('explore.parkCredit')}</p>
            </>
          )}
        </div>

        {/* Events and festivals Wikidata knows for this place. Rendered only
            when there are some: a section whose whole content is "there are
            none" is a section that should not be on the page. */}
        {events.length > 0 && (
          <div className="dsheet-card">
            <SectionTitle icon={MusicIcon}>{t('explore.eventsTitle')}</SectionTitle>
            <ul className="xp-events">
              {events.map((e) => (
                <li key={e.name} className="xp-event">
                  <span className="xp-event-main">
                    <span className="xp-event-name">
                      {e.wp || e.web ? (
                        <a href={safeUrl(e.wp || e.web)} target="_blank" rel="noreferrer">{e.name}</a>
                      ) : e.name}
                    </span>
                    {e.desc && <span className="xp-event-desc">{e.desc}</span>}
                  </span>
                  {e.months?.length > 0 && (
                    <span className="xp-event-month mono">
                      {e.months.map((m) => MONTHS_SHORT[m - 1]).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* What to bring, derived from the month's climate and the place's
            character. The caption names the month it packed for. */}
        <div className="dsheet-card">
          <SectionTitle icon={CheckIcon}>{t('explore.packTitle')}</SectionTitle>
          <p className="xp-pack-for">
            {destination.climate
              ? t('explore.packFor', { month: MONTHS_SHORT[month - 1] })
              : t('explore.packGeneric')}
          </p>
          <div className="xp-packs">
            {packs.map((key) => {
              const Glyph = PACK_GLYPH[key] || PersonIcon;
              return (
                <span key={key} className="xp-pack">
                  <Glyph size={14} />
                  <span>{t(`explore.pack.${key}`)}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Where the page hands over. Carta prices a trip and plans it; the
            tickets and the rooms live with the people who sell them, which is
            the same arrangement lib/transportLinks.js documents for every leg
            of a plan. Neither of these is a deep link: a destination page has
            no origin and no dates, so they open a search and the line under
            them says so. */}
        <div className="dsheet-card xp-further">
          <SectionTitle icon={CompassIcon}>{t('explore.furtherTitle', { city })}</SectionTitle>
          <div className="xp-further-row">
            {flightsHref && (
              <a className="xp-further-btn" href={flightsHref} target="_blank" rel="noreferrer noopener">
                <PlaneIcon size={15} />
                <span>{t('explore.furtherFlights')}</span>
              </a>
            )}
            {staysHref && (
              <a className="xp-further-btn" href={staysHref} target="_blank" rel="noreferrer noopener">
                <BedIcon size={15} />
                <span>{t('explore.furtherStays')}</span>
              </a>
            )}
          </div>
          <p className="xp-source">{t('explore.furtherNote')}</p>
        </div>
      </div>
    </div>
  );
}
