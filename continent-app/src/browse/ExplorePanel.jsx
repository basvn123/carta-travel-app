import React from 'react';
import { knownFor } from '../lib/knownFor.js';
import { ScoreChip, HiddenGemTag, tierClass } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CrowdingBadge, crowdBadgeWorthShowing } from '../components/CrowdingBadge.jsx';
import { ClimateStrip, MONTHS_SHORT, fmtMonthRanges } from './ClimateStrip.jsx';
import { TrailsNearby } from '../components/TrailsNearby.jsx';
import { safeUrl } from '../lib/format.js';
import { fetchActivitiesFull } from '../lib/appData.js';
import { useDestInfo, mapsNavUrl, mapsSearchUrl } from '../lib/destInfo.js';
import { useForecast } from '../lib/weather.js';
import { packingList, packMonth } from '../lib/packing.js';
import { cheapestStayMonths } from '../lib/indices.js';
import { useI18n } from '../i18n/index.jsx';
import {
  InfoIcon, TreeIcon, PersonIcon, CalendarIcon, MapPinIcon, CameraIcon,
  ParkingIcon, MusicIcon, SunIcon, PartSunIcon, CloudIcon, FogIcon,
  RainIcon, DrizzleIcon, SnowIcon, StormIcon,
  ShoeIcon, SwimIcon, BootIcon, PlugIcon, BottleIcon, JacketIcon,
  BackpackIcon, BedIcon, DiningIcon, CheckIcon,
} from '../components/Icons.jsx';

