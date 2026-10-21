import React from 'react';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { knownFor } from '../lib/knownFor.js';
import { crowdBadgeWorthShowing } from '../components/CrowdingBadge.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { safeUrl } from '../lib/format.js';
import { useDossier, destShareUrl } from '../lib/dossier.js';
import { activityLink } from '../lib/activityAffiliates.js';
import { useForecast } from '../lib/weather.js';
import { packingList, packMonth } from '../lib/packing.js';
import { cheapestStayMonths } from '../lib/costIndex.js';
import { monthName } from '../lib/dates.js';
import { useI18n } from '../i18n/index.jsx';
import CreditFold from './CreditFold.jsx';
import { ScoreChip, HiddenGemTag, bandKey } from '../components/RatingBadge.jsx';
import { tierForScore } from '../lib/rating.js';
import { visitLength } from '../lib/nearby.js';
import { countryName } from '../lib/countryName.js';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useFirstRun } from '../lib/firstRunContext.js';
import { PhotoGallery } from './PhotoGallery.jsx';
import { DestPriceCard } from './DestPriceCard.jsx';
import { PageBar } from './PageBar.jsx';
import { usePageArrival } from '../hooks/usePageArrival.js';
import { Button, Chip, Money, Tabs } from '../components/ui/index.js';
import { isNational } from '../components/CostSummary.jsx';
import { BedIcon, CompassIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { scrollBehavior } from '../lib/motion.js';
import { FriendsWentHere } from '../components/FriendsWentHere.jsx';
import { dayIncludesText } from '../lib/dayIncludes.js';
import {
  DEST_TABS, tabFromHash, hashWithTab, aroundCategories, defaultAroundKey, emptyOutdoorKinds,
} from '../lib/destOverview.js';
import {
  baseCity, monthOf, CROWD_KEY, photoMatcher, thumb500, NOT_A_VIEW, isArea, useDoPhotos,
} from './destParts.js';
import { DestOverview } from './DestOverview.jsx';
import { DestNearby } from './DestNearby.jsx';
import { DestWhen } from './DestWhen.jsx';
import { DestPractical } from './DestPractical.jsx';

/**
 * The full-screen destination page, v4 (T499, roadmap 1.4, owner answers
 * T491-a to T491-i; v3 was T429 and T446).
 *
 * Renders from the dossier contract (public/dossier/{id}.json, built by
 * pipeline/dossier/build_dossier.py). The PDF export renders from the SAME
 * file (lib/destinationPdf.js): one contract, two renderers, zero drift.
 *
 * Top to bottom, the same on every tab: the page bar, the photo gallery and
 * the head (the place, its Score, the country, the day figure and what it
 * includes). Then four tabs, always the same four: Overview, Nearby, When to
 * go, Practical (DestOverview.jsx, DestNearby.jsx, DestWhen.jsx,
 * DestPractical.jsx). The tab bar sticks under the page bar once the head
 * has gone (the sticky-rail rule, owner answer T491-c), and a tab changes
 * the address without a history step (T491-b), so Back still leaves the
 * page. Under every panel: the sources line and Report a problem.
 *
 * The price card with the page's one primary is the sticky side column from
 * 1024 px, on every tab; on a phone it sits in the Overview after the year
 * (T491-g), and the head carries the day figure on the first screen.
 */

/** The address the app booted on (#dest=FCO&tab=nearby). The app's boot
 *  reader strips the hash before this page first renders, so the tab it
 *  named is read here, at module load, and honoured once. */
const BOOT_HASH = typeof window !== 'undefined' ? window.location.hash || '' : '';
let bootTabSpent = false;
function initialTab(id) {
  if (!id || typeof window === 'undefined') return 'overview';
  return tabFromHash(window.location.hash, id)
    || (!bootTabSpent && tabFromHash(BOOT_HASH, id))
    || 'overview';
}

/** From 1024 px the price card is a side column; below it, an Overview
 *  block. Where a node lives is a DOM decision, so it is a hook. */
const WIDE = '(min-width: 1024px)';
function useWide() {
  const [wide, setWide] = React.useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE).matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return undefined;
    const on = (e) => setWide(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * Remembered folds (carta-design "Remembered state", T385): the folds a
 * traveller opened on a destination come back when they return to it in the
 * same session, never across sessions. Since v3 every fold starts closed and
 * the open sections need no memory; the key moved to v2 so a set saved by
 * the old page (where the month block was a fold) is not read back.
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

function GalleryStrip({ gallery, city, iso2, fallbackUrl, destId, final = true }) {
  // A caption that is the record's own name ("Rome (Fiumicino)") names the
  // town, not its airport (T385, brief V3-10); any other caption is kept.
  // The strip itself is the shared PhotoGallery (T430), so the item pages and
  // the trip page open on the same gallery as this page.
  const capOf = (cap) => (cap && baseCity(cap) === city ? city : (cap || ''));
  const photos = (gallery?.length ? gallery : (fallbackUrl ? [{ url: fallbackUrl }] : []))
    .map((g) => ({ ...g, caption: capOf(g.caption) || city }));
  return (
    <PhotoGallery photos={photos} label={city} claimKey={destId} final={final}
      fallback={{ city, iso2 }} />
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
  const { t, lang } = useI18n();
  const paywall = usePaywall();
  const pageRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const tabsRef = React.useRef(null);
  const [stuck, setStuck] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  // One-line status for a failed PDF or a blocked clipboard (T405): what
  // happened and what to do, in a polite live region.
  const [notice, setNotice] = React.useState(null);
  const [open, setOpen] = React.useState(() => readFolds(destination?.id) || new Set());
  // The chosen Around chip; null until the traveller picks, so the default
  // follows the dossier (owner answer T491-e).
  const [aroundPick, setAroundPick] = React.useState(null);
  // A jump queued for after the next render: the tab to show has to mount
  // before its anchor can be scrolled to.
  const [pendingJump, setPendingJump] = React.useState(null);
  const destId = destination?.id ?? null;
  const [tabFor, setTabFor] = React.useState(() => ({ id: destId, tab: initialTab(destId) }));
  let tab = tabFor.tab;
  if (tabFor.id !== destId) {
    // A new place opens on the tab its address names, else on Overview.
    tab = initialTab(destId);
    setTabFor({ id: destId, tab });
  }
  const wide = useWide();
  const headRef = React.useRef(null);
  const firstRun = useFirstRun();
  const tripMonth = monthOf(firstRun?.departDate || firstRun?.defaultDates?.start || null);
  const defaults = firstRun?.defaultDates || null;
  const datesOwn = !!(defaults && firstRun?.departDate
    && (firstRun.departDate !== defaults.start || (firstRun.returnDate && firstRun.returnDate !== defaults.end)));

  const dossier = useDossier(destination?.id);
  // D7: a member search lands here with ?dm=<name>; that member is the
  // reason the reader arrived, so it gets the focus.
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
    // The tab a boot address named is honoured once, by the first place
    // this page shows.
    if (destination) bootTabSpent = true;
  }, [destination]);

  React.useEffect(() => {
    setStuck(false);
    setCopied(false);
    setNotice(null);
    setAroundPick(null);
    setPendingJump(null);
    setOpen(readFolds(destination?.id) || new Set());
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [destination?.id]);

  React.useEffect(() => {
    writeFolds(destination?.id, open);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writes on a fold change only: a destination change restores its own set first, and that restore is the next change
  }, [open]);

  /** Show a tab: the address names it without a history step (T491-b), the
   *  panel starts just under the bar, and an anchor (a See all, the Score)
   *  is scrolled to once its tab has drawn. */
  const goTab = React.useCallback((next, anchor = null) => {
    if (!DEST_TABS.includes(next)) return;
    setTabFor({ id: destId, tab: next });
    setPendingJump({ tab: next, anchor, n: Date.now() });
    try {
      const hash = hashWithTab(window.location.hash, destId, next);
      if (hash && hash !== window.location.hash) {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
      }
    } catch { /* sandboxed: the tab still shows */ }
  }, [destId]);

  React.useEffect(() => {
    if (!pendingJump || pendingJump.tab !== tab) return;
    const sc = scrollRef.current;
    const body = bodyRef.current;
    setPendingJump(null);
    if (!sc || !body) return;
    const target = pendingJump.anchor ? sc.querySelector(`#${pendingJump.anchor}`) : null;
    if (target) {
      target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      return;
    }
    // The panel starts just under the bar: once the bar has stuck, a new
    // tab opens at its top, not halfway down.
    const top = body.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    if (sc.scrollTop > top) sc.scrollTop = top;
  }, [pendingJump, tab]);

  // The chosen tab scrolls into the bar's view where the bar runs sideways
  // (German at 360 px, 1.4 sketch 4.6).
  React.useEffect(() => {
    const bar = tabsRef.current?.querySelector('.ui-tabs');
    const on = bar?.querySelector('[aria-selected="true"]');
    if (!bar || !on) return;
    const l = on.offsetLeft - bar.offsetLeft;
    if (l < bar.scrollLeft || l + on.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollLeft = Math.max(0, l - 16);
    }
  }, [tab]);

  // Escape closes it, capture phase, so the app-level stack never double-fires,
  // and the same hook gives the dialog the focus management its aria-modal
  // has always promised. An open dropdown keeps its own Escape.
  const backRef = React.useRef(null);
  const skipEscape = React.useCallback(
    () => !!pageRef.current?.querySelector('.dropdown-menu'), []);
  // Where focus lands on open: the one page rule (hooks/usePageArrival.js,
  // carta-design "Navigation", T474): the heading by pointer, touch or a
  // link; the back control from the keyboard, so the next key acts.
  const titleRef = React.useRef(null);
  const arrivalRef = usePageArrival(pageRef, destination?.id ?? null);
  useFocusTrap(pageRef, onClose, {
    initialFocusRef: arrivalRef,
    skipEscapeWhen: skipEscape,
    enabled: !!destination,
  });

  const lat = destination?.city_lat ?? destination?.lat;
  const lon = destination?.city_lon ?? destination?.lon;
  const forecast = useForecast(lat, lon, !!destination);
  // Photographs for "Things to do". Must sit above the early return: hooks
  // cannot run conditionally.
  const doPhotos = useDoPhotos(destination?.id);

  if (!destination) return null;

  const city = baseCity(destination.city);
  const DEST_REPORT = { layer: 'dest', id: destination.id, cc: destination.iso2, name: city };
  const d = dossier || null;
  const loading = dossier === undefined;
  // Everything below the head waits for the dossier to answer (a file or a
  // null), and then appears in its final shape. Drawn early from the record
  // alone, the intro grew and the facts gained lines, which pushed the page
  // 45 px down on a phone: a layout shift of 0.30 (T011, T271). Content that
  // appears moves nothing.
  const settled = !loading;
  const kf = knownFor(destination);
  const cheapMonths = cheapestStayMonths(destination);
  // Pack for the month the page prices (the traveller's arrive month); the
  // next good month only when no dates exist at all.
  const month = tripMonth || packMonth(destination);
  const packs = packingList(destination, month);

  const intro = d?.intro;
  const verdictRaw = d?.verdict || destination.rating || null;
  // The tier drives the Score's star and band word (T437); a dossier verdict
  // without one takes it from the score against the model's cut-offs.
  const verdict = verdictRaw && verdictRaw.score != null
    ? { ...verdictRaw, tier: verdictRaw.tier ?? tierForScore(verdictRaw.score) }
    : verdictRaw;
  const verdictBand = verdict && bandKey(verdict.tier) ? t(bandKey(verdict.tier)) : '';
  const sleep = d?.sleep || null;
  const getting = d?.practical?.getting_there || null;
  const bookAhead = d?.practical?.book_ahead || [];
  const rhythm = d?.practical?.rhythm || null;
  const pairs = d?.practical?.pairs || [];
  const members = d?.members || null;
  const water = d?.water || null;
  const stayLen = visitLength(destination);
  const highlights = [...(d?.highlights || [])]
    .sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0));
  const doItems = [...(d?.do || [])]
    .sort((a, b) => (b.evidence?.n_sources ?? -1) - (a.evidence?.n_sources ?? -1));
  const trips = d?.trips || [];
  const nearby = d?.nearby || {};
  const around = d?.around || null;
  const tips = d?.tips || [];
  const parking = d?.parking;
  const festivals = d?.festivals || [];
  const links = d?.practical?.links || {};
  const when = d?.when || null;
  // ROUTES.md R6: measured to the nearest point on the line, in the lab, and
  // named for the path rather than for whichever stage of it passes.
  const routeRows = d?.routes || {};
  const nearbyForMap = ['trails', 'beaches', 'lakes', 'mountains']
    .flatMap((layer) => (nearby[layer] || []).slice(0, 3).map((f) => ({ ...f, layer })))
    .filter((f) => f.lat != null);
  const aroundForMap = around
    ? ['trails', 'cycling', 'mountains', 'lakes', 'beaches']
      .flatMap((layer) => (around[layer] || []).slice(0, 12).map((f) => ({ ...f, layer })))
      .filter((f) => f.lat != null)
    : [];
  const tripsForMap = trips.filter((x) => x.lat != null);
  const shortIntro = intro?.short || intro?.lead || kf || '';
  const guideUrl = safeUrl(intro?.grounding?.[0]?.url || destination.guide?.url);
  const isUnesco = (destination.designations || []).some((g) => g.kind === 'unesco_whc');
  const monthList = (ms) => ms.map((m) => monthName(m, lang, false)).join(', ');
  const countryLabel = countryName(destination.iso2, destination.country);
  // A score in the reader's own number format (7,7 in German), so a screen
  // reader does not voice it as a date or a version.
  const fmtScore = (n) => {
    try { return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n); } catch { return Number(n).toFixed(1); }
  };

  // The key facts (carta-design "Detail page grammar"): four to six measured
  // facts, label over value. The day cost is not among them: the head and
  // the price card carry it. A missing fact is left out, never "Not
  // recorded" (Zungoli shows three).
  const crowdOn = crowdBadgeWorthShowing(destination);
  const climateMonth = tripMonth ? destination.climate?.m?.[tripMonth - 1] : null;
  const keyFacts = [
    when?.best?.length > 0 && { k: 'best', label: t('dest.keyBest'), value: monthList(when.best) },
    // A month fact only once the traveller has a month (carta-design "Month").
    datesOwn && climateMonth?.[0] != null && {
      k: 'month',
      label: t('dest.keyMonth', { month: monthName(tripMonth, lang, true) }),
      value: t('dest.keyMonthValue', { hi: Math.round(climateMonth[0]), mm: Math.round(climateMonth[2] ?? 0) }),
    },
    crowdOn && { k: 'crowds', label: t('dest.keyCrowds'), value: t(CROWD_KEY[destination.crowding.tier] || 'crowd.moderate') },
    getting?.airport && {
      k: 'airport',
      label: t('dest.keyAirport'),
      value: getting.transfer_min != null
        ? t('dest.keyAirportValue', { iata: getting.airport, n: getting.transfer_min, mode: t(`mode.${getting.transfer_mode || 'train'}`) })
        : getting.airport,
    },
    getting?.car_needed != null && { k: 'car', label: t('dest.keyCar'), value: t(getting.car_needed ? 'dest.keyCarYes' : 'dest.keyCarNo') },
    // "Time here" left the facts (T446): a rule of thumb from the sights'
    // hours, it contradicted the intro ("three or four days") and the card's
    // stay on the same screen.
  ].filter(Boolean).slice(0, 6);

  const share = async () => {
    const url = destShareUrl(destination.id);
    try {
      if (navigator.share) { await navigator.share({ title: city, url }); return; }
    } catch (e) {
      // A dismissed share sheet is an answer, not a failure: copy nothing.
      if (e?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // The clipboard is blocked (an embedded view, a denied permission): show
      // the link itself so the traveller can copy it by hand.
      setNotice({ key: 'dest.shareBlocked', url });
    }
  };

  // The PDF still prints the day at the traveller's Lifestyle and its basis.
  const pdfCost = firstRun?.indices?.get?.(destination.id) || null;
  const profileKey = matchProfile(choices?.lifestyle || {});
  const lifestyleLine = t('cost.atLifestyle', {
    profile: profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom'),
    stay: t(`stay.${pdfCost?.stayTier || choices?.stay_tier || 'home'}`).toLowerCase(),
  });
  // A PDF needs a Trip Pass: the existing gate opens the pass sheet on tap
  // (usePaywall 'export'; T497 owns the sheet).
  const exportPdf = async () => {
    if (pdfBusy || !d) return;
    if (!paywall.require('export')) return;
    setNotice(null);
    setPdfBusy(true);
    try {
      const { downloadDestinationPdf } = await import('../lib/destinationPdf.js');
      await downloadDestinationPdf({
        dossier: d, destination, cost: pdfCost, t, lang,
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

  // When MET last ran the model, in the reader's own clock (T483).
  const fmtUpdated = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch { return ''; }
  };

  const onScroll = (e) => {
    const next = e.currentTarget.scrollTop > 160;
    setStuck((cur) => (cur === next ? cur : next));
  };

  // Things to do: the photograph of a highlight or a gallery photograph the
  // item names (gallery captions are place names too: "Colosseum"), else
  // one from the POI shard.
  const hlPhoto = photoMatcher([
    ...highlights.filter((h) => h.image?.url && !NOT_A_VIEW.test(h.image.url))
      .map((h) => ({ name: h.name, img: thumb500(h.image.url) })),
    ...(d?.gallery || []).filter((g) => g.caption && baseCity(g.caption) !== city && !NOT_A_VIEW.test(g.url))
      .map((g) => ({ name: g.caption, img: g.thumb || thumb500(g.url) })),
  ]);
  const doRows = doItems.slice(0, 16).map((item, i) => {
    const poi = doPhotos(item.name);
    return { ...item, key: `${i}:${item.name}`, photo: hlPhoto(item.name) || (poi ? thumb500(poi) : null) };
  });
  // The items with a photograph are the track; the rest follow it as a
  // hairline list (T446). With fewer than two photographs there is no track
  // and the list holds everything: a strip of grey boxes reads as broken.
  const doPhotoRows = doRows.filter((r) => r.photo);
  const doTrack = doPhotoRows.length >= 2 ? doPhotoRows : [];
  const doList = doTrack.length ? doRows.filter((r) => !r.photo) : doRows;

  // Day trips: the dossier's trips, then the places it pairs with that are
  // not already among them, each a real catalogue page.
  const tripRows = (() => {
    const seen = new Set(trips.map((tr) => tr.id));
    const paired = pairs.filter((pr) => pr.id && !seen.has(pr.id)).map((pr) => {
      const rec = data?.destinations?.[pr.id];
      return {
        kind: 'destination', id: pr.id, name: pr.name, dist_km: pr.km,
        rating: pr.score != null ? { score: pr.score } : null,
        image: rec?.image?.url ? { url: rec.image.url } : null,
        lat: rec?.lat, lon: rec?.lon,
      };
    });
    return [...trips, ...paired].filter((tr) => tr.id !== destination.id)
      .map((tr, i) => ({ ...tr, key: `${i}:${tr.id}` }));
  })();

  // Around {city}: every kind of outdoor place in reach from the dossier's
  // three readings (around, nearby, routes), plus the day trips.
  const cats = aroundCategories({ around, nearby, routes: routeRows, trips: tripRows });
  const emptyKinds = d ? emptyOutdoorKinds(cats) : [];
  const aroundKey = aroundPick || defaultAroundKey(cats);
  const hasRoutes = (routeRows.hiking?.length || 0) + (routeRows.cycling?.length || 0) > 0
    || !!routeRows.node_network?.km;
  const weatherOn = forecast !== null && forecast !== undefined;

  const exits = [
    links.booking && { key: 'bk', href: links.booking, label: t('dest.linkBooking'), Icon: BedIcon },
    links.airbnb && { key: 'ab', href: links.airbnb, label: t('dest.linkAirbnb'), Icon: BedIcon },
    links.getyourguide && { key: 'gyg', href: activityLink(links.getyourguide, 'dest-book'), label: t('dest.bookGyg'), Icon: CompassIcon },
    links.viator && { key: 'via', href: activityLink(links.viator, 'dest-book'), label: t('dest.bookViator'), Icon: CompassIcon },
    links.flights_google && { key: 'gf', href: links.flights_google, label: t('dest.linkGflights'), Icon: PlaneIcon },
    links.skyscanner && { key: 'sky', href: links.skyscanner, label: t('dest.linkSkyscanner'), Icon: PlaneIcon },
  ].filter(Boolean);

  const priceCard = settled ? (
    <>
      <DestPriceCard
        dest={destination}
        city={city}
        onOpenLifestyle={onOpenLifestyle}
        onPlanTrip={onPlanTrip}
        onPlanDay={onPlanDay}
        carDayEur={getting?.car_needed ? getting.rental_eur_day ?? null : null}
      />
      {/* Friends showing you a trip that stops here (T466); nothing at all
          for a guest or when no friend trip stops here. */}
      <FriendsWentHere destId={destination?.id} destinations={data?.destinations} />
    </>
  ) : null;

  // The page's one reading of the dossier, handed to every tab.
  const p = {
    t, lang, city, destination, data, d, lat, lon, scrollRef,
    keyFacts, highlights, doRows, doTrack, doList, monthList, fmtScore,
    cats, aroundKey, setAroundKey: setAroundPick, emptyKinds,
    aroundKm: around?.radius_km || 20, area: isArea(d),
    tripsForMap, nearbyForMap, aroundForMap, routeRows, hasRoutes, members, memberFocus,
    forecast, monthPick: datesOwn ? tripMonth : null, cheapMonths, water, festivals,
    getting, rhythm, bookAhead, verdict, verdictBand, sleep, tips, packs, month, parking, exits,
    isOpen, toggle,
    onOpenFeature, onSelect, onOpenItin, goTab,
    exportPdf, pdfBusy, pdfReady: !!d,
    priceCard: wide ? null : priceCard,
  };
  const tabs = DEST_TABS.map((id) => ({ id, label: t(`dest.tab.${id}`) }));
  const Panel = { overview: DestOverview, nearby: DestNearby, when: DestWhen, practical: DestPractical }[tab]
    || DestOverview;

  return (
    <div
      ref={pageRef}
      className="destp destp-v2 destp-v3 destp-v4"
      role="dialog"
      aria-modal="true"
      aria-label={city}
    >
      {/* The one page bar (PageBar, T474, row T435-e): back naming the list
          on a phone and a desktop alike, the name once the heading has
          scrolled away, save and share (carta-design "Navigation"). */}
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

      <div className="destp-scroll" ref={scrollRef} onScroll={onScroll}>
        <GalleryStrip
          gallery={d?.gallery}
          final={settled}
          city={city}
          iso2={destination.iso2}
          fallbackUrl={destination.image?.url}
          destId={destination.id}
        />

        <div className="destp-grid">
          <div className="destp-head" ref={headRef}>
            <h1 className="destp-city" ref={titleRef} tabIndex={-1}>{city}</h1>
            <div className="destp-meta">
              {verdict?.score != null && (
                // A jump within the page, so a link to the section (carta-design
                // "Navigation"); it shows Practical and opens Why it rates.
                <a className="destp-score" href="#sec-rating"
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
              {/* The country, in the reader's language, once: a rank line names it
                  already ("Top of Italy"), so then it stands alone (T446). */}
              <span className="destp-country">
                {verdict?.country_rank === 1 ? (
                  <span className="destp-rank">{t('card.topOf', { country: countryLabel })}</span>
                ) : verdict?.country_badge ? (
                  <span className="destp-rank">{t('card.rankIn', { n: verdict.country_rank, country: countryLabel })}</span>
                ) : countryLabel}
              </span>
              {isUnesco && (
                <Chip kind="status" className="destp-unesco"
                  title={(destination.designations || []).find((g) => g.kind === 'unesco_whc')?.name || ''}>
                  {t('dest.unesco')}
                </Chip>
              )}
            </div>
            {/* The day line under the name (T446), with what it includes
                (T486, built from its parts, owner answer T491-h): Carta's one
                line, what a day here costs, on the first screen of a phone.
                From 1024 px the sticky card beside the head carries both. */}
            {pdfCost?.dayEur != null && (
              <div className="destp-day">
                <p className="destp-dayline">
                  <Money value={pdfCost.dayEur} est={isNational(pdfCost)} />
                  <span className="destp-dayline-unit">{t('dest.priceDayUnit')}</span>
                </p>
                <p className="destp-dayline-incl">{dayIncludesText(t)}</p>
              </div>
            )}
            {/* What this place is: two or three sentences from our own
                facts, one opening line after Wikivoyage. Never the article.
                The intro is written in English; in another language the
                guide link stands alone rather than an English paragraph
                (T446). */}
            {settled && shortIntro && lang !== 'en' && guideUrl && (
              <p className="destp-short">
                <a className="destp-short-src" href={guideUrl} target="_blank" rel="noreferrer">{t('detail.readGuide')}</a>
              </p>
            )}
            {settled && shortIntro && lang === 'en' && (
              <p className="destp-short">
                {shortIntro}
                {guideUrl && (
                  <> <a className="destp-short-src" href={guideUrl} target="_blank" rel="noreferrer">{t('detail.readGuide')}</a></>
                )}
              </p>
            )}
          </div>

          {/* While the dossier answers, one still block holds the place of
              the card and the tabs (carta-design "Loading"): no shimmer, no
              spinner, "Loading" for screen readers only. */}
          {!settled && (
            <div className="destp-wait" aria-busy="true">
              <span className="sr-only">{t('state.loading')}</span>
            </div>
          )}

          {settled && wide && <div className="destp-side">{priceCard}</div>}

          {settled && (
            <div className="destp-body" ref={bodyRef}>
              {/* The four tabs (owner answer T491-a), sticky under the page
                  bar once the head has gone: one band, --surface, a --border
                  bottom edge, no shadow (the sticky-rail rule, T491-c). */}
              <div className="destp-tabs" ref={tabsRef}>
                <Tabs label={t('dest.subnavAria')} tabs={tabs} value={tab} onChange={(id) => goTab(id)}
                  panelId="destp-panel" />
              </div>
              <div className="destp-panel" id="destp-panel" role="tabpanel" aria-label={t(`dest.tab.${tab}`)}>
                <Panel p={p} />
              </div>

              {/* The sources the page owes, in one line before the utility row
                  (T446): the route data's licence and the live forecast. */}
              {(hasRoutes || weatherOn) && (
                <div className="destp-sources">
                  <p>
                    {[hasRoutes && t('dest.routesCredit'), weatherOn && t('explore.weatherCredit', { time: fmtUpdated(forecast[0]?.updated) })].filter(Boolean).join(' ')}
                  </p>
                  {hasRoutes && <CreditFold t={t} licenceKeys={['credit.licence.routes']} />}
                </div>
              )}
              <div className="destp-utility">
                <ReportProblem item={DEST_REPORT} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
