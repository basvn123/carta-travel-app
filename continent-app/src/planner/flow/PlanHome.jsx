import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { tabHref } from '../../lib/urlState.js';
import { loadJourneyIndex, loadJourneyType, journeyHash, typeLabel } from '../../lib/journeys.js';
import { cardPerDay } from '../../lib/tripFilters.js';
import { WEEK } from '../../lib/tripLength.js';
import Logo from '../../components/Logo.jsx';
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

// How many planned trips the opening shows: two rows of four on a desktop,
// a rail to swipe on a phone. One trip a style, so the row reads as range.
const PICKS = 8;
const CARD_SIZES = '(max-width: 768px) 72vw, (max-width: 1279px) 30vw, 300px';

/**
 * The planned trips to start from: one a style, in the journeys library's
 * order, each the style's cheapest week a person a day that is in season
 * this month (the first in the list when none is). Resolves [] on any
 * failure, so the opening never waits on it.
 */
function loadPicks(month) {
  return loadJourneyIndex().then((ix) => {
    if (!ix) return [];
    return Promise.all(ix.types.slice(0, PICKS).map((tp) => loadJourneyType(tp.slug)
      .then((rows) => {
        const all = (rows || []).filter((r) => Number.isFinite(cardPerDay(r, WEEK)));
        const season = all.filter((r) => (r.months || []).includes(month));
        const pool = season.length ? season : all;
        const best = pool.reduce((a, b) => (a && cardPerDay(a, WEEK) <= cardPerDay(b, WEEK) ? a : b), null);
        return best ? { ...best, type: tp.slug, typeName: tp.name } : null;
      })
      .catch(() => null)))
      .then((list) => ({ picks: list.filter(Boolean), types: ix.types }));
  }).catch(() => ({ picks: [], types: [] }));
}

/** One planned trip: the photograph, the title, the style and length, and
 *  one from-price a person a day. A real link to the week's address. */
function TemplateCard({ card, onOpen }) {
  const { t } = useI18n();
  const perDay = cardPerDay(card, WEEK);
  return (
    <li className="pf-tpl">
      <a className="pf-tpl-link" href={journeyHash(card.id)} onClick={door(() => onOpen(card.id))}>
        <span className="pf-tpl-media">
          <HeroImage url={card.hero?.url} city={card.title} iso2={card.cc} className="pf-tpl-img"
            maxWidth={640} sizes={CARD_SIZES} ratio={[4, 3]} />
        </span>
        <span className="pf-tpl-body">
          <span className="pf-tpl-kind">
            <span>{typeLabel(card.type, t, card.typeName)}</span>
            <span aria-hidden="true" className="pf-tpl-sep" />
            <span>{t('journey.nDays', { n: card.days || 7 })}</span>
          </span>
          <span className="pf-tpl-title">{card.title}</span>
          <span className="pf-tpl-price">
            {t('journey.fromPpDay', { eur: '\u0001' }).split('\u0001').flatMap((s, i) => (i
              ? [<Money key="m" value={perDay} className="pf-tpl-fig" />, s]
              : [s]))}
          </span>
        </span>
      </a>
    </li>
  );
}

/**
 * PlanHome (T743), the Plan place with nothing open: a full page on warm
 * paper instead of a sheet over a map. Carta's mark and name, one headline
 * in the editorial serif, one line of what the planner gives, Start
 * planning, the trip in progress when there is one, and the written weeks
 * of the journeys library to start from, one a style, with the styles below.
 *
 *   onStart()            the trip-kind sheet
 *   onContinue()         the trip in progress, in the trip planner
 *   onOpenJourney(id)    one written week, its whole plan
 *   onOpenStyle(slug)    one style's weeks (null: every style)
 */
export function PlanHome({ titleTag = 'h1', hasTrip, tripName, onStart, onContinue, onOpenJourney, onOpenStyle }) {
  const { t } = useI18n();
  const Title = titleTag;
  const [lib, setLib] = useState(null);

  useEffect(() => {
    let live = true;
    loadPicks(new Date().getMonth() + 1).then((v) => { if (live) setLib(v); });
    return () => { live = false; };
  }, []);

  const loading = lib === null;
  const picks = lib?.picks || [];
  const types = lib?.types || [];

  return (
    <div className="pf-open">
      <div className="pf-open-contours" aria-hidden="true" />
      <div className="pf-open-inner">
        <header className="pf-open-hero">
          <p className="pf-open-mast">
            <Logo size={32} className="pf-mark" />
            <span>{t('pf.home.mast')}</span>
          </p>
          <Title className="pf-title pf-open-title" tabIndex={-1}>{t('pf.home.title')}</Title>
          <p className="pf-open-lede">{t('pf.home.lede')}</p>
          <div className="pf-open-actions">
            <Button variant="primary" className="pf-open-start" iconEnd={<ArrowRightIcon size={18} />} onClick={onStart}>
              {t('pf.home.start')}
            </Button>
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
        </header>

        {(loading || picks.length > 0) && (
          <section className="pf-open-lib" aria-labelledby="pf-open-lib-h" aria-busy={loading || undefined}>
            <div className="pf-open-lib-head">
              <div>
                <h2 id="pf-open-lib-h" className="pf-open-lib-title">{t('pf.home.templates')}</h2>
                <p className="pf-open-lib-help">{t('pf.home.templatesHelp')}</p>
              </div>
              <a className="pf-open-all" href={tabHref('places')} onClick={door(() => onOpenStyle(null))}>
                {t('pf.home.allTrips')}
                <ArrowRightIcon size={16} />
              </a>
            </div>
            <ul className="pf-open-rail">
              {loading
                ? Array.from({ length: 4 }, (_, i) => <li key={i} className="pf-tpl is-wait" aria-hidden="true" />)
                : picks.map((c) => <TemplateCard key={c.id} card={c} onOpen={onOpenJourney} />)}
            </ul>
            {types.length > 0 && (
              <nav className="pf-open-styles" aria-label={t('pf.home.byStyle')}>
                <span className="pf-open-styles-label" aria-hidden="true">{t('pf.home.byStyle')}</span>
                {types.map((tp) => (
                  <a key={tp.slug} className="ui-chip ui-chip-filter pf-open-style" href={tabHref('places')}
                    onClick={door(() => onOpenStyle(tp.slug))}>
                    {typeLabel(tp.slug, t, tp.name)}
                  </a>
                ))}
              </nav>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