/**
 * The Explore page's destination panel: what a place IS, not what it costs.
 * Replaces the fare receipt that used to live here (DetailPanel), now that
 * the Explore page has stepped away from all-in trip pricing.
 *
 * Top to bottom: identity (photo, score, what it is known for), the two
 * price-level indices, what is around (the POI layer), when to go (climate
 * normals + the stay-seasonality months + crowding), this week's weather
 * (live, Open-Meteo), where to park (OSM harvest), what to pack (derived),
 * and the recurring events Wikidata knows. Every section states its source
 * or its absence; nothing renders an invented value.
 *
 * The phone bottom-sheet mechanics (half/full snap, drag grip) are carried
 * over from the old panel unchanged.
 */

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
const popLine = (g) => {
  if (!g) return '';
  const settle = g.settlement ? g.settlement.charAt(0).toUpperCase() + g.settlement.slice(1) : '';
  const n = g.population;
  const pop = n == null ? ''
    : n >= 1_000_000 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 10_000 ? `${Math.round(n / 1000)}k`
    : n.toLocaleString('en-GB');
  return [settle, pop].filter(Boolean).join(', ');
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const fmtDist = (m) => (m >= 950 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

// "Rome (Fiumicino)" -> "Rome": the gateway parenthetical was fare-era
// routing detail, and this panel is about the place.
const baseCity = (name) => (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

/** One index meter: label, 0-10 mono value, and a track whose fill says how
 *  cheap this place ranks against the whole catalogue. */
function IndexMeter({ icon: Icon, label, value, level, t }) {
  if (value == null) return null;
  return (
    <div className="xp-index" title={level === 'country' ? t('explore.ixCountryLevel') : t('explore.ixCityLevel')}>
      <span className="xp-index-label"><Icon size={13} /> {label}</span>
      <span className="xp-index-track" aria-hidden="true">
        <span className={`xp-index-fill ${value >= 7 ? 'good' : ''}`} style={{ width: `${value * 10}%` }} />
      </span>
      <span className={`xp-index-val ${value >= 7 ? 'good' : ''}`}>{value.toFixed(1)}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="section-title section-title-iconed">
      {Icon && <Icon size={12} />} {children}
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

export function ExplorePanel({ destination, data, indices, onClose, isFavorite, onToggleFavorite }) {
  const { t, lang } = useI18n();

  // Phone bottom sheet: half snap on open, drag the grip between half, full
  // and closed. Desktop keeps the fixed side panel and hides the grip.
  const [isNarrow, setIsNarrow] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );
  const [sheetH, setSheetH] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const sheetRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const dragRef = React.useRef(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  React.useEffect(() => {
    setSheetH(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [destination?.id]);

  const snapPoints = () => {
    const sheet = sheetRef.current;
    const parent = sheet?.offsetParent;
    if (!sheet || !parent) return null;
    const bottomGap = parent.clientHeight - sheet.offsetTop - sheet.offsetHeight;
    const full = parent.clientHeight - bottomGap - 10;
    const half = Math.min(Math.round(full * 0.62), 560);
    return { half, full };
  };
  const onGripDown = (e) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    dragRef.current = { startY: e.clientY, startH: sheet.offsetHeight, moved: false, snaps: snapPoints() };
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };
  const onGripMove = (e) => {
    const st = dragRef.current;
    if (!st || !st.snaps) return;
    const dy = st.startY - e.clientY;
    if (Math.abs(dy) > 4) st.moved = true;
    setSheetH(Math.max(80, Math.min(st.snaps.full, st.startH + dy)));
  };
  const onGripUp = (e) => {
    const st = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* older browsers */ }
    if (!st || !st.snaps) return;
    const { half, full } = st.snaps;
    const h = sheetRef.current?.offsetHeight || half;
    if (!st.moved) { setSheetH(h > (half + full) / 2 ? half : full); return; }
    if (h < half * 0.55) { setSheetH(null); onClose?.(); return; }
    setSheetH(h > (half + full) / 2 ? full : half);
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

  if (!destination) {
    return <div className="panel dest-panel" aria-hidden="true" />;
  }

  const image = destination.image;
  const ix = indices?.get?.(destination.id) || {};
  const aboutLine = popLine(destination.geonames);
  const kf = knownFor(destination);
  const cheapMonths = cheapestStayMonths(destination);
  const month = packMonth(destination);
  const packs = packingList(destination, month);
  const city = baseCity(destination.city);
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
      ref={sheetRef}
      className={`panel dest-panel open ${dragging ? 'dragging' : ''}`}
      style={isNarrow && sheetH != null ? { height: sheetH } : undefined}
    >
      <div
        className="dest-grip-hit"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        aria-hidden="true"
      >
        <div className="dest-grip" />
      </div>

      {/* Identity bar: sticky, so the name and score survive the scroll. */}
      <div className="dsheet-bar">
        <div className="panel-tag">{t('detail.tag')}</div>
        <button className="panel-close" onClick={onClose} aria-label={t('detail.close')}>
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
        <div className="dsheet-bar-title">
          {destination.rating?.score != null && <ScoreChip rating={destination.rating} size="lg" />}
          <h2 className="panel-city">{city}</h2>
          {crowdBadgeWorthShowing(destination) && (
            <CrowdingBadge crowding={destination.crowding} t={t} size="lg" />
          )}
        </div>
      </div>

      <div className="dest-panel-scroll" ref={scrollRef}>
        {image?.url && (
          <div className="panel-hero" style={{ backgroundImage: `url(${image.url})` }}>
            <div className="panel-hero-shade" />
            {safeUrl(image.page) && (
              <a className="panel-hero-credit" href={safeUrl(image.page)} target="_blank" rel="noreferrer"
                title={image.credit ? t('detail.wikipediaCredit', { credit: image.credit }) : t('detail.wikipediaSource')}>
                Wikipedia
              </a>
            )}
          </div>
        )}

        <div className={`panel-header dsheet-card ${image?.url ? 'has-hero' : ''}`}>
          <div className="panel-country">
            {destination.country}
            {aboutLine && <span className="panel-via">{aboutLine}</span>}
          </div>
          {kf && <div className="panel-knownfor">{kf}</div>}
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

          {/* The two indices this page shows instead of a trip price. */}
          <div className="xp-indices">
            <IndexMeter icon={BedIcon} label={t('explore.ixStay')} value={ix.stay} level={ix.stayLevel} t={t} />
            <IndexMeter icon={DiningIcon} label={t('explore.ixFood')} value={ix.food} level={ix.foodLevel} t={t} />
            <p className="xp-index-note">{t('explore.ixNote')}</p>
          </div>

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

        {/* About: the guide lead and the nearest protected nature. */}
        {(guideText || destination.nature?.nearest?.name) && (
          <div className="dsheet-card">
            <SectionTitle icon={InfoIcon}>{t('detail.aboutTitle', { city })}</SectionTitle>
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

        {/* What is around: the measured POI layer, walk-scale, with a map
            link per sight. */}
        <div className="dsheet-card">
          <SectionTitle icon={CameraIcon}>{t('explore.aroundTitle')}</SectionTitle>
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
                        {km != null && <span className="mono">{km < 0.95 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(1)} km`}</span>}
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
        <div className="dsheet-card">
          <SectionTitle icon={SunIcon}>{t('explore.weatherTitle')}</SectionTitle>
          {forecast === undefined ? (
            <p className="footnote">{'…'}</p>
          ) : forecast === null ? (
            <p className="footnote">{t('explore.weatherFail')}</p>
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

        {/* Events and festivals Wikidata knows for this place. */}
        <div className="dsheet-card">
          <SectionTitle icon={MusicIcon}>{t('explore.eventsTitle')}</SectionTitle>
          {info === undefined ? (
            <p className="footnote">{'…'}</p>
          ) : info?.missing ? (
            <p className="footnote">{t('explore.eventsNotBuilt')}</p>
          ) : events.length === 0 ? (
            <p className="footnote">{t('explore.eventsNone')}</p>
          ) : (
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
          )}
        </div>

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
      </div>
    </div>
  );
}
