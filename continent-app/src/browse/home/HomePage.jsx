import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip } from '../../components/ui/index.js';
import {
  CheckIcon, GlobeIcon, ReceiptIcon, SearchIcon, TicketIcon,
} from '../../components/Icons.jsx';
import { usePaywall } from '../../hooks/usePaywall.jsx';
import { formatMoney } from '../../lib/money.js';
import { TIERS, TIER_ORDER, formatPrice, isRecurring, monthlyCents } from '../../lib/pricing.js';
import { tabHref } from '../../lib/urlState.js';
import { loadGuidedData } from '../../lib/guidedData.js';
import {
  SEARCHES, STORY_PLACE, STORY_SEARCH, exploreHref, personaPhotos, screenSrc, searchRows,
} from '../../lib/homeDemo.js';
import { BrowserFrame, PhoneFrame } from './Devices.jsx';
import { HomeStory } from './HomeStory.jsx';
import { HomeTravellers } from './HomeTravellers.jsx';
import { useIdle } from './useHome.js';

/**
 * The home page (T463, rebuilt after T462 on the owner's review, 2026-10-17).
 * It tells one trip in the app's own screens, then lets each traveller find
 * theirs:
 *
 *   Hero        the promise, the real search, three questions that return
 *               places today, the one primary ("Plan a trip"), and the same
 *               priced trip on a laptop and a phone (real captures)
 *   Story       five chapters beside one pinned phone (HomeStory.jsx)
 *   Travellers  six kinds of traveller, each with the cheapest day of its
 *               own search (HomeTravellers.jsx)
 *   Passes      the plans as the app's pass dialog shows them, what a pass
 *               adds, and three plain promises
 *   Close       the search again
 *   Credits     the photographs' authors and licences
 *
 * Every link is a real <a href> that a new tab can open (a search carries
 * its question in the URL); a plain click takes the app's own door so the
 * shell keeps its history. No count, no method sentence, no number that is
 * not a price (PRODUCT.md). Icons are hidden from assistive tech.
 *
 * Props
 *   data          { meta, destinations }, the rank tier is enough
 *   indices       App's exploreIndices (Map id -> day cost row)
 *   pageOver      a page or panel stands over the home page
 *   onNavigate    goToTab(key)
 *   onSearch      ({ question } | { facets } | { open: true }) hands a search
 *                 to Explore; a question is answered there by Ask Carta (T566)
 *   onCategory    opens Destinations on one kind
 *   onOpenDest    opens a destination page by id
 *   onOpenTrips   opens My trips
 */

/** A plain click runs the app's door; a modifier click is the browser's. */
const door = (fn) => (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  fn();
};

const Mute = ({ children }) => <span className="home-glyph" aria-hidden="true">{children}</span>;

