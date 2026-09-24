import React from 'react';
import { flagUrl, isoToFlag } from '../lib/tripGuide.js';
import { monthName } from '../lib/dates.js';
import { eur } from '../lib/format.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { Fold } from '../browse/Fold.jsx';
import { useFolds } from '../browse/useFolds.js';
import { SheetShell } from '../browse/SheetShell.jsx';
import { FeaturePhoto } from '../browse/AroundHere.jsx';
import { knownFor } from '../lib/knownFor.js';
import { loadBeaches } from '../lib/beaches.js';
import { loadTrails } from '../lib/trails.js';
import { loadLakes } from '../lib/lakes.js';
import { loadMountains } from '../lib/mountains.js';
import { loadTrips, rankTrips } from '../lib/trips.js';
import { loadDossier } from '../lib/dossier.js';
import { nearbyAirports } from '../lib/wizardTransit.js';
import { googleFlightsLink } from '../lib/transportLinks.js';
import { cityLabel } from '../lib/placeName.js';
import { useFavoriteItems } from '../hooks/useFavoriteItems.js';
import { useI18n } from '../i18n/index.jsx';
import {
  CheckIcon, PlusIcon, BedIcon, DiningIcon, CalendarIcon, InfoIcon, MapPinIcon,
  CompassIcon, SuitcaseIcon, HeartIcon, RouteIcon, CastleIcon, MusicIcon,
  BeachIcon, BootIcon, LakeIcon, MountainIcon, CarIcon, TicketIcon, ReceiptIcon,
} from '../components/Icons.jsx';

/**
 * One country, opened.
 *
 * The wizard's country grid answers "which of these do I fancy" with a
 * photograph. This panel answers everything that decides it, as a page of
 * folds rather than a card of summaries: what is there to visit, what you
 * would actually do, which published trips already go there, how you get in,
 * and what a bed and a day of eating cost.
 *
 * It is deliberately not a booking surface and carries no fare: transport is
 * chosen and paid for outside Carta now, and a flight price on this panel
 * would be a fact about a date rather than about the country (see
 * lib/countryBrief.js for the whole argument). What it does carry is a link
 * to somewhere that holds live fares.
 *
 * TWO POSITIONS, ONE COMPONENT. On a pointer screen it is a right-hand drawer
 * and the grid reflows to make room; on a phone or tablet it is a SheetShell
 * bottom sheet over everything. It is never injected into the grid flow,
 * which is what used to push the whole Where step down the page the moment
 * somebody tapped "what's there".
 *
 * The synchronous sections (the guide record, the catalogue) paint at once.
 * The layer-backed rails inside "Things to do", "Best trips" and "Getting
 * there" are fetched when their fold is first opened, so a brief that is
 * opened and closed costs nothing beyond what was already in the catalogue.
 */

/** Below this width the drawer would leave the grid a single column, so the
 *  brief becomes a sheet instead. Matches the CSS breakpoint below. */
const DRAWER_MIN = 1024;

/** How many of each thing a section shows before it stops being a summary. */
const TOP_PLACES = 6;
const TOP_TRIPS = 3;
const RAIL_ROWS = 4;

function Flag({ iso2 }) {
  const url = flagUrl(iso2, 40);
  if (!url) return <span className="cbrief-flag">{isoToFlag(iso2)}</span>;
  return <img className="cbrief-flag" src={url} srcSet={`${flagUrl(iso2, 80)} 2x`} alt="" loading="lazy" />;
}

/** Is this viewport wide enough for the drawer? Live, because a desktop
 *  window gets dragged narrow and a tablet gets turned on its side. */
function useWideScreen() {
  const [wide, setWide] = React.useState(
    () => (typeof window === 'undefined' ? true : window.innerWidth >= DRAWER_MIN),
  );
  React.useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DRAWER_MIN}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * One layer fetch, run the first time its fold opens.
 *
 * Three states the caller has to be able to tell apart, which is why this is
 * not a bare promise: `rows` null and loading means skeletons, `rows` null and
 * done means the country has nothing published (hide the rail), and `error`
 * means the request itself failed (offer a retry). Folding them together is
 * how "we could not reach the server" becomes the lie "there are no beaches
 * in Portugal".
 */
