import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { tabHref } from '../../lib/urlState.js';
import { loadJourneyIndex, loadJourneyType, typeLabel, splitAround } from '../../lib/journeys.js';
import { cardPerDay } from '../../lib/tripFilters.js';
import { WEEK } from '../../lib/tripLength.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { Button, Money } from '../../components/ui/index.js';
import { ArrowRightIcon, ChevronRightIcon, RouteIcon } from '../../components/Icons.jsx';

/** A plain click stays in the app; a modified click opens the address. */
function door(go) {
  return (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go();
  };
}

// The three styles whose photographs make the page's picture: a walk, a
// city, the sea. The first is the large one and carries the price chip.
const SHOW = ['hiking', 'city', 'water-sports'];
// A photograph covers a tile taller than itself, so it is asked for at the
// width its height needs, not the tile's width.
const SIZES = ['(max-width: 768px) 190vw, 72vw', '(max-width: 768px) 60vw, 34vw', '(max-width: 768px) 60vw, 34vw'];

/**
 * The picture: three style photographs from the journeys library, and the
 * first style's cheapest week a person a day that is in season this month.
 * Resolves null on any failure, so the page stands without it.
 */
function loadPicture(month) {
  return loadJourneyIndex().then((ix) => {
    if (!ix) return null;
    const bySlug = new Map(ix.types.map((tp) => [tp.slug, tp]));
    const tiles = SHOW.map((s) => bySlug.get(s)).filter((tp) => tp?.hero?.url);
    const fill = ix.types.filter((tp) => tp.hero?.url && !SHOW.includes(tp.slug));
    while (tiles.length < 3 && fill.length) tiles.push(fill.shift());
    if (tiles.length < 3) return null;
    return loadJourneyType(tiles[0].slug).then((rows) => {
      const all = (rows || []).filter((r) => Number.isFinite(cardPerDay(r, WEEK)));
      const season = all.filter((r) => (r.months || []).includes(month));
      const pool = season.length ? season : all;
      const best = pool.reduce((a, b) => (a && cardPerDay(a, WEEK) <= cardPerDay(b, WEEK) ? a : b), null);
      return { tiles, week: best };
    }).catch(() => ({ tiles, week: null }));
  }).catch(() => null);
}

/** The price chip on the large photograph: the style, the days, the price. */
function PriceChip({ tile, week }) {
  const { t } = useI18n();
  if (!week) return null;
  const [before, , after] = splitAround(t, 'saved.costFromDay', { eur: '' }, 'eur');
  return (
    <span className="pf-open-chip">
      <span className="pf-open-chip-kind">
        {t('pf.home.chipKind', { style: typeLabel(tile.slug, t, tile.name), days: t('journey.nDays', { n: week.days || 7 }) })}
      </span>
      <span className="pf-open-chip-price">
        {before}<Money value={cardPerDay(week, WEEK)} className="pf-open-chip-fig" />{after}
      </span>
    </span>
  );
}

/**
 * PlanHome (T743, T744), the Plan place with nothing open: one screen, no
 * scroll. Three photographs of the trip styles, each a door to its weeks,
 * one honest price on the first; the headline in the app's face; one line;
 * Start planning, the planned trips, and the trip in progress when there is
 * one.
 *
 *   onStart()            the trip-kind sheet
 *   onContinue()         the trip in progress, in the trip planner
 *   onOpenStyle(slug)    one style's weeks (null: every style)
 */
export function PlanHome({ titleTag = 'h1', hasTrip, tripName, onStart, onContinue, onOpenStyle }) {
  const { t } = useI18n();
  const Title = titleTag;
  const [pic, setPic] = useState(undefined);

  useEffect(() => {
    let live = true;
    loadPicture(new Date().getMonth() + 1).then((v) => { if (live) setPic(v); });
    return () => { live = false; };
  }, []);

  const accent = t('pf.home.titleAccent');
  const [lead, , tail] = splitAround(t, 'pf.home.title', { accent }, 'accent');

  return (
    <div className={`pf-open${pic === null ? ' is-bare' : ''}`}>
      {pic !== null && (
        <div className="pf-open-pic" aria-busy={pic === undefined || undefined}>
          {[0, 1, 2].map((i) => {
            const tile = pic?.tiles[i];
            if (!tile) return <span key={i} className={`pf-open-tile is-t${i} is-wait`} aria-hidden="true" />;
            return (
              <a key={tile.slug} className={`pf-open-tile is-t${i}`} href={tabHref('places')}
                onClick={door(() => onOpenStyle(tile.slug))} aria-label={typeLabel(tile.slug, t, tile.name)}>
                <HeroImage url={tile.hero.url} city={tile.name} className="pf-open-img" maxWidth={i === 0 ? 1920 : 1280}
                  sizes={SIZES[i]} ratio={[4, 3]} eager={i === 0} />
                {i === 0 && <PriceChip tile={tile} week={pic.week} />}
              </a>
            );
          })}
        </div>
      )}

      <div className="pf-open-text">
        <Title className="pf-title pf-open-title" tabIndex={-1}>
          {lead}<span className="pf-open-accent">{accent}</span>{tail}
        </Title>
        <p className="pf-open-lede">{t('pf.home.lede')}</p>
        <div className="pf-open-actions">
          <Button variant="primary" className="pf-open-start" iconEnd={<ArrowRightIcon size={18} />} onClick={onStart}>
            {t('pf.home.start')}
          </Button>
          <Button variant="secondary" className="pf-open-browse" onClick={() => onOpenStyle(null)}>
            {t('pf.home.browse')}
          </Button>
        </div>
        {hasTrip && (
          <a className="pf-open-resume" href={tabHref('trip')} onClick={door(onContinue)}>
            <span className="pf-open-resume-icon" aria-hidden="true"><RouteIcon size={18} /></span>
            <span className="pf-open-resume-text">
              <span className="pf-open-resume-label">{t('pf.home.continuePlan')}</span>
              <span className="pf-open-resume-name">{tripName || t('pf.home.yourTrip')}</span>
            </span>
            <ChevronRightIcon size={18} />
          </a>
        )}
      </div>
    </div>
  );
}
