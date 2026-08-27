import React from 'react';
import { knownFor } from '../lib/knownFor.js';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CrowdingBadge, crowdBadgeWorthShowing } from '../components/CrowdingBadge.jsx';
import { ClimateStrip, MONTHS_SHORT, fmtMonthRanges } from './ClimateStrip.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { CostReceipt } from '../components/CostSummary.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { safeUrl } from '../lib/format.js';
import { useDossier, destShareUrl } from '../lib/dossier.js';
import { activityLink } from '../lib/activityAffiliates.js';
import { mapsSearchUrl } from '../lib/destInfo.js';
import { useForecast } from '../lib/weather.js';
import { packingList, packMonth } from '../lib/packing.js';
import { cheapestStayMonths } from '../lib/costIndex.js';
import { useI18n } from '../i18n/index.jsx';
import {
  TreeIcon, PersonIcon, CalendarIcon, MapPinIcon, CameraIcon,
  ParkingIcon, SunIcon, PartSunIcon, CloudIcon, FogIcon,
  RainIcon, DrizzleIcon, SnowIcon, StormIcon, ClockIcon, CompassIcon,
  ShoeIcon, SwimIcon, BootIcon, PlugIcon, BottleIcon, JacketIcon,
  BackpackIcon, ReceiptIcon, CheckIcon, BedIcon, InfoIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

/**
 * The full-screen destination page. Replaces the Explore side panel: opening
 * a destination now covers the screen on every width, with a cross (desktop)
 * and a back arrow (phone) as the two ways out, plus Escape.
 *
 * Renders from the dossier contract (public/dossier/{id}.json, built by
 * pipeline/dossier/build_dossier.py). The PDF export renders from the SAME
 * file (lib/destinationPdf.js), which is the whole architecture: one
 * contract, two renderers, zero drift.
 *
 * Section order is the order the user asked for: gallery, what this place is,
 * highlights with the map, best things to do, best trips from here, nearby
 * nature, what a day costs, when to go, live weather, insider tips, parking
 * with navigation deeplinks, what to pack, explore further, credits.
 *
 * Two deliberate removals, both from the brief: the rating is not displayed
 * (the score still ranks trips and highlights inside the pipeline), and the
 * old "sights & areas" list is gone because highlights now carry it.
 *
 * Sections with nothing to say are not rendered at all, same contract as the
 * panel this replaces.
 */

const DestMap = React.lazy(() => import('./DestMap.jsx'));

const WEATHER_GLYPH = {
  sun: SunIcon, partsun: PartSunIcon, cloud: CloudIcon, fog: FogIcon,
  drizzle: DrizzleIcon, rain: RainIcon, snow: SnowIcon, storm: StormIcon,
};

const PACK_GLYPH = {
  shoes: ShoeIcon, daypack: BackpackIcon, sun: SunIcon, bottle: BottleIcon,
  swim: SwimIcon, rain: RainIcon, winter: SnowIcon, layers: JacketIcon,
  evening: JacketIcon, modest: JacketIcon, boots: BootIcon, plug: PlugIcon,
};

const DO_TYPE_KEYS = {
  trail: 'dest.doType.trail', activity: 'dest.doType.activity',
  festival: 'dest.doType.festival', swim: 'dest.doType.swim',
  experience: 'dest.doType.experience',
};

const baseCity = (name) => (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const fmtKm = (km) => (km < 0.95 ? `${Math.round((km * 1000) / 10) * 10} m` : `${Math.round(km)} km`);

function SectionTitle({ icon: Icon, children, aside }) {
  return (
    <div className="section-title section-title-iconed">
      {Icon && <Icon size={12} />} {children}
      {aside && <span className="section-title-aside">{aside}</span>}
    </div>
  );
}

/** One tip sentence from its rule code + args, through t() so all six
 *  languages carry it. Month arguments arrive as 1-12 and leave as names. */
function tipText(tip, t) {
  const args = { ...(tip.args || {}) };
  if (args.from_m) args.from = MONTHS_SHORT[args.from_m - 1];
  if (args.to_m) args.to = MONTHS_SHORT[args.to_m - 1];
  if (args.month) args.month = MONTHS_SHORT[args.month - 1];
  return t(`tip.${tip.code}`, args);
}

function GalleryStrip({ gallery, city, iso2, fallbackUrl }) {
  const scroller = React.useRef(null);
  const [idx, setIdx] = React.useState(0);
  const imgs = gallery?.length ? gallery : (fallbackUrl ? [{ url: fallbackUrl }] : []);

  const onScroll = (e) => {
    const el = e.currentTarget;
    const slide = el.querySelector('.destp-slide');
    if (!slide) return;
    const next = Math.round(el.scrollLeft / (slide.offsetWidth + 8));
    setIdx((cur) => (cur === next ? cur : Math.min(next, imgs.length - 1)));
  };
  const nudge = (dir) => {
    const el = scroller.current;
    const slide = el?.querySelector('.destp-slide');
    if (!el || !slide) return;
    el.scrollBy({ left: dir * (slide.offsetWidth + 8), behavior: 'smooth' });
  };

  if (!imgs.length) {
    return (
      <div className="destp-gallery is-blank">
        <HeroImage url={null} city={city} iso2={iso2} className="destp-slide-img" />
      </div>
    );
  }
  return (
    <div className="destp-gallery">
      <div className="destp-gallery-track" ref={scroller} onScroll={onScroll}>
        {imgs.map((g, i) => (
          <figure className="destp-slide" key={g.url}>
            <img
              src={g.url}
              alt={g.caption || ''}
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : undefined}
            />
            {safeUrl(g.page) && (
              <a
                className="destp-slide-credit"
                href={safeUrl(g.page)}
                target="_blank"
                rel="noreferrer"
                title={[g.author, g.licence].filter(Boolean).join(', ')}
              >
                {'©'}
              </a>
            )}
          </figure>
        ))}
      </div>
      {imgs.length > 1 && (
        <>
          <button type="button" className="destp-gallery-arrow is-prev" onClick={() => nudge(-1)} aria-label="Previous photo" disabled={idx === 0}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button type="button" className="destp-gallery-arrow is-next" onClick={() => nudge(1)} aria-label="Next photo" disabled={idx >= imgs.length - 1}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <span className="destp-gallery-count mono">{idx + 1}/{imgs.length}</span>
        </>
      )}
    </div>
  );
}

export function DestinationPage({
  destination, data, indices, choices, onOpenLifestyle, onClose, onSelect,
  isFavorite, onToggleFavorite, onOpenFeature, onOpenItin,
}) {
  const { t, lang } = useI18n();
  const pageRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const [stuck, setStuck] = React.useState(false);
  const [mapLayer, setMapLayer] = React.useState('highlights');
  const [copied, setCopied] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const dossier = useDossier(destination?.id);

  React.useEffect(() => {
    setStuck(false);
    setMapLayer('highlights');
    setCopied(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [destination?.id]);

  // Escape closes it, capture phase, so the app-level stack never double-fires.
  React.useEffect(() => {
    if (!destination) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (pageRef.current?.querySelector('.dropdown-menu')) return;
      e.stopPropagation();
      onClose?.();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [destination, onClose]);

  const lat = destination?.city_lat ?? destination?.lat;
  const lon = destination?.city_lon ?? destination?.lon;
  const forecast = useForecast(lat, lon, !!destination);

  if (!destination) return null;

  const city = baseCity(destination.city);
  const d = dossier || null;
  const loading = dossier === undefined;
  const cost = indices?.get?.(destination.id) || null;
  const profileKey = matchProfile(choices?.lifestyle || {});
  const lifestyleLine = t('cost.atLifestyle', {
    profile: profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom'),
    stay: t(`stay.${cost?.stayTier || choices?.stay_tier || 'home'}`).toLowerCase(),
  });
  const kf = knownFor(destination);
  const cheapMonths = cheapestStayMonths(destination);
  const month = packMonth(destination);
  const packs = packingList(destination, month);

  const intro = d?.intro;
  const highlights = d?.highlights || [];
  const doItems = d?.do || [];
  const trips = d?.trips || [];
  const nearby = d?.nearby || {};
  const tips = d?.tips || [];
  const parking = d?.parking;
  const festivals = d?.festivals || [];
  const links = d?.practical?.links || {};
  const credits = d?.credits || [];
  const nearbyRows = ['trails', 'beaches', 'lakes', 'mountains']
    .flatMap((layer) => (nearby[layer] || []).slice(0, 3).map((f) => ({ ...f, layer })));

  const nearbyForMap = nearbyRows.filter((f) => f.lat != null);
  const tripsForMap = trips.filter((x) => x.lat != null);

  const share = async () => {
    const url = destShareUrl(destination.id);
    try {
      if (navigator.share) { await navigator.share({ title: city, url }); return; }
    } catch { /* fall through to the clipboard */ }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* no clipboard access; the button did its best */ }
  };

  const exportPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const { openDestinationPdf } = await import('../lib/destinationPdf.js');
      openDestinationPdf({
        dossier: d, destination, cost, t, lang,
        lifestyleLabel: lifestyleLine,
        mapSnapshot: mapRef.current?.snapshot?.() || null,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const fmtDay = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { weekday: 'short', timeZone: 'UTC' })
        .format(new Date(iso + 'T00:00:00Z'));
    } catch { return iso.slice(5); }
  };

  const onScroll = (e) => {
    const next = e.currentTarget.scrollTop > 160;
    setStuck((cur) => (cur === next ? cur : next));
  };

  const layerChoices = [
    { key: 'highlights', label: t('dest.layer.highlights'), n: highlights.length },
    { key: 'trips', label: t('dest.layer.trips'), n: tripsForMap.length },
    { key: 'nearby', label: t('dest.layer.nearby'), n: nearbyForMap.length },
  ].filter((c) => c.n > 0);

  return (
    <div
      ref={pageRef}
      className="destp"
      role="dialog"
      aria-modal="true"
      aria-label={city}
    >
      <div className={`destp-bar ${stuck ? 'is-stuck' : ''}`}>
        <button className="destp-back" onClick={onClose} aria-label={t('detail.close')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m6-7l-7 7 7 7" /></svg>
        </button>
        <span className="destp-bar-name">{city}</span>
        <div className="destp-bar-actions">
          <button type="button" className="destp-bar-btn" onClick={share}>
            {copied ? t('dest.linkCopied') : t('dest.share')}
          </button>
          <button className="panel-close destp-close" onClick={onClose} aria-label={t('detail.close')}>
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </button>
        </div>
      </div>

      <div className="destp-scroll" ref={scrollRef} onScroll={onScroll}>
        <GalleryStrip
          gallery={d?.gallery}
          city={city}
          iso2={destination.iso2}
          fallbackUrl={destination.image?.url}
        />

        <div className="destp-head">
          <div className="destp-head-main">
            <h2 className="destp-city">{city}</h2>
            <div className="destp-country">{destination.country}</div>
            {(intro?.lead || kf) && <p className="destp-lead">{intro?.lead || kf}</p>}
            <div className="destp-badge-row">
              {(destination.designations || []).some((g) => g.kind === 'unesco_whc') && (
                <span className="destp-unesco" title={(destination.designations || []).find((g) => g.kind === 'unesco_whc')?.name || ''}>
                  {t('dest.unesco')}
                </span>
              )}
              {crowdBadgeWorthShowing(destination) && (
                <CrowdingBadge crowding={destination.crowding} t={t} size="lg" />
              )}
              {swimRelevant(destination) && (
                <WaterQualityBadge bathing={destination.bathing_water} t={t} size="lg" />
              )}
              {destination.place?.visit_h != null && (
                <span className="destp-visit"><ClockIcon size={12} />{t('dest.visitHours', { n: Math.round(destination.place.visit_h) })}</span>
              )}
            </div>
          </div>
          <div className="destp-head-actions">
            <button type="button" className="destp-pdf" onClick={exportPdf} disabled={pdfBusy || loading}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v11m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
              <span>{pdfBusy ? t('dest.pdfBuilding') : t('dest.pdf')}</span>
            </button>
            {onToggleFavorite && (
              <button className={`panel-fav ${isFavorite ? 'on' : ''}`} onClick={onToggleFavorite}
                aria-label={isFavorite ? t('detail.removeShortlist') : t('detail.addShortlist')}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                  <polygon points="12 2 15.1 8.6 22 9.3 16.8 14 18.3 21 12 17.3 5.7 21 7.2 14 2 9.3 8.9 8.6" />
                </svg>
                <span>{isFavorite ? t('detail.shortlisted') : t('detail.shortlist')}</span>
              </button>
            )}
            <a className="panel-fav" href={mapsSearchUrl(lat, lon)} target="_blank" rel="noreferrer">
              <MapPinIcon size={15} />
              <span>{t('explore.openMaps')}</span>
            </a>
          </div>
        </div>

        <div className="destp-grid">
          <div className="destp-col is-main">
            {/* What this place is about. */}
            {(intro?.body || (!loading && !intro?.body && destination.guide?.text)) && (
              <div className="dsheet-card">
                <SectionTitle icon={InfoIcon}>{t('dest.aboutTitle')}</SectionTitle>
                <p className="destp-about">{intro?.body || destination.guide?.text}</p>
                {safeUrl(intro?.grounding?.[0]?.url || destination.guide?.url) && (
                  <a className="panel-about-guide-link" href={safeUrl(intro?.grounding?.[0]?.url || destination.guide?.url)} target="_blank" rel="noreferrer">
                    {t('detail.readGuide')}
                  </a>
                )}
                {destination.nature?.nearest?.name && (
                  <div className="panel-about-fact">
                    <TreeIcon size={13} />
                    <span>
                      {t('detail.nearestNature')}: {destination.nature.nearest.name}
                      {destination.nature.nearest.dist_km != null ? `, ${destination.nature.nearest.dist_km} km` : ''}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Highlights and the one map, three toggleable layers. */}
            {(highlights.length > 0 || !loading) && (
              <div className="dsheet-card">
                <SectionTitle icon={MapPinIcon}>{t('dest.mapTitle')}</SectionTitle>
                {layerChoices.length > 1 && (
                  <div className="destp-layers" role="tablist" aria-label={t('dest.mapTitle')}>
                    {layerChoices.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        role="tab"
                        aria-selected={mapLayer === c.key}
                        className={`destp-layer ${mapLayer === c.key ? 'on' : ''}`}
                        onClick={() => setMapLayer(c.key)}
                      >
                        {c.label} <span className="mono">{c.n}</span>
                      </button>
                    ))}
                  </div>
                )}
                <React.Suspense fallback={<div className="place-map place-map-wait" style={{ height: 300 }} />}>
                  <DestMap
                    ref={mapRef}
                    place={{ lat, lon, name: city }}
                    highlights={highlights}
                    trips={tripsForMap}
                    nearby={nearbyForMap}
                    active={mapLayer}
                    height={300}
                    onPickTrip={(row) => onSelect?.(row.id)}
                  />
                </React.Suspense>
                {highlights.length > 0 && (
                  <div className="destp-hls">
                    {highlights.map((h, i) => (
                      <figure className="destp-hl" key={h.id}>
                        {h.image?.url ? (
                          <img src={h.image.url} alt="" loading="lazy" />
                        ) : (
                          <span className="destp-hl-blank"><CameraIcon size={16} /></span>
                        )}
                        <figcaption>
                          <span className="destp-hl-name"><span className="destp-hl-n mono">{i + 1}</span>{h.name}</span>
                          <span className="destp-hl-sub">
                            <span>{h.kind}</span>
                            {h.dist_km != null && <span className="mono">{fmtKm(h.dist_km)}</span>}
                          </span>
                          {h.fact && <span className="destp-hl-fact">{h.fact}</span>}
                        </figcaption>
                        {safeUrl(h.wikipedia) && (
                          <a className="destp-hl-link" href={safeUrl(h.wikipedia)} target="_blank" rel="noreferrer" aria-label={h.name} />
                        )}
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Best things to do: activities, trails, festivals, with their
                evidence when the research sweep has run here. */}
            {doItems.length > 0 && (
              <div className="dsheet-card">
                <SectionTitle icon={CompassIcon}>{t('dest.doTitle')}</SectionTitle>
                <ul className="destp-dos">
                  {doItems.map((item) => (
                    <li className="destp-do" key={item.name}>
                      <span className={`destp-do-type is-${item.type}`}>{t(DO_TYPE_KEYS[item.type] || 'dest.doType.activity')}</span>
                      <span className="destp-do-main">
                        <span className="destp-do-name">
                          {item.link && safeUrl(item.link) ? (
                            <a href={activityLink(safeUrl(item.link), 'dest-do')} target="_blank" rel="noreferrer">{item.name}</a>
                          ) : item.ref && onOpenFeature ? (
                            <button type="button" className="destp-do-ref" onClick={() => onOpenFeature(item.ref.layer, item.ref)}>{item.name}</button>
                          ) : item.name}
                        </span>
                        {item.detail && <span className="destp-do-detail">{item.detail}</span>}
                        <span className="destp-do-meta">
                          {item.season?.length > 0 && (
                            <span className="mono">{item.season.map((m) => MONTHS_SHORT[m - 1]).join(', ')}</span>
                          )}
                          {/* Two evidence models, and the line says which:
                              publishers that named it, or the independent
                              institutions that list it. Never conflated. */}
                          {item.evidence?.n_sources != null && (
                            item.evidence.method === 'open' ? (
                              <span className="destp-do-evidence is-open" title={(item.evidence.sources || []).join(', ')}>
                                {item.evidence.curated
                                  ? t('dest.evidenceCurated')
                                  : t('dest.evidenceOpen', { n: item.evidence.n_sources })}
                              </span>
                            ) : (
                              <span className="destp-do-evidence">{t('dest.evidence', { n: item.evidence.n_sources, of: item.evidence.of })}</span>
                            )
                          )}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {(links.getyourguide || links.viator) && (
                  <div className="destp-book-row">
                    {links.getyourguide && (
                      <a className="xp-further-btn" href={activityLink(links.getyourguide, 'dest-book')} target="_blank" rel="noreferrer noopener">{t('dest.bookGyg')}</a>
                    )}
                    {links.viator && (
                      <a className="xp-further-btn" href={activityLink(links.viator, 'dest-book')} target="_blank" rel="noreferrer noopener">{t('dest.bookViator')}</a>
                    )}
                  </div>
                )}
                <p className="xp-source">{t('dest.bookNote')}</p>
              </div>
            )}

            {/* Best trips from here. Each card is a real catalogue place, so
                clicking one opens ITS page; the map layer shows the same set. */}
            {trips.length > 0 && (
              <div className="dsheet-card">
                <SectionTitle
                  icon={CompassIcon}
                  aside={tripsForMap.length > 0 && (
                    <button type="button" className="xp-shots-toggle" onClick={() => setMapLayer('trips')}>
                      {t('dest.tripsOnMap')}
                    </button>
                  )}
                >
                  {t('dest.tripsTitle')}
                </SectionTitle>
                <div className="destp-trips">
                  {trips.map((tr) => {
                    const inner = (
                      <>
                        {tr.image?.url ? (
                          <img src={tr.image.url} alt="" loading="lazy" />
                        ) : (
                          <span className="destp-trip-blank"><CompassIcon size={15} /></span>
                        )}
                        <span className="destp-trip-main">
                          <span className="destp-trip-head">
                            <span className="destp-trip-name">{tr.name}</span>
                            {tr.rating?.score != null && (
                              <span className="destp-trip-score mono">{tr.rating.score.toFixed(1)}</span>
                            )}
                          </span>
                          <span className="destp-trip-sub">
                            {tr.kind === 'composed_trip' ? (
                              <span>{t('dest.tripDays', { n: tr.days || 0 })}</span>
                            ) : (
                              tr.travel?.minutes != null && (
                                <span className="mono">
                                  {t('dest.minutesBy', { n: tr.travel.minutes, mode: t(`mode.${tr.travel.mode}`) })}
                                </span>
                              )
                            )}
                            {tr.rating?.label && <span>{tr.rating.label}</span>}
                          </span>
                          {/* Why this one, in the catalogue's own words. A card
                              that says only "58 min by train" is a distance,
                              not a recommendation. */}
                          {tr.blurb && <span className="destp-trip-why">{tr.blurb}</span>}
                        </span>
                      </>
                    );
                    if (tr.kind === 'composed_trip') {
                      return (
                        <button type="button" className="destp-trip" key={tr.id} onClick={() => onOpenItin?.(tr.id)} disabled={!onOpenItin}>
                          {inner}
                        </button>
                      );
                    }
                    return (
                      <button type="button" className="destp-trip" key={tr.id} onClick={() => onSelect?.(tr.id)} disabled={!onSelect}>
                        {inner}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="destp-col is-side">
            {/* What a day here costs, at the reader's own lifestyle. */}
            {cost?.dayEur != null && (
              <div className="dsheet-card">
                <SectionTitle icon={ReceiptIcon}>{t('cost.title')}</SectionTitle>
                <CostReceipt cost={cost} t={t} lifestyleLabel={lifestyleLine} onOpenLifestyle={onOpenLifestyle} />
              </div>
            )}

            {/* Insider tips: rule codes with evidence behind every sentence. */}
            {tips.length > 0 && (
              <div className="dsheet-card destp-tips">
                <SectionTitle icon={CheckIcon}>{t('dest.tipsTitle')}</SectionTitle>
                <ul className="destp-tip-list">
                  {tips.map((tip) => (
                    <li key={tip.code}>{tipText(tip, t)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Nature close by: the trails, beaches, lakes and mountains
                layers, joined to this destination for the first time. */}
            {nearbyRows.length > 0 && (
              <div className="dsheet-card">
                <SectionTitle icon={TreeIcon}>{t('dest.natureTitle')}</SectionTitle>
                <ul className="destp-nature">
                  {nearbyRows.map((f) => (
                    <li key={`${f.layer}|${f.id}`}>
                      <button
                        type="button"
                        className="destp-nat"
                        onClick={() => onOpenFeature?.(f.layer, f)}
                        disabled={!onOpenFeature}
                      >
                        {f.thumb ? (
                          <img src={f.thumb} alt="" loading="lazy" />
                        ) : (
                          <span className="destp-nat-blank"><TreeIcon size={14} /></span>
                        )}
                        <span className="destp-nat-main">
                          <span className="destp-nat-name">{f.name}</span>
                          <span className="destp-nat-sub">
                            <span>{t(`dest.layerKind.${f.layer}`)}</span>
                            {f.elev_m != null && <span className="mono">{f.elev_m} m</span>}
                            {f.km_len != null && <span className="mono">{f.km_len} km</span>}
                          </span>
                        </span>
                        <span className="destp-nat-km mono">{fmtKm(f.km)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* When to go: normals, cheap months, crowding, and the events
                Wikidata knows here. */}
            {destination.climate && (
              <div className="dsheet-card">
                <SectionTitle icon={CalendarIcon}>{t('explore.whenTitle')}</SectionTitle>
                {destination.climate && <ClimateStrip climate={destination.climate} />}
                {cheapMonths && (
                  <p className="xp-when-fact">{t('explore.whenCheapStay', { months: fmtMonthRanges(cheapMonths) })}</p>
                )}
                {crowdBadgeWorthShowing(destination) && destination.crowding?.label && (
                  <p className="xp-when-fact">{t('explore.whenCrowds', { label: destination.crowding.label })}</p>
                )}
              </div>
            )}

            {/* Festivals get their own section, led by when they happen. */}
            {festivals.length > 0 && (
              <div className="dsheet-card">
                <SectionTitle icon={CalendarIcon}>{t('dest.festivalsTitle')}</SectionTitle>
                <ul className="destp-fests">
                  {festivals.map((f) => (
                    <li className="destp-fest" key={f.name}>
                      <span className={`destp-fest-when mono ${f.months?.length ? '' : 'is-undated'}`}>
                        {f.months?.length
                          ? f.months.map((m) => MONTHS_SHORT[m - 1]).join(', ')
                          : t('pdf.dateVaries')}
                      </span>
                      <span className="destp-fest-main">
                        <span className="destp-fest-name">
                          {safeUrl(f.url) ? (
                            <a href={safeUrl(f.url)} target="_blank" rel="noreferrer">{f.name}</a>
                          ) : f.name}
                        </span>
                        {f.what && <span className="destp-fest-what">{f.what}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* This week, live. Panel only; the PDF prints normals instead. */}
            {forecast !== null && forecast !== undefined && (
              <div className="dsheet-card">
                <SectionTitle icon={SunIcon}>{t('explore.weatherTitle')}</SectionTitle>
                <div className="xp-weather">
                  {forecast.map((day) => {
                    const Glyph = WEATHER_GLYPH[day.kind] || CloudIcon;
                    return (
                      <div key={day.date} className="xp-wday" title={day.date}>
                        <span className="xp-wday-name">{fmtDay(day.date)}</span>
                        <Glyph size={17} className="xp-wday-icon" />
                        <span className="xp-wday-hi">{day.hi != null ? `${Math.round(day.hi)}°` : ''}</span>
                        <span className="xp-wday-lo">{day.lo != null ? `${Math.round(day.lo)}°` : ''}</span>
                        {day.rainPct != null && day.rainPct >= 30 && (
                          <span className="xp-wday-rain mono">{`${day.rainPct}%`}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="xp-source">{t('explore.weatherCredit')}</p>
              </div>
            )}

            {/* Where to park: ranked spots, each with three navigation apps. */}
            {parking && (parking.spots?.length > 0 || parking.park_ride) && (
              <div className="dsheet-card">
                <SectionTitle icon={ParkingIcon}>{t('explore.parkTitle')}</SectionTitle>
                <ul className="destp-park-list">
                  {(parking.spots || []).map((s, i) => (
                    <li className="destp-park" key={`${s.lat}|${s.lon}`}>
                      <span className="destp-park-main">
                        <span className="destp-park-name">{s.name || t('explore.parkUnnamed')}</span>
                        <span className="destp-park-sub">
                          <span className={s.fee === 'no' ? 'destp-park-free' : ''}>
                            {t(s.fee === 'no' ? 'explore.parkFree' : s.fee === 'yes' ? 'explore.parkPaid' : 'explore.parkFeeUnknown')}
                          </span>
                          {s.capacity != null && <span className="mono">{t('explore.parkSpaces', { n: s.capacity })}</span>}
                          <span className="mono">{t('dest.walkMin', { n: s.walk_min })}</span>
                        </span>
                      </span>
                      <span className="destp-park-nav">
                        <a href={s.nav.gmaps} target="_blank" rel="noreferrer noopener">{t('dest.navGmaps')}</a>
                        <a href={s.nav.waze} target="_blank" rel="noreferrer noopener">{t('dest.navWaze')}</a>
                      </span>
                    </li>
                  ))}
                  {parking.park_ride && (
                    <li className="destp-park is-pr" key="pr">
                      <span className="destp-park-main">
                        <span className="destp-park-name">{parking.park_ride.name || t('explore.park.park_ride')}</span>
                        <span className="destp-park-sub">
                          <span>{t('explore.park.park_ride')}</span>
                          <span className="mono">{fmtKm((parking.park_ride.dist_m || 0) / 1000)}</span>
                        </span>
                      </span>
                      <span className="destp-park-nav">
                        <a href={parking.park_ride.nav.gmaps} target="_blank" rel="noreferrer noopener">{t('dest.navGmaps')}</a>
                        <a href={parking.park_ride.nav.waze} target="_blank" rel="noreferrer noopener">{t('dest.navWaze')}</a>
                      </span>
                    </li>
                  )}
                </ul>
                <p className="xp-source">{t('explore.parkCredit')}</p>
              </div>
            )}

            {/* What to bring for the month that matters here. */}
            {packs.length > 0 && (
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
            )}

            {/* Explore further: every handover, honest about being a search. */}
            <div className="dsheet-card xp-further">
              <SectionTitle icon={CompassIcon}>{t('explore.furtherTitle', { city })}</SectionTitle>
              <div className="destp-further">
                {links.flights_google && (
                  <a className="xp-further-btn" href={links.flights_google} target="_blank" rel="noreferrer noopener"><PlaneIcon size={15} /><span>{t('dest.linkGflights')}</span></a>
                )}
                {links.skyscanner && (
                  <a className="xp-further-btn" href={links.skyscanner} target="_blank" rel="noreferrer noopener"><PlaneIcon size={15} /><span>{t('dest.linkSkyscanner')}</span></a>
                )}
                {links.booking && (
                  <a className="xp-further-btn" href={links.booking} target="_blank" rel="noreferrer noopener"><BedIcon size={15} /><span>{t('dest.linkBooking')}</span></a>
                )}
                {links.airbnb && (
                  <a className="xp-further-btn" href={links.airbnb} target="_blank" rel="noreferrer noopener"><BedIcon size={15} /><span>{t('dest.linkAirbnb')}</span></a>
                )}
              </div>
              <p className="xp-source">{t('explore.furtherNote')}</p>
            </div>

            {/* Where every fact came from. The PDF prints the long form. */}
            {credits.length > 0 && (
              <p className="destp-credits">
                {t('dest.creditsLine')}{' '}
                {credits.map((c, i) => (
                  <React.Fragment key={c.key}>
                    {i > 0 && ', '}
                    <a href={safeUrl(c.url)} target="_blank" rel="noreferrer">{c.name}</a>
                  </React.Fragment>
                ))}
                .
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