function useLayerRows(load, cc, enabled) {
  const [state, setState] = React.useState({ rows: null, loading: false, error: false });
  const [nonce, setNonce] = React.useState(0);
  React.useEffect(() => {
    if (!enabled || !cc) { setState({ rows: null, loading: false, error: false }); return undefined; }
    let live = true;
    setState({ rows: null, loading: true, error: false });
    load(cc).then(
      (rows) => { if (live) setState({ rows: rows || null, loading: false, error: false }); },
      () => { if (live) setState({ rows: null, loading: false, error: true }); },
    );
    return () => { live = false; };
  }, [load, cc, enabled, nonce]);
  return { ...state, retry: () => setNonce((n) => n + 1) };
}

/** The placeholder a rail shows while its layer is in flight. */
function RailSkeletons({ n = RAIL_ROWS }) {
  return (
    <div className="cbrief-rail" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <span className="cbrief-rail-card is-skeleton" key={i} />)}
    </div>
  );
}

/** What a failed layer request looks like: the truth, and a way to try again. */
function RailRetry({ onRetry, t }) {
  return (
    <p className="cbrief-retry">
      {t('brief.loadFailed')}
      <button type="button" onClick={onRetry}>{t('brief.retry')}</button>
    </p>
  );
}

/* ── 1. At a glance ─────────────────────────────────────────────────────── */

/** Is the traveller's month a good one here? Three answers only, because the
 *  guide's best_months is a list of good months and nothing finer. */
function monthVerdict(bestMonths, month) {
  if (!month || !bestMonths?.length) return null;
  if (bestMonths.includes(month)) return 'good';
  // The month either side of a good one is the shoulder: quieter, cheaper,
  // and still the same weather give or take a fortnight.
  const near = (m) => bestMonths.includes(((m - 1 + 12 - 1) % 12) + 1) || bestMonths.includes((m % 12) + 1);
  return near(month) ? 'ok' : 'off';
}

/** The budget as a word. A euro figure belongs in Costs, at the bottom, where
 *  it can say what it measured; up here it would be a number with no basis. */
const BUDGET_WORD = { budget: 'brief.budgetLow', mid: 'brief.budgetMid', high: 'brief.budgetHigh' };

