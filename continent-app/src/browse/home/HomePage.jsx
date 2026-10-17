import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import {
  BeachIcon, BikeIcon, BootIcon, ChevronRightIcon, CompassIcon, FriendsIcon, LakeIcon,
  MountainIcon, ReceiptIcon, RouteIcon, SearchIcon, SuitcaseIcon,
} from '../../components/Icons.jsx';
import { usePaywall } from '../../hooks/usePaywall.jsx';
import { formatMoney } from '../../lib/money.js';
import { TIERS, TIER_ORDER, formatPrice } from '../../lib/pricing.js';
import { tabHref } from '../../lib/urlState.js';
import { loadGuidedData } from '../../lib/guidedData.js';
import { loadJourneyIndex } from '../../lib/journeys.js';
import { KINDS, SEARCHES, STORY, buildDemo, exploreHref, kindPhotos } from '../../lib/homeDemo.js';
import { HomeDemo } from './HomeDemo.jsx';
import { useIdle } from './useDemoClock.js';

/**
 * The home page (T462, owner brief 2026-10-17), which replaces the T209
 * landing receipt. It says what Carta is for in one screen and then shows
 * it: plan any trip in Europe, with honest prices.
 *
 *   Hero      the promise, the real search (it opens Explore's guided search),
 *             three questions that return places today, the one primary
 *             ("Plan a trip"), and the live demo beside it, with one real
 *             door under it for the scene on show
 *   Kinds     the six kinds of trip Destinations publishes, as photo tiles
 *   Features  four things Carta does, each with its door
 *   Passes    what is free and what a pass adds, from lib/pricing.js
 *   Credits   the photographs' authors and licences
 *
 * Every link is a real <a href> that a new tab can open (a search carries
 * its question in the URL); a plain click takes the app's own door so the
 * shell keeps its history. No count, no method sentence, no number that is
 * not a price (PRODUCT.md). Icons are hidden from assistive tech: the shared
 * glyphs name themselves, which would read into a link's name.
 *
 * Props
 *   data          { meta, destinations }, the rank tier is enough
 *   indices       App's exploreIndices (Map id -> day cost row)
 *   pageOver      a page or panel stands over the home page
 *   onNavigate    goToTab(key)
 *   onSearch      ({ facets } | { open: true }) hands a search to Explore
 *   onCategory    opens Destinations on one kind
 *   onOpenDest    opens a destination page by id
 *   onOpenTrips   opens My trips
 */

const KIND_ICON = {
  trips: SuitcaseIcon, trails: BootIcon, beaches: BeachIcon, lakes: LakeIcon, mountains: MountainIcon, cycling: BikeIcon,
};

/** A plain click runs the app's door; a modifier click is the browser's. */
const door = (fn) => (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  fn();
};

const Mute = ({ children }) => <span className="home-glyph" aria-hidden="true">{children}</span>;

