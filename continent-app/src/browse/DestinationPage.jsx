import React from 'react';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { knownFor } from '../lib/knownFor.js';
import { crowdBadgeWorthShowing } from '../components/CrowdingBadge.jsx';
import { ClimateStrip, MONTHS_SHORT, fmtMonthRanges } from './ClimateStrip.jsx';
import { claimShared } from '../lib/sharedElement.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { CostReceipt } from '../components/CostSummary.jsx';
import { FirstRunReceipt } from '../components/FirstRunReceipt.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { safeUrl, eur, eurExact } from '../lib/format.js';
import { useDossier, destShareUrl } from '../lib/dossier.js';
import { activityLink } from '../lib/activityAffiliates.js';
import { mapsSearchUrl } from '../lib/destInfo.js';
import { useForecast } from '../lib/weather.js';
import { packingList, packMonth } from '../lib/packing.js';
import { cheapestStayMonths } from '../lib/costIndex.js';
import { useI18n } from '../i18n/index.jsx';
import { Fold } from './Fold.jsx';
import { FigureFooter } from './HonestFooters.jsx';
import { RatingBreakdown } from './RatingBreakdown.jsx';
import { Neighbourhoods } from './Neighbourhoods.jsx';
import { GettingThere } from './GettingThere.jsx';
import { CrowdCalendar } from './CrowdCalendar.jsx';
import { BathingWater } from './BathingWater.jsx';
import { MemberPlaces } from './MemberPlaces.jsx';
import { AroundHere, FeaturePhoto, summaryOf } from './AroundHere.jsx';
import RoutesFromHere from './RoutesFromHere.jsx';
import { NearestLine } from './CoverageEmpty.jsx';
import { WebcamSection } from './WebcamEmbed.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { visitLength } from '../lib/nearby.js';
import { roleOf } from '../lib/taxonomy.js';
import { KindGlyph } from '../components/KindGlyph.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { fetchDestPois } from '../lib/appData.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useFirstRun } from '../lib/firstRunContext.js';
import { SectionRail } from './SectionRail.jsx';
import {
  TreeIcon, PersonIcon, CalendarIcon, MapPinIcon,
  ParkingIcon, SunIcon, PartSunIcon, CloudIcon, FogIcon,
  RainIcon, DrizzleIcon, SnowIcon, StormIcon, ClockIcon, CompassIcon,
  ShoeIcon, SwimIcon, BootIcon, PlugIcon, BottleIcon, JacketIcon,
  BackpackIcon, ReceiptIcon, CheckIcon, BedIcon, StarIcon,
  ChevronRightIcon, MusicIcon, SparkIcon, LinkIcon,
  DownloadIcon, BulbIcon, MedalIcon, RouteIcon, AlertIcon,
  ArrowLeftIcon, CloseIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { scrollBehavior } from '../lib/motion.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { FlashDeck } from './FlashDeck.jsx';
import { cardCategory } from '../lib/flashcards.js';

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

/**
 * Only one section opens itself (P4.4). Six open folds made the page a wall a
 * reader had to scroll past rather than a page they could steer. Since T385
 * it is the month block, the traveller's second question after the cost the
 * receipt already answers; the map used to open first, but it now sits below
 * walk and ride, and an open map below the fold holds a WebGL context for a
 * view nobody has scrolled to.
 */
const OPEN_BY_DEFAULT = new Set(['when']);
/** lib/coverageEmpty.js loader layers against the dossier layer names
 *  onOpenFeature takes (the same names AroundHere rows carry). */
const DOSSIER_LAYER = {
  trail: 'trails', cycling: 'cycling', mountain: 'mountains', lake: 'lakes', beach: 'beaches',
};

const baseCity = (name) => (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

/**
 * Remembered folds (carta-design "Remembered state", T385): the folds a
 * traveller opened on a destination come back when they return to it in the
 * same session, never across sessions. sessionStorage, every read and write
 * in try/catch; without storage the page simply opens on its defaults.
 */
const FOLD_STORE = 'carta.destFolds.v1';
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

/** The arrive month (1 to 12) of the dates the receipt prices: the
 *  traveller's own once they set them, Carta's default pair until then. The
 *  shell's settings line (T381) writes the same dates. */
function monthOf(iso) {
  const m = /^\d{4}-(\d{2})/.exec(iso || '');
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? n : null;
}
const CROWD_KEY = ['crowd.quiet', 'crowd.moderate', 'crowd.busy', 'crowd.crowded'];
const fmtKm = (km) => (km < 0.95 ? `${Math.round((km * 1000) / 10) * 10} m` : `${Math.round(km)} km`);
/** Highlight photographs ship at 960px; the tiles want 500. Same file, one
 *  path segment, and Commons serves both. */
const thumb500 = (url) => (url ? url.replace(/\/960px-/, '/500px-') : url);

/**
 * A photograph for each "best thing to do" (P4.4).
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

  return React.useMemo(() => {
    const named = (pois || [])
      .filter((p) => p?.img && p.name && !NOT_A_VIEW.test(p.img) && foldName(p.name).length >= 3)
      .map((p) => ({ key: foldName(p.name), img: p.img }))
      .sort((a, b) => b.key.length - a.key.length);
    return (text) => {
      const hay = ` ${foldName(text)} `;
      const hit = named.find((p) => hay.includes(` ${p.key} `));
      return hit?.img || null;
    };
  }, [pois]);
}

/** Case, accents and a trailing "(...)" removed, so "Sagrada Família" and
 *  "Sagrada Familia (Basilica)" fold together. NFKD leaves some letters
 *  whole, so the handful that matter are folded by hand. */
/** Commons files that are a mark rather than a view: an SVG rendering is
 *  almost always a crest, a logo or a map, never a photograph. */
const NOT_A_VIEW = /\.svg\.png|logo|coat[_%20-]*of[_%20-]*arms|crest|emblem|wappen|escudo|stemma|blason/i;

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
  return t(`tip.${tip.code}`, args);
}

function GalleryStrip({ gallery, city, iso2, fallbackUrl, destId }) {
  const { t } = useI18n();
  // The first photograph takes the card photograph's name (G2), so the card's
  // picture grows into this one instead of the page appearing from nothing.
  const claimRef = React.useCallback((el) => claimShared(el, destId), [destId]);
  const scroller = React.useRef(null);
  const [idx, setIdx] = React.useState(0);
  const [failed, setFailed] = React.useState(() => new Set());
  const imgs = (gallery?.length ? gallery : (fallbackUrl ? [{ url: fallbackUrl }] : []))
    .filter((g) => !failed.has(g.url));
  // A caption that is the record's own name ("Rome (Fiumicino)") names the
  // town, not its airport (T385, brief V3-10); any other caption is kept.
  const capOf = (cap) => (cap && baseCity(cap) === city ? city : (cap || ''));

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
    el.scrollBy({ left: dir * (slide.offsetWidth + 6), behavior: scrollBehavior() });
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
      {/* A photo track (carta-design "Photo track"): the arrow keys move it
          when it has focus, like the Previous and Next buttons. */}
      <div
        className="destp-gallery-track"
        ref={scroller}
        onScroll={onScroll}
        tabIndex={imgs.length > 1 ? 0 : undefined}
        aria-label={imgs.length > 1 ? city : undefined}
        role={imgs.length > 1 ? 'group' : undefined}
        onKeyDown={imgs.length > 1 ? (e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
        } : undefined}
      >
        {imgs.map((g, i) => (
          <figure className="destp-slide" key={g.url}>
            <img
              ref={i === 0 ? claimRef : undefined}
              src={g.url}
              alt={capOf(g.caption)}
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchpriority={i === 0 ? 'high' : undefined}
              onError={() => setFailed((s) => new Set([...s, g.url]))}
            />
            {/* The caption band (carta-design "Caption band", T395): a solid
                paper band flush under the photograph, never text on it. The
                place, the position in mono and the credit as text. */}
            <figcaption className="destp-slide-band">
              <span className="destp-slide-cap">{capOf(g.caption)}</span>
              {imgs.length > 1 && (
                <span className="destp-slide-pos mono">{t('journey.deckPos', { n: i + 1, total: imgs.length })}</span>
              )}
              {safeUrl(g.page) && (g.author || g.licence) && (
                <a
                  className="destp-slide-credit"
                  href={safeUrl(g.page)}
                  title={[g.author, g.licence].filter(Boolean).join(', ')}
                  target="_blank"
                  rel="noreferrer"
                >
                  {[g.author, g.licence].filter(Boolean).join(', ')}
                </a>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      {imgs.length > 1 && (
        <>
          <button type="button" className="destp-gallery-arrow is-prev" onClick={() => nudge(-1)} aria-label={t('dest.photoPrev')} disabled={idx === 0}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button type="button" className="destp-gallery-arrow is-next" onClick={() => nudge(1)} aria-label={t('dest.photoNext')} disabled={idx >= imgs.length - 1}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </>
      )}
    </div>
  );
}

export function DestinationPage({
  destination, data, indices, choices, onOpenLifestyle, onClose, onSelect,
  isFavorite, onToggleFavorite, onOpenFeature, onOpenItin,
  // The two doors into the planners (App.openTripForCountry / openDayForDest).
  onPlanTrip = null, onPlanDay = null,
}) {
  const { t, lang } = useI18n();
  const paywall = usePaywall();
  const pageRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const [stuck, setStuck] = React.useState(false);
  const [mapLayer, setMapLayer] = React.useState('highlights');
  // The committed highlight (a click or tap on a tile or its pin) and the one
  // under the pointer or in focus: carta-design "Map and list in sync" (T395).
  const [hlFocus, setHlFocus] = React.useState(null);
  const [hlHover, setHlHover] = React.useState(null);
  const [hlAll, setHlAll] = React.useState(false);
  const [doAll, setDoAll] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  // One-line status for a failed PDF or a blocked clipboard (T405): what
  // happened and what to do, in a polite live region.
  const [notice, setNotice] = React.useState(null);
  // True while the first-run receipt's "Set your dates" is the page's one
  // primary; "Plan a trip here" waits as a secondary until then (T099).
  const [frrPrimary, setFrrPrimary] = React.useState(false);
  const [open, setOpen] = React.useState(() => readFolds(destination?.id) || new Set(OPEN_BY_DEFAULT));
  // Expand all stays in force while the dossier arrives: folds that appear
  // after the click open too, and the label stays true (T385, brief V3-7).
  const [expanding, setExpanding] = React.useState(false);
  const headRef = React.useRef(null);
  const firstRun = useFirstRun();
  const tripMonth = monthOf(firstRun?.departDate || firstRun?.defaultDates?.start || null);
  // The receipt names the town, never the airport the record is keyed by.
  const receiptDest = React.useMemo(
    () => (destination ? { ...destination, city: baseCity(destination.city) } : null),
    [destination],
  );

  const dossier = useDossier(destination?.id);
  // D7: a member search lands here with ?dm=<name>; that member is the
  // reason the reader arrived, so it gets the focus.
  const memberFocus = React.useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('dm') || null;
    } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-reads ?dm= from the address bar, which is not React state, each time the page changes destination
  }, [destination?.id]);

  // While Expand all is in force every fold reads as open, including the ones
  // the dossier adds after the click. Closing one ends the mode and keeps the
  // rest open. `allIds` is declared further down; these run at click time.
  const isOpen = (id) => expanding || open.has(id);
  const toggle = (id) => {
    if (expanding) {
      setExpanding(false);
      setOpen(new Set(allIds.filter((x) => x !== id)));
      return;
    }
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const setAllOpen = (ids, value) => setOpen((s) => {
    const n = new Set(s);
    ids.forEach((id) => { if (value) n.add(id); else n.delete(id); });
    return n;
  });
  const jumpTo = (id) => {
    setOpen((s) => new Set([...s, id]));
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector?.(`#sec-${id}`)
        ?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
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
    setHlHover(null);
    setHlAll(false);
    setDoAll(false);
    setCopied(false);
    setNotice(null);
    setExpanding(false);
    setOpen(readFolds(destination?.id) || new Set(OPEN_BY_DEFAULT));
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [destination?.id]);

  React.useEffect(() => {
    writeFolds(destination?.id, open);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writes on a fold change only: a destination change restores its own set first, and that restore is the next change
  }, [open]);

  // Escape closes it, capture phase, so the app-level stack never double-fires,
  // and the same hook gives the dialog the focus management its aria-modal
  // has always promised. An open dropdown keeps its own Escape.
  const backRef = React.useRef(null);
  const skipEscape = React.useCallback(
    () => !!pageRef.current?.querySelector('.dropdown-menu'), []);
  // Where focus lands on open (carta-design rule 10, T405): on a mouse the
  // place name, which takes focus with no ring (a script focus after a click
  // is never :focus-visible); on a phone the back arrow, the thumb's exit.
  const titleRef = React.useRef(null);
  const openFocusRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let fine = false;
    try { fine = window.matchMedia('(pointer: fine)').matches; } catch { /* keep the back arrow */ }
    openFocusRef.current = fine && titleRef.current ? titleRef.current : backRef.current;
  }, [destination?.id]);
  useFocusTrap(pageRef, onClose, {
    initialFocusRef: openFocusRef,
    skipEscapeWhen: skipEscape,
    enabled: !!destination,
  });

  const lat = destination?.city_lat ?? destination?.lat;
  const lon = destination?.city_lon ?? destination?.lon;
  const forecast = useForecast(lat, lon, !!destination);
  // Photographs for "Best things to do". Must sit above the early return:
  // hooks cannot run conditionally.
  const doPhotos = useDoPhotos(destination?.id);
  // The day figure updates in place when the Lifestyle reprices it: one
  // opacity dip, no count-up (carta-design "Motion", T395). Keyed by the
  // formatted figure, and reset by the destination so a new page never dips.
  const dayFigRef = React.useRef(null);
  const dayFig = indices?.get?.(destination?.id)?.dayEur;
  useSettledFigure(dayFigRef, dayFig == null ? '' : `${destination?.id}:${eur(dayFig)}`);

  if (!destination) return null;

  const city = baseCity(destination.city);
  const DEST_REPORT = { layer: 'dest', id: destination.id, cc: destination.iso2, name: city };
  const d = dossier || null;
  const loading = dossier === undefined;
  // Everything below the badge row waits for the dossier to answer (a file
  // or a null), and then appears in its final shape. Drawn early from the
  // record alone, the intro grew from the knownFor line to the dossier's two
  // sentences and the fact strip gained its best months and bed price, which
  // pushed the planner buttons and the strip 45 px down on a phone: a layout
  // shift of 0.30 (T011, T271). Content that appears moves nothing.
  const settled = !loading;
  const cost = indices?.get?.(destination.id) || null;
  const profileKey = matchProfile(choices?.lifestyle || {});
  const lifestyleLine = t('cost.atLifestyle', {
    profile: profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom'),
    stay: t(`stay.${cost?.stayTier || choices?.stay_tier || 'home'}`).toLowerCase(),
  });
  const kf = knownFor(destination);
  const cheapMonths = cheapestStayMonths(destination);
  // Pack for the month the receipt prices (the traveller's arrive month); the
  // next good month only when no dates exist at all.
  const month = tripMonth || packMonth(destination);
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
  const webcams = d?.webcams || [];
  // ROUTES.md R6: measured to the nearest point on the line, in the lab, and
  // named for the path rather than for whichever stage of it passes. Trails
  // left `nearby` with this block: see pipeline/dossier NEARBY_RULES.
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
  const bestMonths = when?.best?.length ? when.best.map((m) => MONTHS_SHORT[m - 1]).join(', ') : '';
  const bedFrom = sleep?.tiers?.dorm_pp_night_eur ?? sleep?.per_person_night_eur ?? null;

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

  const exportPdf = async () => {
    if (pdfBusy || !d) return;
    if (!paywall.require('export')) return;
    setNotice(null);
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
      setNotice({ key: 'dest.pdfFailed' });
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

  const hasAround = !!(around || nearbyRows.length);
  const hasRoutes = (routeRows.hiking?.length || 0) + (routeRows.cycling?.length || 0) > 0
    || !!routeRows.node_network?.km;
  const weatherOn = forecast !== null && forecast !== undefined;
  const crowdOn = crowdBadgeWorthShowing(destination);
  const has = {
    highlights: highlights.length > 0 || !loading,
    do: doItems.length > 0,
    // Walk and ride from here: the routes that pass the town and the outdoors
    // within 20 km, one fold (T385, brief V3-6).
    routes: hasRoutes || hasAround,
    trips: trips.length > 0,
    members: members?.length > 0,
    rating: verdict?.score != null,
    // The month block: climate, cheap-bed months, crowds, bathing water and
    // this week's forecast, one fold (T385, brief V3-4).
    when: !!destination.climate?.m || weatherOn || crowdOn || !!water?.rating,
    sleep: !!(sleep?.neighbourhoods?.length > 0 || sleep?.tiers || sleep?.seasonality),
    getting: !!(getting || rhythm || bookAhead.length > 0 || pairs.length > 0),
    cost: cost?.dayEur != null,
    tips: tips.length > 0,
    festivals: festivals.length > 0,
    webcams: webcams.length > 0,
    park: !!(parking && (parking.spots?.length > 0 || parking.park_ride || parking.web)),
    pack: packs.length > 0,
  };
  // Two sections keep their heading when they have nothing to show and say
  // so in one line (T367, docs/ONBOARDING_AND_EMPTY_STATES.md, "The
  // detail-page rule"), once the dossier has answered: an empty fold is a
  // fact about the place, a missing one reads as a page that broke. They stay
  // out of the section rail, which lists what a page HAS.
  const show = {
    routes: has.routes || !!d,
    getting: has.getting || !!d,
  };
  // The rail, in page order (the traveller's order: cost, month, getting
  // there, what is there), only the sections the page has.
  const railSpec = JSON.stringify([
    ['cost', 'dest.nav.cost'], ['when', 'dest.nav.when'], ['getting', 'dest.nav.getting'],
    ['routes', 'dest.nav.walkRide'], ['do', 'dest.nav.do'], ['highlights', 'dest.nav.highlights'],
    ['trips', 'dest.nav.trips'], ['rating', 'dest.nav.verdict'], ['sleep', 'dest.nav.sleep'],
    ['park', 'dest.nav.park'],
  ].filter(([id]) => has[id]).map(([id, key]) => ({ id: `sec-${id}`, key: id, label: t(key) })));
  // Expand all opens every fold on the page, the empty ones included.
  const allIds = Object.keys(has).filter((k) => has[k] || show[k]).concat(['further']);
  const allOpen = expanding || allIds.every((id) => open.has(id));
  const expandAll = () => {
    if (allOpen) {
      setExpanding(false);
      setAllOpen(allIds, false);
    } else {
      setExpanding(true);
      setAllOpen(allIds, true);
    }
  };

  // Closed summaries that answer their question.
  const crowdWord = crowdOn ? t(CROWD_KEY[destination.crowding.tier] || 'crowd.moderate').toLowerCase() : '';
  const whenSummary = bestMonths
    ? (crowdWord ? t('dest.whenSummaryCrowd', { months: bestMonths, crowd: crowdWord }) : t('dest.whenSummary', { months: bestMonths }))
    : (weatherOn && forecast[0]?.hi != null ? t('dest.weatherSummary', { hi: Math.round(forecast[0].hi) }) : crowdWord);
  // Getting there answers "can I do this without a car" first.
  const gettingSummary = getting?.transit
    ? [t(`dest.transit.${getting.transit}`), getting.car_needed != null ? t(getting.car_needed ? 'dest.carYes' : 'dest.carNo') : '']
      .filter(Boolean).join(' ')
    : getting?.airport
      ? (getting.transfer_min != null
        ? t('dest.flyToWithTransfer', { iata: getting.airport, n: getting.transfer_min, mode: t(`mode.${getting.transfer_mode || 'train'}`) })
        : t('dest.flyTo', { iata: getting.airport }))
      : '';
  const walkSummary = [
    [
      routeRows.hiking?.length && `${routeRows.hiking.length} ${t('dest.routesHiking').toLowerCase()}`,
      routeRows.cycling?.length && `${routeRows.cycling.length} ${t('dest.routesCycling').toLowerCase()}`,
    ].filter(Boolean).join(', '),
    hasAround ? summaryOf(around, t) : '',
  ].filter(Boolean).join('; ');
  const festMonths = fmtMonthRanges([...new Set(festivals.flatMap((f) => f.months || []))]);
  const visitLine = stayLen && destination.place?.visit_h != null
    ? t('dest.visitWithSights', { visit: t(stayLen.key, { n: stayLen.n }), n: Math.round(destination.place.visit_h) })
    : stayLen ? t(stayLen.key, { n: stayLen.n })
      : destination.place?.visit_h != null ? t('dest.visitHours', { n: Math.round(destination.place.visit_h) }) : '';

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
        <button className="destp-back" onClick={onClose} aria-label={t('glyph.back')} ref={backRef}>
          <ArrowLeftIcon size={20} />
        </button>
        <span className="destp-bar-name">{city}</span>
        <div className="destp-bar-actions">
          {/* Expand all sits in the bar, always in reach (T385): the shared
              SectionRail has no slot for it (register row T385). Its class
              stays destp-subnav-all, which the harnesses look for. */}
          {settled && (
            <button type="button" className="destp-bar-btn destp-subnav-all" onClick={expandAll}>
              {allOpen ? t('dest.collapseAll') : t('dest.expandAll')}
            </button>
          )}
          <button type="button" className="destp-bar-btn" onClick={share}>
            {copied ? t('dest.linkCopied') : t('dest.share')}
          </button>
          <button className="panel-close destp-close" onClick={onClose} aria-label={t('detail.close')}>
            <CloseIcon size={16} />
          </button>
        </div>
      </div>

      {notice && (
        <p className="destp-notice" role="status">
          {t(notice.key)}
          {notice.url && <> <span className="destp-notice-url">{notice.url}</span></>}
          <button type="button" className="destp-notice-x" onClick={() => setNotice(null)}>{t('dest.noticeDismiss')}</button>
        </p>
      )}

      <div className="destp-scroll" ref={scrollRef} onScroll={onScroll}>
        {/* The shared section rail (T165-b): anchors, the ink-fill pill on
            the section in view, shown once the head has scrolled away. */}
        <DestRail
          spec={railSpec}
          scrollRef={scrollRef}
          heroRef={headRef}
          ready={`${destination.id}:${settled}`}
          ariaLabel={t('dest.subnavAria')}
          onJump={(key) => setOpen((o) => new Set([...o, key]))}
        />
        <GalleryStrip
          gallery={d?.gallery}
          city={city}
          iso2={destination.iso2}
          fallbackUrl={destination.image?.url}
          destId={destination.id}
        />

        <div className="destp-head" ref={headRef}>
          <div className="destp-head-main">
            <div className="destp-title-row">
              <h1 className="destp-city" ref={titleRef} tabIndex={-1}>{city}</h1>
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
              {/* The crowd and water badges moved into the month block (T385). */}
              {visitLine && (
                <span className="destp-visit"><ClockIcon size={12} />{visitLine}</span>
              )}
            </div>
            {/* What this place is: two or three sentences from our own
                facts, one opening line after Wikivoyage. Never the article. */}
            {settled && shortIntro && (
              <p className="destp-short">
                {shortIntro}
                {guideUrl && (
                  <a className="destp-short-src" href={guideUrl} target="_blank" rel="noreferrer">{t('detail.readGuide')}</a>
                )}
              </p>
            )}
          </div>
          {settled && (
          <div className="destp-head-actions">
            {/* Into the planners. A page about a place is where the wish to
                go there forms, so the trip wizard (this country picked) and
                the day flow (staying in this city) open from here. */}
            {/* One row of three (T385, brief V3-3): the primary, Shortlist,
                Plan a day. Share lives in the bar; the PDF and Report a
                problem sit before the footer; Google Maps in the map fold. */}
            {onPlanTrip && (
              <button type="button" className={`panel-fav destp-plan-btn${frrPrimary ? ' is-quiet' : ''}`} onClick={onPlanTrip}>
                <RouteIcon size={15} />
                <span>{t('dest.planTrip')}</span>
              </button>
            )}
            {onToggleFavorite && (
              <button className={`panel-fav ${isFavorite ? 'on' : ''}`} onClick={onToggleFavorite}
                aria-label={isFavorite ? t('detail.removeShortlist') : t('detail.addShortlist')}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                  <polygon points="12 2 15.1 8.6 22 9.3 16.8 14 18.3 21 12 17.3 5.7 21 7.2 14 2 9.3 8.9 8.6" />
                </svg>
                <span>{isFavorite ? t('detail.shortlisted') : t('detail.shortlist')}</span>
              </button>
            )}
            {onPlanDay && (
              <button type="button" className="panel-fav destp-plan-btn is-day" onClick={onPlanDay}>
                <SunIcon size={15} />
                <span>{t('dest.planDay')}</span>
              </button>
            )}
          </div>
          )}
        </div>

        {/* The cost facts. The sights hours joined the visit line and the
            best months the month block (T385). "A day" is the cost index at
            the traveller's Lifestyle; the receipt below prices its own stay
            tier. Which of the two the page shows is the owner's call (register
            row T374-d), so both stay, and each label names its basis. */}
        {settled && (cost?.dayEur != null || bedFrom != null) && (
          <dl className="dfacts">
            {cost?.dayEur != null && (
              <div className="dfact"><dt>{t('dest.factDayAt')}</dt><dd className="mono" ref={dayFigRef}>{eur(cost.dayEur)}</dd></div>
            )}
            {bedFrom != null && (
              <div className="dfact"><dt>{t('dest.factSleep')}</dt><dd className="mono">{eur(bedFrom)}</dd></div>
            )}
          </dl>
        )}

        {/* While the dossier answers, one still block holds the place of the
            receipt and the folds (carta-design "Loading", T395): no shimmer,
            no spinner, "Loading" for screen readers only. */}
        {!settled && (
          <div className="destp-wait" aria-busy="true">
            <span className="sr-only">{t('state.loading')}</span>
          </div>
        )}

        {settled && (
        <div className="destp-grid has-frr">
          {/* The first priced total (T099, docs/FIRST_RUN_RESULT.md): on a
              phone straight under the facts, on a desktop at the head of
              the right column, beside the folds. */}
          <div className="destp-frr">
            <FirstRunReceipt
              dest={receiptDest}
              receiptKey={`dest:${destination.id}`}
              headingLevel={2}
              onPrimaryChange={setFrrPrimary}
            />
            <ReportProblem priceOnly item={DEST_REPORT} />
          </div>
          {/* The traveller's first three questions, in order: what a day
              costs, is it good in my month, can I get there without a car.
              First on a phone; on a desktop under the receipt at the head
              of the side column (T385, brief V3-2). */}
          <div className="destp-col is-lead">
            {/* What a day here costs at the reader's own Lifestyle: the cost
                index basis, kept beside the receipt and named for its basis
                while the owner decides which basis the page shows (T374-d).
                The rounded trip total and the second price report button went
                (T385): the receipt above is the trip total, unrounded, and
                carries the one report button. */}
            {has.cost && (
              <Fold level={2}
                id="sec-cost"
                icon={ReceiptIcon}
                title={t('dest.costTitleAt')}
                summary={t('dest.costSummary', { eur: Math.round(cost.dayEur) })}
                open={isOpen('cost')}
                onToggle={() => toggle('cost')}
              >
                <CostReceipt cost={cost} t={t} lang={lang} lifestyleLabel={lifestyleLine} onOpenLifestyle={onOpenLifestyle} />
              </Fold>
            )}

            {/* The month block (T385, brief V3-4): is it good in my month.
                Climate with every month's figures readable without a hover,
                the traveller's month outlined, the cheap-bed months, the crowd
                tier with its year, the bathing water and this week's forecast. */}
            {has.when && (
              <Fold level={2}
                id="sec-when"
                icon={CalendarIcon}
                title={t('dest.whenTitle')}
                summary={whenSummary}
                open={isOpen('when')}
                onToggle={() => toggle('when')}
              >
                {destination.climate?.m && <ClimateStrip climate={destination.climate} month={tripMonth} figures />}
                {cheapMonths && (
                  <p className="xp-when-fact">{t('explore.whenCheapStay', { months: fmtMonthRanges(cheapMonths) })}</p>
                )}
                <CrowdCalendar destination={destination} t={t} />
                <BathingWater water={water} destination={destination} t={t} />
                {weatherOn && forecast.length > 0 && (
                  <div className="destp-week">
                    <h3 className="destp-subhead">{t('dest.weekTitle')}</h3>
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
              </Fold>
            )}

            {/* Getting there and around. */}
            {show.getting && (
              <Fold level={2}
                id="sec-getting"
                icon={PlaneIcon}
                title={t('dest.gettingTitle')}
                summary={gettingSummary}
                open={isOpen('getting')}
                onToggle={() => toggle('getting')}
              >
                {getting && <GettingThere getting={getting} t={t} />}
                {!has.getting && <div className="sec-none" data-testid="section-none"><p>{t('dest.gettingNone', { city })}</p></div>}
                {rhythm && <p className="destp-rhythm">{rhythm}</p>}
                {bookAhead.length > 0 && (
                  <p className="destp-bookahead">
                    <AlertIcon size={15} className="destp-bookahead-icon" />
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

          </div>

          <div className="destp-col is-main">
            {/* Walk and ride from here (T385, brief V3-6): the routes that PASS
                this town, measured to the line (ROUTES.md R6), then the
                outdoors within 20 km from every layer the Destinations tab
                knows. One fold, one empty line when there is neither. */}
            {show.routes && (
              <Fold level={2}
                id="sec-routes"
                icon={RouteIcon}
                title={t('dest.walkRideTitle')}
                summary={walkSummary}
                open={isOpen('routes')}
                onToggle={() => toggle('routes')}
              >
                {hasRoutes && <RoutesFromHere routes={routeRows} t={t} onOpen={onOpenFeature} />}
                {hasAround && (
                  <div className="destp-around">
                    {hasRoutes && <h3 className="destp-subhead">{t('dest.aroundTitle', { city })}</h3>}
                    <AroundHere
                      city={city}
                      nearby={nearby}
                      around={around}
                      t={t}
                      onOpenFeature={onOpenFeature}
                      onShowMap={aroundForMap.length || nearbyForMap.length ? showOnMap : null}
                    />
                  </div>
                )}
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
              </Fold>
            )}

            {/* Best things to do: cards, grouped by how many guides agree. */}
            {has.do && (
              <Fold level={2}
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
                          // The POI behind this item, where the shard has a
                          // photograph of it. Where it does not, the type
                          // glyph fills the frame: a missing thumbnail
                          // leaves a hole, which reads as a broken page.
                          const photo = doPhotos(item.name);
                          const body = (
                            <>
                              <span className={`ddo-photo ${photo ? '' : 'is-blank'}`} aria-hidden="true">
                                {photo
                                  ? <img src={thumb500(photo)} alt="" loading="lazy" />
                                  : <TypeIcon size={17} />}
                              </span>
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

            {/* Highlights and the one map, with its layers. */}
            {has.highlights && (
              <Fold level={2}
                id="sec-highlights"
                icon={MapPinIcon}
                title={t('dest.mapTitleV')}
                summary={highlights.length ? t('dest.hlSummary', { n: highlights.length }) : ''}
                open={isOpen('highlights')}
                onToggle={() => toggle('highlights')}
                aside={layerChoices.length > 1 && (
                  // A tablist behaves like one (T190): one tab stop, the
                  // arrows move between layers and switch as they go, Home
                  // and End jump to the ends.
                  <div
                    className="destp-layers"
                    role="tablist"
                    aria-label={t('dest.mapTitle')}
                    onKeyDown={(e) => {
                      const n = layerChoices.length;
                      const i = Math.max(0, layerChoices.findIndex((c) => c.key === effectiveLayer));
                      const j = { ArrowRight: (i + 1) % n, ArrowDown: (i + 1) % n,
                        ArrowLeft: (i - 1 + n) % n, ArrowUp: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
                      if (j == null) return;
                      e.preventDefault();
                      setMapLayer(layerChoices[j].key);
                      e.currentTarget.querySelectorAll('[role="tab"]')[j]?.focus();
                    }}
                  >
                    {layerChoices.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        role="tab"
                        tabIndex={effectiveLayer === c.key ? 0 : -1}
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
                      hover={hlHover}
                      onHoverHighlight={setHlHover}
                      height={undefined}
                      onPickTrip={(row) => onSelect?.(row.id)}
                      onPickFeature={(layer, row) => onOpenFeature?.(layer, row)}
                      onPickHighlight={(i) => {
                        setHlFocus(i);
                        setHlAll(true);
                        requestAnimationFrame(() => {
                          scrollRef.current?.querySelector?.(`#hl-${i}`)
                            ?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest', inline: 'center' });
                        });
                      }}
                    />
                  </React.Suspense>
                  {highlights.length > 0 && (
                    <div className={`dhl-strip ${hlAll ? 'is-all' : ''}`}>
                      {(hlAll ? highlights : highlights.slice(0, 8)).map((h, i) => (
                        <figure
                          className={`dhl ${hlFocus === i ? 'is-focus' : ''} ${hlHover === i ? 'is-hover' : ''}`}
                          key={h.id}
                          id={`hl-${i}`}
                          onMouseEnter={() => setHlHover(i)}
                          onMouseLeave={() => setHlHover((cur) => (cur === i ? null : cur))}
                          onFocus={() => setHlHover(i)}
                          onBlur={() => setHlHover((cur) => (cur === i ? null : cur))}
                        >
                          <button
                            type="button"
                            className="dhl-pic"
                            onClick={() => { setHlFocus(i); setMapLayer('highlights'); }}
                            aria-label={h.name}
                            aria-pressed={hlFocus === i}
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
                  {lat != null && lon != null && (
                    <a className="xp-further-btn destp-maps-link" href={mapsSearchUrl(lat, lon)} target="_blank" rel="noreferrer">
                      <MapPinIcon size={15} />
                      <span>{t('explore.openMaps')}</span>
                    </a>
                  )}
                </div>
              </Fold>
            )}

            {/* Best trips from here. Each card is a real catalogue place, so
                clicking one opens ITS page; the map layer shows the same set. */}
            {has.trips && (
              <Fold level={2}
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
              <Fold level={2}
                id="sec-members"
                icon={MapPinIcon}
                title={members.length === 1 ? t('dest.membersTitle1') : t('dest.membersTitleN', { n: members.length })}
                summary={members.slice(0, 3).map((m) => m.name).filter(Boolean).join(', ')}
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
              <Fold level={2}
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

            {/* Where to sleep: neighbourhood prices, tiers, the price curve. */}
            {has.sleep && (
              <Fold level={2}
                id="sec-sleep"
                icon={BedIcon}
                title={t('dest.sleepTitle')}
                summary={bedFrom != null ? t('dest.sleepSummary', { eur: eurExact(bedFrom) }) : ''}
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
                summary={t('dest.tipsSummary', { n: tips.length })}
                open={isOpen('tips')}
                onToggle={() => toggle('tips')}
                className="dsec-tips"
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
                icon={CalendarIcon}
                title={festivals.length === 1 ? t('dest.festTitle1') : t('dest.festTitleN', { n: festivals.length })}
                summary={festMonths}
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

            {/* Where to park: OSM spots with deeplinks, the city's own word
                where the web check has run, and an honest provenance line. */}
            {has.park && (
              <Fold level={2}
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

            {/* Live webcams from external providers: never stored, always live. */}
            <WebcamSection
              webcams={webcams}
              open={isOpen('webcams')}
              onToggle={() => toggle('webcams')}
              t={t}
            />

            {/* What to bring for the month that matters here. */}
            {has.pack && (
              <Fold level={2}
                id="sec-pack"
                icon={BackpackIcon}
                title={t('explore.packTitle')}
                summary={destination.climate || tripMonth ? t('dest.packSummary', { month: MONTHS_SHORT[month - 1] }) : ''}
                open={isOpen('pack')}
                onToggle={() => toggle('pack')}
              >
                <p className="xp-pack-for">
                  {destination.climate || tripMonth
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
            <Fold level={2}
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
            </Fold>

            {/* The per-source credit list used to print here as a long grey
                paragraph under every destination. It has moved to the PDF
                export (which still prints the full form) and to the map's own
                attribution control, so the page ends on content rather than on
                bookkeeping. NOTE: OpenStreetMap (ODbL) and Wikimedia Commons
                (CC BY-SA) require attribution to remain reachable somewhere in
                the product - do not remove it from those two places as well. */}
          </div>
        </div>
        )}

        {/* The page-end utility row (carta-design "Detail page grammar"):
            download and report, secondary, before the honest footer and
            never in the head (T385, brief V3-3). */}
        {settled && (
          <div className="destp-utility">
            <button type="button" className="destp-pdf" onClick={exportPdf} disabled={pdfBusy || loading || !d}>
              <DownloadIcon size={15} />
              <span>{pdfBusy ? t('dest.pdfBuilding') : t('dest.pdf')}</span>
            </button>
            <ReportProblem item={DEST_REPORT} />
          </div>
        )}

        {/* The four facts the page states as figures: the sights hours (in
            the visit line, a rule of thumb), the best months (counted from
            the climate record), and the two cost facts (indicative, so
            estimates). The receipt's lines carry their own provenance. */}
        {settled && (
          <FigureFooter kinds={[
            destination.place?.visit_h != null && 'e',
            bestMonths && 'c',
            cost?.dayEur != null && 'e',
            bedFrom != null && 'e',
          ]} />
        )}
      </div>
    </div>
  );
}
