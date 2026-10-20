/**
 * RegionPage: one region's record, full screen. The browsing unit between
 * "beach" and "country": a coastal stretch, a mountain range, or a NUTS2
 * region, composed from /region/{ID}.json exactly as the export wrote it.
 *
 *   editorial   seed picks a person vouched for, pinned first (empty until
 *               the layer briefs land, the slot ships now)
 *   rated       published rows, ranked; each carries its own score
 *   listed      rows that exist but are not scored. A DIFFERENT card, not a
 *               dimmer one: dashed border, a "not scored yet" chip where the
 *               score would sit, and one honest line about why it is shown.
 *   neighbours  "nothing here? try next door", straight from the wire
 *
 * Opening a card hands over to the layer's own page through the same
 * onOpenFeature callback DestinationPage uses, so a beach opened from the
 * Costa de la Luz page is the same beach page as everywhere else.
 *
 * Escape closes. Bound in the capture phase with stopPropagation, per the
 * escape-stack lesson: this page can sit over other overlays and the
 * topmost layer must eat the key.
 */
import React, { useEffect, useRef, useState } from 'react';
import { loadRegion, loadRegionIndex, regionShareUrl } from '../lib/regions.js';
import { nearestRegions } from '../lib/coverageEmpty.js';
import { useI18n } from '../i18n/index.jsx';
import { LoadingBlock, ErrorBlock } from '../components/StateBlocks.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { usePageArrival } from '../hooks/usePageArrival.js';
import { Button, Card } from '../components/ui/index.js';
import { PageBar } from './PageBar.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { okPhoto } from '../lib/photoVeto.js';
import { countryName } from '../lib/countryName.js';

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

function cardImage(card) {
  // Two shapes reach a card: beaches, lakes and mountains ship `images[]`
  // of objects, trails ship a single `img` that is ALSO an object. Reading
  // `img` as a string dropped every trail photograph on the page while the
  // wire carried it, so both shapes are unwrapped here.
  const first = (card.images && card.images[0]) || card.img;
  const url = typeof first === 'string' ? first : first && first.u;
  return typeof url === 'string' && url.startsWith('https://') ? okPhoto(url) : null;
}

function RegionCard({ card, listed, t, onOpen }) {
  const img = cardImage(card);
  const score = typeof card.score === 'number' ? card.score
    : typeof card.rating === 'number' ? card.rating : null;
  const where = card.region || card.range || null;
  return (
    <Card
      className={`rgnp-card${listed ? ' rgnp-listed' : ''}`}
      media={img
        ? <img src={img} alt="" loading="lazy" />
        : <span className="rgnp-card-noimg" aria-hidden="true" />}
      title={<span className="rgnp-card-name">{card.name}</span>}
      onOpen={() => onOpen(card)}
      meta={listed ? t('region.listedChip') : where}
      rating={!listed && score != null ? <ScoreChip rating={{ score }} size="sm" /> : null}
    />
  );
}

export function RegionPage({ id, onClose, onOpenFeature, onOpenRegion, backLabel = '' }) {
  const { t } = useI18n();
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

  const open = (card) => {
    const feature = LAYER_TO_FEATURE[card.layer];
    if (feature && onOpenFeature) {
      onOpenFeature(feature, { id: card.id, cc: card.cc || card.country });
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

  if (data === null) {
    // An id that resolves to no file at all: a stale link, or a region
    // that left the spine. Say which, rather than showing an empty shell
    // that reads as a broken page.
    return shell(
      <>
          <h1 ref={headEl}>{t('region.notFound')}</h1>
          <p className="rgnp-card-sub">{t('region.notFoundHint')}</p>
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
      </>,
    );
  }

  const region = data?.region;
  // The page's photograph: its best-rated member's own, where one exists.
  const heroUrl = [...(data?.editorial || []), ...(data?.rated || [])].map(cardImage).find(Boolean) || null;
  return shell(
    <>
        {region && (
          <>
            {/* The name first, then what kind of region it is and where
                (T474, row T435-e), as the item pages' head reads. */}
            <h1 ref={headEl}>{region.name}</h1>
            <p className="rgnp-kind">
              {t(KIND_KEY[region.kind] || 'region.kind.nuts2')}
              {region.country ? `, ${countryName(region.country, region.country)}` : ''}
            </p>
            {heroUrl && (
              <div className="rgnp-hero">
                <HeroImage url={heroUrl} city={region.name} className="rgnp-hero-img"
                  maxWidth={1280} sizes="(max-width: 860px) 100vw, 860px" ratio={[21, 9]} eager />
              </div>
            )}

            {data.editorial?.length > 0 && (
              <div className="rgnp-list">
                {data.editorial.map((card) => (
                  <RegionCard key={`e-${card.layer}-${card.id}`} card={card}
                        listed={false} t={t} onOpen={open} />
                ))}
              </div>
            )}

            {data.rated?.length > 0 && (
              <>
                <h2 className="rgnp-sect">{t('region.ratedHead')}</h2>
                <div className="rgnp-list">
                  {data.rated.map((card) => (
                    <RegionCard key={`r-${card.layer}-${card.id}`} card={card}
                          listed={false} t={t} onOpen={open} />
                  ))}
                </div>
              </>
            )}

            {data.listed?.length > 0 && (
              <>
                <h2 className="rgnp-sect">{t('region.listedHead')}</h2>
                <div className="rgnp-list">
                  {data.listed.map((card) => (
                    <RegionCard key={`l-${card.layer}-${card.id}`} card={card}
                          listed t={t} onOpen={open} />
                  ))}
                </div>
              </>
            )}

            {data.neighbours?.length > 0 && (
              <>
                <h2 className="rgnp-sect">{t('region.neighboursHead')}</h2>
                <div className="rgnp-neigh">
                  {data.neighbours.map((n) => (
                    <Button key={n.id} variant="secondary" size="sm" onClick={() => onOpenRegion?.(n.id)}>
                      {n.name}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
    </>,
    { name: region?.name || '', canShare: Boolean(region) },
  );
}
