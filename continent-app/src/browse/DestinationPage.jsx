import React from 'react';
import { knownFor } from '../lib/knownFor.js';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CrowdingBadge, crowdBadgeWorthShowing } from '../components/CrowdingBadge.jsx';
import { ClimateStrip, MONTHS_SHORT, fmtMonthRanges } from './ClimateStrip.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { CostReceipt } from '../components/CostSummary.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { safeUrl, eur } from '../lib/format.js';
import { useDossier, destShareUrl } from '../lib/dossier.js';
import { activityLink } from '../lib/activityAffiliates.js';
import { mapsSearchUrl } from '../lib/destInfo.js';
import { useForecast } from '../lib/weather.js';
import { packingList, packMonth } from '../lib/packing.js';
import { cheapestStayMonths } from '../lib/costIndex.js';
import { useI18n } from '../i18n/index.jsx';
import { RatingBreakdown } from './RatingBreakdown.jsx';
import { Neighbourhoods } from './Neighbourhoods.jsx';
import { GettingThere } from './GettingThere.jsx';
import { CrowdCalendar } from './CrowdCalendar.jsx';
import { BathingWater } from './BathingWater.jsx';
import { MemberPlaces } from './MemberPlaces.jsx';
import { AroundHere, FeaturePhoto, summaryOf } from './AroundHere.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { visitLength } from '../lib/nearby.js';
import { roleOf } from '../lib/taxonomy.js';
import { KindGlyph } from '../components/KindGlyph.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import {
  TreeIcon, PersonIcon, CalendarIcon, MapPinIcon,
  ParkingIcon, SunIcon, PartSunIcon, CloudIcon, FogIcon,
  RainIcon, DrizzleIcon, SnowIcon, StormIcon, ClockIcon, CompassIcon,
  ShoeIcon, SwimIcon, BootIcon, PlugIcon, BottleIcon, JacketIcon,
  BackpackIcon, ReceiptIcon, CheckIcon, BedIcon, InfoIcon, StarIcon,
  ChevronDownIcon, ChevronRightIcon, MusicIcon, SparkIcon, LinkIcon,
  DownloadIcon, ShareIcon, BulbIcon, MedalIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

/**
 * The full-screen destination page, v2: compact by construction.
 *
 * Renders from the dossier contract (public/dossier/{id}.json, built by
 * pipeline/dossier/build_dossier.py). The PDF export renders from the SAME
 * file (lib/destinationPdf.js): one contract, two renderers, zero drift.
 *
 * Structure, top to bottom: the gallery, the head (name, badges, the short
 * intro composed from our own facts, a four-fact strip, the actions), then
 * folding sections. A closed section still answers its question in the
 * header ("When to go: best Apr, May"; "What a day costs: EUR85"), so the
 * page reads as a summary at a glance and as a guide when opened. The first
 * four sections open by default because they are why people come here:
 * highlights with the map, things to do, the outdoors within 20 km, and day
 * trips. Everything else opens on demand.
 *
 * Every picture on the page is either a Commons photograph or a basemap tile
 * of the place; a broken image never renders and no lettered plate stands in
 * for one. Sections with nothing to say are not rendered at all.
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
const DO_TYPE_ICON = {
  trail: BootIcon, activity: CompassIcon, festival: MusicIcon,
  swim: SwimIcon, experience: SparkIcon,
};

const OPEN_BY_DEFAULT = new Set(['highlights', 'do', 'around', 'trips', 'cost', 'tips']);

const baseCity = (name) => (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const fmtKm = (km) => (km < 0.95 ? `${Math.round((km * 1000) / 10) * 10} m` : `${Math.round(km)} km`);
/** Highlight photographs ship at 960px; the tiles want 500. Same file, one
 *  path segment, and Commons serves both. */
const thumb500 = (url) => (url ? url.replace(/\/960px-/, '/500px-') : url);

/** One folding section. The header is the summary when closed and the title
 *  when open; the body mounts only while open, which is also what keeps a
 *  closed map from costing a WebGL context. */