function HomeKinds({ t, photos, ready, onCategory }) {
  return (
    <section className="home-section home-kinds" aria-labelledby="home-kinds-title">
      <h2 id="home-kinds-title" className="home-h2">{t('home.kindsTitle')}</h2>
      <ul className="home-kinds-grid">
        {KINDS.map((k) => {
          const Icon = KIND_ICON[k.key];
          const photo = photos?.[k.key];
          return (
            <li key={k.key}>
              <a className="home-kind" href={tabHref('places')} onClick={door(() => onCategory(k.key))}>
                <span className="home-kind-media" aria-hidden="true">
                  {!ready ? null : photo ? (
                    <HeroImage url={photo.url} city={t(k.labelKey)} className="home-kind-img"
                      maxWidth={500} sizes="(max-width: 768px) 46vw, 190px" ratio={[4, 5]} />
                  ) : (
                    <span className="home-kind-blank"><Icon size={28} /></span>
                  )}
                </span>
                <span className="home-kind-label">
                  <Mute><Icon size={16} /></Mute>
                  {t(k.labelKey)}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HomeFeatures({ t, demo, onNavigate, onOpenDest, onOpenTrips }) {
  const place = demo?.place || null;
  const rows = [
    { key: 'f1', Icon: CompassIcon, door: t('nav.explore'), href: tabHref('map'), go: () => onNavigate('map') },
    {
      key: 'f2', Icon: ReceiptIcon, door: place ? place.city : t('nav.places'),
      href: place ? `#dest=${encodeURIComponent(place.id)}` : tabHref('places'),
      go: () => (place ? onOpenDest(place.id) : onNavigate('places')),
    },
    {
      key: 'f3', Icon: RouteIcon, door: t('nav.trip'), href: tabHref('trip'), go: () => onNavigate('trip'),
      n: TIERS.free.aiPlans,
    },
    { key: 'f4', Icon: FriendsIcon, door: t('nav.myTrips'), go: onOpenTrips },
  ];
  return (
    <section className="home-section home-feats" aria-labelledby="home-feats-title">
      <h2 id="home-feats-title" className="home-h2">{t('home.featTitle')}</h2>
      <ul className="home-feat-list">
        {rows.map((r) => (
          <li key={r.key} className="home-feat">
            <Mute><r.Icon size={24} className="home-feat-icon" /></Mute>
            <div className="home-feat-text">
              <h3 className="home-h3">{t(`home.${r.key}Title`)}</h3>
              <p className="home-feat-body">{t(`home.${r.key}`, r.n != null ? { n: r.n } : undefined)}</p>
              {r.href ? (
                <a className="btn btn-quiet btn-sm home-door" href={r.href} onClick={door(r.go)}>
                  <span className="btn-label">{r.door}</span>
                  <span className="btn-icon" aria-hidden="true"><ChevronRightIcon size={16} /></span>
                </a>
              ) : (
                <Button variant="quiet" size="sm" className="home-door" onClick={r.go}
                  iconEnd={<ChevronRightIcon size={16} />}>
                  {r.door}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HomePasses({ t }) {
  const paywall = usePaywall();
  const note = (tier) => {
    if (tier.id === 'trip') return t('pass.tripNote', { n: tier.periodDays });
    if (tier.id === 'year') return t('pass.yearNote', { month: formatPrice(Math.round(tier.priceCents / 12)) });
    return null;
  };
  return (
    <section className="home-section home-passes" aria-labelledby="home-passes-title">
      <h2 id="home-passes-title" className="home-h2">{t('home.priceTitle')}</h2>
      <ul className="home-pass-grid">
        {TIER_ORDER.map((id) => {
          const tier = TIERS[id];
          const n = note(tier);
          return (
            <li key={id} className="home-pass-card">
              <span className="home-pass-name">{t(tier.labelKey)}</span>
              {/* Free is a word's worth of price: no cents on a nought. */}
              <span className="home-pass-price">{tier.priceCents ? formatPrice(tier.priceCents) : formatMoney(0)}</span>
              {n && <span className="home-pass-note">{n}</span>}
              <p className="home-pass-blurb">{t(tier.blurbKey)}</p>
            </li>
          );
        })}
      </ul>
      <div className="home-pass-foot">
        <Button variant="secondary" onClick={() => paywall.openPrices('home')}>{t('home.priceDoor')}</Button>
        <p className="home-trade">{t('home.trade')}</p>
      </div>
    </section>
  );
}

function HomeCredits({ t, photos, demo }) {
  const items = [];
  const seen = new Set();
  const add = (p) => {
    if (!p?.url || seen.has(p.url)) return;
    seen.add(p.url);
    items.push(p);
  };
  for (const k of KINDS) add(photos?.[k.key]);
  if (demo) {
    for (const r of [...demo.results, demo.place, ...demo.trip.stops]) {
      add({ url: r.image, credit: r.credit || r.city, page: r.page });
    }
  }
  if (!items.length) return null;
  return (
    <details className="home-credits">
      <summary>{t('home.credits')}</summary>
      <ul>
        {items.map((p) => (
          <li key={p.url}>
            {p.page ? <a href={p.page} target="_blank" rel="noopener noreferrer">{p.credit || p.url}</a> : (p.credit || '')}
            {p.author ? `, ${p.author}` : ''}
            {p.licence ? `, ${p.licence}` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function HomePage({
  data, indices, pageOver = false, onNavigate, onSearch, onCategory, onOpenDest, onOpenTrips,
}) {
  const { t } = useI18n();
  const destinations = data?.destinations || null;
  const built = React.useMemo(() => buildDemo(destinations, indices), [destinations, indices]);
  const demo = built.state === 'none' ? null : built;
  const loading = !destinations || !indices;

  const [journeys, setJourneys] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    loadJourneyIndex().then((ix) => { if (live) setJourneys(ix); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const photos = React.useMemo(() => kindPhotos(journeys, destinations), [journeys, destinations]);

  // Explore's vocabulary arrives before the visitor does: the search is the
  // next step for most first visits, so it loads once the page is idle (70 KB
  // gzipped), and at once when a search control is pointed at or touched. A
  // tap on a phone has no hover, and Explore would show an empty list until
  // the vibes arrived.
  const warm = () => { loadGuidedData(); };
  React.useEffect(() => {
    const idle = window.requestIdleCallback;
    const h = idle ? idle(() => loadGuidedData(), { timeout: 4000 }) : setTimeout(() => loadGuidedData(), 1500);
    return () => { if (idle) window.cancelIdleCallback?.(h); else clearTimeout(h); };
  }, []);

  // The demo's one door per scene: the search it typed, the place it
  // opened, the planner it priced in, the trips it shared.
  const acts = demo ? {
    search: {
      label: demo.state === 'story' ? t(STORY.query) : t('nav.explore'),
      href: demo.state === 'story' ? exploreHref(STORY.seed) : tabHref('map'),
      go: () => (demo.state === 'story' ? onSearch({ facets: STORY.seed }) : onNavigate('map')),
    },
    place: { label: demo.place.city, href: `#dest=${encodeURIComponent(demo.place.id)}`, go: () => onOpenDest(demo.place.id) },
    trip: { label: t('nav.trip'), href: tabHref('trip'), go: () => onNavigate('trip') },
    share: { label: t('nav.myTrips'), go: onOpenTrips },
  } : null;

  // The kinds' photos wait for an idle browser: the catalogue (and so the
  // headline) comes first on a slow line.
  const photosReady = useIdle();

  const Title = pageOver ? 'div' : 'h1';

  return (
    <div className="home-page">
      <div className="home-wrap">
        <section className={`home-hero${!demo && !loading ? ' is-solo' : ''}`} aria-labelledby="home-title">
          <div className="home-hero-text">
            <Title id="home-title" className="home-title">{t('home.title')}</Title>
            <p className="home-sub">{t('home.sub')}</p>
            <a className="home-search" href={tabHref('map')}
              onPointerEnter={warm} onPointerDown={warm} onFocus={warm}
              onClick={door(() => onSearch({ open: true }))}>
              <Mute><SearchIcon size={20} /></Mute>
              <span>{t('gs.placeholder')}</span>
            </a>
            <div className="home-tries">
              <span className="home-tries-label" id="home-tries-label">{t('home.tryLabel')}</span>
              <ul className="home-tries-list" aria-labelledby="home-tries-label">
                {SEARCHES.map((s) => (
                  <li key={s.key}>
                    <a className="home-try" href={exploreHref(s.facets)}
                      onPointerEnter={warm} onPointerDown={warm} onFocus={warm}
                      onClick={door(() => onSearch({ facets: s.facets }))}>
                      {t(s.key, s.price ? { price: formatMoney(s.price) } : undefined)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <a className="btn btn-primary home-cta" href={tabHref('trip')} onClick={door(() => onNavigate('trip'))}>
              <span className="btn-label">{t('home.ctaPlan')}</span>
            </a>
          </div>
          {demo && <HomeDemo demo={demo} pageOver={pageOver} acts={acts} door={door} />}
          {!demo && loading && (
            <div className="home-demo home-demo-still" aria-busy="true">
              <span className="sr-only">{t('state.loading')}</span>
            </div>
          )}
        </section>

        <HomeKinds t={t} photos={photos} ready={photosReady} onCategory={onCategory} />
        <HomeFeatures t={t} demo={demo} onNavigate={onNavigate} onOpenDest={onOpenDest} onOpenTrips={onOpenTrips} />
        <HomePasses t={t} />
        <HomeCredits t={t} photos={photos} demo={demo} />
      </div>
    </div>
  );
}
