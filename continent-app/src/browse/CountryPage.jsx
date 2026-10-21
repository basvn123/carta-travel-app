import React from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { kindOf } from '../lib/taxonomy.js';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { useI18n } from '../i18n/index.jsx';
import { Button, Money } from '../components/ui/index.js';
import { PlaceTile } from './ExploreCards.jsx';
import { Strip } from './SectionOpening.jsx';
import { GalleryStrip } from './CountryGallery.jsx';
import { countryPhotos, countryKnownKey } from '../lib/countryGallery.js';
import { countryName as localCountryName } from '../lib/countryName.js';
import { isNational } from '../components/CostSummary.jsx';
import { MonthStrip } from '../components/MonthStrip.jsx';
import { DayPriceDot } from '../components/DayPriceDot.jsx';
import { PageBar } from './PageBar.jsx';
import { WeeksRow } from './TripStylesRow.jsx';
import { EXPLORE_TILES } from './ExploreCategories.jsx';
import { loadRegionIndex, regionsForCountry } from '../lib/regions.js';
import { countryHash } from '../lib/urlState.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { usePageArrival } from '../hooks/usePageArrival.js';
import CreditFold from './CreditFold.jsx';

/**
 * A country as a destination of its own (PLAN.md C9; T450 on the kit; T498
 * a real page, roadmap 1.3b section D).
 *
 * A reading page with the one page bar (back naming where it was opened
 * from, the name once the heading has gone, share) and its own address
 * (#country=IT), hoisted over every view so Explore, an outdoor layer, the
 * planner's country brief and a shared link open the same page.
 *
 * Top to bottom: the photographs the country is known for, its name and the
 * one line of what it is known for; the fact block (the typical day a person
 * at the traveller's Lifestyle with the day-price dot, the best months with
 * the month strip, how you get around) with the page's one primary, "Plan a
 * trip in {country}", a sticky side column from 1024 px; three rails (its
 * best, its weeks, its cities); the doors to its outdoor layers and to its
 * coasts and ranges; every place on Places; the credits in one closed row.
 *
 * Every section renders only when it has content: a thin country shows a
 * shorter page, never an empty row.
 */