/** The search pill and the three questions, in the hero and at the close. */
function SearchBlock({ t, onSearch, idPrefix }) {
  // Explore's vocabulary arrives before the visitor does (70 KB gzipped):
  // at once when a search control is pointed at or touched, since a tap on
  // a phone has no hover.
  const warm = () => { loadGuidedData(); };
  // T566: the pill is Ask Carta's own field. What is typed here is the
  // question Explore answers on arrival; Ask with nothing typed opens it.
  const [text, setText] = React.useState('');
  const ask = (e) => {
    e.preventDefault();
    const q = text.trim();
    onSearch(q ? { question: q } : { open: true });
  };
  return (
    <>
      <form className="home-search" role="search" onSubmit={ask}
        onPointerEnter={warm} onPointerDown={warm} onFocus={warm}>
        <Mute><SearchIcon size={20} /></Mute>
        <input className="home-search-input" type="text" value={text} maxLength={200}
          onChange={(e) => setText(e.target.value)} aria-label={t('ask.inputLabel')}
          placeholder={t('ask.placeholder')} autoComplete="off" spellCheck={false} enterKeyHint="search" />
        <Button type="submit" variant="secondary" size="sm" className="home-search-go">{t('ask.go')}</Button>
      </form>
      <div className="home-tries">
        <span className="home-tries-label" id={`${idPrefix}-tries`}>{t('home.tryLabel')}</span>
        <ul className="home-tries-list" aria-labelledby={`${idPrefix}-tries`}>
          {SEARCHES.map((s) => (
            <li key={s.key}>
              <a className="home-try" href={exploreHref(s.facets)}
                onPointerEnter={warm} onPointerDown={warm} onFocus={warm}
                onClick={door(() => onSearch({ question: t(s.key, s.price ? { price: formatMoney(s.price) } : undefined) }))}>
                {t(s.key, s.price ? { price: formatMoney(s.price) } : undefined)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function HomePasses({ t }) {
  const paywall = usePaywall();
  const per = (tier) => {
    if (!tier.priceCents) return null;
    return t(isRecurring(tier.id) ? 'pass.perYearRenews' : 'pass.perOnce');
  };
  const note = (tier) => {
    if (tier.id === 'trip') return t('pass.tripNote', { n: tier.periodDays });
    if (isRecurring(tier.id)) return t('pass.yearNote', { month: formatPrice(monthlyCents(tier.id)) });
    return null;
  };
  const adds = [
    t('pass.addPlansTrip', { n: TIERS.trip.aiPlans }),
    t('pass.addExports'),
    t('pass.addTrips'),
    t('pass.addImport'),
  ];
  const promises = [
    { Icon: TicketIcon, key: 'home.promise1' },
    { Icon: ReceiptIcon, key: 'home.promise2' },
    { Icon: GlobeIcon, key: 'home.promise3' },
  ];
  return (
    <section className="home-section home-passes" aria-labelledby="home-passes-title">
      <h2 id="home-passes-title" className="home-h2">{t('home.priceTitle')}</h2>
      {/* The one sentence about what is free (roadmap 1.15 point 6). */}
      <p className="home-sub home-passes-free">{t('pass.freeSentence')}</p>
      <ul className="home-plan-grid">
        {TIER_ORDER.map((id) => {
          const tier = TIERS[id];
          const p = per(tier);
          const n = note(tier);
          return (
            <li key={id} className={`home-plan${tier.featured ? ' is-featured' : ''}`}>
              <span className="home-plan-top">
                {tier.featured && <Chip kind="status" tone="neutral">{t('pass.recommended')}</Chip>}
                <span className="home-plan-name">{t(tier.labelKey)}</span>
              </span>
              <span className="home-plan-price">
                {/* Free is a word's worth of price: no cents on a nought. */}
                <span className="home-plan-fig">{tier.priceCents ? formatPrice(tier.priceCents) : formatMoney(0)}</span>
                {p && <span className="home-plan-per">{p}</span>}
              </span>
              {n && <span className="home-plan-note">{n}</span>}
              <p className="home-plan-blurb">{t(tier.blurbKey)}</p>
            </li>
          );
        })}
      </ul>
      <div className="home-pass-more">
        <div className="home-adds">
          <h3 className="home-h3">{t('home.addsTitle')}</h3>
          <ul>
            {adds.map((a) => (
              <li key={a}><Mute><CheckIcon size={16} /></Mute><span>{a}</span></li>
            ))}
          </ul>
          <Button variant="secondary" className="home-pass-door" onClick={() => paywall.openPrices('home')}>
            {t('home.priceDoor')}
          </Button>
        </div>
        <ul className="home-promises">
          {promises.map((p) => (
            <li key={p.key}><Mute><p.Icon size={20} /></Mute><span>{t(p.key)}</span></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HomeCredits({ t, photos }) {
  const items = Object.values(photos || {}).filter((p) => p?.url);
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
  const { t, lang } = useI18n();
  const destinations = data?.destinations || null;

  const photos = React.useMemo(() => personaPhotos(), []);

  // Each traveller's card prices its own place from the catalogue rows.
  const rows = React.useMemo(() => searchRows(destinations, indices), [destinations, indices]);

  // Photos wait for an idle browser: the headline comes first on a slow line.
  const ready = useIdle();

  const place = destinations?.[STORY_PLACE] || null;
  const acts = {
    search: {
      label: t('home.try1'),
      href: exploreHref(STORY_SEARCH),
      go: () => onSearch({ facets: STORY_SEARCH }),
    },
    place: place
      ? { label: place.city, href: `#dest=${encodeURIComponent(STORY_PLACE)}`, go: () => onOpenDest(STORY_PLACE) }
      : { label: t('nav.places'), href: tabHref('places'), go: () => onNavigate('places') },
    trip: { label: t('home.ctaPlan'), href: tabHref('trip'), go: () => onNavigate('trip') },
    day: { label: t('home.ctaDay'), href: tabHref('day'), go: () => onNavigate('day') },
    trips: { label: t('home.ctaTrips'), go: onOpenTrips },
  };

  const Title = pageOver ? 'div' : 'h1';

  return (
    <div className="home-page">
      <div className="home-wrap">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-text">
            <Title id="home-title" className="home-title">{t('home.title')}</Title>
            <p className="home-sub">{t('home.sub')}</p>
            <SearchBlock t={t} onSearch={onSearch} idPrefix="home-hero" />
            <a className="btn btn-primary home-cta" href={tabHref('trip')} onClick={door(() => onNavigate('trip'))}>
              <span className="btn-label">{t('home.ctaPlan')}</span>
            </a>
          </div>
          <div className="home-devices">
            <BrowserFrame className="home-devices-desk" src={screenSrc(lang, 'desk')} alt={t('home.deskAlt')} eager />
            <div className="home-peek home-devices-peek">
              <PhoneFrame className="home-devices-phone" src={screenSrc(lang, 'trip')} alt={t('home.tripAlt')} eager />
            </div>
          </div>
        </section>

        {/* Photography and real prices come second (T464): on a phone the
            first photograph used to wait 2.8 screens behind the story. */}
        <HomeTravellers
          rows={rows}
          photos={photos}
          ready={ready}
          door={door}
          onSearch={onSearch}
          onCategory={onCategory}
        />

        <HomeStory lang={lang} acts={acts} door={door} />

        <HomePasses t={t} />

        <section className="home-section home-close" aria-labelledby="home-close-title">
          <h2 id="home-close-title" className="home-h2">{t('home.closeTitle')}</h2>
          <SearchBlock t={t} onSearch={onSearch} idPrefix="home-close" />
        </section>

        <HomeCredits t={t} photos={photos} />
      </div>
    </div>
  );
}
