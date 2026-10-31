import React from 'react';
import { CalendarIcon, PiggyIcon, StarIcon } from '../components/Icons.jsx';
import { Button, Money } from '../components/ui/index.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { isNational } from '../components/CostSummary.jsx';
import { openShared } from '../lib/sharedElement.js';
import { countryName } from '../lib/countryName.js';
import { useI18n } from '../i18n/index.jsx';
import { DayPrice, SaveButton } from './ExploreCards.jsx';
import { FriendCardLine } from '../together/signals.jsx';
import { StoryRail, StoryCard, STORY_MAX, STORY_SIZES } from './StoryRail.jsx';

/**
 * Explore's sections (T427, after the owner's review of 2026-10-13).
 *
 * Each rail is a question a traveller asks ("Best in October", "Hiking
 * bases") answered by a strip of photo tiles, capped at 12, and a "See all"
 * that opens the list with the SAME filter applied, so the rail and the list
 * can never describe different places: the rail's query is the filter's
 * predicate, passed in by ExploreTab.
 *
 * Calm by subtraction: no subtitle explaining how a rail was chosen, no
 * position figure, no count in "See all" (owner: say less). Four strips on a
 * desktop and three on a phone (eight stacked carousels pushed the list two
 * screens down in v4); every further rail is one button in a single row that
 * opens its list. On a pointer screen each strip has a pair of arrows, since
 * a scroller with no scrollbar gives a mouse no way in; the arrow keys move
 * between the tiles.
 *
 * T587: each strip is a StoryRail (the owner's Komoot rail in Carta's
 * colours): a tilted lead card holding the heading, a stack of its photos (T599), the "See all"
 * and facts read from the rail's own rows (the cheapest day, the month when
 * every place is good then, the best Score), then tall photo cards with the
 * status and the Score in solid pills on the photo. `month` is the month the
 * rails speak about (ExploreTab's); the rail logic, the lead count, the doors
 * and every seeAll are unchanged.
 */

const CAP = 12;

// Round-robin by country, so a rail of 292 gems does not open on ten
// Italian tiles: take each country's best in turn until the cap.
export function interleaveByCountry(rows) {
  const byCountry = new Map();
  for (const p of rows) {
    if (!byCountry.has(p.country)) byCountry.set(p.country, []);
    byCountry.get(p.country).push(p);
  }
  const queues = [...byCountry.values()];
  const out = [];
  for (let i = 0; out.length < rows.length; i++) {
    const q = queues[i % queues.length];
    if (q.length) out.push(q.shift());
    if (queues.every((x) => !x.length)) break;
  }
  return out;
}

const SLOT = '\u0001';
/** A sentence with a node (the kit's Money) in its one slot. */
function withNode(text, node) {
  const at = text.indexOf(SLOT);
  if (at < 0) return text;
  return <>{text.slice(0, at)}{node}{text.slice(at + SLOT.length)}</>;
}

// The rails whose own question already says the month, or the gem: their
// cards do not repeat it in the status pill.
const MONTH_RAILS = new Set(['now', 'cost', 'beach']);
// One short line under a rail's heading (rail.line.*), only where it says
// something the heading does not (T599: what the day price covers, what a
// hiking base or a car-free trip means). The other rails speak for themselves.
const LINES = new Set(['cost', 'hiking', 'nocar']);

const inMonth = (p, month) => !!month && (p.climate?.best || []).includes(month);

/** The lead card's facts, read from the rail's own rows: the cheapest day,
 *  the month when every place in it is good then, and the best Score. The
 *  cheapest day is the card's one large figure (T599); a rail with no price
 *  shows its best Score large instead. */
function railFacts(rows, month, monthLong, t) {
  const facts = [];
  const priced = rows.filter((p) => p.cost?.dayEur != null);
  if (priced.length) {
    const low = priced.reduce((a, b) => (b.cost.dayEur < a.cost.dayEur ? b : a));
    facts.push({
      key: 'from',
      icon: PiggyIcon,
      figure: true,
      text: withNode(t('rail.factFrom', { price: SLOT }), <Money value={low.cost.dayEur} est={isNational(low.cost)} />),
    });
  }
  if (month && rows.length && rows.every((p) => inMonth(p, month))) {
    facts.push({ key: 'month', icon: CalendarIcon, text: t('rail.goodIn', { month: monthLong }) });
  }
  const scores = rows.map((p) => p.rating?.score).filter((n) => Number.isFinite(n));
  if (scores.length) {
    const best = Math.max(...scores).toFixed(1);
    facts.push({
      key: 'score',
      icon: StarIcon,
      figure: !priced.length,
      text: priced.length
        ? t('rail.factScore', { n: best })
        : withNode(t('rail.factScore', { n: SLOT }), <span className="storyr-num">{best}</span>),
    });
  }
  return facts;
}

