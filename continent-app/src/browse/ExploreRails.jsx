import React from 'react';
import { Button, Rail as HouseRail } from '../components/ui/index.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { openShared } from '../lib/sharedElement.js';
import { countryName } from '../lib/countryName.js';
import { useI18n } from '../i18n/index.jsx';
import { SaveButton } from './ExploreCards.jsx';
import { PlaceScore, RowFormation } from './explore/HouseParts.jsx';
import { PriceNotes } from '../components/PriceNotes.jsx';
import { priceNotes } from '../lib/price/notes.js';
import { ListHead } from './explore/PlaceRow.jsx';
import { FriendCardLine } from '../together/signals.jsx';
import { WhyChips } from './WhyChips.jsx';
import { STORY_MAX, STORY_SIZES } from './StoryRail.jsx';

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
 * House style 2026-11 (G1): each strip is the house Rail (components/ui)
 * with rail cards (photo, name and Score plate, flag and country, the
 * formation). `month` is the month the rails speak about (ExploreTab's); the
 * rail logic, the lead count, the doors and every seeAll are unchanged.
 */

const CAP = 12;

// Round-robin by country, so a rail of 292 gems does not open on ten
// Italian tiles: take each country's best in turn until the cap.
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
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


// The rails whose own question already says the month, or the gem: their
// cards do not repeat it on the status line.
const MONTH_RAILS = new Set(['now', 'cost', 'beach']);

const inMonth = (p, month) => !!month && (p.climate?.best || []).includes(month);

/** One place as a house rail card (DESIGN.md "Rail and RailCard"): the photo
 *  with only the save disc on it (no text on a photo), the name with the
 *  Score plate, the flag and country with the status the rail's own question
 *  does not already say (the month, else the hidden gem), the why chips, then
 *  the weighted formation, the price notes and the friends line. */
function PlaceRailCard({ p, railKey, month, monthShort, onSelect, fav, onToggleFav, t, eager = false, shared = [] }) {
  // Notes every card shares are said once over the rails (ListHead); a card
  // keeps only its own (a thin bed, a part only it lacks).
  const own = priceNotes(p.cost);
  const notes = { ...own, unmeasured: own.unmeasured.filter((k) => !shared.includes(k)) };
  const goodNow = !MONTH_RAILS.has(railKey) && inMonth(p, month);
  const gem = !goodNow && railKey !== 'gems' && p.rating?.hidden_gem;
  return (
    <article className="hs-rcard xstory" role="listitem">
      <a className="hs-rcard-link" href={`#dest=${encodeURIComponent(p.id)}`}
        onClick={(e) => {
          // A real link (T444): a plain click opens the place here, a
          // modifier click lets the browser open it in a new tab.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          openShared(e.currentTarget.closest('.hs-rcard'), p.id, () => onSelect(p.id));
        }}>
        <span className="hs-rcard-photo">
          <HeroImage url={p.image} image={p.photo} city={p.city} iso2={p.iso2} className="xrc-img" maxWidth={STORY_MAX}
            sizes={STORY_SIZES} ratio={[4, 3]} eager={eager} />
        </span>
        <span className="hs-rcard-head">
          <span className="hs-rcard-name">{p.city}</span>
          <PlaceScore rating={p.rating} />
        </span>
        <span className="hs-rcard-where">
          <CountryFlag country={p.iso2} size={12} />
          <span className="xrc-country">{countryName(p.iso2, p.country)}</span>
          {goodNow && <span className="xrc-status">{t('rail.goodIn', { month: monthShort })}</span>}
          {gem && <span className="hs-gem">{t('common.hiddenGem')}</span>}
        </span>
        {/* T1208 (G9): why it fits this traveller, only with evidence on both sides. */}
        <WhyChips place={p} className="xstory-why" />
      </a>
      {/* The price row sits outside the link: its day figure is a button
          (the items in it, T695), and a button never nests in a link. */}
      <RowFormation cost={p.cost} t={t} weighted />
      <PriceNotes notes={notes} className="xprice-notes" />
      <FriendCardLine destId={p.id} />
      {onToggleFav && (
        <span className="hs-rcard-save">
          <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} tone="photo" name={p.city} />
        </span>
      )}
    </article>
  );
}

// H12 (T1105): how many cards of the first rails a phone sees before it
// scrolls. Those load eagerly (the first one is the page's largest paint);
// every other card waits for the viewport.
const EAGER_RAILS = 2;
const EAGER_CARDS = 2;

function ExploreRail({ r, onSelect, favorites, onToggleFav, t, month, lang, eager = false, shared = [] }) {
  const shown = r.rows.slice(0, CAP);
  const monthShort = month ? new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(2026, month - 1, 15)) : '';
  // h2: the rails sit straight under the page's h1 (T193). The house rail
  // (G1): the heading, See all and the two round arrows; the lead card's
  // facts and the rail lines went (house style 2026-11, owner: no redundant
  // text): the cards already show the cheapest day, the month and the Score.
  return (
    <HouseRail id={`xrail-${r.key}`} title={r.title} headingLevel={2}
      onSeeAll={r.seeAll} className="xrails-rail">
      {shown.map((p, i) => (
        <PlaceRailCard key={p.id} p={p} railKey={r.key} month={month} monthShort={monthShort}
          onSelect={onSelect} fav={favorites?.has(p.id)} onToggleFav={onToggleFav} t={t}
          eager={eager && i < EAGER_CARDS} shared={shared} />
      ))}
    </HouseRail>
  );
}

/** `hideDoors` (T599): leave out the row of further-rail buttons, for a
 *  page that shows those doors elsewhere (the overview's top). */
export function ExploreRails({
  rails, onSelect, favorites, onToggleFav, t, lead = 4, month = null, hideDoors = false, eager = false,
}) {
  const { lang } = useI18n();
  const visible = rails.filter((r) => r.rows.length >= 4);
  if (!visible.length) return null;
  const strips = visible.slice(0, lead);
  const doors = hideDoors ? [] : visible.slice(lead);
  // A part every card on screen lacks ("Local transport") is said once, in
  // the head over the rails, with the unit (owner rule: no repeated text).
  const shown = strips.flatMap((r) => r.rows.slice(0, CAP));
  const shared = shown.length
    ? priceNotes(shown[0].cost).unmeasured.filter((k) => shown.every((p) => priceNotes(p.cost).unmeasured.includes(k)))
    : [];
  return (
    <div className="xrails">
      <ListHead t={t} notes={shared} />
      {strips.map((r, ri) => (
        <ExploreRail key={r.key} r={r} onSelect={onSelect} favorites={favorites} onToggleFav={onToggleFav} t={t}
          month={month} lang={lang} eager={eager && ri < EAGER_RAILS} shared={shared} />
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