function median(xs) {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

function Rail({ id, title, rows, onSelect, favorites, onToggleFav, t }) {
  if (!rows.length) return null;
  return (
    <Strip id={id} title={title} t={t} className="cpg-rail">
      {rows.map((p) => (
        <li key={p.id} className="dtab-item">
          <PlaceTile p={p} onSelect={onSelect} t={t}
            fav={favorites ? favorites.has(p.id) : false}
            onToggleFav={onToggleFav} />
        </li>
      ))}
    </Strip>
  );
}

const OUTDOOR = EXPLORE_TILES.filter((x) => x.key !== 'places');

export function CountryPage({
  iso2, rows = [], backLabel = '', onClose, onSelect, favorites = null, onToggleFav = null,
  onShowAll = null, onOpenLayer = null, onOpenRegion = null, onPlanTrip = null,
  onOpenJourney = null, onSeeAllWeeks = null,
}) {
  const { t, lang } = useI18n();
  const mine = React.useMemo(
    () => rows.filter((p) => p.iso2 === iso2)
      .sort((a, b) => (b.rating?.score ?? 0) - (a.rating?.score ?? 0)),
    [rows, iso2],
  );
  const country = localCountryName(iso2, mine[0]?.country || iso2);
  const knownKey = countryKnownKey(iso2);
  const photos = countryPhotos(iso2);

  // The coasts and ranges this country holds, fullest first (lib/regions.js).
  const [regions, setRegions] = React.useState([]);
  React.useEffect(() => {
    let live = true;
    setRegions([]);
    loadRegionIndex()
      .then((ix) => { if (live) setRegions(regionsForCountry(ix, iso2, { limit: 10 })); })
      .catch(() => { if (live) setRegions([]); });
    return () => { live = false; };
  }, [iso2]);

  // Focus, Escape and the name in the bar, the one page rule (T474).
  const pageRef = React.useRef(null);
  const backRef = React.useRef(null);
  const scrollEl = React.useRef(null);
  const headEl = React.useRef(null);
  const arrivalRef = usePageArrival(pageRef, iso2);
  useFocusTrap(pageRef, onClose, { initialFocusRef: arrivalRef });
  const [nameOn, setNameOn] = React.useState(false);
  React.useEffect(() => {
    const el = headEl.current;
    const root = scrollEl.current;
    if (!el || !root || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setNameOn(!entry.isIntersecting), { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [iso2]);
  React.useEffect(() => { scrollEl.current?.scrollTo?.(0, 0); }, [iso2]);

  const [copied, setCopied] = React.useState(false);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${countryHash(iso2)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard refused; the button just stays */ }
  };

  const badged = mine.filter((p) => p.country_badge)
    .sort((a, b) => (a.country_rank ?? 99) - (b.country_rank ?? 99));
  // A place shows once on the page (T451): the best-of rail first, the
  // cities after it without the places it already holds.
  const inBest = new Set(badged.map((p) => p.id));
  const cities = mine.filter((p) => !inBest.has(p.id) && ['metro', 'city'].includes(kindOf(p))).slice(0, 12);

  const dayCosts = mine.map((p) => p.cost).filter((c) => c && c.dayEur != null);
  const day = median(dayCosts.map((c) => c.dayEur));
  // The figure is an estimate when most of the places it is drawn from are.
  const dayEst = dayCosts.length > 0 && dayCosts.filter((c) => isNational(c)).length * 2 >= dayCosts.length;
  const monthVotes = new Array(13).fill(0);
  for (const p of mine) for (const m of p.climate?.best || []) monthVotes[m]++;
  const peak = Math.max(...monthVotes);
  const goodMonths = peak
    ? monthVotes.map((v, m) => (m > 0 && v >= peak * 0.6 ? m : null)).filter(Boolean)
    : [];
  const carShare = mine.length
    ? mine.filter((p) => p.local_transport?.car_needed).length / mine.length
    : 0;
  const carKey = carShare > 0.6 ? 'cpage.carMost'
    : carShare > 0.3 ? 'cpage.carSome' : 'cpage.carFew';
  const hasFacts = day != null || goodMonths.length > 0 || mine.length > 0;

  return (
    <div className="rgnp cpg-page" role="dialog" aria-modal="true" aria-label={country} ref={pageRef}>
      <PageBar
        t={t}
        backLabel={backLabel || t('cpage.back')}
        onBack={onClose}
        backRef={backRef}
        name={country}
        nameOn={nameOn}
        onShare={share}
        shareLabel={t('cpage.share')}
        copied={copied}
        copiedLabel={t('cpage.shareDone')}
      />
      <div className="rgnp-scroll" ref={scrollEl}>
        <div className="rgnp-inner">
          <div className="rgnp-grid">
            {photos.length > 0 && (
              <div className="rgnp-hero cpg-hero">
                <GalleryStrip cc={iso2} name={country} t={t} eager
                  sizes="(max-width: 768px) 100vw, min(92vw, 1180px)" />
              </div>
            )}

            <header className="rgnp-head">
              <h1 ref={headEl} className="cpg-name">
                <CountryFlag country={iso2} size={22} />
                <span>{country}</span>
              </h1>
              {knownKey && <p className="cpg-line">{t(knownKey)}</p>}
            </header>

            {(hasFacts || onPlanTrip) && (
              <aside className="rgnp-side" aria-label={country}>
                {hasFacts && (
                  <dl className="rgnp-facts">
                    {day != null && (
                      <div className="rgnp-fact">
                        <dt>{t('cpage.kDay')}<DayPriceDot /></dt>
                        <dd>
                          <Money value={day} est={dayEst} />
                          <span className="rgnp-unit"> {t('dest.priceDayUnit')}</span>
                        </dd>
                      </div>
                    )}
                    {goodMonths.length > 0 && (
                      <div className="rgnp-fact">
                        <dt>{t('cpage.kWhen')}</dt>
                        <dd>
                          {fmtMonthRanges(goodMonths, t)}
                          <MonthStrip good={goodMonths} className="cpg-months" />
                        </dd>
                      </div>
                    )}
                    {mine.length > 0 && (
                      <div className="rgnp-fact">
                        <dt>{t('cpage.kCar')}</dt>
                        <dd className="cpg-fact-text">{t(carKey)}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {onPlanTrip && (
                  <Button variant="primary" block className="rgnp-plan" onClick={() => onPlanTrip(iso2)}>
                    {t('cpage.planTrip', { country })}
                  </Button>
                )}
                {onShowAll && mine.length > 0 && (
                  <Button variant="quiet" className="cpg-every" iconEnd={<ChevronRightIcon size={16} />}
                    onClick={() => onShowAll(iso2)}>
                    {t('cpage.showAll', { country })}
                  </Button>
                )}
              </aside>
            )}

            <Rail id={`cpg-best-${iso2}`} title={t('cpage.best', { country })} rows={badged}
              onSelect={onSelect} favorites={favorites} onToggleFav={onToggleFav} t={t} />
            {onOpenJourney && (
              <WeeksRow t={t} lang={lang} id={`cpg-weeks-${iso2}`} title={t('cpage.weeks', { country })}
                country={iso2} onOpen={onOpenJourney}
                onSeeAll={onSeeAllWeeks ? () => onSeeAllWeeks(iso2) : null} />
            )}
            <Rail id={`cpg-cities-${iso2}`} title={t('cpage.cities')} rows={cities}
              onSelect={onSelect} favorites={favorites} onToggleFav={onToggleFav} t={t} />

            {/* Further cuts are one row of door buttons each (carta-design
                "Rails and cuts"): the outdoor layers in this country, then
                its coasts and ranges. */}
            {onOpenLayer && (
              <section className="rgnp-sect cpg-door-row" aria-labelledby={`cpg-out-${iso2}`}>
                <h2 className="rgnp-sect-head" id={`cpg-out-${iso2}`}>{t('cpage.outdoorsHead', { country })}</h2>
                <div className="rgnp-neigh">
                  {OUTDOOR.map(({ key, labelKey, Icon }) => (
                    <Button key={key} variant="secondary" size="sm" iconStart={<Icon size={16} />}
                      onClick={() => onOpenLayer(key, iso2)}>
                      {t(labelKey)}
                    </Button>
                  ))}
                </div>
              </section>
            )}
            {onOpenRegion && regions.length > 0 && (
              <section className="rgnp-sect cpg-door-row" aria-labelledby={`cpg-reg-${iso2}`}>
                <h2 className="rgnp-sect-head" id={`cpg-reg-${iso2}`}>{t('cpage.regionsHead')}</h2>
                <div className="rgnp-neigh">
                  {regions.map((r) => (
                    <Button key={r.id} variant="secondary" size="sm" onClick={() => onOpenRegion(r.id)}>
                      {r.name}
                    </Button>
                  ))}
                </div>
              </section>
            )}

            {photos.length > 0 && (
              <div className="dtab-sources">
                <CreditFold t={t}>
                  <p className="dtab-sources-head">{t('dtab.photoCredits')}</p>
                  <ul className="dtab-sources-list">
                    {photos.map((p) => (
                      <li key={p.u}>
                        {p.place}: <a href={p.page} target="_blank" rel="noreferrer">{p.author}</a>, {p.licence}
                      </li>
                    ))}
                  </ul>
                </CreditFold>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
