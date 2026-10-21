import React from 'react';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { knownFor } from '../lib/knownFor.js';
import { crowdBadgeWorthShowing } from '../components/CrowdingBadge.jsx';
import { ClimateStrip, MONTHS_SHORT } from './ClimateStrip.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { safeUrl, eur } from '../lib/format.js';
import { useDossier, destShareUrl } from '../lib/dossier.js';
import { activityLink } from '../lib/activityAffiliates.js';
import { mapsSearchUrl } from '../lib/destInfo.js';
import { useForecast } from '../lib/weather.js';
import { packingList, packMonth } from '../lib/packing.js';
import { cheapestStayMonths } from '../lib/costIndex.js';
import { monthName } from '../lib/dates.js';
import { useI18n } from '../i18n/index.jsx';
import { Fold } from './Fold.jsx';
import { RatingBreakdown } from './RatingBreakdown.jsx';
import { Neighbourhoods } from './Neighbourhoods.jsx';
import { GettingThere } from './GettingThere.jsx';
import { CrowdCalendar } from './CrowdCalendar.jsx';
import { BathingWater } from './BathingWater.jsx';
import { MemberPlaces } from './MemberPlaces.jsx';
import { FeaturePhoto } from './AroundHere.jsx';
import RoutesFromHere from './RoutesFromHere.jsx';
import CreditFold from './CreditFold.jsx';
import { NearestLine } from './CoverageEmpty.jsx';
import { ScoreChip, HiddenGemTag, bandKey } from '../components/RatingBadge.jsx';
import { tierForScore } from '../lib/rating.js';
import { visitLength } from '../lib/nearby.js';
import { countryName } from '../lib/countryName.js';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { fetchDestPois } from '../lib/appData.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useFirstRun } from '../lib/firstRunContext.js';
import { SectionRail } from './SectionRail.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { DestTrack } from './DestTrack.jsx';
import { DestPriceCard } from './DestPriceCard.jsx';
import { PageBar } from './PageBar.jsx';
import { usePageArrival } from '../hooks/usePageArrival.js';
import { Button, Card, Chip, Money, Tabs } from '../components/ui/index.js';
import { isNational } from '../components/CostSummary.jsx';
import {
  PersonIcon, MapPinIcon, ParkingIcon, SunIcon, PartSunIcon, CloudIcon, FogIcon,
  RainIcon, DrizzleIcon, SnowIcon, StormIcon, CompassIcon,
  ShoeIcon, SwimIcon, BootIcon, PlugIcon, BottleIcon, JacketIcon,
  BackpackIcon, CheckIcon, BedIcon, StarIcon, ChevronRightIcon, MusicIcon, SparkIcon, LinkIcon,
  DownloadIcon, BulbIcon, AlertIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { scrollBehavior } from '../lib/motion.js';
import { FlashDeck } from './FlashDeck.jsx';
import { FriendsWentHere } from '../components/FriendsWentHere.jsx';
import { cardCategory } from '../lib/flashcards.js';

/**
 * The full-screen destination page, v3 (T429, owner brief 2026-10-13).
 *
 * Renders from the dossier contract (public/dossier/{id}.json, built by
 * pipeline/dossier/build_dossier.py). The PDF export renders from the SAME
 * file (lib/destinationPdf.js): one contract, two renderers, zero drift.
 *
 * carta-design "Detail page grammar": decision first, then hand-off, then
 * depth. Top to bottom:
 *   the photo strip, each photograph named in full under it;
 *   the head: the place, its Score, a hidden gem, the country, UNESCO, the
 *     short intro;
 *   the key facts: four to six label-over-value facts;
 *   the price card (DestPriceCard): the day at the traveller's Lifestyle,
 *     the stay's total and the page's one primary. On a phone it follows the
 *     facts; from 1024 px it is a sticky side column beside everything else;
 *   six open sections, in the owner's order: When to go, Things to do, the
 *     map with its highlights, Walk and ride, Getting there, Day trips. The
 *     colour of the page is their photography;
 *   at most five folded rows: why it rates, where to sleep, tips, festivals,
 *     parking and packing;
 *   the exits to the booking sites, then download and report.
 *
 * What left with v3 (owner, "say less"): the receipt's method sentences, the
 * counts in every fold summary, the evidence meters, "Expand all", the
 * position figure under each photograph, the webcams fold (no data) and the
 * figure footer. Sections with nothing to say are not rendered at all, except
 * Walk and ride and Getting there, which say so in one line.
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

/** lib/coverageEmpty.js loader layers against the dossier layer names
 *  onOpenFeature takes (the same names AroundHere rows carry). */
const DOSSIER_LAYER = {
  trail: 'trails', cycling: 'cycling', mountain: 'mountains', lake: 'lakes', beach: 'beaches',
};
const TRACK_CAP = 16;

const baseCity = (name) => (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

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

/** The shared rail reads its items in a layout effect, so it needs a stable
 *  array; the page builds its list after the early return, where a hook
 *  cannot run, so the list travels as a string and is parsed once per change. */
function DestRail({ spec, ...rest }) {
  const items = React.useMemo(() => JSON.parse(spec), [spec]);
  return <SectionRail items={items} {...rest} />;
}

/** The arrive month (1 to 12) of the dates the page prices: the traveller's
 *  own once they set them, Carta's default pair until then. */
function monthOf(iso) {
  const m = /^\d{4}-(\d{2})/.exec(iso || '');
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? n : null;
}
const CROWD_KEY = ['crowd.quiet', 'crowd.moderate', 'crowd.busy', 'crowd.crowded'];
/** A catalogue name that is a number with the place in brackets, as
 *  OpenStreetMap sometimes records a waterfall or a spring ("7 (The Blue
 *  Eye)"), shows the place (T446). Every other name is kept as it is. */
const cleanName = (name) => {
  const raw = String(name || '');
  const m = /^\s*\d+\s*\((.+)\)\s*$/.exec(raw);
  if (m) return m[1];
  // A route's stage code is bookkeeping, not a name: "CNP - 01 - Roma -
  // Castel Gandolfo" reads "Roma, Castel Gandolfo", "Romea Strata in
  // Italia - Tappa RSIT47" reads "Romea Strata in Italia" (T446).
  const parts = raw.split(/\s+-\s+/);
  const named = parts.length > 1
    ? parts.filter((p) => !/^(?:[A-Z]{2,5}|\d{1,3})$/.test(p.trim())
      && !/^(?:tappa|stage|etappe|etapa|tronçon)\s+\S+$/i.test(p.trim()))
    : parts;
  const joined = (named.length ? named : parts).join(', ');
  // Words set in capitals by the source ("DORSALE", "STAZIONE") are set in
  // the name's own case.
  return joined.replace(/\b([A-ZÀ-ÖØ-Ý]{4,})\b/g, (w) => w[0] + w.slice(1).toLowerCase());
};
const fmtKm = (km) => (km < 0.95 ? `${Math.round((km * 1000) / 10) * 10} m` : `${Math.round(km)} km`);
/** Highlight photographs ship at 960px; the tiles want 500. Same file, one
 *  path segment, and Commons serves both. */
const thumb500 = (url) => (url ? url.replace(/\/960px-/, '/500px-') : url);

/**
 * A photograph for each "thing to do" (P4.4).
 *
 * The `do` items are editorial phrases, not place names: "Colosseum, Forum
 * and Palatine Hill circuit", "Eat through Trastevere on an evening food
 * crawl". The POI shard for the same destination holds real places with
 * photographs. So the join is containment, not equality: a POI matches an
 * item when its folded name appears in the item's folded text, and the
 * LONGEST such name wins, so "Sistine Chapel" beats "Chapel" for the
 * Vatican line.
 *
 * Only names of three characters or more, and only whole words, so "Rome"
 * inside "Romantic" cannot claim a photograph it has nothing to do with.
 *
 * Crests and logos are dropped. A museum's coat of arms is a picture of its
 * BRANDING, not of the place, and the page's claim is that the photograph
 * shows what you would see, so the type glyph is the more honest fallback.
 */
function useDoPhotos(destId) {
  const [pois, setPois] = React.useState(null);
  React.useEffect(() => {
    if (!destId) { setPois(null); return undefined; }
    let live = true;
    fetchDestPois(destId).then((items) => { if (live) setPois(items); });
    return () => { live = false; };
  }, [destId]);

  return React.useMemo(() => photoMatcher(
    (pois || []).filter((p) => p?.img && !NOT_A_VIEW.test(p.img)).map((p) => ({ name: p.name, img: p.img })),
  ), [pois]);
}

/** (text) => the photograph whose folded name the text contains, longest
 *  name first, or null. */
function photoMatcher(rows) {
  const named = rows
    .filter((p) => p.img && p.name && foldName(p.name).length >= 3)
    .map((p) => ({ key: foldName(p.name), img: p.img }))
    .sort((a, b) => b.key.length - a.key.length);
  return (text) => {
    const hay = ` ${foldName(text)} `;
    return named.find((p) => hay.includes(` ${p.key} `))?.img || null;
  };
}

/** Commons files that are a mark rather than a view: an SVG rendering is
 *  almost always a crest, a logo or a map, never a photograph. */
const NOT_A_VIEW = /\.svg\.png|logo|coat[_%20-]*of[_%20-]*arms|crest|emblem|wappen|escudo|stemma|blason/i;

/** Case, accents and a trailing "(...)" removed, so "Sagrada Família" and
 *  "Sagrada Familia (Basilica)" fold together. NFKD leaves some letters
 *  whole, so the handful that matter are folded by hand. */
const FOLD_PAIRS = [['ø', 'o'], ['æ', 'ae'], ['ł', 'l'], ['ð', 'd'], ['þ', 'th'], ['ß', 'ss']];
function foldName(s) {
  let out = String(s || '').toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
  for (const [from, to] of FOLD_PAIRS) out = out.split(from).join(to);
  return out.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** One tip sentence from its rule code + args, through t() so all six
 *  languages carry it. Month arguments arrive as 1-12 and leave as names. */
function tipText(tip, t) {
  const args = { ...(tip.args || {}) };
  if (args.from_m) args.from = MONTHS_SHORT[args.from_m - 1];
  if (args.to_m) args.to = MONTHS_SHORT[args.to_m - 1];
  if (args.month) args.month = MONTHS_SHORT[args.month - 1];
  if (args.rental_eur != null) args.rental_eur = eur(args.rental_eur);
  return t(`tip.${tip.code}`, args);
}

/** A real link to a catalogue place: a plain click opens it here, a
 *  modifier click lets the browser open it in a new tab (T444). */
function placeOpener(id, onSelect) {
  return (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onSelect?.(id);
  };
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

/** An open section: a heading and its body, no toggle (T429). */
function Section({ id, title, children, className = '' }) {
  return (
    <section className={`dsec2 ${className}`.trim()} id={`sec-${id}`} aria-labelledby={title ? `h-${id}` : undefined}>
      {title && <h2 className="dsec2-title" id={`h-${id}`}>{title}</h2>}
      {children}
    </section>
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
  const mapRef = React.useRef(null);
  const mapSlotRef = React.useRef(null);
  const [stuck, setStuck] = React.useState(false);
  const [mapLayer, setMapLayer] = React.useState('highlights');
  // The map mounts when its section comes near the view (T429): open by
  // default, it would otherwise hold a WebGL context for a view nobody has
  // scrolled to. Until then a still block of the same size holds its place.
  const [mapOn, setMapOn] = React.useState(false);
  // The committed highlight (a click or tap on a tile or its pin) and the one
  // under the pointer or in focus: carta-design "Map and list in sync" (T395).
  const [hlFocus, setHlFocus] = React.useState(null);
  const [hlHover, setHlHover] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  // One-line status for a failed PDF or a blocked clipboard (T405): what
  // happened and what to do, in a polite live region.
  const [notice, setNotice] = React.useState(null);
  const [open, setOpen] = React.useState(() => readFolds(destination?.id) || new Set());
  const headRef = React.useRef(null);
  const firstRun = useFirstRun();
  const tripMonth = monthOf(firstRun?.departDate || firstRun?.defaultDates?.start || null);
  const defaults = firstRun?.defaultDates || null;
  const datesOwn = !!(defaults && firstRun?.departDate
    && (firstRun.departDate !== defaults.start || (firstRun.returnDate && firstRun.returnDate !== defaults.end)));

  const dossier = useDossier(destination?.id);
  const settledEarly = dossier !== undefined;
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
  const jumpTo = (id) => {
    setOpen((s) => new Set([...s, id]));
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector?.(`#sec-${id}`)
        ?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    });
  };

  React.useEffect(() => {
    setStuck(false);
    setMapLayer('highlights');
    setMapOn(false);
    setHlFocus(null);
    setHlHover(null);
    setCopied(false);
    setNotice(null);
    setOpen(readFolds(destination?.id) || new Set());
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [destination?.id]);

  React.useEffect(() => {
    writeFolds(destination?.id, open);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writes on a fold change only: a destination change restores its own set first, and that restore is the next change
  }, [open]);

  // The map's slot appears once the dossier answers; watch it until it comes
  // within 300 px of the view, then mount the map once.
  React.useEffect(() => {
    if (mapOn || !settledEarly) return undefined;
    const el = mapSlotRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver !== 'function') { setMapOn(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setMapOn(true); io.disconnect(); }
    }, { root: scrollRef.current, rootMargin: '300px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [mapOn, settledEarly, destination?.id]);

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
  const isUnesco = (destination.designations || []).some((g) => g.kind === 'unesco_whc');
  const monthList = (ms) => ms.map((m) => monthName(m, lang, false)).join(', ');
  const countryLabel = countryName(destination.iso2, destination.country);
  const fmtDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${iso}T00:00:00Z`));
    } catch { return iso; }
  };
  // A score in the reader's own number format (7,7 in German), so a screen
  // reader does not voice it as a date or a version.
  const fmtScore = (n) => {
    try { return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n); } catch { return Number(n).toFixed(1); }
  };

  // The key facts (carta-design "Detail page grammar"): four to six measured
  // facts, label over value. The day cost is not among them: the price card
  // beside them carries it.
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
    { id: 'highlights', label: t('dest.layer.highlights'), n: highlights.length },
    { id: 'around', label: t('dest.layer.around'), n: aroundForMap.length },
    { id: 'trips', label: t('dest.layer.trips'), n: tripsForMap.length },
  ].filter((c) => c.n > 0);
  const effectiveLayer = layerChoices.some((c) => c.id === mapLayer) ? mapLayer
    : mapLayer === 'nearby' && nearbyForMap.length ? 'nearby' : 'highlights';

  // Things to do: the photograph of a highlight or a gallery photograph the
  // item names (gallery captions are place names too: "Colosseum"), else
  // one from the POI shard.
  const hlPhoto = photoMatcher([
    ...highlights.filter((h) => h.image?.url && !NOT_A_VIEW.test(h.image.url))
      .map((h) => ({ name: h.name, img: thumb500(h.image.url) })),
    ...(d?.gallery || []).filter((g) => g.caption && baseCity(g.caption) !== city && !NOT_A_VIEW.test(g.url))
      .map((g) => ({ name: g.caption, img: g.thumb || thumb500(g.url) })),
  ]);
  const doRows = doItems.slice(0, TRACK_CAP).map((item, i) => {
    const poi = doPhotos(item.name);
    return { ...item, key: `${i}:${item.name}`, photo: hlPhoto(item.name) || (poi ? thumb500(poi) : null) };
  });
  // The items with a photograph are the track; the rest follow it as a
  // hairline list (T446). With fewer than two photographs there is no track
  // and the list holds everything: a strip of grey boxes reads as broken.
  const doPhotoRows = doRows.filter((r) => r.photo);
  const doTrack = doPhotoRows.length >= 2 ? doPhotoRows : [];
  const doList = doTrack.length ? doRows.filter((r) => !r.photo) : doRows;

  // Walk and ride: the outdoors within reach from every layer, the trails,
  // beaches, lakes and peaks the Destinations tab knows, best first.
  const outdoor = (() => {
    const seen = new Set();
    const rows = [];
    const add = (layer, f) => {
      const key = `${layer}:${f.id}`;
      if (f.id == null || seen.has(key)) return;
      seen.add(key);
      rows.push({ ...f, layer, key });
    };
    for (const l of ['trails', 'beaches', 'lakes', 'mountains']) (nearby[l] || []).forEach((f) => add(l, f));
    if (around) for (const l of ['trails', 'cycling', 'mountains', 'lakes', 'beaches']) (around[l] || []).forEach((f) => add(l, f));
    // The walks and the rides lead (hikers first, PRODUCT.md), then the
    // peaks, the lakes and the beaches; best first inside each (T446).
    const RANK = { trails: 0, cycling: 1, mountains: 2, lakes: 3, beaches: 4 };
    return rows
      .sort((a, b) => (RANK[a.layer] - RANK[b.layer])
        || (b.score ?? -1) - (a.score ?? -1) || (a.km ?? 99) - (b.km ?? 99))
      .slice(0, TRACK_CAP);
  })();

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
      .slice(0, TRACK_CAP).map((tr, i) => ({ ...tr, key: `${i}:${tr.id}` }));
  })();

  const hasAround = outdoor.length > 0;
  const hasRoutes = (routeRows.hiking?.length || 0) + (routeRows.cycling?.length || 0) > 0
    || !!routeRows.node_network?.km;
  const weatherOn = forecast !== null && forecast !== undefined;
  const has = {
    when: !!destination.climate?.m || weatherOn || crowdOn || !!water?.rating,
    do: doRows.length > 0,
    highlights: highlights.length > 0 || (lat != null && lon != null),
    routes: hasRoutes || hasAround,
    getting: !!(getting || rhythm || bookAhead.length > 0),
    trips: tripRows.length > 0 || members?.length > 0,
    rating: verdict?.score != null,
    sleep: !!(sleep?.neighbourhoods?.length > 0 || sleep?.tiers || sleep?.seasonality),
    tips: tips.length > 0,
    festivals: festivals.length > 0,
    practical: !!(parking && (parking.spots?.length > 0 || parking.park_ride || parking.web)) || packs.length > 0,
  };
  // Two sections keep their heading when they have nothing to show and say
  // so in one line (T367, docs/ONBOARDING_AND_EMPTY_STATES.md), once the
  // dossier has answered: an empty section is a fact about the place, a
  // missing one reads as a page that broke. They stay out of the rail.
  const show = {
    routes: has.routes || !!d,
    getting: has.getting || !!d,
  };
  // The rail lists the open sections, in page order.
  const railSpec = JSON.stringify([
    ['when', 'dest.nav.when'], ['do', 'dest.nav.do'], ['highlights', 'dest.nav.highlights'],
    ['routes', 'dest.nav.walkRide'], ['getting', 'dest.nav.getting'], ['trips', 'dest.nav.trips'],
  ].filter(([id]) => has[id]).map(([id, key]) => ({ id: `sec-${id}`, key: id, label: t(key) })));

  const festMonths = monthList([...new Set(festivals.flatMap((f) => f.months || []))].sort((a, b) => a - b));
  const sleepNames = (sleep?.neighbourhoods || []).slice(0, 3).map((n) => n.name).filter(Boolean).join(', ');
  const parkSearch = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`parking ${city}`)}`;
  const webPark = parking?.web || null;
  const cityNamed = new Set((webPark?.car_parks || []).map((c) => (c.name || '').toLowerCase()));
  const hasPark = !!(parking && (parking.spots?.length > 0 || parking.park_ride || parking.web));

  const exits = [
    links.booking && { key: 'bk', href: links.booking, label: t('dest.linkBooking'), Icon: BedIcon },
    links.airbnb && { key: 'ab', href: links.airbnb, label: t('dest.linkAirbnb'), Icon: BedIcon },
    links.getyourguide && { key: 'gyg', href: activityLink(links.getyourguide, 'dest-book'), label: t('dest.bookGyg'), Icon: CompassIcon },
    links.viator && { key: 'via', href: activityLink(links.viator, 'dest-book'), label: t('dest.bookViator'), Icon: CompassIcon },
    links.flights_google && { key: 'gf', href: links.flights_google, label: t('dest.linkGflights'), Icon: PlaneIcon },
    links.skyscanner && { key: 'sky', href: links.skyscanner, label: t('dest.linkSkyscanner'), Icon: PlaneIcon },
  ].filter(Boolean);

  return (
    <div
      ref={pageRef}
      className="destp destp-v2 destp-v3"
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
        {/* The shared section rail (T165-b): anchors, the selected state on
            the section in view, shown once the head has scrolled away. */}
        <DestRail
          spec={railSpec}
          scrollRef={scrollRef}
          heroRef={headRef}
          ready={`${destination.id}:${settled}`}
          ariaLabel={t('dest.subnavAria')}
          onJump={() => {}}
        />
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
                // "Navigation"); the click also opens the fold it lands on.
                <a className="destp-score" href="#sec-rating"
                  onClick={(e) => { e.preventDefault(); jumpTo('rating'); }}
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
            {/* The day line under the name (T446): on a phone the price card
                sits a screen down, and Carta's one line, what a day here
                costs, belongs on the first screen. From 1024 px the sticky
                card beside the head carries it, so this line hides. */}
            {pdfCost?.dayEur != null && (
              <p className="destp-dayline">
                <Money value={pdfCost.dayEur} est={isNational(pdfCost)} />
                <span className="destp-dayline-unit">{t('dest.priceDayUnit')}</span>
              </p>
            )}
            {/* What this place is: two or three sentences from our own
                facts, one opening line after Wikivoyage. Never the article. */}
            {/* The intro is written in English; in another language the guide
                link stands alone rather than an English paragraph (T446). */}
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

          {settled && keyFacts.length > 0 && (
            <dl className="destp-keys">
              {keyFacts.map((f) => (
                <div className="destp-key" key={f.k}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* While the dossier answers, one still block holds the place of
              the card and the sections (carta-design "Loading"): no shimmer,
              no spinner, "Loading" for screen readers only. */}
          {!settled && (
            <div className="destp-wait" aria-busy="true">
              <span className="sr-only">{t('state.loading')}</span>
            </div>
          )}

          {settled && (
            <div className="destp-side">
              <DestPriceCard
                dest={destination}
                city={city}
                onOpenLifestyle={onOpenLifestyle}
                onPlanTrip={onPlanTrip}
                onPlanDay={onPlanDay}
                carDayEur={getting?.car_needed ? getting.rental_eur_day ?? null : null}
              />
              {/* Friends showing you a trip that stops here (T466); nothing
                  at all for a guest or when no friend trip stops here. */}
              <FriendsWentHere destId={destination?.id} destinations={data?.destinations} />
            </div>
          )}

          {settled && has.when && (
            <Section id="when" title={t('dest.whenTitle')}>
              {destination.climate?.m && <ClimateStrip climate={destination.climate} month={datesOwn ? tripMonth : null} figures />}
              {cheapMonths && (
                <p className="xp-when-fact">{t('explore.whenCheapStay', { months: monthList(cheapMonths) })}</p>
              )}
              <CrowdCalendar destination={destination} t={t} />
              <BathingWater water={water} destination={destination} t={t} />
              {forecast !== null && (
                <div className={`destp-week${forecast === undefined ? ' is-waiting' : ''}`}>
                  <h3 className="destp-subhead">{t('dest.weekNext')}</h3>
                  {weatherOn && forecast.length > 0 && (
                    <div className="xp-weather">
                      {forecast.map((day) => {
                        const Glyph = WEATHER_GLYPH[day.kind] || CloudIcon;
                        return (
                          <div key={day.date} className="xp-wday" title={day.date}>
                            <span className="xp-wday-name">{fmtDay(day.date)}</span>
                            <Glyph size={17} className="xp-wday-icon" />
                            <span className="xp-wday-hi">{day.hi != null ? `${Math.round(day.hi)}°` : ''}</span>
                            <span className="xp-wday-lo">{day.lo != null ? `${Math.round(day.lo)}°` : ''}</span>
                            {day.rainMm != null && day.rainMm >= 1 && (
                              <span className="xp-wday-rain">{`${Math.round(day.rainMm)} mm`}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}

          {settled && has.do && (
            <Section id="do" title={doTrack.length ? null : t('dest.doTitle')}>
              {doTrack.length > 0 && (
                <DestTrack
                  id="h-do"
                  title={t('dest.doTitle')}
                  items={doTrack}
                  t={t}
                  render={(item) => {
                    const href = item.link && safeUrl(item.link) ? activityLink(safeUrl(item.link), 'dest-do') : null;
                    const opener = href
                      ? { title: <a className="card-open" href={href} target="_blank" rel="noreferrer">{item.name}</a>, className: 'ddo2 is-interactive' }
                      : item.ref && onOpenFeature
                        ? { title: item.name, onOpen: () => onOpenFeature(item.ref.layer, item.ref), className: 'ddo2' }
                        : { title: item.name, className: 'ddo2' };
                    return (
                      <Card
                        layout="tile"
                        {...opener}
                        media={<img src={item.photo} alt="" loading="lazy" />}
                        meta={(
                          <span className="dtile-meta">
                            <span>{t(DO_TYPE_KEYS[item.type] || 'dest.doType.activity')}</span>
                            {item.season?.length > 0 && <span>{monthList(item.season)}</span>}
                          </span>
                        )}
                      />
                    );
                  }}
                />
              )}
              {/* The things without a photograph: one hairline list, name and
                  kind, two columns from 680 px (T446). */}
              {doList.length > 0 && (
                <ul className="ddo-list">
                  {doList.map((item) => {
                    const TypeIcon = DO_TYPE_ICON[item.type] || CompassIcon;
                    const href = item.link && safeUrl(item.link) ? activityLink(safeUrl(item.link), 'dest-do') : null;
                    const body = (
                      <>
                        <TypeIcon size={16} className="ddo-list-icon" />
                        <span className="ddo-list-main">
                          <span className="ddo-list-name">{item.name}</span>
                          <span className="ddo-list-meta">
                            <span>{t(DO_TYPE_KEYS[item.type] || 'dest.doType.activity')}</span>
                            {item.season?.length > 0 && <span>{monthList(item.season)}</span>}
                          </span>
                        </span>
                      </>
                    );
                    return (
                      <li key={item.key}>
                        {href ? (
                          <a className="ddo-list-row" href={href} target="_blank" rel="noreferrer">{body}</a>
                        ) : item.ref && onOpenFeature ? (
                          <Button variant="quiet" block className="ddo-list-row"
                            onClick={() => onOpenFeature(item.ref.layer, item.ref)}>{body}</Button>
                        ) : (
                          <span className="ddo-list-row is-static">{body}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          )}

          {settled && has.highlights && (
            <Section id="highlights" className="dsec2-map">
              <div className="dsec2-head">
                <h2 className="dsec2-title" id="h-highlights">{t('dest.mapTitleV')}</h2>
                {layerChoices.length > 1 && (
                  <Tabs
                    label={t('dest.mapTitle')}
                    tabs={layerChoices}
                    value={effectiveLayer}
                    onChange={setMapLayer}
                    className="destp-layers"
                  />
                )}
              </div>
              <div className="dmap-slot" ref={mapSlotRef}>
                {mapOn ? (
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
                      hover={hlHover}
                      onHoverHighlight={setHlHover}
                      height={320}
                      onPickTrip={(row) => onSelect?.(row.id)}
                      onPickFeature={(layer, row) => onOpenFeature?.(layer, row)}
                      onPickHighlight={(i) => {
                        setHlFocus(i);
                        requestAnimationFrame(() => {
                          scrollRef.current?.querySelector?.(`#hl-${i}`)
                            ?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest', inline: 'center' });
                        });
                      }}
                    />
                  </React.Suspense>
                ) : <div className="place-map place-map-wait dmap" />}
              </div>
              {highlights.length > 0 && (
                <DestTrack
                  id="h-hl"
                  level={3}
                  title={t('dest.layer.highlights')}
                  items={highlights.slice(0, TRACK_CAP).map((h, i) => ({ ...h, key: h.id || String(i) }))}
                  t={t}
                  render={(h, i) => (
                    <Card
                      layout="tile"
                      id={`hl-${i}`}
                      className={`dhl2${hlFocus === i ? ' is-focus' : ''}${hlHover === i ? ' is-hover' : ''}`}
                      selected={hlFocus === i}
                      onMouseEnter={() => setHlHover(i)}
                      onMouseLeave={() => setHlHover((cur) => (cur === i ? null : cur))}
                      onFocus={() => setHlHover(i)}
                      onBlur={() => setHlHover((cur) => (cur === i ? null : cur))}
                      media={<FeaturePhoto src={thumb500(h.image?.url)} lat={h.lat} lon={h.lon} />}
                      title={(
                        <>
                          <span className="dhl2-n" aria-hidden="true">{i + 1}</span>
                          {h.name}
                        </>
                      )}
                      onOpen={() => { setHlFocus(i); setMapLayer('highlights'); }}
                      meta={(
                        <span className="dtile-meta">
                          {h.kind && lang === 'en' && <span>{h.kind}</span>}
                          {h.dist_km != null && <span>{fmtKm(h.dist_km)}</span>}
                        </span>
                      )}
                    />
                  )}
                />
              )}
              {lat != null && lon != null && (
                <a className="destp-exit destp-maps-link" href={mapsSearchUrl(lat, lon)} target="_blank" rel="noreferrer">
                  <MapPinIcon size={16} />
                  <span>{t('explore.openMaps')}</span>
                </a>
              )}
            </Section>
          )}

          {settled && show.routes && (
            <Section id="routes" title={hasAround ? null : t('dest.walkRideTitle')}>
              {hasAround && (
                <DestTrack
                  id="h-routes"
                  title={t('dest.walkRideTitle')}
                  items={outdoor}
                  t={t}
                  render={(f) => (
                    <Card
                      layout="tile"
                      className="dout"
                      media={<FeaturePhoto src={f.thumb} lat={f.lat} lon={f.lon} />}
                      title={cleanName(f.name)}
                      onOpen={onOpenFeature ? () => onOpenFeature(f.layer, { id: f.id, cc: f.cc }) : undefined}
                      meta={(
                        <span className="dtile-meta">
                          <span>{t(`dest.layerKind.${f.layer}`)}</span>
                          {f.km != null && <span>{`${fmtKm(f.km)}${f.bearing ? ` ${f.bearing}` : ''}`}</span>}
                          {f.km_len != null && <span>{t('dest.trackLong', { km: Math.round(f.km_len) })}</span>}
                        </span>
                      )}
                      rating={f.score != null ? <ScoreChip rating={{ score: f.score, tier: f.tier ?? 0 }} size="sm" /> : null}
                    />
                  )}
                />
              )}
              {hasRoutes && <RoutesFromHere routes={routeRows} t={t} onOpen={onOpenFeature} limit={3} brief credits={false} />}
              {!hasRoutes && !hasAround && (
                // pipeline/trails/attach.py MAX_KM (25 km to the line) and
                // pipeline/dossier/build_dossier.py AROUND_KM (20 km).
                <NearestLine
                  noneKey="dest.walkRideNone"
                  noneVars={{ city }}
                  layers={['trail', 'cycling', 'mountain', 'lake', 'beach']}
                  cc={destination.iso2}
                  from={lat != null && lon != null ? { lat, lon } : null}
                  radiusKm={25}
                  onOpen={onOpenFeature ? (l, row) => onOpenFeature(DOSSIER_LAYER[l], { id: row.id, cc: row.cc }) : null}
                />
              )}
            </Section>
          )}

          {settled && show.getting && (
            <Section id="getting" title={t('dest.gettingTitle')}>
              {getting && <GettingThere getting={lang === 'en' ? getting : { ...getting, why: null }} t={t} />}
              {!has.getting && <div className="sec-none" data-testid="section-none"><p>{t('dest.gettingNone', { city })}</p></div>}
              {rhythm && lang === 'en' && <p className="destp-rhythm">{rhythm}</p>}
              {bookAhead.length > 0 && (
                <p className="destp-bookahead">
                  <AlertIcon size={16} className="destp-bookahead-icon" />
                  {t('dest.bookAhead', { names: bookAhead.join(', ') })}
                </p>
              )}
            </Section>
          )}

          {settled && has.trips && (
            <Section id="trips" title={tripRows.length ? null : t('dest.tripsTitle')}>
              {tripRows.length > 0 && (
                <DestTrack
                  id="h-trips"
                  title={t('dest.tripsTitle')}
                  items={tripRows}
                  t={t}
                  render={(tr) => {
                    const itin = tr.kind === 'composed_trip';
                    const opener = itin
                      ? (onOpenItin ? { onOpen: () => onOpenItin(tr.id) } : {})
                      : { href: `#dest=${encodeURIComponent(tr.id)}`, onOpen: placeOpener(tr.id, onSelect) };
                    return (
                      <Card
                        layout="tile"
                        className="dtrip2"
                        {...opener}
                        media={<FeaturePhoto src={tr.image?.url} lat={tr.lat} lon={tr.lon} />}
                        title={cleanName(tr.name)}
                        meta={(
                          <span className="dtile-meta">
                            {itin ? (
                              <span>{t('dest.tripDays', { n: tr.days || 0 })}</span>
                            ) : tr.travel?.minutes != null && (
                              // A time from the trip model, not a routed one,
                              // is an estimate and says so (T446).
                              <span>
                                {tr.travel.source === 'routed'
                                  ? t('dest.minutesBy', { n: tr.travel.minutes, mode: t(`mode.${tr.travel.mode}`) })
                                  : `~${t('dest.minutesBy', { n: tr.travel.minutes, mode: t(`mode.${tr.travel.mode}`) })} ${t('money.est')}`}
                              </span>
                            )}
                            {tr.dist_km != null && <span>{`${tr.dist_km} km`}</span>}
                          </span>
                        )}
                        rating={tr.rating?.score != null
                          ? <ScoreChip rating={{ score: tr.rating.score, tier: tierForScore(tr.rating.score) }} size="sm" />
                          : null}
                      />
                    );
                  }}
                />
              )}
              {/* D7: the villages inside this area, from B1's members. */}
              {members?.length > 0 && (
                <div className="destp-villages">
                  <h3 className="destp-subhead">{t('dest.membersInside', { city })}</h3>
                  <MemberPlaces members={members} focusName={memberFocus} t={t} />
                </div>
              )}
            </Section>
          )}

          {settled && (
            <div className="destp-folds">
              {/* The verdict, with its argument. */}
              {has.rating && (
                <Fold level={2}
                  id="sec-rating"
                  icon={StarIcon}
                  title={t('dest.ratingTitle', { score: fmtScore(verdict.score) })}
                  summary={verdictBand}
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
                </Fold>
              )}

              {/* Where to sleep: neighbourhood prices, tiers, the price curve. */}
              {has.sleep && (
                <Fold level={2}
                  id="sec-sleep"
                  icon={BedIcon}
                  title={t('dest.sleepTitle')}
                  summary={sleepNames}
                  open={isOpen('sleep')}
                  onToggle={() => toggle('sleep')}
                >
                  <Neighbourhoods sleep={sleep} t={t} />
                </Fold>
              )}

              {/* Insider tips: rule codes with evidence behind every sentence. */}
              {has.tips && (
                <Fold level={2}
                  id="sec-tips"
                  icon={BulbIcon}
                  title={t('dest.tipsTitleV')}
                  open={isOpen('tips')}
                  onToggle={() => toggle('tips')}
                >
                  {/* One tip at a time on the shared deck (carta-design
                      "Flashcards", T395): Previous, Next, the arrow keys and
                      Show all; printing shows the list. */}
                  <div className="destp-tips">
                    <FlashDeck
                      id="dest-tips-deck"
                      label={t('dest.tipsTitleV')}
                      t={t}
                      cards={tips.map((tip) => {
                        const text = tipText(tip, t);
                        return { key: tip.code, text, category: cardCategory(text, 'tip') };
                      })}
                    />
                  </div>
                </Fold>
              )}

              {/* Festivals, led by when they happen. */}
              {has.festivals && (
                <Fold level={2}
                  id="sec-festivals"
                  icon={MusicIcon}
                  title={t('dest.festivalsTitle')}
                  summary={festMonths}
                  open={isOpen('festivals')}
                  onToggle={() => toggle('festivals')}
                >
                  <ul className="destp-fests">
                    {festivals.map((f) => (
                      <li className="destp-fest" key={f.name}>
                        <span className={`destp-fest-when ${f.months?.length ? '' : 'is-undated'}`}>
                          {f.months?.length ? monthList(f.months) : t('pdf.dateVaries')}
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

              {/* Parking and what to bring: the two practical lists, one fold
                  (T429; carta-design caps a page at five folded rows). */}
              {has.practical && (
                <Fold level={2}
                  id="sec-practical"
                  icon={BackpackIcon}
                  title={t('dest.practicalTitle')}
                  summary={packs.length > 0 ? t('dest.packSummaryFor', { month: monthName(month, lang, true) }) : ''}
                  open={isOpen('practical')}
                  onToggle={() => toggle('practical')}
                >
                  {packs.length > 0 && (
                    <div className="destp-pack">
                      <h3 className="destp-subhead">{t('explore.packTitle')}</h3>
                      <div className="xp-packs">
                        {packs.map((key) => {
                          const Glyph = PACK_GLYPH[key] || PersonIcon;
                          return (
                            <span key={key} className="xp-pack">
                              <Glyph size={16} />
                              <span>{t(`explore.pack.${key}`)}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {hasPark && (
                    <div className="destp-parking">
                      <h3 className="destp-subhead">{t('explore.parkTitle')}</h3>
                      {webPark && (
                        <div className="dpark-web">
                          <p className="dpark-web-head"><CheckIcon size={12} />{t('dest.parkChecked', { date: fmtDate(webPark.checked) })}</p>
                          {webPark.restricted && (
                            <p className="dpark-web-line is-warn">{t('dest.parkRestricted')}</p>
                          )}
                          {webPark.car_parks?.length > 0 && (
                            <p className="dpark-web-line">
                              <b>{t('dest.parkCityNamed')}:</b> {webPark.car_parks.map((c) => cleanName(c.name)).join(', ')}
                            </p>
                          )}
                          {webPark.park_ride_names?.length > 0 && (
                            <p className="dpark-web-line"><b>{t('explore.park.park_ride')}:</b> {webPark.park_ride_names.map(cleanName).join(', ')}</p>
                          )}
                          {safeUrl(webPark.official_url) && (
                            <a className="dpark-web-link" href={safeUrl(webPark.official_url)} target="_blank" rel="noreferrer noopener"><LinkIcon size={12} />{t('dest.parkOfficial')}</a>
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
                                  {s.name ? cleanName(s.name) : t('explore.parkUnnamed')}
                                  {confirmed && <span className="dpark-ok"><CheckIcon size={10} />{t('dest.parkVerified')}</span>}
                                </span>
                                <span className="destp-park-sub">
                                  <span className={s.fee === 'no' ? 'destp-park-free' : ''}>
                                    {t(s.fee === 'no' ? 'explore.parkFree' : s.fee === 'yes' ? 'explore.parkPaid' : 'explore.parkFeeUnknown')}
                                  </span>
                                  {s.capacity != null && <span>{t('explore.parkSpaces', { n: s.capacity })}</span>}
                                  <span>{t('dest.walkMin', { n: s.walk_min })}</span>
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
                                <span>{fmtKm((parking.park_ride.dist_m || 0) / 1000)}</span>
                              </span>
                            </span>
                            <span className="destp-park-nav">
                              <a href={parking.park_ride.nav.gmaps} target="_blank" rel="noreferrer noopener">{t('dest.navGmaps')}</a>
                              <a href={parking.park_ride.nav.waze} target="_blank" rel="noreferrer noopener">{t('dest.navWaze')}</a>
                            </span>
                          </li>
                        )}
                      </ul>
                      <a className="destp-exit dpark-search" href={parkSearch} target="_blank" rel="noreferrer noopener"><ParkingIcon size={16} /><span>{t('dest.parkSearch')}</span></a>
                      {/* The OpenStreetMap credit the ODbL asks for stays. */}
                      <p className="xp-source">{t('dest.parkSource')}</p>
                    </div>
                  )}
                </Fold>
              )}
            </div>
          )}

          {/* Exits: every hand-over to a booking or search site, one row,
              each a link; the one line every booking link owes the traveller
              (PRODUCT.md: prices may have changed). */}
          {settled && exits.length > 0 && (
            <section className="destp-exits" aria-labelledby="h-exits">
              <h2 className="destp-exits-title" id="h-exits">{t('explore.furtherTitle', { city })}</h2>
              <div className="destp-exit-row">
                {exits.map(({ key, href, label, Icon }) => (
                  <a key={key} className="destp-exit" href={href} target="_blank" rel="noreferrer noopener">
                    <Icon size={16} />
                    <span>{label}</span>
                  </a>
                ))}
              </div>
              <p className="destp-exits-note">{t('prov.bookingNote')}</p>
            </section>
          )}

          {/* The sources the page owes, in one line before the utility row
              (T446): the route data's licence and the live forecast. They
              used to sit under their sections as method lines. */}
          {settled && (hasRoutes || weatherOn) && (
            <div className="destp-sources">
              <p>
                {[hasRoutes && t('dest.routesCredit'), weatherOn && t('explore.weatherCredit', { time: fmtUpdated(forecast[0]?.updated) })].filter(Boolean).join(' ')}
              </p>
              {hasRoutes && <CreditFold t={t} licenceKeys={['credit.licence.routes']} />}
            </div>
          )}

          {/* The page-end utility row (carta-design "Detail page grammar"):
              download and report, secondary. */}
          {settled && (
            <div className="destp-utility">
              <Button variant="secondary" className="destp-pdf" onClick={exportPdf} disabled={pdfBusy || loading || !d}
                loading={pdfBusy} iconStart={<DownloadIcon size={16} />}>
                {pdfBusy ? t('dest.pdfBuilding') : t('dest.pdf')}
              </Button>
              <ReportProblem item={DEST_REPORT} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
