import React, { useCallback, useEffect, useRef, useState } from 'react';
import { scrollBehavior } from '../lib/motion.js';
import { openShared } from '../lib/sharedElement.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  CalendarIcon, ChevronRightIcon, CrosshairIcon, MountainIcon, PiggyIcon, RouteIcon,
} from '../components/Icons.jsx';
import { Button, Card, IconButton, Money, Segmented } from '../components/ui/index.js';
import { TilePhotos } from './PhotoGallery.jsx';
import { BedFoodLine } from './DestCards.jsx';
import { StoryRail, StoryCard, STORY_SIZES } from './StoryRail.jsx';
import { tripGrade } from '../lib/trailCards.js';
import { GRADE_KEY } from '../lib/cardFillings.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * The opening of a Destinations section (T428; T183 built the first one).
 *
 * Top to bottom, the same grammar Explore's idle page uses (T457 set the
 * order and the parts on Explore's):
 *   SectionHead   the section's title with a verb, at Explore's head scale,
 *                 and beside it, where Explore keeps List | Map, the view
 *                 switch Highlights | Full list and the near-me door
 *                 ("Beaches near me", T430)
 *   rails         photo strips of kit tile Cards: the section's best known
 *                 first, then the saved filters of lib/openingScreen.js; with
 *                 the countries track, at most four on a desktop and three
 *                 on a phone
 *   children      what the tab puts after them (the countries track)
 *   starters      the cuts that did not get a rail, as one row of Explore's
 *                 door buttons right over the list they narrow ("Try one")
 * The Full list view keeps the head and the doors and drops the rails, so
 * the list is one choice from the top of the section.
 *
 * What went (owner, 2026-10-14): the "Europe's 6 best-known mountains"
 * heading and its ranking sentence, the dots and the "1 to 4 of 12" under a
 * strip, the figure on "See all". T430 (owner, 2026-10-15): the photograph
 * at the top of each section; the rails' photographs carry the section now.
 * The rails still follow carta-design "Rails": arrows on a fine pointer,
 * arrow keys between cards, scroll snap, one aspect, nothing over a
 * photograph.
 *
 * T587: the rails are StoryRails (StoryRail.jsx): a tilted lead card with
 * the heading, facts from the rail's rows and "See all", then tall photo
 * cards with the grade or the month in a pill. Strip stays for the
 * countries track and the country and region pages.
 *
 * `describe(row)` returns { name, where, fact, rating } for one wire row.
 */

// T457: Explore's tile widths, about 230 to 300 px on a desktop.
const RAIL_SIZES = '(max-width: 768px) 72vw, 300px';

