/**
 * RegionPage: one region's record, full screen. The browsing unit between
 * "beach" and "country": a coastal stretch, a mountain range, or a NUTS2
 * region, composed from /region/{ID}.json exactly as the export wrote it.
 *
 * Since T498 (roadmap 1.3b section E) the page reads as the item pages do
 * (carta-design "Detail page grammar"): the photo first, then the name and
 * what kind of region it is, then what decides a trip (the day price of the
 * nearest priced town, the best months, one "Plan a trip here" primary; a
 * sticky side column from 1024 px), then one rail per layer, the towns here,
 * the weeks through it, the unscored items and the regions next door.
 *
 *   editorial   seed picks a person vouched for, pinned first in their rail
 *   rated       published rows, ranked; each carries its own score
 *   listed      rows that exist but are not scored: the same compact row as
 *               every other list, with a "Not scored yet" status chip where
 *               the Score would sit (T498: the dashed border was a second
 *               card style and is gone)
 *   neighbours  "nothing here? try next door", straight from the wire
 *
 * The region file carries no towns, no climate and no price, so those come
 * from the catalogue rows Explore holds (`rows`, usePlaceRows), joined by
 * distance in lib/regions.js. A thin region shows a shorter page: every
 * block below the head is left out when it has nothing, never drawn empty.
 *
 * Opening a card hands over to the layer's own page through the same
 * onOpenFeature callback DestinationPage uses, so a beach opened from the
 * Costa de la Luz page is the same beach page as everywhere else.
 *
 * Escape closes. Bound in the capture phase with stopPropagation, per the
 * escape-stack lesson: this page can sit over other overlays and the
 * topmost layer must eat the key.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadRegion, loadRegionIndex, regionShareUrl,
  regionCentre, townsNear, nearestPriced, bestMonthsOf,
} from '../lib/regions.js';
import { nearestRegions } from '../lib/coverageEmpty.js';
import { useI18n } from '../i18n/index.jsx';
import { LoadingBlock, ErrorBlock } from '../components/StateBlocks.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { usePageArrival } from '../hooks/usePageArrival.js';
import { Button, Card, Chip, Money } from '../components/ui/index.js';
import { PageBar } from './PageBar.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { isNational } from '../components/CostSummary.jsx';
import { okPhoto } from '../lib/photoVeto.js';
import { countryName } from '../lib/countryName.js';
import { Strip } from './SectionOpening.jsx';
import { DayPrice, SaveButton } from './ExploreCards.jsx';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { WeeksRow } from './TripStylesRow.jsx';

const KIND_KEY = {
  coast: 'region.kind.coast',
  range: 'region.kind.range',
  nuts2: 'region.kind.nuts2',
};

// Every layer the region wire can put on a card has to appear here, or the
// card renders and does nothing when it is clicked. Cycling is the largest
// contributor of listed rows on these pages and was missing from this table,
// so every one of those cards was inert.
const LAYER_TO_FEATURE = {
  beach: 'beaches',
  cycling: 'cycling',
  lake: 'lakes',
  mountain: 'mountains',
  trail: 'trails',
};

// One rail per layer, in this order, titled with the category's own name.
const LAYER_RAILS = [
  ['beach', 'places.catBeaches'],
  ['trail', 'places.catTrails'],
  ['lake', 'places.catLakes'],
  ['mountain', 'places.catMountains'],
  ['cycling', 'places.catCycling'],
];

const RAIL_MAX = 12;
const TOWN_KM = 25;
const PRICE_KM = 40;
const WEEKS_KM = 60;

function firstImage(card) {
  // Two shapes reach a card: beaches, lakes and mountains ship `images[]`
  // of objects, trails ship a single `img` that is ALSO an object. Reading
  // `img` as a string dropped every trail photograph on the page while the
  // wire carried it, so both shapes are unwrapped here.
  return (card.images && card.images[0]) || card.img || null;
}

function cardImage(card) {
  const first = firstImage(card);
  const url = typeof first === 'string' ? first : first && first.u;
  return typeof url === 'string' && url.startsWith('https://') ? okPhoto(url) : null;
}

function cardScore(card) {
  return typeof card.score === 'number' ? card.score
    : typeof card.rating === 'number' ? card.rating : null;
}

/** A rated or editorial item as a rail tile: 4:3 photo, name, where, Score. */
function RegionTile({ card, onOpen }) {
  const score = cardScore(card);
  return (
    <Card
      layout="tile"
      className="rgnp-card rgnp-tile"
      media={(
        <HeroImage url={cardImage(card)} city={card.name} iso2={card.cc || card.country}
          className="rgnp-media-img" maxWidth={960} sizes="(max-width: 768px) 78vw, 280px" ratio={[4, 3]} />
      )}
      title={card.name}
      onOpen={() => onOpen(card)}
      meta={card.region || card.range || null}
      rating={score != null ? <ScoreChip rating={{ score }} size="sm" /> : null}
    />
  );
}