function Fold({ id, icon: Icon, title, summary, open, onToggle, children, aside, className = '' }) {
  return (
    <section className={`dsec ${open ? 'is-open' : ''} ${className}`} id={id}>
      <div className="dsec-head">
        <button type="button" className="dsec-toggle" onClick={onToggle} aria-expanded={open} aria-controls={`${id}-body`}>
          {Icon && <Icon size={14} className="dsec-icon" />}
          <span className="dsec-title">{title}</span>
          {!open && summary && <span className="dsec-summary">{summary}</span>}
          <ChevronDownIcon size={14} className="dsec-chev" />
        </button>
        {open && aside && <div className="dsec-aside">{aside}</div>}
      </div>
      {open && <div className="dsec-body" id={`${id}-body`}>{children}</div>}
    </section>
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
  const [failed, setFailed] = React.useState(() => new Set());
  const imgs = (gallery?.length ? gallery : (fallbackUrl ? [{ url: fallbackUrl }] : []))
    .filter((g) => !failed.has(g.url));

  const onScroll = (e) => {
    const el = e.currentTarget;
    const slide = el.querySelector('.destp-slide');
    if (!slide) return;
    const next = Math.round(el.scrollLeft / (slide.offsetWidth + 6));
    setIdx((cur) => (cur === next ? cur : Math.min(next, imgs.length - 1)));
  };
  const nudge = (dir) => {
    const el = scroller.current;
    const slide = el?.querySelector('.destp-slide');
    if (!el || !slide) return;
    el.scrollBy({ left: dir * (slide.offsetWidth + 6), behavior: 'smooth' });
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
              onError={() => setFailed((s) => new Set([...s, g.url]))}
            />
            {g.caption && <figcaption className="destp-slide-cap">{g.caption}</figcaption>}
            {safeUrl(g.page) && (
              <a
                className="destp-slide-credit"
                href={safeUrl(g.page)}
                target="_blank"
                rel="noreferrer"
                title={[g.author, g.licence].filter(Boolean).join(', ')}
                aria-label={[g.author, g.licence].filter(Boolean).join(', ') || 'Photo credit'}
              >
                <InfoIcon size={12} />
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
  const paywall = usePaywall();
  const pageRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const [stuck, setStuck] = React.useState(false);
  const [mapLayer, setMapLayer] = React.useState('highlights');
  const [hlFocus, setHlFocus] = React.useState(null);
  const [hlAll, setHlAll] = React.useState(false);
  const [doAll, setDoAll] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [open, setOpen] = React.useState(() => new Set(OPEN_BY_DEFAULT));

  const dossier = useDossier(destination?.id);
  // D7: a member search lands here with ?dm=<name>; that member is the
  // reason the reader arrived, so it gets the focus.
  const memberFocus = React.useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('dm') || null;
    } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.id]);

  const isOpen = (id) => open.has(id);
  const toggle = (id) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const setAllOpen = (ids, value) => setOpen((s) => {
    const n = new Set(s);
    ids.forEach((id) => { if (value) n.add(id); else n.delete(id); });
    return n;
  });
  const jumpTo = (id) => {
    setOpen((s) => new Set([...s, id]));
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector?.(`#sec-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const showOnMap = (layer) => {
    setMapLayer(layer);
    jumpTo('highlights');
  };

  React.useEffect(() => {
    setStuck(false);
    setMapLayer('highlights');
    setHlFocus(null);
    setHlAll(false);
    setDoAll(false);
    setCopied(false);
    setOpen(new Set(OPEN_BY_DEFAULT));
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
  const verdict = d?.verdict || destination.rating || null;
  const sleep = d?.sleep || null;
  const getting = d?.practical?.getting_there || null;
  const bookAhead = d?.practical?.book_ahead || [];
  const rhythm = d?.practical?.rhythm || null;
  const pairs = d?.practical?.pairs || [];
  const members = d?.members || null;
  const water = d?.water || null;
  const stayLen = visitLength(destination);
  const role = roleOf(destination, 0);
  const highlights = [...(d?.highlights || [])]
    .sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0));
  const doItems = d?.do || [];
  const trips = d?.trips || [];
  const nearby = d?.nearby || {};
  const around = d?.around || null;
  const tips = d?.tips || [];
  const parking = d?.parking;
  const festivals = d?.festivals || [];
  const links = d?.practical?.links || {};
  const credits = d?.credits || [];
  const when = d?.when || null;
  const nearbyRows = ['trails', 'beaches', 'lakes', 'mountains']
    .flatMap((layer) => (nearby[layer] || []).slice(0, 3).map((f) => ({ ...f, layer })));
  const nearbyForMap = nearbyRows.filter((f) => f.lat != null);
  const aroundForMap = around
    ? ['trails', 'cycling', 'mountains', 'lakes', 'beaches']
      .flatMap((layer) => (around[layer] || []).slice(0, 12).map((f) => ({ ...f, layer })))
      .filter((f) => f.lat != null)
    : [];
  const tripsForMap = trips.filter((x) => x.lat != null);
  const shortIntro = intro?.short || intro?.lead || kf || '';
  const guideUrl = safeUrl(intro?.grounding?.[0]?.url || destination.guide?.url);
  const bestMonths = when?.best?.length ? when.best.map((m) => MONTHS_SHORT[m - 1]).join(', ') : '';
  const bedFrom = sleep?.tiers?.dorm_pp_night_eur ?? sleep?.per_person_night_eur ?? null;

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
    if (pdfBusy || !d) return;
    if (!paywall.require('export')) return;
    setPdfBusy(true);
    try {
      const { downloadDestinationPdf } = await import('../lib/destinationPdf.js');
      await downloadDestinationPdf({
        dossier: d, destination, cost, t, lang,
        lifestyleLabel: lifestyleLine,
        stayDays: stayLen?.n || null,
      });
    } catch (e) {
      console.error('pdf export failed', e);
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
    { key: 'around', label: t('dest.layer.around'), n: aroundForMap.length },
    { key: 'trips', label: t('dest.layer.trips'), n: tripsForMap.length },
  ].filter((c) => c.n > 0);
  const effectiveLayer = layerChoices.some((c) => c.key === mapLayer) ? mapLayer
    : mapLayer === 'nearby' && nearbyForMap.length ? 'nearby' : 'highlights';

  // The consensus count groups things to do: essential, if you have time,
  // off the trail. Fewer than three evidenced items: one flat list.
  const nOf = (x) => x.evidence?.n_sources ?? 0;
  const evidenced = doItems.filter((x) => x.evidence?.n_sources != null);
  const doBuckets = evidenced.length >= 3 ? [
    ['dest.doEssential', doItems.filter((x) => nOf(x) >= 5)],
    ['dest.doIfTime', doItems.filter((x) => nOf(x) >= 2 && nOf(x) < 5)],
    ['dest.doOffTrail', doItems.filter((x) => nOf(x) < 2)],
  ].filter(([, xs]) => xs.length > 0) : [[null, doItems]];
  const DO_LIMIT = 5;
  let doShown = 0;

  const has = {
    highlights: highlights.length > 0 || !loading,
    do: doItems.length > 0,
    around: !!(around || nearbyRows.length),
    trips: trips.length > 0,
    members: members?.length > 0,
    rating: verdict?.score != null,
    when: !!destination.climate?.m,
    sleep: !!(sleep?.neighbourhoods?.length > 0 || sleep?.tiers || sleep?.seasonality),
    getting: !!(getting || rhythm || bookAhead.length > 0 || pairs.length > 0),
    cost: cost?.dayEur != null,
    tips: tips.length > 0,
    festivals: festivals.length > 0,
    weather: forecast !== null && forecast !== undefined,
    park: !!(parking && (parking.spots?.length > 0 || parking.park_ride || parking.web)),
    pack: packs.length > 0,
  };
  const navItems = [
    ['highlights', 'dest.nav.highlights'], ['do', 'dest.nav.do'], ['around', 'dest.nav.around'],
    ['trips', 'dest.nav.trips'], ['when', 'dest.nav.when'], ['sleep', 'dest.nav.sleep'],
    ['cost', 'dest.nav.cost'], ['park', 'dest.nav.park'],
  ].filter(([id]) => has[id]);
  const allIds = Object.keys(has).filter((k) => has[k]).concat(['further']);
  const allOpen = allIds.every((id) => open.has(id));

  const parkSearch = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`parking ${city}`)}`;
  const webPark = parking?.web || null;
  const cityNamed = new Set((webPark?.car_parks || []).map((c) => (c.name || '').toLowerCase()));

  return (
    <div
      ref={pageRef}
      className="destp destp-v2"
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

      {/* The section rail: tap a name, the section opens and scrolls up. */}
      <nav className="destp-subnav" aria-label={t('dest.subnavAria')}>
        <div className="destp-subnav-scroll">
          {navItems.map(([id, key]) => (
            <button key={id} type="button" onClick={() => jumpTo(id)}>{t(key)}</button>
          ))}
        </div>
        <button type="button" className="destp-subnav-all" onClick={() => setAllOpen(allIds, !allOpen)}>
          {allOpen ? t('dest.collapseAll') : t('dest.expandAll')}
        </button>
      </nav>

      <div className="destp-scroll" ref={scrollRef} onScroll={onScroll}>
        <GalleryStrip
          gallery={d?.gallery}
          city={city}
          iso2={destination.iso2}
          fallbackUrl={destination.image?.url}
        />

        <div className="destp-head">
          <div className="destp-head-main">
            <div className="destp-title-row">
              <h2 className="destp-city">{city}</h2>
              {verdict?.score != null && (
                <button type="button" className="destp-score" onClick={() => jumpTo('rating')} title={t('dest.ratingTitle', { score: verdict.score.toFixed(1) })}>
                  <ScoreChip rating={verdict} size="lg" />
                  {verdict.label && <span className="destp-score-label">{verdict.label}</span>}
                </button>
              )}
            </div>
            <div className="destp-country">
              {destination.country}
              {verdict?.country_rank === 1 ? (
                <span className="destp-rank">{t('card.topOf', { country: destination.country })}</span>
              ) : verdict?.country_badge ? (
                <span className="destp-rank">{t('card.rankIn', { n: verdict.country_rank, country: destination.country })}</span>
              ) : null}
            </div>
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
              {stayLen && (
                <span className="destp-visit"><ClockIcon size={12} />{t(stayLen.key, { n: stayLen.n })}</span>
              )}
            </div>
            {/* What this place is: two or three sentences from our own
                facts, one opening line after Wikivoyage. Never the article. */}
            {shortIntro && (
              <p className="destp-short">
                {shortIntro}
                {guideUrl && (
                  <a className="destp-short-src" href={guideUrl} target="_blank" rel="noreferrer">{t('detail.readGuide')}</a>
                )}
              </p>
            )}
          </div>
          <div className="destp-head-actions">
            <button type="button" className="destp-pdf" onClick={exportPdf} disabled={pdfBusy || loading || !d}>
              <DownloadIcon size={15} />
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
            <button type="button" className="panel-fav destp-share-btn" onClick={share}>
              <ShareIcon size={15} />
              <span>{copied ? t('dest.linkCopied') : t('dest.share')}</span>
            </button>
            <a className="panel-fav" href={mapsSearchUrl(lat, lon)} target="_blank" rel="noreferrer">
              <MapPinIcon size={15} />
              <span>{t('explore.openMaps')}</span>
            </a>
          </div>
        </div>

        {/* Four measured facts, the instrument strip. */}
        {(destination.place?.visit_h != null || bestMonths || cost?.dayEur != null || bedFrom != null) && (
          <dl className="dfacts">
            {destination.place?.visit_h != null && (
              <div className="dfact"><dt>{t('pdf.factVisit')}</dt><dd className="mono">{Math.round(destination.place.visit_h)} h</dd></div>
            )}
            {bestMonths && (
              <div className="dfact"><dt>{t('pdf.factBest')}</dt><dd className="mono">{bestMonths}</dd></div>
            )}
            {cost?.dayEur != null && (
              <div className="dfact"><dt>{t('pdf.factDay')}</dt><dd className="mono">{eur(cost.dayEur)}</dd></div>
            )}
            {bedFrom != null && (
              <div className="dfact"><dt>{t('dest.factSleep')}</dt><dd className="mono">{eur(bedFrom)}</dd></div>
            )}
          </dl>
        )}

        <div className="destp-grid">
          <div className="destp-col is-main">
            {/* Highlights and the one map, with its layers. */}
            {has.highlights && (
              <Fold
                id="sec-highlights"
                icon={MapPinIcon}
                title={t('dest.mapTitle')}
                summary={highlights.length ? t('dest.hlSummary', { n: highlights.length }) : ''}
                open={isOpen('highlights')}
                onToggle={() => toggle('highlights')}
                aside={layerChoices.length > 1 && (
                  <div className="destp-layers" role="tablist" aria-label={t('dest.mapTitle')}>
                    {layerChoices.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        role="tab"
                        aria-selected={effectiveLayer === c.key}
                        className={`destp-layer ${effectiveLayer === c.key ? 'on' : ''}`}
                        onClick={() => setMapLayer(c.key)}
                      >
                        {c.label} <span className="mono">{c.n}</span>
                      </button>
                    ))}
                  </div>
                )}
              >
                <div className="dhl-wrap">
                  <React.Suspense fallback={<div className="place-map place-map-wait dmap" />}>
                    <DestMap
                      ref={mapRef}
                      place={{ lat, lon, name: city }}
                      highlights={highlights}
                      trips={tripsForMap}
                      nearby={nearbyForMap}
                      around={aroundForMap}
                      active={effectiveLayer}
                      focus={hlFocus}
                      height={undefined}
                      onPickTrip={(row) => onSelect?.(row.id)}
                      onPickFeature={(layer, row) => onOpenFeature?.(layer, row)}
                      onPickHighlight={(i) => {
                        setHlFocus(i);
                        setHlAll(true);
                        requestAnimationFrame(() => {
                          scrollRef.current?.querySelector?.(`#hl-${i}`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        });
                      }}
                    />
                  </React.Suspense>
                  {highlights.length > 0 && (
                    <div className={`dhl-strip ${hlAll ? 'is-all' : ''}`}>
                      {(hlAll ? highlights : highlights.slice(0, 8)).map((h, i) => (
                        <figure
                          className={`dhl ${hlFocus === i ? 'is-focus' : ''}`}
                          key={h.id}
                          id={`hl-${i}`}
                          onMouseEnter={() => setHlFocus(i)}
                          onFocus={() => setHlFocus(i)}
                        >
                          <button
                            type="button"
                            className="dhl-pic"
                            onClick={() => { setHlFocus(i); setMapLayer('highlights'); }}
                            aria-label={h.name}
                          >
                            <FeaturePhoto src={thumb500(h.image?.url)} lat={h.lat} lon={h.lon} className="dhl-photo" />
                            <span className="dhl-n mono">{i + 1}</span>
                            {h.heritage && <span className="dhl-heritage" title={t('dest.unesco')}><MedalIcon size={11} /></span>}
                          </button>
                          <figcaption>
                            <span className="dhl-name">{h.name}</span>
                            <span className="dhl-sub">
                              <span>{h.kind}</span>
                              {h.dist_km != null && <span className="mono">{fmtKm(h.dist_km)}</span>}
                              {safeUrl(h.wikipedia) && (
                                <a className="dhl-link" href={safeUrl(h.wikipedia)} target="_blank" rel="noreferrer" aria-label={`${h.name}, Wikipedia`}><LinkIcon size={11} /></a>
                              )}
                            </span>
                            {h.fact && <span className="dhl-fact">{h.fact}</span>}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                  {highlights.length > 8 && (
                    <button type="button" className="dsec-more" onClick={() => setHlAll((v) => !v)}>
                      {hlAll ? t('dest.showLess') : t('dest.showAll', { n: highlights.length })}
                    </button>
                  )}
                </div>
              </Fold>
            )}

            {/* Best things to do: cards, grouped by how many guides agree. */}
            {has.do && (
              <Fold
                id="sec-do"
                icon={CompassIcon}
                title={t('dest.doTitle')}
                summary={t('dest.doSummary', { n: doItems.length })}
                open={isOpen('do')}
                onToggle={() => toggle('do')}
              >
                {doBuckets.map(([bkey, items]) => {
                  const visible = items.filter(() => {
                    if (doAll) return true;
                    doShown += 1;
                    return doShown <= DO_LIMIT;
                  });
                  if (!visible.length) return null;
                  return (
                    <React.Fragment key={bkey || 'all'}>
                      {bkey && <p className="ddo-group">{t(bkey)} <span className="mono">{items.length}</span></p>}
                      <ul className="ddo-grid">
                        {visible.map((item) => {
                          const TypeIcon = DO_TYPE_ICON[item.type] || CompassIcon;
                          const ev = item.evidence;
                          const evPct = ev?.n_sources != null
                            ? (ev.method === 'open' ? Math.min(100, ev.n_sources * 25) : Math.round((ev.n_sources / Math.max(ev.of || 1, 1)) * 100))
                            : null;
                          const href = item.link && safeUrl(item.link) ? activityLink(safeUrl(item.link), 'dest-do') : null;
                          const body = (
                            <>
                              <span className={`ddo-type is-${item.type}`}><TypeIcon size={11} />{t(DO_TYPE_KEYS[item.type] || 'dest.doType.activity')}</span>
                              <span className="ddo-name">{item.name}</span>
                              {item.detail && <span className="ddo-detail">{item.detail}</span>}
                              <span className="ddo-foot">
                                {item.season?.length > 0 && (
                                  <span className="ddo-season mono">{item.season.map((m) => MONTHS_SHORT[m - 1]).join(', ')}</span>
                                )}
                                {ev?.n_sources != null && (
                                  <span className={`ddo-ev ${ev.method === 'open' ? 'is-open' : ''}`} title={(ev.sources || ev.urls || []).join(', ')}>
                                    <span className="ddo-ev-bar" aria-hidden="true"><span style={{ width: `${Math.max(8, evPct)}%` }} /></span>
                                    <span>
                                      {ev.method === 'open'
                                        ? (ev.curated ? t('dest.evidenceCurated') : t('dest.evidenceOpen', { n: ev.n_sources }))
                                        : t('dest.evidence', { n: ev.n_sources, of: ev.of })}
                                    </span>
                                  </span>
                                )}
                                {(href || (item.ref && onOpenFeature)) && <ChevronRightIcon size={13} className="ddo-go" />}
                              </span>
                            </>
                          );
                          if (href) {
                            return (
                              <li key={item.name}><a className="ddo" href={href} target="_blank" rel="noreferrer">{body}</a></li>
                            );
                          }
                          if (item.ref && onOpenFeature) {
                            return (
                              <li key={item.name}><button type="button" className="ddo" onClick={() => onOpenFeature(item.ref.layer, item.ref)}>{body}</button></li>
                            );
                          }
                          return <li key={item.name}><span className="ddo is-static">{body}</span></li>;
                        })}
                      </ul>
                    </React.Fragment>
                  );
                })}
                {doItems.length > DO_LIMIT && (
                  <button type="button" className="dsec-more" onClick={() => setDoAll((v) => !v)}>
                    {doAll ? t('dest.showLess') : t('dest.showAll', { n: doItems.length })}
                  </button>
                )}
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
              </Fold>
            )}

            {/* Around here: the outdoors within 20 km, from every layer the
                Destinations tab knows, plus the top picks with photographs. */}
            {has.around && (
              <Fold
                id="sec-around"
                icon={TreeIcon}
                title={t('dest.aroundTitle', { city })}
                summary={summaryOf(around, t) || t('dest.natureTitle')}
                open={isOpen('around')}
                onToggle={() => toggle('around')}
              >
                <AroundHere
                  city={city}
                  nearby={nearby}
                  around={around}
                  t={t}
                  onOpenFeature={onOpenFeature}
                  onShowMap={aroundForMap.length || nearbyForMap.length ? showOnMap : null}
                />
              </Fold>
            )}

            {/* Best trips from here. Each card is a real catalogue place, so
                clicking one opens ITS page; the map layer shows the same set. */}
            {has.trips && (
              <Fold
                id="sec-trips"
                icon={CompassIcon}
                title={t('dest.tripsTitle')}
                summary={t('dest.tripsSummary', { n: trips.length })}
                open={isOpen('trips')}
                onToggle={() => toggle('trips')}
                aside={tripsForMap.length > 0 && (
                  <button type="button" className="dar-map" onClick={() => showOnMap('trips')}>{t('dest.tripsOnMap')}</button>
                )}
              >
                <div className="dtrips">
                  {trips.map((tr) => {
                    const go = tr.kind === 'composed_trip' ? () => onOpenItin?.(tr.id) : () => onSelect?.(tr.id);
                    const can = tr.kind === 'composed_trip' ? !!onOpenItin : !!onSelect;
                    return (
                      <button type="button" className="dtrip" key={tr.id} onClick={go} disabled={!can}>
                        <FeaturePhoto src={tr.image?.url} lat={tr.lat} lon={tr.lon} className="dtrip-photo" />
                        <span className="dtrip-body">
                          <span className="dtrip-head">
                            <span className="dtrip-name">{tr.name}</span>
                            {tr.rating?.score != null && <ScoreChip rating={{ score: tr.rating.score, tier: tr.rating.score >= 8 ? 3 : tr.rating.score >= 7 ? 2 : 1 }} size="sm" />}
                          </span>
                          <span className="dtrip-sub">
                            {tr.kind === 'composed_trip' ? (
                              <span className="mono">{t('dest.tripDays', { n: tr.days || 0 })}</span>
                            ) : (
                              tr.travel?.minutes != null && (
                                <span className="mono">{t('dest.minutesBy', { n: tr.travel.minutes, mode: t(`mode.${tr.travel.mode}`) })}</span>
                              )
                            )}
                            {tr.dist_km != null && <span className="mono">{tr.dist_km} km</span>}
                          </span>
                          {tr.blurb && <span className="dtrip-why">{tr.blurb}</span>}
                          <span className="dtrip-go">{t('dest.tripOpen')} <ChevronRightIcon size={12} /></span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Fold>
            )}

            {/* D7: the villages inside this area, from B1's members. */}
            {has.members && (
              <Fold
                id="sec-members"
                icon={MapPinIcon}
                title={t('dest.membersTitle')}
                summary={t('dest.membersSummary', { n: members.length })}
                open={isOpen('members')}
                onToggle={() => toggle('members')}
              >
                <MemberPlaces members={members} focusName={memberFocus} t={t} />
              </Fold>
            )}
          </div>

          <div className="destp-col is-side">
            {/* The verdict, with its argument. */}
            {has.rating && (
              <Fold
                id="sec-rating"
                icon={StarIcon}
                title={t('dest.ratingTitle', { score: verdict.score.toFixed(1) })}
                summary={verdict.label || ''}
                open={isOpen('rating')}
                onToggle={() => toggle('rating')}
              >
                <RatingBreakdown
                  rating={verdict}
                  meta={data?.meta}
                  t={t}
                  countryLine={verdict.country_rank === 1
                    ? t('card.topOf', { country: destination.country })
                    : verdict.country_badge
                      ? t('card.rankIn', { n: verdict.country_rank, country: destination.country })
                      : null}
                />
                {verdict.confidence && verdict.confidence !== 'curated' && (
                  <p className="destp-confidence">
                    {t(verdict.confidence === 'provisional' ? 'dest.confProvisional' : 'dest.confModelled')}
                  </p>
                )}
                {(stayLen || destination.place?.visit_h != null) && (
                  <p className="destp-howlong">
                    <ClockIcon size={13} />
                    <span>
                      {stayLen ? t(stayLen.key, { n: stayLen.n }) : null}
                      {' '}({t(role.labelKey)})
                    </span>
                  </p>
                )}
              </Fold>
            )}

            {/* When: the climate strip with crowding and water beside it. */}
            {has.when && (
              <Fold
                id="sec-when"
                icon={CalendarIcon}
                title={t('explore.whenTitle')}
                summary={bestMonths ? t('dest.whenSummary', { months: bestMonths }) : ''}
                open={isOpen('when')}
                onToggle={() => toggle('when')}
              >
                <ClimateStrip climate={destination.climate} />
                {cheapMonths && (
                  <p className="xp-when-fact">{t('explore.whenCheapStay', { months: fmtMonthRanges(cheapMonths) })}</p>
                )}
                <CrowdCalendar destination={destination} t={t} />
                <BathingWater water={water} destination={destination} t={t} />
              </Fold>
            )}

            {/* Where to sleep: neighbourhood prices, tiers, the price curve. */}
            {has.sleep && (
              <Fold
                id="sec-sleep"
                icon={BedIcon}
                title={t('dest.sleepTitle')}
                summary={bedFrom != null ? t('dest.sleepSummary', { eur: Math.round(bedFrom) }) : ''}
                open={isOpen('sleep')}
                onToggle={() => toggle('sleep')}
              >
                <Neighbourhoods sleep={sleep} t={t} />
              </Fold>
            )}

            {/* Getting there and around. */}
            {has.getting && (
              <Fold
                id="sec-getting"
                icon={PlaneIcon}
                title={t('dest.gettingTitle')}
                summary={getting?.airport
                  ? (getting.transfer_min != null
                    ? t('dest.flyToWithTransfer', { iata: getting.airport, n: getting.transfer_min, mode: t(`mode.${getting.transfer_mode || 'train'}`) })
                    : t('dest.flyTo', { iata: getting.airport }))
                  : (getting?.transit ? t(`dest.transit.${getting.transit}`) : '')}
                open={isOpen('getting')}
                onToggle={() => toggle('getting')}
              >
                {getting && <GettingThere getting={getting} t={t} />}
                {rhythm && <p className="destp-rhythm">{rhythm}</p>}
                {bookAhead.length > 0 && (
                  <p className="destp-bookahead">
                    <span className="destp-bookahead-mark" aria-hidden="true">!</span>
                    {t('dest.bookAhead', { names: bookAhead.join(', ') })}
                  </p>
                )}
                {pairs.length > 0 && (
                  <div className="destp-pairs">
                    <span className="destp-pairs-label">{t('dest.pairsWith')}</span>
                    {pairs.map((pr) => (
                      <button key={pr.id} type="button" className="destp-pair"
                        onClick={() => onSelect?.(pr.id)}>
                        <KindGlyph kind={pr.kind} size={10} label={t(`pkind.${pr.kind}`)} />
                        <span>{pr.name}</span>
                        <span className="mono">{pr.km} km</span>
                      </button>
                    ))}
                  </div>
                )}
              </Fold>
            )}

            {/* What a day here costs, at the reader's own lifestyle. */}
            {has.cost && (
              <Fold
                id="sec-cost"
                icon={ReceiptIcon}
                title={t('cost.title')}
                summary={t('dest.costSummary', { eur: Math.round(cost.dayEur) })}
                open={isOpen('cost')}
                onToggle={() => toggle('cost')}
              >
                <CostReceipt cost={cost} t={t} lifestyleLabel={lifestyleLine} onOpenLifestyle={onOpenLifestyle} />
                {stayLen?.n >= 2 && (
                  <p className="destp-triptotal">
                    {t('dest.tripTotal', {
                      eur: new Intl.NumberFormat('en-GB').format(Math.round(cost.dayEur * stayLen.n)),
                      n: stayLen.n,
                    })}
                  </p>
                )}
              </Fold>
            )}

            {/* Insider tips: rule codes with evidence behind every sentence. */}
            {has.tips && (
              <Fold
                id="sec-tips"
                icon={BulbIcon}
                title={t('dest.tipsTitle')}
                summary={t('dest.tipsSummary', { n: tips.length })}
                open={isOpen('tips')}
                onToggle={() => toggle('tips')}
                className="dsec-tips"
              >
                <ul className="destp-tip-list">
                  {tips.map((tip) => (
                    <li key={tip.code}>{tipText(tip, t)}</li>
                  ))}
                </ul>
              </Fold>
            )}

            {/* Festivals, led by when they happen. */}
            {has.festivals && (
              <Fold
                id="sec-festivals"
                icon={CalendarIcon}
                title={t('dest.festivalsTitle')}
                summary={t('dest.festSummary', { n: festivals.length })}
                open={isOpen('festivals')}
                onToggle={() => toggle('festivals')}
              >
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
              </Fold>
            )}

            {/* This week, live. Page only; the PDF prints normals instead. */}
            {has.weather && (
              <Fold
                id="sec-weather"
                icon={SunIcon}
                title={t('explore.weatherTitle')}
                summary={forecast[0]?.hi != null ? t('dest.weatherSummary', { hi: Math.round(forecast[0].hi) }) : ''}
                open={isOpen('weather')}
                onToggle={() => toggle('weather')}
              >
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
              </Fold>
            )}

            {/* Where to park: OSM spots with deeplinks, the city's own word
                where the web check has run, and an honest provenance line. */}
            {has.park && (
              <Fold
                id="sec-park"
                icon={ParkingIcon}
                title={t('explore.parkTitle')}
                summary={[
                  parking.spots?.length ? t('dest.parkSummary', { n: parking.spots.length }) : '',
                  parking.park_ride ? t('explore.park.park_ride') : '',
                ].filter(Boolean).join(', ')}
                open={isOpen('park')}
                onToggle={() => toggle('park')}
              >
                {webPark && (
                  <div className="dpark-web">
                    <p className="dpark-web-head"><CheckIcon size={12} />{t('dest.parkChecked', { date: webPark.checked })}</p>
                    {webPark.restricted && (
                      <p className="dpark-web-line is-warn">{t('dest.parkRestricted')}{webPark.restricted_note ? ` ${webPark.restricted_note}` : ''}</p>
                    )}
                    {webPark.advice && <p className="dpark-web-line">{webPark.advice}</p>}
                    {webPark.car_parks?.length > 0 && (
                      <p className="dpark-web-line">
                        <b>{t('dest.parkCityNamed')}:</b> {webPark.car_parks.map((c) => c.name + (c.note ? ` (${c.note})` : '')).join(', ')}
                      </p>
                    )}
                    {webPark.park_ride_names?.length > 0 && (
                      <p className="dpark-web-line"><b>{t('explore.park.park_ride')}:</b> {webPark.park_ride_names.join(', ')}</p>
                    )}
                    {safeUrl(webPark.official_url) && (
                      <a className="dpark-web-link" href={safeUrl(webPark.official_url)} target="_blank" rel="noreferrer noopener"><LinkIcon size={11} />{t('dest.parkOfficial')}</a>
                    )}
                  </div>
                )}
                <ul className="destp-park-list">
                  {(parking.spots || []).map((s) => {
                    const confirmed = s.name && cityNamed.has(s.name.toLowerCase());
                    return (
                      <li className="destp-park" key={`${s.lat}|${s.lon}`}>
                        <span className="destp-park-main">
                          <span className="destp-park-name">
                            {s.name || t('explore.parkUnnamed')}
                            {confirmed && <span className="dpark-ok"><CheckIcon size={10} />{t('dest.parkVerified')}</span>}
                          </span>
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
                    );
                  })}
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
                <a className="xp-further-btn dpark-search" href={parkSearch} target="_blank" rel="noreferrer noopener"><ParkingIcon size={14} /><span>{t('dest.parkSearch')}</span></a>
                <p className="xp-source">{t('dest.parkSource')}</p>
              </Fold>
            )}

            {/* What to bring for the month that matters here. */}
            {has.pack && (
              <Fold
                id="sec-pack"
                icon={BackpackIcon}
                title={t('explore.packTitle')}
                summary={destination.climate ? t('explore.packFor', { month: MONTHS_SHORT[month - 1] }) : ''}
                open={isOpen('pack')}
                onToggle={() => toggle('pack')}
              >
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
              </Fold>
            )}

            {/* Explore further: every handover, honest about being a search. */}
            <Fold
              id="sec-further"
              icon={CompassIcon}
              title={t('explore.furtherTitle', { city })}
              summary={t('dest.furtherSummary')}
              open={isOpen('further')}
              onToggle={() => toggle('further')}
            >
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
            </Fold>

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
