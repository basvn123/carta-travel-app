import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { tabHref } from '../../lib/urlState.js';
import { loadJourneyIndex, loadJourneyType, journeyHash, typeLabel, splitAround } from '../../lib/journeys.js';
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

// The styles to look in first, by month: what a week in Europe is for then.
// Each yields its cheapest week in season; the first three that have one
// make the picture. The tail is the fallback for a thin month.
const SEASON = {
  1: ['winter-sports', 'city', 'culinary'], 2: ['winter-sports', 'city', 'culinary'],
  3: ['city', 'winter-sports', 'cozy-towns'], 4: ['hiking', 'city', 'cycling'],
  5: ['hiking', 'cycling', 'water-sports'], 6: ['hiking', 'water-sports', 'city'],
  7: ['water-sports', 'hiking', 'city'], 8: ['water-sports', 'hiking', 'city'],
  9: ['hiking', 'cycling', 'city'], 10: ['hiking', 'city', 'cycling'],
  11: ['city', 'culinary', 'cozy-towns'], 12: ['winter-sports', 'city', 'culinary'],
};
const FALLBACK = ['city', 'cozy-towns', 'culinary', 'cycling', 'hiking', 'nature-escape'];

// A photograph covers a tile taller than itself, so it is asked for at the
// width its height needs, not the tile's width.
const SIZES = ['(max-width: 768px) 190vw, 72vw', '(max-width: 768px) 60vw, 34vw', '(max-width: 768px) 60vw, 34vw'];

const cheapest = (rows) => rows.reduce((a, b) => (a && cardPerDay(a, WEEK) <= cardPerDay(b, WEEK) ? a : b), null);

/**
 * Three planned weeks in season this month, one a style, each the style's
 * cheapest a person a day. Resolves null on any failure, so the page
 * stands without its picture.
 */
function loadWeeks(month) {
  return loadJourneyIndex().then((ix) => {
    if (!ix) return null;
    const known = new Map(ix.types.map((tp) => [tp.slug, tp]));
    const order = [...new Set([...(SEASON[month] || []), ...FALLBACK])].filter((s) => known.has(s));
    return Promise.all(order.map((slug) => loadJourneyType(slug).catch(() => null))).then((lists) => {
      const picked = [];
      const spare = [];
      lists.forEach((rows, i) => {
        const tp = known.get(order[i]);
        const all = (rows || []).filter((r) => Number.isFinite(cardPerDay(r, WEEK)) && (r.hero?.url || tp.hero?.url));
        const season = cheapest(all.filter((r) => (r.months || []).includes(month)));
        if (season) picked.push({ tp, week: season });
        else if (all.length) spare.push({ tp, week: cheapest(all) });
      });
      const weeks = [...picked, ...spare].slice(0, 3);
      return weeks.length === 3 ? weeks : null;
    });
  }).catch(() => null);
}

/** The week's own name: the title before its colon, as the library writes
 *  it, and before its first comma when that is still long. */
function shortTitle(title) {
  const head = String(title || '').split(':')[0].trim();
  return head.length > 28 ? head.split(',')[0].trim() : head;
}

/** One planned week as a photograph and a white card: the style and days,
 *  its name, and what a day of it costs from. A link to the whole week. */
function WeekTile({ item, index, onOpen }) {
  const { t } = useI18n();
  const { tp, week } = item;
  const style = typeLabel(tp.slug, t, tp.name);
  const [before, , after] = splitAround(t, 'saved.costFromDay', { eur: '' }, 'eur');
  return (
    <a className={`pf-open-tile is-t${index}`} href={journeyHash(week.id)} onClick={door(() => onOpen(week.id))}
      style={{ '--i': index }}>
      <HeroImage url={week.hero?.url || tp.hero?.url} city={week.title} iso2={week.cc} className="pf-open-img"
        maxWidth={index === 0 ? 1920 : 1280} sizes={SIZES[index]} ratio={[4, 3]} eager={index === 0} />
      <span className="pf-open-chip">
        <span className="pf-open-chip-kind">
          {t('pf.home.chipKind', { style, days: t('journey.nDays', { n: week.days || 7 }) })}
        </span>
        <span className="pf-open-chip-name">{shortTitle(week.title)}</span>
        <span className="pf-open-chip-price">
          <span>{before}<Money value={cardPerDay(week, WEEK)} className="pf-open-chip-fig" />{after}</span>
          <ArrowRightIcon size={14} className="pf-open-chip-go" />
        </span>
      </span>
    </a>
  );
}

/**
 * PlanHome (T743 to T745), the Plan place with nothing open: one screen, no
 * scroll. Three planned weeks in season this month, each a photograph with
 * its name and what a day costs, each a door to the whole week; the
 * headline; one line; Start planning, the planned trips, and the trip in
 * progress when there is one.
 *
 *   onStart()            the trip-kind sheet
 *   onContinue()         the trip in progress, in the trip planner
 *   onOpenJourney(id)    one planned week, its whole plan
 *   onOpenStyle(slug)    one style's weeks (null: every style)
 */
export function PlanHome({ titleTag = 'h1', hasTrip, tripName, onStart, onContinue, onOpenJourney, onOpenStyle }) {
  const { t } = useI18n();
  const Title = titleTag;
  const [weeks, setWeeks] = useState(undefined);

  useEffect(() => {
    let live = true;
    loadWeeks(new Date().getMonth() + 1).then((v) => { if (live) setWeeks(v); });
    return () => { live = false; };
  }, []);

  const accent = t('pf.home.titleAccent');
  const [lead, , tail] = splitAround(t, 'pf.home.title', { accent }, 'accent');

  return (
    <div className={`pf-open${weeks === null ? ' is-bare' : ''}`}>
      {weeks !== null && (
        <section className="pf-open-pic" aria-label={t('pf.home.inSeason')} aria-busy={weeks === undefined || undefined}>
          {weeks
            ? weeks.map((item, i) => <WeekTile key={item.week.id} item={item} index={i} onOpen={onOpenJourney} />)
            : [0, 1, 2].map((i) => <span key={i} className={`pf-open-tile is-t${i} is-wait`} aria-hidden="true" />)}
        </section>
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