/** One place as a StoryRail photo card: the status pill says the month or
 *  the gem (whichever the rail's own question does not already say), the
 *  Score sits top right, the flag and country under the title, then the
 *  day price. */
function PlaceStoryCard({ p, railKey, month, monthShort, onSelect, fav, onToggleFav, t }) {
  let status = null;
  if (!MONTH_RAILS.has(railKey) && inMonth(p, month)) status = t('rail.goodIn', { month: monthShort });
  else if (railKey !== 'gems' && p.rating?.hidden_gem) status = t('common.hiddenGem');
  return (
    <StoryCard
      className="xstory"
      photo={(
        <HeroImage url={p.image} city={p.city} iso2={p.iso2} className="storyr-img" maxWidth={STORY_MAX}
          sizes={STORY_SIZES} ratio={[4, 5]} />
      )}
      status={status}
      score={p.rating?.score != null ? <ScoreChip rating={p.rating} size="sm" /> : null}
      save={onToggleFav ? (
        <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} tone="photo" name={p.city} />
      ) : null}
      title={p.city}
      href={`#dest=${encodeURIComponent(p.id)}`}
      onOpen={(e) => {
        // A real link (T444): a plain click opens the place here, a
        // modifier click lets the browser open it in a new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        openShared(e.currentTarget.closest('.card'), p.id, () => onSelect(p.id));
      }}
      meta={(
        <span className="xstory-meta">
          <CountryFlag country={p.iso2} size={12} />
          <span>{countryName(p.iso2, p.country)}</span>
        </span>
      )}
      price={<><DayPrice cost={p.cost} t={t} /><FriendCardLine destId={p.id} /></>}
    />
  );
}

function Rail({ r, onSelect, favorites, onToggleFav, t, month, lang }) {
  const shown = r.rows.slice(0, CAP);
  const monthLong = month ? new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2026, month - 1, 15)) : '';
  const monthShort = month ? new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(2026, month - 1, 15)) : '';
  // h2: the rails sit straight under the page's h1 (T193).
  return (
    <StoryRail
      id={`xrail-${r.key}`}
      title={r.title}
      line={LINES.has(r.key) ? t(`rail.line.${r.key}`) : null}
      facts={railFacts(shown, month, monthLong, t)}
      onSeeAll={r.seeAll}
      stack={shown.filter((p) => p.image).slice(0, 3).map((p) => ({ url: p.image, city: p.city }))}
      headingLevel={2}
      className="xrails-rail"
      t={t}
    >
      {shown.map((p) => (
        <PlaceStoryCard key={p.id} p={p} railKey={r.key} month={month} monthShort={monthShort}
          onSelect={onSelect} fav={favorites?.has(p.id)} onToggleFav={onToggleFav} t={t} />
      ))}
    </StoryRail>
  );
}

/** `hideDoors` (T599): leave out the row of further-rail buttons, for a
 *  page that shows those doors elsewhere (the overview's top). */
export function ExploreRails({
  rails, onSelect, favorites, onToggleFav, t, lead = 4, month = null, hideDoors = false,
}) {
  const { lang } = useI18n();
  const visible = rails.filter((r) => r.rows.length >= 4);
  if (!visible.length) return null;
  const strips = visible.slice(0, lead);
  const doors = hideDoors ? [] : visible.slice(lead);
  return (
    <div className="xrails">
      {strips.map((r) => (
        <Rail key={r.key} r={r} onSelect={onSelect} favorites={favorites} onToggleFav={onToggleFav} t={t}
          month={month} lang={lang} />
      ))}
      {doors.length > 0 && (
        <nav className="xrails-doors" aria-label={t('explore.moreRails')}>
          {doors.map((r) => (
            <Button key={r.key} variant="secondary" size="sm" onClick={r.seeAll}>
              {r.short || r.title}
            </Button>
          ))}
        </nav>
      )}
    </div>
  );
}
