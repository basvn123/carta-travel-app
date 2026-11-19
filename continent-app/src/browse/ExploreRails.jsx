import React, { useId } from 'react';
import { Button, Rail as HouseRail } from '../components/ui/index.js';
import { HouseIcon } from '../components/HouseIcons.jsx';
import '../styles/85-explore-rails.css';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { openShared } from '../lib/sharedElement.js';
import { countryName } from '../lib/countryName.js';
import { useI18n } from '../i18n/index.jsx';
import { SaveButton } from './ExploreCards.jsx';
import { PlaceScore, RowFormation } from './explore/HouseParts.jsx';
import { FriendCardLine } from '../together/signals.jsx';
import { monthName } from '../lib/dates.js';
import { STORY_MAX, RAIL_CARD_SIZES } from './StoryRail.jsx';

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

// Explore rails (owner 2026-11-18, "scroll a lot horizontally"): sixteen
// places a strip, then the See all tile (it was twelve).
const CAP = 16;

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
 *  the weighted formation (its figure with the unit) and the friends line. */
// G12, D10 (audit-perf.md cause 4): memoised, so a rail redraw (a typed
// letter, a saved place, a tab hop) redraws only the cards whose place, save
// state or month changed. Every prop is a value or a stable callback.
const PlaceRailCard = React.memo(function PlaceRailCard({ p, railKey, month, monthShort, onSelect, fav, onToggleFav, t, eager = false }) {
  const goodNow = !MONTH_RAILS.has(railKey) && inMonth(p, month);
  const gem = !goodNow && railKey !== 'gems' && p.rating?.hidden_gem;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  // Explore rails (owner 2026-11-18, "cleaner and clearer under the image"):
  // three lines in a grid. The name, its Score and the day figure share the
  // first line, so the price is read with the place, not on a line of its
  // own; the flag and country follow; then the parts of that figure (bed
  // plus food) and the return fare apart. The link is the photo, stretched
  // over the whole card (the list row's pattern), so the figure and the
  // parts can be buttons beside it: a button never nests in a link.
  return (
    <article className="hs-rcard xstory xrc" role="listitem">
      <a className="hs-rcard-link" href={`#dest=${encodeURIComponent(p.id)}`}
        aria-labelledby={`${uid}-n ${uid}-w`}
        onClick={(e) => {
          // A real link (T444): a plain click opens the place here, a
          // modifier click lets the browser open it in a new tab.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          openShared(e.currentTarget.closest('.hs-rcard'), p.id, () => onSelect(p.id));
        }}>
        <span className="hs-rcard-photo">
          <HeroImage url={p.image} image={p.photo} city={p.city} iso2={p.iso2} className="xrc-img" maxWidth={STORY_MAX}
            sizes={RAIL_CARD_SIZES} ratio={[4, 3]} eager={eager} />
        </span>
      </a>
      <div className="xrc-head">
        <span className="hs-rcard-name" id={`${uid}-n`}>{p.city}</span>
        <PlaceScore rating={p.rating} />
        {/* G12, D10: the figure says its unit and opens the price sheet. */}
        <RowFormation cost={p.cost} t={t} pressable place={p} slot="figure" className="xrc-fig" />
      </div>
      <span className="hs-rcard-where" id={`${uid}-w`}>
        <CountryFlag country={p.iso2} size={12} />
        <span className="xrc-country">{countryName(p.iso2, p.country)}</span>
        {goodNow && <span className="xrc-status">{t('rail.goodIn', { month: monthShort })}</span>}
        {gem && <span className="hs-gem">{t('common.hiddenGem')}</span>}
      </span>
      {/* The parts: each wagon a button to the price sheet; a thin bed is
          a dot on the bed wagon. */}
      <RowFormation cost={p.cost} t={t} pressable place={p} slot="parts" className="xrc-parts" />
      <FriendCardLine destId={p.id} />
      {onToggleFav && (
        <span className="hs-rcard-save">
          <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} tone="photo" name={p.city} />
        </span>
      )}
    </article>
  );
});

/**
 * The rail's last tile (Explore rails, owner 2026-11-18: "See all must be
 * cleaner, more beautiful, more custom"). A traveller who scrolled to the
 * end of a strip wants more of the same, so the strip ends on a door the
 * size of a photo: the next places' photos as a row of round faces, "See
 * all" and the rail's name, and the umber arrow disc the head's See all
 * wears. One press opens what the head's See all opens.
 */
function SeeAllTile({ r, rest, t }) {
  const faces = rest.filter((p) => p.image || p.photo).slice(0, 3);
  return (
    <article className="hs-rcard xrc-more" role="listitem">
      <Button variant="quiet" className="xrc-more-btn" onClick={r.seeAll}
        aria-label={t('rail.seeAllNamed', { title: r.title })}>
        {faces.length > 0 && (
          <span className="xrc-more-faces" aria-hidden="true">
            {faces.map((p) => (
              <span key={p.id} className="xrc-more-face">
                <HeroImage url={p.image} image={p.photo} city={p.city} iso2={p.iso2} maxWidth={160}
                  sizes="64px" ratio={[1, 1]} />
              </span>
            ))}
          </span>
        )}
        <span className="xrc-more-text" aria-hidden="true">
          <span className="xrc-more-word">{t('rail.seeAllPlain')}</span>
          <span className="xrc-more-title">{r.title}</span>
        </span>
        <span className="hs-go-disc is-lg" aria-hidden="true"><HouseIcon.next size={20} /></span>
      </Button>
    </article>
  );
}

// H12 (T1105): how many cards of the first rails a phone sees before it
// scrolls. Those load eagerly (the first one is the page's largest paint);
// every other card waits for the viewport.
const EAGER_RAILS = 2;
const EAGER_CARDS = 2;

const ExploreRail = React.memo(function ExploreRail({ r, onSelect, favorites, onToggleFav, t, month, lang, eager = false }) {
  const shown = r.rows.slice(0, CAP);
  const monthShort = month ? monthName(month, lang, false) : '';
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
          eager={eager && i < EAGER_CARDS} />
      ))}
      {r.seeAll && <SeeAllTile r={r} rest={r.rows.slice(CAP)} t={t} />}
    </HouseRail>
  );
});

// The latest callback behind a stable identity: the parents' open and save
// handlers change with the search hits, and a new identity would redraw every
// memoised card on each typed letter.
function useStableCallback(fn) {
  const ref = React.useRef(fn);
  React.useLayoutEffect(() => { ref.current = fn; });
  return React.useCallback((...a) => ref.current?.(...a), []);
}

/** `hideDoors` (T599): leave out the row of further-rail buttons, for a
 *  page that shows those doors elsewhere (the overview's top). */
export function ExploreRails({
  rails, onSelect, favorites, onToggleFav, t, lead = 4, month = null, hideDoors = false, eager = false,
}) {
  const { lang } = useI18n();
  const select = useStableCallback(onSelect);
  const toggleFav = useStableCallback(onToggleFav);
  const visible = rails.filter((r) => r.rows.length >= 4);
  if (!visible.length) return null;
  const strips = visible.slice(0, lead);
  const doors = hideDoors ? [] : visible.slice(lead);
  // G12, D10 (owner, 2026-11-17): no head line over the rails. Each figure
  // says its unit; "Local transport: not yet measured" lives in what the
  // figure opens, inside the price it explains.
  return (
    <div className="xrails">
      {strips.map((r, ri) => (
        <ExploreRail key={r.key} r={r} onSelect={select} favorites={favorites} onToggleFav={onToggleFav ? toggleFav : null} t={t}
          month={month} lang={lang} eager={eager && ri < EAGER_RAILS} />
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