export function SectionHead({ title, id, nearMe = null, view = null }) {
  return (
    <div className="dtab-head">
      <h2 className="dtab-title" id={id}>{title}</h2>
      {(view || nearMe) && (
        <div className="dtab-head-tools">
          {view && (
            <Segmented size="sm" className="dtab-view" label={view.label} value={view.value}
              onChange={view.onChange} options={view.options} />
          )}
          {nearMe && (
            <Button variant="secondary" size="sm" className="dtab-nearme" iconStart={<CrosshairIcon size={16} />}
              onClick={nearMe.onPick} loading={nearMe.busy}>
              {nearMe.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Whether a strip can move either way, for the two arrows. */
function useStripEnds(ref) {
  const [ends, setEnds] = useState({ atStart: true, atEnd: true });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const next = { atStart: el.scrollLeft <= 2, atEnd: el.scrollLeft >= max - 2 };
    setEnds((cur) => (cur.atStart === next.atStart && cur.atEnd === next.atEnd ? cur : next));
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    measure();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [ref, measure]);
  return ends;
}

/**
 * A horizontal strip with a heading, an optional "See all" and the two
 * arrows. Shared by the rails and the countries track so both move, focus
 * and snap the same way.
 */
export function Strip({ id, title, onSeeAll = null, t, className = '', children }) {
  const stripRef = useRef(null);
  const ends = useStripEnds(stripRef);
  const onKeyDown = (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    const cards = Array.from(stripRef.current?.querySelectorAll('.card-open') || []);
    const at = cards.indexOf(document.activeElement);
    if (at < 0) return;
    const next = cards[at + dir];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.closest('.dtab-strip > *')?.scrollIntoView({ block: 'nearest', inline: 'start', behavior: scrollBehavior() });
  };
  const page = (dir) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: scrollBehavior() });
  };
  return (
    <section className={`dtab-rail ${className}`.trim()} aria-labelledby={id}>
      <div className="dtab-rail-head">
        <h3 className="dtab-rail-title" id={id}>{title}</h3>
        {onSeeAll && (
          <Button variant="quiet" size="sm" className="dtab-all" onClick={onSeeAll}>
            {t('rail.seeAllPlain')}
          </Button>
        )}
        <span className="dtab-nav">
          <IconButton tone="surface" className="dtab-arrow is-prev" label={t('explore.railPrev')}
            onClick={() => page(-1)} disabled={ends.atStart}>
            <ChevronRightIcon size={16} />
          </IconButton>
          <IconButton tone="surface" className="dtab-arrow" label={t('explore.railNext')}
            onClick={() => page(1)} disabled={ends.atEnd}>
            <ChevronRightIcon size={16} />
          </IconButton>
        </span>
      </div>
      <ul className="dtab-strip" ref={stripRef} onKeyDown={onKeyDown} aria-label={title}>
        {children}
      </ul>
    </section>
  );
}

/** One wire row as a rail tile, on Explore's three lines (T457): the name;
 *  the flag and where it is, on one line; the measured fact and the Score
 *  on one line, the fact where Explore's tile has its price. */
export function RailTile({ row, describe, photo, photos = null, onOpen, sharedKey, t = null }) {
  const d = describe(row);
  const key = sharedKey ? sharedKey(row) : null;
  const url = photo(row);
  const urls = photos ? photos(row) : [];
  const open = (e) => {
    const card = e.currentTarget.closest('.card');
    if (key == null) onOpen(row);
    else openShared(card, key, () => onOpen(row));
  };
  return (
    <Card
      layout="tile"
      as="div"
      wrap
      className="dtab-tile"
      media={urls.length > 1 ? (
        <TilePhotos urls={urls} city={d.name} onOpen={open} sizes={RAIL_SIZES} />
      ) : (
        <HeroImage url={url} city={d.name} className="dtab-tile-img" maxWidth={640}
          sizes={RAIL_SIZES} ratio={[4, 3]} />
      )}
      title={d.name}
      onOpen={open}
      meta={d.where ? (
        <span className="dtab-tile-meta">
          {d.cc && <CountryFlag country={d.cc} size={12} />}
          <span className="dtab-where">{d.where}</span>
        </span>
      ) : null}
      price={t && d.base && d.base.dayEur != null ? <BedFoodLine base={d.base} t={t} /> : d.fact ? (
        <span className="dtab-fact">
          {d.factLabel && <span className="dtab-fact-l">{d.factLabel} </span>}
          {d.fact}
        </span>
      ) : null}
      rating={d.rating ? <ScoreChip rating={d.rating} size="sm" /> : null}
    />
  );
}

// ── T587: the opening rails as StoryRails ───────────────────────────────
//
// The status pill on a card is the trail's grade, else "Good in <month>"
// when this month is inside the row's measured season (a ride's best
// months, a summit's months, a lake's swimming season); nothing when the
// data has neither. The lead card's facts come from the rail's own rows.

const MONTH_CODES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The months (1 to 12) a row is good in, from whatever its layer measures. */
function seasonMonths(layer, row) {
  if (layer === 'cycle') return row?.season?.best || [];
  if (layer === 'mountain') return row?.season?.snowbound ? [] : (row?.season?.months || []);
  if (layer === 'lake') {
    const s = row?.swim?.season;
    const from = s ? MONTH_CODES.indexOf(String(s.from).toLowerCase()) + 1 : 0;
    const to = s ? MONTH_CODES.indexOf(String(s.to).toLowerCase()) + 1 : 0;
    if (!from || !to) return [];
    const out = [];
    for (let m = from; ; m = (m % 12) + 1) {
      out.push(m);
      if (m === to || out.length >= 12) break;
    }
    return out;
  }
  return [];
}

const monthWord = (m, lang, style) => new Intl.DateTimeFormat(lang, { month: style }).format(new Date(2026, m - 1, 15));

function statusOf(layer, row, t, lang) {
  if (layer === 'trail') {
    const g = tripGrade(row);
    return g && GRADE_KEY[g] ? t(GRADE_KEY[g]) : null;
  }
  const now = new Date().getMonth() + 1;
  return seasonMonths(layer, row).includes(now) ? t('rail.goodIn', { month: monthWord(now, lang, 'short') }) : null;
}

const SLOT = '\u0001';
function withMoney(text, money) {
  const at = text.indexOf(SLOT);
  if (at < 0) return text;
  return <>{text.slice(0, at)}{money}{text.slice(at + SLOT.length)}</>;
}

/** Up to three facts for a rail's lead card, read from its rows. */
function sectionFacts(layer, rows, describe, t, lang) {
  const facts = [];
  const days = rows.map((r) => describe(r).base?.dayEur).filter(Number.isFinite);
  if (days.length) {
    facts.push({ key: 'from', icon: PiggyIcon, text: withMoney(t('rail.factFrom', { price: SLOT }), <Money value={Math.min(...days)} est />) });
  }
  const now = new Date().getMonth() + 1;
  if (layer !== 'trail' && rows.length && rows.every((r) => seasonMonths(layer, r).includes(now))) {
    facts.push({ key: 'month', icon: CalendarIcon, text: t('rail.goodIn', { month: monthWord(now, lang, 'long') }) });
  }
  const km = rows.map((r) => (layer === 'trail' ? (r.distance_m != null ? r.distance_m / 1000 : null)
    : layer === 'cycle' ? r.km : null)).filter(Number.isFinite);
  if (km.length > 1) {
    const fmt = (v) => Math.round(v).toLocaleString(lang);
    const lo = Math.min(...km);
    const hi = Math.max(...km);
    if (Math.round(lo) !== Math.round(hi)) {
      facts.push({ key: 'km', icon: RouteIcon, text: t('rail.factKm', { from: fmt(Math.max(1, lo)), to: fmt(hi) }) });
    }
  }
  if (layer === 'mountain') {
    const ele = rows.map((r) => r.ele).filter(Number.isFinite);
    if (ele.length) {
      facts.push({ key: 'ele', icon: MountainIcon, text: t('rail.factUpTo', { v: `${Math.round(Math.max(...ele)).toLocaleString(lang)} m` }) });
    }
  }
  return facts;
}

/** One wire row as a StoryRail photo card: the photograph with the status
 *  and the Score in pills, then the name, where it is, and the measured fact
 *  or the "Bed and food" line, as RailTile says them. */
function SectionStoryCard({ layer, row, describe, photo, photos, onOpen, sharedKey, t, lang }) {
  const d = describe(row);
  const key = sharedKey ? sharedKey(row) : null;
  const url = photo(row) || (photos ? photos(row)[0] : null);
  const status = statusOf(layer, row, t, lang);
  const open = (e) => {
    const card = e.currentTarget.closest('.card');
    if (key == null) onOpen(row);
    else openShared(card, key, () => onOpen(row));
  };
  // Within one country a trail's "where" is its grade, which the pill says.
  const where = d.where && d.where !== status ? d.where : null;
  return (
    <StoryCard
      photo={<HeroImage url={url} city={d.name} iso2={d.cc} maxWidth={640} sizes={STORY_SIZES} ratio={[4, 5]} />}
      status={status}
      score={d.rating && d.rating.score != null ? <ScoreChip rating={d.rating} size="sm" /> : null}
      title={d.name}
      onOpen={open}
      meta={where ? (
        <span className="dtab-tile-meta">
          {d.cc && <CountryFlag country={d.cc} size={12} />}
          <span className="dtab-where">{where}</span>
        </span>
      ) : null}
      price={d.base && d.base.dayEur != null ? <BedFoodLine base={d.base} t={t} /> : d.fact ? (
        <span className="dtab-fact">
          {d.factLabel && <span className="dtab-fact-l">{d.factLabel} </span>}
          {d.fact}
        </span>
      ) : null}
    />
  );
}

export function SectionOpening({
  layer, head = null, rails, starters = [], describe, photo, photos = null, onOpen, t,
  sharedKey = null, nearMe = null, view = null, children = null,
}) {
  const { lang } = useI18n();
  return (
    <div className="open-bands dtab-open" data-layer={layer}>
      {head && <SectionHead title={head.title} id={`dtab-head-${layer}`} nearMe={nearMe} view={view} />}
      {rails.length > 0 && (
        <div className="dtab-rails" data-rails={rails.length}>
          {rails.map((rail) => (
            <StoryRail key={rail.key} id={`dtab-rail-${layer}-${rail.key}`} title={rail.title}
              facts={sectionFacts(layer, rail.rows, describe, t, lang)}
              onSeeAll={rail.onSeeAll} t={t} headingLevel={3} className="open-rail">
              {rail.rows.map((row) => (
                <SectionStoryCard key={row.id} layer={layer} row={row} describe={describe} photo={photo}
                  photos={photos} onOpen={onOpen} sharedKey={sharedKey} t={t} lang={lang} />
              ))}
            </StoryRail>
          ))}
        </div>
      )}
      {children}
      {/* Try one, after the rails and right over the list it narrows, drawn
          as Explore draws its doors over "All places" (T457). */}
      {starters.length > 0 && (
        <nav className="dtab-starters" aria-label={t('dtab.tryOne')}>
          {starters.map((s) => (
            <Button key={s.key} variant="secondary" size="sm" className="dtab-starter" data-rail={s.key}
              onClick={s.onPick}>
              {s.title}
            </Button>
          ))}
        </nav>
      )}
    </div>
  );
}
