import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import Logo from '../../components/Logo.jsx';
import { Button } from '../../components/ui/index.js';
import { SiteFooter } from '../../components/SiteFooter.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { cheapestReturnAnyMonth } from '../../lib/flights/flights.js';
import { destAnchor } from '../../lib/origins.js';
import { tabHref } from '../../lib/urlState.js';
import { STORY_PLACE, STORY_SEARCH, exploreHref, searchRows } from '../../lib/homeDemo.js';
import { AskField, HomeHero } from './HomeHero.jsx';
import { HomeWeek } from './HomeWeek.jsx';
import { HomeVoices } from './HomeVoices.jsx';
import { HomeChapters } from './HomeChapters.jsx';
import { HomeRoute } from './HomeRoute.jsx';
import { HomeWhy } from './HomeWhy.jsx';
import { HomePlans } from './HomePlans.jsx';
import { useIdle, useReveal } from './useHome.js';

/**
 * The home page, rebuilt from scratch (T606 batch, owner 2026-10-23: "throw
 * away everything existing on the main page and start from scratch"; the plan
 * is the claude.ai artifact 2Jbd2LipGXYFMryXLzf6VW, the research and the
 * owner's twelve decisions are Execution/P15/T605-home-research.md).
 *
 * It says one thing, "A cheap flight is not a cheap trip", and then shows it:
 *
 *   Hero    the film of real places from edge to edge under the app header
 *           (T621), the slogan, one line and Ask Carta's field on it (T620);
 *           on a phone the mark and Log in stand on its top edge
 *   Week    the point in figures: a real flight, then the week it leads to
 *   Voices  six travellers, each asking in their own words, each answered
 *           with one real place and its price
 *   Story   five colour panels, each a recording of the app doing that step
 *   Route   the story's trip drawn on Slovenia, its total at the end
 *   Why     five promises the product keeps, as a rail of cards
 *   Plans   the three plans as columns, the free sentence
 *   Close   the question again, then the site footer
 *
 * Every figure is real: a place's own day price at the traveller's Lifestyle
 * from App's cost index, a flight from the traveller's home airport in the
 * sweep (Google Flights' price). Every door is a real <a href> a new tab can
 * open; a plain click takes the app's own door so the shell keeps its
 * history. No count, no method sentence (PRODUCT.md).
 *
 * Props
 *   data          { meta, destinations, flights }
 *   indices       App's exploreIndices (Map id -> day cost row)
 *   pageOver      a page or panel stands over the home page (no h1 then)
 *   onNavigate    goToTab(key)
 *   onSearch      ({ question } | { facets } | { open: true }) hands a search
 *                 to Explore; a question is answered there by Ask Carta
 *   onCategory    opens Explore on one category
 *   onOpenDest    opens a destination page by id
 *   onOpenTrips   opens My trips
 */

/** A plain click runs the app's door; a modifier click is the browser's. */
const door = (fn) => (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  fn();
};

export function HomePage({
  data, indices, pageOver = false, onNavigate, onSearch, onCategory, onOpenDest, onOpenTrips,
}) {
  const { t, lang } = useI18n();
  const settings = useSettings();
  const { user } = useAuth();
  const destinations = data?.destinations || null;
  const rows = React.useMemo(() => searchRows(destinations, indices), [destinations, indices]);
  const photosOn = useIdle();

  // The cheapest return flight a seat from the home airport to a place,
  // Google Flights' price from the sweep, or null: never a guess.
  const flights = data?.flights || settings?.data?.flights || null;
  const flightFor = React.useCallback((id) => {
    const d = destinations?.[id];
    const r = flights && d ? cheapestReturnAnyMonth(flights, destAnchor(d)) : null;
    if (!r) return null;
    return { perSeat: r.perSeat, airline: r.out.airline, checked: Math.min(r.out.checked, r.back.checked), to: destAnchor(d) };
  }, [flights, destinations]);
  const origin = settings?.origin || null;
  const fromName = origin ? (destinations?.[origin]?.city || origin) : null;

  const place = destinations?.[STORY_PLACE] || null;
  const acts = {
    search: { label: t('home.try1'), href: exploreHref(STORY_SEARCH), go: () => onSearch({ facets: STORY_SEARCH }) },
    place: place
      ? { label: t('home.openPlace', { place: place.city }), href: `#dest=${encodeURIComponent(STORY_PLACE)}`, go: () => onOpenDest(STORY_PLACE) }
      : { label: t('nav.places'), href: tabHref('places'), go: () => onNavigate('places') },
    trip: { label: t('home.ctaPlan'), href: tabHref('trip'), go: () => onNavigate('trip') },
    day: { label: t('home.ctaDay'), href: tabHref('day'), go: () => onNavigate('day') },
    trips: { label: t('home.ctaTrips'), go: onOpenTrips },
  };
  const login = () => onNavigate('account');
  const close = useReveal();

  // T621: while the film is under the app header, the header lies on it
  // (transparent, white); scrolled past the film, or with a page over the
  // home page, it is the usual bar again. The shell reads the root's
  // data-home-film; leaving the home page takes it away.
  const pageRef = React.useRef(null);
  React.useEffect(() => {
    const box = pageRef.current;
    const root = document.documentElement;
    if (!box) return undefined;
    let raf = 0;
    const sync = () => {
      raf = 0;
      const stage = box.querySelector('.hv-hero-stage');
      const bar = document.querySelector('.top-bar');
      const under = !pageOver && !!stage && box.scrollTop < stage.offsetHeight - (bar?.offsetHeight || 0);
      const v = under ? 'under' : 'past';
      if (root.dataset.homeFilm !== v) root.dataset.homeFilm = v;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(sync); };
    sync();
    box.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      box.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
      delete root.dataset.homeFilm;
    };
  }, [pageOver]);

  return (
    <div className="hv-page" ref={pageRef}>
      <HomeHero onSearch={onSearch} titleAs={pageOver ? 'div' : 'h1'} flightFor={flightFor} origin={origin}>
        <div className="hv-top">
          <a className="hv-top-brand" href="?tab=home" aria-label="Carta"><Logo size={28} /><span>Carta</span></a>
          {!user && (
            <Button variant="quiet" size="sm" className="hv-top-login" onClick={login}>{t('home.login')}</Button>
          )}
        </div>
      </HomeHero>
      <div className="hv-wrap">
        <HomeWeek rows={rows} flightFor={flightFor} fromName={fromName} places={destinations}
          door={door} onOpenDest={onOpenDest} />
        <HomeVoices rows={rows} photosOn={photosOn} door={door} onSearch={onSearch} onCategory={onCategory} />
        <HomeChapters lang={lang} acts={acts} door={door} />
        <HomeRoute rows={rows} places={destinations} door={door} onNavigate={onNavigate} />
        <HomeWhy />
        <HomePlans />
        <section className="hv-section hv-close" aria-labelledby="hv-close-title" {...close}>
          <h2 id="hv-close-title" className="hv-h2 hv-close-title">{t('home.closeTitle')}</h2>
          <AskField t={t} onSearch={onSearch} id="hv-ask-close" />
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