function AtAGlance({ brief, tripMonth, lang, t }) {
  const verdict = monthVerdict(brief.bestMonths, tripMonth);
  const around = [];
  if (brief.rail?.operator) around.push({ Icon: RouteIcon, text: brief.rail.operator });
  if (brief.bus?.operators?.length) around.push({ Icon: RouteIcon, text: brief.bus.operators.join(', ') });
  if (brief.driving?.tolls || brief.driving?.vignette) {
    around.push({ Icon: CarIcon, text: brief.driving.vignette ? t('brief.vignette') : t('brief.tolled') });
  }
  const budgetKey = BUDGET_WORD[brief.budgetLevel] || null;

  return (
    <div className="cbrief-glance">
      {brief.bestMonths.length > 0 && (
        <div className="cbrief-months">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const good = brief.bestMonths.includes(m);
            const mine = tripMonth === m;
            return (
              <span
                key={m}
                className={`cbrief-mo ${good ? 'good' : ''} ${mine ? 'mine' : ''}`}
                title={monthName(m, lang)}
              >
                {monthName(m, lang, false)}
              </span>
            );
          })}
        </div>
      )}
      {verdict && (
        <p className={`cbrief-verdict v-${verdict}`}>
          {t(`brief.month${verdict === 'good' ? 'Good' : verdict === 'ok' ? 'Ok' : 'Off'}`, {
            month: monthName(tripMonth, lang),
          })}
        </p>
      )}
      {brief.bestTimeNote && <p className="cbrief-note">{brief.bestTimeNote}</p>}

      <dl className="cbrief-facts">
        {around.length > 0 && (
          <div className="cbrief-fact">
            <dt>{t('brief.gettingAround')}</dt>
            <dd>{around.map((a) => a.text).join(' · ').replace(/ · /g, ', ')}</dd>
          </div>
        )}
        {brief.currency && (
          <div className="cbrief-fact">
            <dt>{t('brief.currency')}</dt>
            <dd>{brief.currency}</dd>
          </div>
        )}
        {brief.languages?.length > 0 && (
          <div className="cbrief-fact">
            <dt>{t('brief.languages')}</dt>
            <dd>{brief.languages.join(', ')}</dd>
          </div>
        )}
        {budgetKey && (
          <div className="cbrief-fact">
            <dt>{t('brief.budget')}</dt>
            <dd>{t(budgetKey)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/* ── 2. Top places ──────────────────────────────────────────────────────── */

function TopPlaces({ brief, destinations, onOpenDest, onSeeAll, t }) {
  const rows = brief.visit.slice(0, TOP_PLACES);
  if (!rows.length) return null;
  return (
    <>
      <div className="cbrief-rail">
        {rows.map((v) => {
          const dest = v.id ? destinations?.[v.id] : null;
          const line = v.why || (dest ? knownFor(dest) : '');
          const openable = Boolean(v.id && onOpenDest);
          return (
            <button
              type="button"
              className="cbrief-rail-card"
              key={`${v.name}-${v.id || ''}`}
              onClick={() => openable && onOpenDest(v.id)}
              disabled={!openable}
            >
              {/* A hand-written must-see the catalogue does not hold ("Theth
                  & the Blue Eye") has no photograph of its own, but it does
                  have coordinates, so FeaturePhoto draws the map there rather
                  than leaving an empty grey rectangle. Only a row with neither
                  falls back to the pin. */}
              {v.img || v.lat != null
                ? (
                  <FeaturePhoto
                    src={v.img}
                    lat={v.lat}
                    lon={v.lon}
                    className="cbrief-rail-img"
                  />
                )
                : (
                  // Neither a photograph nor a coordinate: a guide entry the
                  // catalogue does not hold as a place ("Valbona-Theth hike").
                  // The pin plus the region says "a place, no picture", which
                  // is true; borrowing the country's cover would claim a
                  // photograph of somewhere we have never photographed.
                  <span className="cbrief-rail-img is-blank">
                    <MapPinIcon size={15} />
                    {v.region && <small>{v.region}</small>}
                  </span>
                )}
              <span className="cbrief-rail-head">
                <b>{cityLabel(v.name)}</b>
                {v.ratingObj && <ScoreChip rating={v.ratingObj} />}
              </span>
              {line && <small className="cbrief-rail-why">{line}</small>}
            </button>
          );
        })}
      </div>
      {onSeeAll && (
        <button type="button" className="cbrief-more" onClick={() => onSeeAll(brief.country)}>
          {t('brief.seeAllPlaces', { n: brief.nPlaces })}
        </button>
      )}
    </>
  );
}

/* ── 3. Best trips ──────────────────────────────────────────────────────── */

function BestTrips({ brief, nights, onOpenTrip, onPlanTrip, open, t }) {
  const load = React.useCallback((cc) => loadTrips(cc), []);
  const { rows, loading, error, retry } = useLayerRows(load, brief.iso2, open);
  const ranked = React.useMemo(() => {
    if (!rows?.length) return [];
    return rankTrips(rows, { days: (nights || 6) + 1 }).slice(0, TOP_TRIPS);
  }, [rows, nights]);

  if (loading) return <RailSkeletons n={2} />;
  if (error) return <RailRetry onRetry={retry} t={t} />;
  if (!ranked.length) return <p className="cbrief-note">{t('brief.noTrips')}</p>;

  return (
    <ul className="cbrief-trips">
      {ranked.map((trip) => (
        <li key={trip.id}>
          <button type="button" className="cbrief-trip" onClick={() => onOpenTrip?.(trip)} disabled={!onOpenTrip}>
            <HeroImage
              url={trip.img?.url}
              city={trip.cities?.[0]?.city || brief.country}
              iso2={brief.iso2}
              className="cbrief-trip-img"
              maxWidth={330}
              ratio={[4, 3]}
              sizes="76px"
            />
            <span className="cbrief-trip-text">
              <b>{(trip.cities || []).map((c) => cityLabel(c.city)).join(' → ')}</b>
              <small>{t('brief.tripDays', { n: trip.days })}</small>
            </span>
          </button>
          {onPlanTrip && (
            <button type="button" className="cbrief-trip-plan" onClick={() => onPlanTrip(trip)}>
              {t('brief.planThisTrip')}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── 4. Things to do ────────────────────────────────────────────────────── */

const GROUP_ICON = {
  beach: BeachIcon, mountains: MountainIcon, hiking: BootIcon, nature: LakeIcon,
  heritage: CastleIcon, art: CastleIcon, food: DiningIcon, islands: BeachIcon,
  spa: LakeIcon, nightlife: MusicIcon,
};

const LAYER_LOADER = {
  beaches: loadBeaches, trails: loadTrails, lakes: loadLakes, mountains: loadMountains,
};

/** One theme group, as four real places rather than a count.
 *
 * A group with a published layer (beaches, trails, lakes, mountains) draws
 * from it, because those rows carry their own photographs, distances and
 * ascent. A group without one (heritage, food, art) draws the destinations
 * that carry its tags, which the brief already holds. */
function ThemeRail({ group, cc, open, t }) {
  const loader = group.layer ? LAYER_LOADER[group.layer] : null;
  const load = React.useCallback((code) => (loader ? loader(code) : Promise.resolve(null)), [loader]);
  const { rows, loading, error, retry } = useLayerRows(load, loader ? cc : null, open && Boolean(loader));

  const items = React.useMemo(() => {
    if (loader) {
      if (!rows?.length) return null;
      return rows
        .slice()
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, RAIL_ROWS)
        .map((r) => ({
          key: `${group.key}-${r.id}`,
          name: r.name,
          img: r.img || r.images?.[0]?.u || null,
          lat: r.lat, lon: r.lon,
          meta: group.layer === 'trails'
            ? [r.distance_m != null ? `${Math.round(r.distance_m / 1000)} km` : null,
              r.ascent_m != null ? t('brief.ascent', { m: Math.round(r.ascent_m) }) : null]
              .filter(Boolean).join(' · ')
            : null,
          rating: r.score != null ? { score: r.score, tier: r.tier ?? 0 } : null,
        }));
    }
    if (!group.rows?.length) return null;
    return group.rows.map((r) => ({
      key: `${group.key}-${r.id}`,
      name: cityLabel(r.name),
      img: r.img,
      lat: r.lat, lon: r.lon,
      meta: null,
      rating: r.rating,
    }));
  }, [loader, rows, group, t]);

  if (loading) {
    return (
      <div className="cbrief-group">
        <h5 className="cbrief-group-h">{t(group.labelKey)}</h5>
        <RailSkeletons />
      </div>
    );
  }
  if (error) {
    return (
      <div className="cbrief-group">
        <h5 className="cbrief-group-h">{t(group.labelKey)}</h5>
        <RailRetry onRetry={retry} t={t} />
      </div>
    );
  }
  // A layer with nothing published here hides its sub-rail rather than
  // printing an empty heading.
  if (!items) return null;

  const Icon = GROUP_ICON[group.key] || CompassIcon;
  return (
    <div className="cbrief-group">
      <h5 className="cbrief-group-h">
        <Icon size={12} /> {t(group.labelKey)}
        <span className="mono">{group.n}</span>
      </h5>
      <div className="cbrief-rail">
        {items.map((it) => (
          <div className="cbrief-rail-card is-static" key={it.key}>
            <FeaturePhoto src={it.img} lat={it.lat} lon={it.lon} className="cbrief-rail-img" />
            <span className="cbrief-rail-head">
              <b>{it.name}</b>
              {it.rating && <ScoreChip rating={it.rating} />}
            </span>
            {it.meta && <small className="cbrief-rail-why mono">{it.meta}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The events the guide names, with the traveller's month marked. */
function EventsRow({ events, tripMonth, lang, t }) {
  if (!events?.length) return null;
  // The guide writes the month into the line itself ("Palio di Siena (2 July
  // & 16 August)"), so the badge is read back out of the text rather than
  // invented: no month, no badge.
  const name = tripMonth ? monthName(tripMonth, lang) : '';
  return (
    <div className="cbrief-group">
      <h5 className="cbrief-group-h"><CalendarIcon size={12} /> {t('brief.events')}</h5>
      <ul className="cbrief-events">
        {events.map((e, i) => {
          const mine = Boolean(name) && new RegExp(name, 'i').test(e);
          return <li key={i} className={mine ? 'is-mine' : ''}>{e}</li>;
        })}
      </ul>
    </div>
  );
}

/* ── 7. Getting there ───────────────────────────────────────────────────── */

function GettingThere({ brief, meta, origin, open, startDate = '', endDate = '', lang = 'en', t }) {
  const top = brief.visit.find((v) => v.lat != null && v.lon != null) || null;
  const airports = React.useMemo(
    () => (top ? nearbyAirports(meta, top.lat, top.lon, { limit: 3 }) : []),
    [meta, top],
  );

  // The airport-to-city transfer is written per destination, in its dossier,
  // so it arrives with the fold rather than with the catalogue. It is a
  // RECORD ({airport, transit, car_needed, why, rental_eur_day}), not a
  // sentence: rendering the object itself is React error #31, and only `why`
  // is prose a traveller can read.
  const [transfer, setTransfer] = React.useState(null);
  React.useEffect(() => {
    if (!open || !top?.id) { setTransfer(null); return undefined; }
    let live = true;
    loadDossier(top.id).then(
      (doc) => {
        if (!live) return;
        const g = doc?.practical?.getting_there;
        setTransfer(g && typeof g === 'object' ? (g.why || null) : (g || null));
      },
      () => { if (live) setTransfer(null); },
    );
    return () => { live = false; };
  }, [open, top?.id]);

  // Google Flights from the traveller's own airport to the country's main one,
  // carrying the dates when the wizard has them. Undated it is still the right
  // link: the price graph is what someone reading a country brief wants.
  const flights = airports[0]
    ? googleFlightsLink({
      fromIata: origin,
      toIata: airports[0].iata,
      toCity: brief.country,
      date: startDate,
      returnDate: endDate,
      lang,
    })
    : null;

  if (!airports.length && !transfer) return <p className="cbrief-note">{t('brief.noAirports')}</p>;
  return (
    <div className="cbrief-getting">
      {airports.length > 0 && (
        <ul className="cbrief-airports">
          {airports.map((a) => (
            <li key={a.iata}>
              <b className="mono">{a.iata}</b>
              <span>{a.name}</span>
              <small className="mono">{t('brief.kmFrom', { km: a.km, place: cityLabel(top.name) })}</small>
            </li>
          ))}
        </ul>
      )}
      {transfer && <p className="cbrief-note">{transfer}</p>}
      {flights && (
        <a className="cbrief-link" href={flights} target="_blank" rel="noopener noreferrer">
          {t('brief.checkFlights', { from: origin, to: airports[0].iata })}
          <span className="ext-arrow" aria-hidden="true">&#8599;</span>
        </a>
      )}
    </div>
  );
}

/* ── The brief itself ───────────────────────────────────────────────────── */

function BriefBody({
  brief, destinations, meta, origin, tripMonth, nights, startDate, endDate, quizTypes,
  favorites, onOpenDest, onSeeAll, onOpenTrip, onPlanTrip,
}) {
  const { t, lang } = useI18n();
  const { isOpen, toggle } = useFolds(['glance', 'places', 'trips'], brief.iso2);

  // Groups the traveller asked for first, then the rest. What they told the
  // quiz is the only ordering signal the brief has, and ignoring it puts
  // "beach towns" above "walking bases" for somebody who asked to walk.
  //
  // Ordered by the traveller's picks IN THE ORDER THEY PICKED THEM, not by a
  // yes/no match: a trail runner who also said "road trip" was getting the
  // lakes rail first because it happened to be bigger and matched too.
  const groups = React.useMemo(() => {
    const picks = quizTypes || [];
    const rank = (g) => {
      const hits = (g.quizTypes || []).map((k) => picks.indexOf(k)).filter((i) => i >= 0);
      return hits.length ? Math.min(...hits) : Infinity;
    };
    return brief.themes
      .map((g) => (g.key === 'hiking' && picks.includes('trailrun')
        ? { ...g, labelKey: 'brief.themeHikingRun' } : g))
      .sort((a, b) => rank(a) - rank(b));
  }, [brief.themes, quizTypes]);

  // The shortlist, resolved through the same door the Favorites tab uses, so
  // a kept trail shows the name its own page shows. The loaders are cached
  // per file, so opening a second brief costs no second download.
  const { sections } = useFavoriteItems(favorites, destinations);
  const mine = React.useMemo(() => sections
    .flatMap((sec) => sec.rows)
    .filter((r) => !r.missing && r.name && r.cc === brief.iso2),
  [sections, brief.iso2]);

  const drivingBits = [];
  if (brief.driving?.tolls) drivingBits.push(brief.driving.tolls);
  if (brief.driving?.vignette) drivingBits.push(brief.driving.vignette);
  for (const w of brief.driving?.warnings || []) drivingBits.push(w);

  return (
    <div className="cbrief-folds">
      <Fold
        id="cb-glance" icon={CompassIcon} title={t('brief.atAGlance')}
        open={isOpen('glance')} onToggle={() => toggle('glance')}
      >
        <AtAGlance brief={brief} tripMonth={tripMonth} lang={lang} t={t} />
      </Fold>

      {brief.visit.length > 0 && (
        <Fold
          id="cb-places" icon={MapPinIcon} title={t('brief.topPlaces')}
          open={isOpen('places')} onToggle={() => toggle('places')}
        >
          <TopPlaces
            brief={brief} destinations={destinations}
            onOpenDest={onOpenDest} onSeeAll={onSeeAll} t={t}
          />
        </Fold>
      )}

      {brief.iso2 && (
        <Fold
          id="cb-trips" icon={SuitcaseIcon} title={t('brief.bestTrips')}
          open={isOpen('trips')} onToggle={() => toggle('trips')}
        >
          <BestTrips
            brief={brief} nights={nights} open={isOpen('trips')}
            onOpenTrip={onOpenTrip} onPlanTrip={onPlanTrip} t={t}
          />
        </Fold>
      )}

      {(groups.length > 0 || brief.events.length > 0) && (
        <Fold
          id="cb-do" icon={CompassIcon} title={t('brief.thingsToDo')}
          summary={groups.slice(0, 3).map((g) => t(g.labelKey)).join(', ')}
          open={isOpen('do')} onToggle={() => toggle('do')}
        >
          {groups.map((g) => (
            <ThemeRail key={g.key} group={g} cc={brief.iso2} open={isOpen('do')} t={t} />
          ))}
          <EventsRow events={brief.events} tripMonth={tripMonth} lang={lang} t={t} />
        </Fold>
      )}

      {brief.eat.length > 0 && (
        <Fold
          id="cb-eat" icon={DiningIcon} title={t('brief.eatDrink')}
          summary={t('brief.nDishes', { n: brief.eat.length })}
          open={isOpen('eat')} onToggle={() => toggle('eat')}
        >
          <div className="cbrief-chips">
            {brief.eat.map((f, i) => <span className="cbrief-chip" key={i}>{f}</span>)}
          </div>
        </Fold>
      )}

      {mine.length > 0 && (
        <Fold
          id="cb-fav" icon={HeartIcon} title={t('brief.yourShortlist')}
          summary={t('brief.nSaved', { n: mine.length })}
          open={isOpen('fav')} onToggle={() => toggle('fav')}
        >
          <ul className="cbrief-favs">
            {mine.map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <FeaturePhoto src={r.img} lat={r.lat} lon={r.lon} className="cbrief-fav-img" />
                <span className="cbrief-fav-text">
                  <b>{r.name}</b>
                  {r.sub && <small>{r.sub}</small>}
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      )}

      <Fold
        id="cb-there" icon={TicketIcon} title={t('brief.gettingThere')}
        open={isOpen('there')} onToggle={() => toggle('there')}
      >
        <GettingThere
          brief={brief} meta={meta} origin={origin} open={isOpen('there')}
          startDate={startDate} endDate={endDate} lang={lang} t={t}
        />
      </Fold>

      {(brief.tips.length > 0 || drivingBits.length > 0) && (
        <Fold
          id="cb-know" icon={InfoIcon} title={t('brief.worthKnowing')}
          summary={t('brief.nTips', { n: brief.tips.length + drivingBits.length })}
          open={isOpen('know')} onToggle={() => toggle('know')}
        >
          {brief.tips.length > 0 && (
            <ul className="cbrief-tips">
              {brief.tips.map((tip, i) => <li key={i}><InfoIcon size={11} /> <span>{tip}</span></li>)}
            </ul>
          )}
          {drivingBits.length > 0 && (
            <ul className="cbrief-tips cbrief-driving">
              {drivingBits.map((line, i) => <li key={i}><CarIcon size={11} /> <span>{line}</span></li>)}
            </ul>
          )}
        </Fold>
      )}

      <Fold
        id="cb-cost" icon={ReceiptIcon} title={t('brief.costs')}
        summary={brief.dayEur != null ? eur(Math.round(brief.dayEur)) : null}
        open={isOpen('cost')} onToggle={() => toggle('cost')}
      >
        {brief.dayEur != null ? (
          <div className="cbrief-figs">
            <div className="cbrief-fig">
              <span className="cbrief-fig-label"><BedIcon size={11} /> {t('brief.bed')}</span>
              <b className="cbrief-fig-val">{eur(Math.round(brief.stayEur))}</b>
              <small className="cbrief-fig-sub">{t('brief.aNight')}</small>
            </div>
            <div className="cbrief-fig">
              <span className="cbrief-fig-label"><DiningIcon size={11} /> {t('brief.eatingOut')}</span>
              <b className="cbrief-fig-val">{eur(Math.round(brief.foodEur))}</b>
              <small className="cbrief-fig-sub">{t('brief.aDay')}</small>
            </div>
          </div>
        ) : (
          <p className="cbrief-note">{t('brief.noPrices')}</p>
        )}
      </Fold>
    </div>
  );
}

/** The photo strip both positions open on. `showName` is off wherever the
 *  surrounding chrome already prints the country. */
function BriefHeader({ brief, showName = true }) {
  return (
    <div className="cbrief-hero">
      <HeroImage
        url={brief.cover}
        city={brief.country}
        iso2={brief.iso2}
        className="cbrief-hero-img"
        maxWidth={960}
        ratio={[16, 9]}
        sizes="(max-width: 768px) 100vw, 420px"
      />
      <span className="cbrief-hero-scrim" aria-hidden="true" />
      <span className="cbrief-hero-name">
        <Flag iso2={brief.iso2} />
        {showName && brief.country}
      </span>
    </div>
  );
}

/** [ Add {country} ] / [ On your list ✓ ], in the sticky footer of both
 *  positions: the one action the brief exists to make easy. */
function AddButton({ brief, picked, onToggle, t }) {
  return (
    <button
      className={`cbrief-add ${picked ? 'on' : ''}`}
      onClick={() => onToggle(brief.country)}
      aria-pressed={picked}
    >
      {picked
        ? <><CheckIcon size={13} /> {t('brief.onYourList')}</>
        : <><PlusIcon size={13} /> {t('brief.addCountry', { country: brief.country })}</>}
    </button>
  );
}

export function CountryBrief({
  brief, picked, onToggle, onClose, destinations = null, meta = null, origin = '',
  tripMonth = null, nights = null, quizTypes = null, favorites = null,
  startDate = '', endDate = '',
  onOpenDest = null, onSeeAll = null, onOpenTrip = null, onPlanTrip = null,
  anchorRef = null,
}) {
  const { t } = useI18n();
  const wide = useWideScreen();
  if (!brief) return null;

  const body = (
    <BriefBody
      brief={brief}
      destinations={destinations}
      meta={meta}
      origin={origin}
      tripMonth={tripMonth}
      nights={nights}
      startDate={startDate}
      endDate={endDate}
      quizTypes={quizTypes}
      favorites={favorites}
      onOpenDest={onOpenDest}
      onSeeAll={onSeeAll}
      onOpenTrip={onOpenTrip}
      onPlanTrip={onPlanTrip}
    />
  );

  // Phone and tablet: a bottom sheet over everything. SheetShell already owns
  // the scrim, the focus trap, the capture-phase Escape and the swipe.
  if (!wide) {
    return (
      <SheetShell
        title={brief.country}
        onClose={onClose}
        anchorRef={anchorRef}
        className="cbrief-sheet"
        labelId="cbrief-title"
        closeLabel={t('wizard.close')}
      >
        {/* The sheet's own header already names the country, so the photo
            strip carries only the flag: the name twice, 40px apart, read as
            a mistake. */}
        <BriefHeader brief={brief} showName={false} />
        {body}
        <div className="cbrief-foot is-sticky">
          <AddButton brief={brief} picked={picked} onToggle={onToggle} t={t} />
        </div>
      </SheetShell>
    );
  }

  // Desktop: a drawer in the grid's second column, sticky, scrolling itself.
  return (
    <aside className="cbrief" aria-label={brief.country}>
      {/* The drawer has no title bar of its own: the photo strip under it is
          the title, and a second copy of the country name above a picture
          with the country name on it is chrome for its own sake. The close
          button floats over the photograph instead. */}
      <div className="cbrief-body">
        <div className="cbrief-hero-wrap">
          <BriefHeader brief={brief} />
          <button className="cbrief-close" onClick={onClose} aria-label={t('wizard.close')}>×</button>
        </div>
        {body}
      </div>
      <div className="cbrief-foot">
        <AddButton brief={brief} picked={picked} onToggle={onToggle} t={t} />
      </div>
    </aside>
  );
}