/** An unscored item: the compact row every list uses, a status chip for the Score. */
function ListedRow({ card, t, onOpen }) {
  return (
    <Card
      layout="row"
      className="rgnp-card rgnp-row"
      media={(
        <HeroImage url={cardImage(card)} city={card.name} iso2={card.cc || card.country}
          className="rgnp-media-img" maxWidth={160} sizes="72px" ratio={[1, 1]} />
      )}
      title={card.name}
      onOpen={() => onOpen(card)}
      meta={card.region || card.range || null}
      rating={<Chip kind="status" tone="neutral">{t('region.listedChip')}</Chip>}
    />
  );
}

/** A catalogue town as a compact row: photo, name, Score, the day price. */
function TownRow({ p, onSelect, fav, onToggleFav, t }) {
  return (
    <Card
      layout="row"
      className="rgnp-row"
      media={(
        <HeroImage url={p.image} city={p.city} iso2={p.iso2}
          className="rgnp-media-img" maxWidth={160} sizes="72px" ratio={[1, 1]} />
      )}
      title={p.city}
      href={`#dest=${encodeURIComponent(p.id)}`}
      onOpen={(e) => {
        // A real link: a plain click opens the place here, a modifier click
        // lets the browser open it in a new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onSelect(p.id);
      }}
      price={<DayPrice cost={p.cost} t={t} />}
      rating={<ScoreChip rating={p.rating} size="sm" />}
      actions={onToggleFav ? (
        <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} name={p.city} />
      ) : null}
    />
  );
}

