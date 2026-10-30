import React from 'react';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { knownFor } from '../lib/knownFor.js';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { safeUrl } from '../lib/format.js';
import { useDossier, destShareUrl } from '../lib/dossier.js';
import { activityLink } from '../lib/activityAffiliates.js';
import { packingList, packMonth } from '../lib/packing.js';
import { useStaysVersion } from '../lib/staysData.js';
import { seasonCurve } from '../lib/stayPrice.js';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { useI18n } from '../i18n/index.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { classRankLine, poiLabel, ratingWords } from '../lib/rating.js';
import { fetchDestPois } from '../lib/appData.js';
import { visitLength } from '../lib/nearby.js';
import { countryName } from '../lib/countryName.js';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useFirstRun } from '../lib/firstRunContext.js';
import { MatchLine } from './WhyItMatches.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { DestPriceCard } from './DestPriceCard.jsx';
import { PageBar } from './PageBar.jsx';
import { KeyFacts } from './KeyFacts.jsx';
import { usePageArrival } from '../hooks/usePageArrival.js';
import { Button, Chip, Money } from '../components/ui/index.js';
import { BedIcon, CompassIcon, RouteIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { FriendsWentHere } from '../components/FriendsWentHere.jsx';
import { tabFromHash, aroundCategories, defaultAroundKey } from '../lib/destOverview.js';
import { featureHref, linkOpener } from '../lib/featureHref.js';
import {
  baseCity, monthOf, photoMatcher, thumb500, NOT_A_VIEW, isArea, useDoPhotos,
} from './destParts.js';
import { DestOverview } from './DestOverview.jsx';
import { DestSee, DestAround } from './DestNearby.jsx';
import { DestWhen, monthDayCosts } from './DestWhen.jsx';
import { DestStay, DestGetting, DestPractical } from './DestPractical.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { resolveWhen, whenMonth, xmFromSearch } from '../lib/when.js';
import { crowdFor, CROWD_TIER_KEYS } from '../lib/crowdMonth.js';
import { mobilityStat } from '../lib/mobility.js';
import { pickAirport, airportLine } from '../lib/airportPick.js';
import { useDayView } from '../hooks/useDayView.js';
import { homePoint, partyOf } from '../lib/travelWay.js';
import { destAnchor } from '../lib/origins.js';
import { homeFlightSetup } from './cartaFlight.js';
import { waysThere } from './placeWays.js';
import { JumpBar, PSection, PriceDock, scrollToSection, useWide } from './PageTemplate.jsx';

/**
 * The full-screen destination page, v5 (T912, the owner's approved spec of
 * 2026-10-30, "Place and trip pages: one long page, one price, one button";
 * v4 was T499 with four tabs).
 *
 * Renders from the dossier contract (public/dossier/{id}.json, built by
 * pipeline/dossier/build_dossier.py). The PDF export renders from the SAME
 * file (lib/destinationPdf.js): one contract, two renderers, zero drift.
 *
 * Top to bottom: the page bar (back, save, share); the photographs (a swipe
 * carousel on a phone, a 1 + 4 mosaic from 700 px); the head (the name, the
 * flag and the country, the Score with its rank, UNESCO and hidden gem as
 * badges, the match, the intro); the facts row (best time, crowds, the hours
 * of sights, getting around, the airport); then ONE long page under a sticky
 * jump bar: Overview (Good to know, Eat and drink), What to see, Around, When
 * to go, Where to stay, Getting there, Practical, and Places like this at
 * the foot. The tabs are gone; a link or an address that named a tab
 * (#dest=OPO&tab=when, the Score's #sec-rating) scrolls to its section.
 *
 * The price card holds the page's one primary ("Plan a trip here"): a sticky
 * right column from 1024 px; below that it sits in the page ("What a day
 * costs") and a fixed bar at the foot carries the price, the dates and the
 * party, and the primary. That bar stands where the phone's bottom nav
 * stands, since the page covers the app while it is open.
 *
 * A section, a row or a cell without data is not drawn, and its jump link
 * goes with it: no "Not available yet" and no "nothing within 20 km" lines
 * on this page (the owner, 2026-10-30).
 */

/** The address the app booted on (#dest=FCO&tab=nearby). The app's boot
 *  reader strips the hash before this page first renders, so the tab it
 *  named is read here, at module load, and honoured once. */
const BOOT_HASH = typeof window !== 'undefined' ? window.location.hash || '' : '';
let bootTabSpent = false;
function initialTab(id) {
  if (!id || typeof window === 'undefined') return null;
  return tabFromHash(window.location.hash, id)
    || (!bootTabSpent && tabFromHash(BOOT_HASH, id))
    || null;
}
/** The section an old tab id (an address, a caller) now scrolls to. */
const TAB_SECTION = { overview: 'pt-overview', nearby: 'pt-see', when: 'pt-when', practical: 'pt-practical' };

/**
 * Remembered folds (carta-design "Remembered state", T385): the folds a
 * traveller opened on a destination come back when they return to it in the
 * same session, never across sessions.
 */
const FOLD_STORE = 'carta.destFolds.v2';
function readFolds(id) {
  if (!id) return null;
  try {
    const all = JSON.parse(sessionStorage.getItem(FOLD_STORE) || '{}');
    return Array.isArray(all[id]) ? new Set(all[id]) : null;
  } catch { return null; }
}
function writeFolds(id, set) {
  if (!id) return;
  try {
    const all = JSON.parse(sessionStorage.getItem(FOLD_STORE) || '{}');
    all[id] = [...set];
    sessionStorage.setItem(FOLD_STORE, JSON.stringify(all));
  } catch { /* storage unavailable: the defaults still hold */ }
}

/** The page's photographs: the shared PhotoGallery in its mosaic layout, the
 *  one the trip page opens on too. A caption that is the record's own name
 *  ("Rome (Fiumicino)") names the town, not its airport (T385). */
function GalleryStrip({ gallery, city, iso2, fallbackUrl, destId }) {
  const capOf = (cap) => (cap && baseCity(cap) === city ? city : (cap || ''));
  const photos = (gallery?.length ? gallery : (fallbackUrl ? [{ url: fallbackUrl }] : []))
    .map((g) => ({ ...g, caption: capOf(g.caption) || city }));
  return (
    <PhotoGallery layout="mosaic" photos={photos} label={city} claimKey={destId} fallback={{ city, iso2 }} />
  );
}

/** The Where to stay data (T534): beds, the measured month shape and the
 *  neighbourhood medians, or null when there is none of it. */
function destSleep(destination, d, version) {
  const beds = destination?.accommodation?.beds || null;
  const curve = version >= 0 ? seasonCurve(destination) : null;
  const hoods = d?.sleep?.neighbourhoods || destination?.accommodation?.neighbourhoods || null;
  return beds || curve || hoods?.length
    ? { beds, curve, neighbourhoods: hoods, q: destination?.accommodation?.q || null } : null;
}

const SIMILAR_WHY = ['cheaper', 'quieter', 'same_class', 'same_style'];

/** Places like this (d.similar): a card a place, its runtime day price looked
 *  up by id; two whole cards a row on a phone (the owner's standing rule). */
function Similar({ rows, data, indices, t, view, onSelect }) {
  const cards = (rows || []).filter((r) => r?.id && r.name).slice(0, 6);
  if (!cards.length) return null;
  return (
    <PSection id="pt-similar" title={t('destx.similar')}>
      <ul className="pt-similar">
        {cards.map((r) => {
          const rec = data?.destinations?.[r.id] || null;
          const cost = indices?.get?.(r.id) || null;
          const href = featureHref('dest', { id: r.id });
          const why = (r.why || []).filter((w) => SIMILAR_WHY.includes(w)).map((w) => t(`destx.why.${w}`));
          return (
            <li key={r.id} className="pt-sim">
              <a className="pt-sim-link" href={href} onClick={linkOpener(() => onSelect?.(r.id))}>
                <span className="pt-sim-photo">
                  <HeroImage url={rec?.image?.url || null} city={r.name} iso2={r.iso2 || rec?.iso2} maxWidth={500}
                    sizes="(max-width: 700px) 45vw, 240px" ratio={[4, 3]} />
                </span>
                <span className="pt-sim-name">{r.name}</span>
              </a>
              <span className="pt-sim-meta">
                {(r.iso2 || rec?.iso2) && <CountryFlag country={r.iso2 || rec?.iso2} size={13} />}
                <span>{countryName(r.iso2 || rec?.iso2, r.country || rec?.country)}</span>
                {r.score != null && <ScoreChip rating={{ score: r.score }} size="sm" />}
              </span>
              {Number.isFinite(cost?.dayEur) && (
                <span className="pt-sim-price">
                  <Money value={view.day(cost.dayEur)} />
                  <span className="pt-sim-unit"> {view.unit}</span>
                </span>
              )}
              {why.length > 0 && <span className="pt-sim-why">{why.join(', ')}</span>}
            </li>
          );
        })}
      </ul>
    </PSection>
  );
}

export function DestinationPage({
  destination, data, choices, onOpenLifestyle, onClose, onSelect,
  isFavorite, onToggleFavorite, onOpenFeature, onOpenItin,
  // The two doors into the planners (App.openTripForCountry / openDayForDest).
  onPlanTrip = null, onPlanDay = null,
  // What the back control names: the tab the page closes back to (T474).
  backLabel = '',
}) {
  const { t, lang, languages } = useI18n();
  const paywall = usePaywall();
  const pageRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const [stuck, setStuck] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  // One-line status for a failed PDF or a blocked clipboard (T405).
  const [notice, setNotice] = React.useState(null);
  const [open, setOpen] = React.useState(() => readFolds(destination?.id) || new Set());
  // The chosen Around chip; null until the traveller picks.
  const [aroundPick, setAroundPick] = React.useState(null);
  // A section to scroll to once the page has drawn it: the tab an address
  // named, or a jump asked before the dossier answered.
  const [pendingJump, setPendingJump] = React.useState(() => {
    const tab = initialTab(destination?.id);
    return tab && tab !== 'overview' ? { id: TAB_SECTION[tab] } : null;
  });
  const [cardSignal, setCardSignal] = React.useState(0);
  const wide = useWide();
  const firstRun = useFirstRun();
  const view = useDayView();   // T694: per person or the group's total
  const tripMonth = monthOf(firstRun?.departDate || firstRun?.defaultDates?.start || null);
  const defaults = firstRun?.defaultDates || null;
  const datesOwn = !!(defaults && firstRun?.departDate
    && (firstRun.departDate !== defaults.start || (firstRun.returnDate && firstRun.returnDate !== defaults.end)));

  // T649: the traveller's when (exact, month or any), read once by lib/when.js.
  const settingsCtx = useSettings();
  const xm = xmFromSearch(typeof window === 'undefined' ? '' : window.location.search);
  const tripWhen = xm ? resolveWhen({ xm })
    : (settingsCtx?.when
      ?? resolveWhen({ ownDates: datesOwn, departDate: firstRun?.departDate, returnDate: firstRun?.returnDate }));
  const statMonth = whenMonth(tripWhen);

  const dossier = useDossier(destination?.id);
  const staysVersion = useStaysVersion();
  // D7: a member search lands here with ?dm=<name>.
  const memberFocus = React.useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('dm') || null;
    } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-reads ?dm= from the address bar, which is not React state, each time the page changes destination
  }, [destination?.id]);

  const isOpen = (id) => open.has(id);
  const toggle = (id) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  React.useEffect(() => {
    if (destination) bootTabSpent = true;
  }, [destination]);

  const destId = destination?.id ?? null;
  const lastId = React.useRef(destId);
  React.useEffect(() => {
    if (lastId.current === destId) return;
    lastId.current = destId;
    setStuck(false);
    setCopied(false);
    setNotice(null);
    setAroundPick(null);
    const tab = initialTab(destId);
    setPendingJump(tab && tab !== 'overview' ? { id: TAB_SECTION[tab] } : null);
    setOpen(readFolds(destId) || new Set());
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [destId]);

  React.useEffect(() => {
    writeFolds(destination?.id, open);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writes on a fold change only
  }, [open]);

  /** A jump within the page: what used to show a tab (a caller, an address,
   *  a See all) now scrolls to that tab's section, or to `anchor`. */
  const goTab = React.useCallback((next, anchor = null) => {
    setPendingJump({ id: anchor || TAB_SECTION[next] || null, n: Date.now() });
  }, []);

  // Escape closes it, capture phase; the same hook gives the dialog its
  // focus management. An open dropdown keeps its own Escape.
  const backRef = React.useRef(null);
  const skipEscape = React.useCallback(
    () => !!pageRef.current?.querySelector('.dropdown-menu'), []);
  const titleRef = React.useRef(null);
  const arrivalRef = usePageArrival(pageRef, destination?.id ?? null);
  useFocusTrap(pageRef, onClose, {
    initialFocusRef: arrivalRef,
    skipEscapeWhen: skipEscape,
    enabled: !!destination,
  });

  // Photographs for the things to do.
  const doPhotos = useDoPhotos(destination?.id);
  // The POI labels (Must-see, Recommended, Worth a look) by name (T763).
  const [poiLabels, setPoiLabels] = React.useState(null);
  React.useEffect(() => {
    const id = destination?.id;
    setPoiLabels(null);
    if (!id) return undefined;
    let live = true;
    fetchDestPois(id).then((items) => {
      if (!live) return;
      const m = new Map();
      for (const p of items || []) {
        if (!p?.name) continue;
        const label = 'label' in p ? (p.label || null) : poiLabel(p);
        if (label && !m.has(p.name.toLowerCase())) m.set(p.name.toLowerCase(), label);
      }
      setPoiLabels(m);
    });
    return () => { live = false; };
  }, [destination?.id]);

  const loading = dossier === undefined;
  const settled = !loading;

  // A queued jump runs once its section is on the page.
  React.useEffect(() => {
    if (!pendingJump?.id || !settled) return;
    const sc = scrollRef.current;
    if (!sc) return;
    const id = pendingJump.id;
    setPendingJump(null);
    requestAnimationFrame(() => { scrollToSection(sc, id); });
  }, [pendingJump, settled]);

  if (!destination) return null;

  const city = baseCity(destination.city);
  const DEST_REPORT = { layer: 'dest', id: destination.id, cc: destination.iso2, name: city };
  const d = dossier || null;
  const kf = knownFor(destination);
  const month = tripMonth || packMonth(destination);
  const packs = packingList(destination, month);

  const intro = d?.intro;
  const verdict = (d?.verdict || destination.rating)
    ? { ...(d?.verdict || {}), ...(destination.rating || {}) }
    : null;
  const verdictBand = ratingWords(verdict, t)?.word || '';
  const verdictClassRank = classRankLine(verdict, t);
  const sleep = destSleep(destination, d, staysVersion);
  const gettingRaw = d?.practical?.getting_there || null;
  const getting = destination.airports?.length && !gettingRaw?.airports
    ? { ...(gettingRaw || {}), airport: gettingRaw?.airport || destination.airports[0].iata, airports: destination.airports }
    : gettingRaw;
  const bookAhead = d?.practical?.book_ahead || [];
  const rhythm = d?.practical?.rhythm || null;
  const pairs = d?.practical?.pairs || [];
  const members = d?.members || null;
  const water = d?.water || null;
  const stayLen = visitLength(destination);
  const hlPhoto = photoMatcher([
    ...(d?.highlights || []).filter((h) => h.image?.url && !NOT_A_VIEW.test(h.image.url))
      .map((h) => ({ name: h.name, img: thumb500(h.image.url) })),
    ...(d?.gallery || []).filter((g) => g.caption && baseCity(g.caption) !== city && !NOT_A_VIEW.test(g.url))
      .map((g) => ({ name: g.caption, img: g.thumb || thumb500(g.url) })),
  ]);
  const highlights = [...(d?.highlights || [])]
    .sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0))
    .map((h) => {
      const label = h.name ? poiLabels?.get(h.name.toLowerCase()) : null;
      const photo = h.image?.url ? null : hlPhoto(h.name);
      return { ...h, ...(label ? { label } : {}), ...(photo ? { photo } : {}) };
    });
  const doItems = [...(d?.do || [])]
    .sort((a, b) => (b.evidence?.n_sources ?? -1) - (a.evidence?.n_sources ?? -1));
  const doRows = doItems.slice(0, 16).map((item, i) => {
    const poi = doPhotos(item.name);
    return { ...item, key: `${i}:${item.name}`, photo: hlPhoto(item.name) || (poi ? thumb500(poi) : null) };
  });
  const trips = d?.trips || [];
  const nearby = d?.nearby || {};
  const around = d?.around || null;
  const tips = d?.tips || [];
  const parking = d?.parking;
  const festivals = d?.festivals || [];
  const links = d?.practical?.links || {};
  const routeRows = d?.routes || {};
  const shortIntro = intro?.short || intro?.lead || kf || '';
  const guideUrl = safeUrl(intro?.grounding?.[0]?.url || destination.guide?.url);
  const isUnesco = (destination.designations || []).some((g) => g.kind === 'unesco_whc');
  const monthList = (ms) => fmtMonthRanges(ms, t);
  const countryLabel = countryName(destination.iso2, destination.country);
  const fmtScore = (n) => {
    try { return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n); } catch { return Number(n).toFixed(1); }
  };
  const n1 = (v) => Number(v).toLocaleString(lang, { maximumFractionDigits: 1 });

  // The facts row (the owner's spec): best time, crowds, the hours of
  // sights, getting around, the airport. A missing fact is left out.
  const aroundStat = mobilityStat(destination, t, lang);
  const airportPick = pickAirport(getting);
  const airportText = airportPick ? (airportPick.minutes != null && (airportPick.road || airportPick.mode)
    ? airportLine(airportPick, t, '') : airportPick.iata) : null;
  const crowd = crowdFor(destination.crowding, tripWhen);
  const crowdText = !crowd ? null
    : crowd.kind === 'tier' ? t(CROWD_TIER_KEYS[crowd.tier])
    : crowd.kind === 'pattern' ? t('dest.crowdPattern', { quiet: monthList(crowd.quiet), busy: monthList(crowd.busy) })
    : t('dest.crowdFlat', { label: t(CROWD_TIER_KEYS[crowd.tier]) });
  const visitH = Number(d?.place?.visit_h ?? intro?.facts?.visit_h);
  const bestMonths = d?.when?.best?.length ? d.when.best : destination.climate?.best;
  const keyFacts = [
    bestMonths?.length > 0 && { key: 'best', label: t('dest.keyBest'), value: monthList(bestMonths) },
    crowdText && { key: 'crowds', label: t('dest.keyCrowds'), value: crowdText },
    Number.isFinite(visitH) && visitH > 0 && { key: 'sights', label: t('destx.fact.sights'), value: t('destx.fact.sightsValue', { n: n1(Math.round(visitH)) }) },
    aroundStat?.value && { key: 'around', label: t('dest.keyAround'), value: aroundStat.value },
    airportPick && { key: 'airport', label: t('destx.fact.fly'), value: airportPick.iata },
  ].filter(Boolean);

  const share = async () => {
    const url = destShareUrl(destination.id);
    try {
      if (navigator.share) { await navigator.share({ title: city, url }); return; }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice({ key: 'dest.shareBlocked', url });
    }
  };

  // The PDF still prints the day at the traveller's Lifestyle and its basis.
  const costRow = firstRun?.indices?.get?.(destination.id) || null;
  const profileKey = matchProfile(choices?.lifestyle || {});
  const lifestyleLine = t('cost.atLifestyle', {
    profile: profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom'),
    stay: t(`stay.${costRow?.stayTier || choices?.stay_tier || 'home'}`).toLowerCase(),
  });
  const exportPdf = async () => {
    if (pdfBusy || !d) return;
    if (!paywall.require('export')) return;
    setNotice(null);
    setPdfBusy(true);
    try {
      const { downloadDestinationPdf } = await import('../lib/destinationPdf.js');
      await downloadDestinationPdf({
        dossier: { ...d, highlights, sleep: sleep || d.sleep }, destination, cost: costRow, t, lang,
        lifestyleLabel: lifestyleLine,
        stayDays: stayLen?.n || null,
      });
    } catch (e) {
      console.error('pdf export failed', e);
      setNotice({ key: 'dest.pdfFailed' });
    } finally {
      setPdfBusy(false);
    }
  };

  const onScroll = (e) => {
    const next = e.currentTarget.scrollTop > 160;
    setStuck((cur) => (cur === next ? cur : next));
  };

  // Day trips: the dossier's trips, then the places it pairs with that are
  // not already among them, never the place itself.
  const tripRows = (() => {
    const seen = new Set(trips.map((tr) => tr.id));
    const paired = pairs.filter((pr) => pr.id && !seen.has(pr.id)).map((pr) => ({
      kind: 'destination', id: pr.id, name: pr.name, dist_km: pr.km,
      rating: pr.score != null ? { score: pr.score } : null,
    }));
    return [...trips, ...paired].filter((tr) => tr.id !== destination.id)
      .map((tr, i) => ({ ...tr, key: `${i}:${tr.id}` }));
  })();
  const cats = aroundCategories({ around, nearby, routes: routeRows, trips: tripRows });
  const aroundKey = aroundPick || defaultAroundKey(cats.filter((c) => c.key !== 'trips'));
  const hasRoutes = (routeRows.hiking?.length || 0) + (routeRows.cycling?.length || 0) > 0
    || !!routeRows.node_network?.km;

  const exits = [
    links.booking && { key: 'bk', href: links.booking, label: t('dest.linkBooking'), Icon: BedIcon },
    links.airbnb && { key: 'ab', href: links.airbnb, label: t('dest.linkAirbnb'), Icon: BedIcon },
    links.getyourguide && { key: 'gyg', href: activityLink(links.getyourguide, 'dest-book'), label: t('dest.bookGyg'), Icon: CompassIcon },
    links.viator && { key: 'via', href: activityLink(links.viator, 'dest-book'), label: t('dest.bookViator'), Icon: CompassIcon },
    links.flights_google && { key: 'gf', href: links.flights_google, label: t('dest.linkGflights'), Icon: PlaneIcon },
    links.skyscanner && { key: 'sky', href: links.skyscanner, label: t('dest.linkSkyscanner'), Icon: PlaneIcon },
  ].filter(Boolean);

  // Getting there from the traveller's home, by the app's own travel models.
  const homeChoices = settingsCtx
    ? { drive_home: settingsCtx.fromPlace, origin: settingsCtx.origin }
    : { drive_home: firstRun?.choices?.drive_home, origin: firstRun?.choices?.origin };
  const partyChoices = settingsCtx
    ? { group_size: settingsCtx.party, children: settingsCtx.children, babies: settingsCtx.babies }
    : firstRun?.choices;
  const request = settingsCtx?.priceRequest || firstRun?.priceRequest || null;
  const fl = homeFlightSetup(firstRun);
  const ways = settled ? waysThere({
    dest: destination,
    anchor: destAnchor(destination),
    home: homePoint(homeChoices, data),
    party: partyOf(partyChoices),
    flights: fl.file,
    request,
    bagKey: request?.baggage || fl.bagKey,
  }) : null;

  // What a day costs by month: the measured bed curve on the card's own row.
  const monthCosts = monthDayCosts(sleep?.curve, costRow, tripMonth, statMonth);

  const priceCard = settled ? (
    <DestPriceCard
      dest={destination}
      city={city}
      onOpenLifestyle={onOpenLifestyle}
      onPlanTrip={onPlanTrip}
      onPlanDay={onPlanDay}
      doItems={doItems}
      openSignal={cardSignal}
    />
  ) : null;

  // The page's one reading of the dossier, handed to every section.
  const p = {
    t, lang, city, destination, data, d, lat: destination.city_lat ?? destination.lat,
    lon: destination.city_lon ?? destination.lon, scrollRef, view,
    highlights, doRows, monthList, fmtScore,
    cats, aroundKey, setAroundKey: setAroundPick, aroundKm: around?.radius_km || 20,
    area: isArea(d), routeRows, hasRoutes, members, memberFocus,
    monthPick: statMonth, water, festivals, crowdText, monthCosts,
    getting, rhythm, bookAhead, verdict, verdictBand, sleep, tips, packs, month, parking, exits,
    isOpen, toggle, onOpenLifestyle, onOpenFeature, onSelect, onOpenItin, goTab,
    exportPdf, pdfBusy, pdfReady: !!d, ways, aroundStat, airportText, guideUrl,
    carDayEur: getting?.car_needed ? getting.rental_eur_day ?? null : null,
  };

  const jumps = [
    ['overview', 'pt-overview'], ['see', 'pt-see'], ['around', 'pt-around'], ['when', 'pt-when'],
    ['stay', 'pt-stay'], ['getting', 'pt-getting'], ['practical', 'pt-practical'],
  ].map(([key, id]) => ({ key, id, label: t(`destx.jump.${key}`) }));

  // The foot bar's line: the dates and the party, as the card's fields say it.
  const bcp47 = languages?.find?.((l) => l.code === lang)?.bcp47 || 'en-GB';
  const shortDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short', timeZone: 'UTC' })
        .format(new Date(`${iso}T00:00:00Z`));
    } catch { return iso; }
  };
  const fromIso = firstRun?.departDate || defaults?.start || null;
  const toIso = firstRun?.returnDate || defaults?.end || null;
  const people = Math.max(1, Math.round(firstRun?.choices?.group_size || 2));
  const dockInputs = [
    fromIso && toIso ? t('settings.datesRange', { start: shortDate(fromIso), end: shortDate(toIso) }) : null,
    people === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: people }),
  ].filter(Boolean).join(', ');
  const openCard = () => {
    scrollToSection(scrollRef.current, 'pt-cost');
    setCardSignal((n) => n + 1);
  };

  return (
    <div
      ref={pageRef}
      className="destp destp-v5 pt-page"
      role="dialog"
      aria-modal="true"
      aria-label={city}
    >
      <PageBar
        t={t}
        backLabel={backLabel || t('detail.backToList')}
        onBack={onClose}
        backRef={backRef}
        name={city}
        nameOn={stuck}
        fav={isFavorite}
        onFav={onToggleFavorite || null}
        onShare={share}
        shareLabel={t('dest.share')}
        copied={copied}
        copiedLabel={t('dest.linkCopied')}
      />

      {notice && (
        <p className="destp-notice" role="status">
          {t(notice.key)}
          {notice.url && <> <span className="destp-notice-url">{notice.url}</span></>}
          <Button variant="quiet" size="sm" className="destp-notice-x" onClick={() => setNotice(null)}>{t('dest.noticeDismiss')}</Button>
        </p>
      )}

      <div className="destp-scroll pt-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="pt-wrap">
          <GalleryStrip
            gallery={d?.gallery}
            city={city}
            iso2={destination.iso2}
            fallbackUrl={destination.image?.url}
            destId={destination.id}
          />

          <div className="pt-body">
            <div className="pt-main">
              <header className="pt-head">
                <h1 className="pt-title" ref={titleRef} tabIndex={-1}>{city}</h1>
                <p className="pt-where">
                  <CountryFlag country={destination.iso2} size={15} />
                  <span>{countryLabel}</span>
                </p>
                <div className="pt-badges">
                  {verdict?.score != null && (
                    // A jump within the page: it opens Why it rates in Practical.
                    <a className="pt-score" href="#sec-rating"
                      onClick={(e) => {
                        e.preventDefault();
                        setOpen((s) => new Set([...s, 'rating']));
                        goTab('practical', 'sec-rating');
                      }}
                      aria-label={t('dest.ratingTitle', { score: fmtScore(verdict.score) })}>
                      <ScoreChip rating={verdict} size="lg" band />
                    </a>
                  )}
                  {verdict?.hidden_gem && <HiddenGemTag />}
                  {verdictClassRank && <Chip kind="status" className="pt-badge">{verdictClassRank}</Chip>}
                  {verdict?.country_rank === 1 ? (
                    <Chip kind="status" className="pt-badge">{t('card.topOf', { country: countryLabel })}</Chip>
                  ) : verdict?.country_badge ? (
                    <Chip kind="status" className="pt-badge">{t('card.rankIn', { n: verdict.country_rank, country: countryLabel })}</Chip>
                  ) : null}
                  {isUnesco && (
                    <Chip kind="status" className="pt-badge"
                      title={(destination.designations || []).find((g) => g.kind === 'unesco_whc')?.name || ''}>
                      {t('dest.unesco')}
                    </Chip>
                  )}
                </div>
                {/* T765: the match after the rank lines, never merged into the Score. */}
                <MatchLine place={destination} month={tripMonth} className="destp-match" />
                {/* The intro is written in English; in another language the
                    head shows nothing rather than an English paragraph (T446). */}
                {settled && shortIntro && lang === 'en' && <p className="pt-lead">{shortIntro}</p>}
              </header>

              {settled && <KeyFacts cells={keyFacts} className="pt-facts" />}

              {!settled && (
                <div className="destp-wait" aria-busy="true">
                  <span className="sr-only">{t('state.loading')}</span>
                </div>
              )}

              {settled && (
                <>
                  <JumpBar items={jumps} scrollRef={scrollRef} ready={`${destination.id}:${!!d}`}
                    label={t('dest.subnavAria')} />
                  <DestOverview p={p} />
                  {!wide && priceCard && (
                    <PSection id="pt-cost" title={t('destx.dayCosts')} className="pt-inlinecost">
                      {priceCard}
                    </PSection>
                  )}
                  <DestSee p={p} />
                  <DestAround p={p} />
                  <DestWhen p={p} />
                  <DestStay p={p} />
                  <DestGetting p={p} />
                  <DestPractical p={p} />
                  <Similar rows={d?.similar} data={data} indices={firstRun?.indices} t={t} view={view} onSelect={onSelect} />
                  {/* Friends showing you a trip that stops here (T466). */}
                  <FriendsWentHere destId={destination?.id} destinations={data?.destinations} />
                  <div className="destp-utility">
                    <ReportProblem item={DEST_REPORT} />
                  </div>
                </>
              )}
            </div>
            {settled && wide && <aside className="pt-side" aria-label={t('destx.dayCosts')}>{priceCard}</aside>}
          </div>
        </div>
      </div>

      {settled && !wide && (
        <PriceDock
          price={Number.isFinite(costRow?.dayEur) ? <Money value={view.day(costRow.dayEur)} /> : null}
          unit={view.unit}
          inputs={dockInputs}
          inputsLabel={t('destx.dockInputs', { what: dockInputs })}
          onInputs={openCard}
          primary={onPlanTrip ? (
            <Button variant="primary" className="pt-dock-cta" iconStart={<RouteIcon size={18} />} onClick={onPlanTrip}>
              {t('dest.planTrip')}
            </Button>
          ) : null}
        />
      )}
    </div>
  );
}