export function RegionPage({
  id, fav = false, onFav = null, onClose, onOpenFeature, onOpenRegion, backLabel = '',
  rows = [], onSelectDest = null, onPlanTrip = null, onOpenJourney = null,
  onSeeAllLayer = null, favorites = null, onToggleFav = null,
}) {
  const { t, lang } = useI18n();
  const [data, setData] = useState(undefined);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [copied, setCopied] = useState(false);
  // A stale id (T367, docs/ONBOARDING_AND_EMPTY_STATES.md row 30): the three
  // regions whose ids it shares the most of, read from the index only when
  // the region itself is not found.
  const [nearIds, setNearIds] = useState([]);
  useEffect(() => {
    if (data !== null) { setNearIds([]); return undefined; }
    let on = true;
    loadRegionIndex().then((ix) => { if (on) setNearIds(nearestRegions(ix?.regions, id)); })
      .catch(() => { if (on) setNearIds([]); });
    return () => { on = false; };
  }, [data, id]);

  // One fetch. Neighbours arrive named inside the region file, so opening
  // a page never pulls the whole region index for six button labels.
  //
  // Three outcomes, not two: loadRegion resolves the region, resolves null
  // when the id is not in the catalogue, and rejects when the request itself
  // failed. Folding the third into the second told the traveller their link
  // was stale when the truth was that the network dropped.
  useEffect(() => {
    let on = true;
    setData(undefined);
    setFailed(false);
    loadRegion(id).then(
      (d) => { if (on) setData(d); },
      () => { if (on) setFailed(true); },
    );
    return () => { on = false; };
  }, [id, tries]);

  // Escape (capture phase, per the escape-stack rule) plus the focus
  // management this dialog's aria-modal has always promised. Arrival focus
  // follows the one page rule (hooks/usePageArrival.js, T474).
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const arrivalRef = usePageArrival(pageRef, data?.region?.id ?? (data === null ? 'missing' : null));
  useFocusTrap(pageRef, onClose, { initialFocusRef: arrivalRef });

  // The bar takes over the name once the heading has scrolled away.
  const scrollEl = useRef(null);
  const headEl = useRef(null);
  const [nameOn, setNameOn] = useState(false);
  const loaded = Boolean(data?.region);
  useEffect(() => {
    const el = headEl.current;
    const root = scrollEl.current;
    if (!el || !root || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setNameOn(!entry.isIntersecting), { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [id, loaded]);

  // Everything the page borrows from the catalogue, derived once per region.
  const region = data?.region || null;
  const iso2 = region?.country || null;
  const derived = useMemo(() => {
    if (!data?.region) return null;
    const all = [...(data.editorial || []), ...(data.rated || []), ...(data.listed || [])];
    const centre = regionCentre(all);
    const towns = townsNear(rows, all, iso2, TOWN_KM);
    const priced = nearestPriced(rows, centre, iso2, PRICE_KM);
    const months = bestMonthsOf(towns);
    // One rail per layer: editorial picks pinned first, then the rated
    // best first. A card in both lists appears once.
    const rails = LAYER_RAILS.map(([layer, key]) => {
      const seen = new Set();
      const pinned = (data.editorial || []).filter((c) => c.layer === layer);
      const ranked = (data.rated || []).filter((c) => c.layer === layer)
        .sort((a, b) => (cardScore(b) ?? -1) - (cardScore(a) ?? -1));
      const cards = [...pinned, ...ranked].filter((c) => {
        const k = `${c.layer}:${c.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { layer, key, cards };
    }).filter((r) => r.cards.length > 0);
    // The page's photograph: its best member's own, with its credit.
    const best = [...rails.flatMap((r) => r.cards)]
      .sort((a, b) => (cardScore(b) ?? -1) - (cardScore(a) ?? -1));
    const heroCard = [...(data.editorial || []), ...best].find((c) => cardImage(c)) || null;
    return { centre, towns, priced, months, rails, heroCard };
  }, [data, rows, iso2]);

  const open = (card) => {
    const feature = LAYER_TO_FEATURE[card.layer];
    if (feature && onOpenFeature) {
      // The region's name rides along, so the page it opens names this
      // region in its back control (T504, row T498-c).
      onOpenFeature(feature, { id: card.id, cc: card.cc || card.country }, region?.name || null);
    }
  };

  // writeText REJECTS rather than throws, so a synchronous try/catch around it
  // never fires: the button said "Link copied" on a permission denial and the
  // rejection went unhandled. Await it, and only then claim the copy happened.
  const share = async () => {
    try {
      await navigator.clipboard.writeText(regionShareUrl(id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard refused; the button just stays */ }
  };


  // One shell for every state (T474, row T435-e): the bar the item pages
  // wear (back naming the tab it returns to, the name once the heading has
  // gone, share), then the scrolling body.
  const shell = (body, { name = '', canShare = false } = {}) => (
    <div className="rgnp" role="dialog" aria-modal="true"
      aria-label={name || t('region.kind.nuts2')} ref={pageRef}>
      <PageBar
        t={t}
        backLabel={backLabel || t('glyph.back')}
        onBack={onClose}
        backRef={backRef}
        name={name}
        nameOn={nameOn}
        fav={fav}
        onFav={canShare ? onFav : null}
        onShare={canShare ? share : null}
        shareLabel={t('region.share')}
        copied={copied}
        copiedLabel={t('region.shareDone')}
      />
      <div className="rgnp-scroll" ref={scrollEl}>
        <div className="rgnp-inner">{body}</div>
      </div>
    </div>
  );

  if (failed) {
    return shell(<ErrorBlock message={t('layer.loadFailed')} onRetry={() => setTries((n) => n + 1)} retryLabel={t('layer.retry')} />);
  }

  if (data === undefined) {
    // Still fetching. Without this the page rendered its container with a
    // back button and nothing else, which reads as a page that broke rather
    // than one that has not arrived.
    return shell(<LoadingBlock label={t('region.loading')} rows={4} />);
  }

  if (data === null || !region || !derived) {
    // An id that resolves to no file at all: a stale link, or a region
    // that left the spine. Say which, rather than showing an empty shell
    // that reads as a broken page.
    return shell(
      <div className="rgnp-missing">
        <h1 ref={headEl}>{t('region.notFound')}</h1>
        <p className="rgnp-sub">{t('region.notFoundHint')}</p>
        {nearIds.length > 0 && (
          <div className="cov-empty" data-testid="region-nearest">
            <p className="cov-empty-head">{t('region.nearestHead')}</p>
            <ul className="cov-near">
              {nearIds.map((r) => (
                <li key={r.id}>
                  <button type="button" className="cov-near-row" onClick={() => onOpenRegion?.(r.id)}>
                    <span className="cov-near-name">{r.name}</span>
                    <span className="cov-near-meta"><span className="mono">{r.id}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>,
    );
  }

  const { centre, towns, priced, months, rails, heroCard } = derived;
  const heroUrl = heroCard ? cardImage(heroCard) : null;
  const heroMeta = heroCard ? firstImage(heroCard) : null;
  const credit = heroMeta && typeof heroMeta === 'object'
    ? [heroMeta.by, heroMeta.lic].filter(Boolean).join(', ')
    : '';
  const creditPage = heroMeta && typeof heroMeta.page === 'string' && heroMeta.page.startsWith('https://')
    ? heroMeta.page : null;
  const canPlan = Boolean(onPlanTrip && iso2);
  const hasFacts = Boolean(priced) || months.length > 0;

  return shell(
    <div className="rgnp-grid">
      {heroUrl && (
        <figure className="rgnp-hero">
          <div className="rgnp-hero-frame">
            <HeroImage url={heroUrl} city={region.name} iso2={iso2} className="rgnp-hero-img"
              maxWidth={1280} sizes="(max-width: 1180px) 100vw, 1180px" ratio={[3, 2]} eager />
          </div>
          {credit && (
            <figcaption className="rgnp-credit">
              {creditPage
                ? <a href={creditPage} target="_blank" rel="noopener noreferrer">{t('region.photoBy', { credit })}</a>
                : t('region.photoBy', { credit })}
            </figcaption>
          )}
        </figure>
      )}

      {/* The name first, then what kind of region it is and where
          (T474, row T435-e), as the item pages' head reads. */}
      <header className="rgnp-head">
        <h1 ref={headEl}>{region.name}</h1>
        <p className="rgnp-kind">
          {t(KIND_KEY[region.kind] || 'region.kind.nuts2')}
          {iso2 ? `, ${countryName(iso2, iso2)}` : ''}
        </p>
      </header>

      {(hasFacts || canPlan) && (
        <aside className="rgnp-side" aria-label={region.name}>
          {hasFacts && (
            <dl className="rgnp-facts">
              {priced && (
                <div className="rgnp-fact">
                  <dt>{t('item.dayIn', { city: priced.city })}</dt>
                  <dd>
                    <Money value={priced.cost.dayEur} est={isNational(priced.cost)} />
                    <span className="rgnp-unit"> {t('dest.priceDayUnit')}</span>
                  </dd>
                </div>
              )}
              {months.length > 0 && (
                <div className="rgnp-fact">
                  <dt>{t('dest.keyBest')}</dt>
                  <dd>{fmtMonthRanges(months, t)}</dd>
                </div>
              )}
            </dl>
          )}
          {canPlan && (
            <Button variant="primary" block className="rgnp-plan" onClick={() => onPlanTrip(iso2, priced?.id || null)}>
              {t('region.planTrip')}
            </Button>
          )}
        </aside>
      )}

      {rails.map(({ layer, key, cards }) => {
        const feature = LAYER_TO_FEATURE[layer];
        const more = onSeeAllLayer && iso2 && feature ? () => onSeeAllLayer(feature, iso2) : null;
        return (
          <Strip key={layer} id={`rgnp-rail-${layer}`} title={t(key)} onSeeAll={more} t={t} className="rgnp-rail">
            {cards.slice(0, RAIL_MAX).map((card) => (
              <li key={`${card.layer}-${card.id}`} className="dtab-item">
                <RegionTile card={card} onOpen={open} />
              </li>
            ))}
          </Strip>
        );
      })}

      {towns.length > 0 && onSelectDest && (
        <section className="rgnp-sect" aria-labelledby="rgnp-towns">
          <h2 className="rgnp-sect-head" id="rgnp-towns">{t('region.townsHead')}</h2>
          <ul className="rgnp-list">
            {towns.map((p) => (
              <li key={p.id}>
                <TownRow p={p} onSelect={onSelectDest} t={t}
                  fav={favorites ? favorites.has(p.id) : false}
                  onToggleFav={onToggleFav} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {onOpenJourney && centre && (
        <WeeksRow t={t} lang={lang} id="rgnp-weeks" title={t('region.weeksHead')}
          country={iso2} near={{ lat: centre.lat, lon: centre.lon, km: WEEKS_KM }}
          onOpen={(card) => onOpenJourney(card, region.name)} />
      )}

      {data.listed?.length > 0 && (
        <section className="rgnp-sect" aria-labelledby="rgnp-listed">
          <h2 className="rgnp-sect-head" id="rgnp-listed">{t('region.listedHead')}</h2>
          <ul className="rgnp-list">
            {data.listed.map((card) => (
              <li key={`l-${card.layer}-${card.id}`}>
                <ListedRow card={card} t={t} onOpen={open} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.neighbours?.length > 0 && (
        <section className="rgnp-sect" aria-labelledby="rgnp-neigh">
          <h2 className="rgnp-sect-head" id="rgnp-neigh">{t('region.neighboursHead')}</h2>
          <div className="rgnp-neigh">
            {data.neighbours.map((n) => (
              <Button key={n.id} variant="secondary" size="sm" onClick={() => onOpenRegion?.(n.id)}>
                {n.name}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>,
    { name: region.name, canShare: true },
  );
}
