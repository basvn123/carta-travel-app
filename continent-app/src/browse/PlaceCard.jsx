import React from 'react';
import {
  MapPinIcon, LoopIcon, MountainIcon, LakeIcon, BeachIcon, TreeIcon, CastleIcon,
  CameraIcon, VillageIcon, HomeIcon, TrainIcon, ShieldIcon, SunIcon, CoffeeIcon,
  LeafIcon, SwimIcon, BootIcon, GondolaIcon, DiningIcon,
} from '../components/Icons.jsx';
import { thumbAt, isResizable } from '../lib/heroImage.js';
import { openShared } from '../lib/sharedElement.js';

/*
 * PlaceCard, the one card (spec 5.1, T179).
 *
 * Beaches, lakes, mountains, cycle routes and walks all draw through this
 * frame; lib/cardFillings.js decides what goes in it. Top to bottom:
 *
 *   the band   a 16:9 photograph, rounded top corners only, and the
 *              section's 6 px data strip along its bottom edge (CardStrip).
 *              Nothing else sits on the photograph (T394, carta-design
 *              "Caption band"): the seal and the small facts that used to
 *              ride its corners are in the body now.
 *   the body   the name in Fraunces with a mono ref chip and the ochre
 *              rating seal at the end of the same row, the place line, the
 *              hook on one line led by the small facts (distance from a
 *              searched place, a swimming verdict, a lift, whose photograph
 *              it is), exactly three measured values, an optional month
 *              line, and up to three 20 px icons
 *
 * The outer element keeps each section's old class (.places-bcard,
 * .places-lcard, .places-mcard, .places-tcard, the cycle test ids) and the
 * inner classes the layer harnesses read (.places-card-name,
 * .places-bcard-where, .places-bcard-tags, .places-card-facts, ...), so a
 * harness that found a beach card before finds the same card now.
 *
 * Every row is a fixed height in 37-card-fillings.css, so every card in a
 * grid is the same height whatever its filling, and the skeleton below, built
 * from the same rows, is the card's final size before the data arrives.
 */

// The three widths spec 5.2 names. All three are on Wikimedia's renderable
// list (lib/heroImage.js WIKI_WIDTHS), which is the only reason they work.
const CARD_WIDTHS = [500, 960, 1280];

// What the band is drawn at: the full column less the 16 px gutters under
// 640 px, about half the column up to 1039 px, a third of the list column
// above it (the list sits beside the desktop panel, so a third of the window
// overstates it; capped where the grid stops growing).
const PLACE_CARD_SIZES = '(max-width: 639px) calc(100vw - 32px), (max-width: 1039px) 47vw, min(26vw, 370px)';

function cardSrcSet(url) {
  if (!isResizable(url)) return undefined;
  return CARD_WIDTHS.map((w) => `${thumbAt(url, w)} ${w}w`).join(', ');
}

/** The photograph in the band, lazy, with the 500/960/1280 ladder. */
export function PlaceCardPhoto({ url }) {
  if (!url) return null;
  return (
    <img
      className="places-card-img"
      src={thumbAt(url, CARD_WIDTHS[0])}
      srcSet={cardSrcSet(url)}
      sizes={PLACE_CARD_SIZES}
      alt=""
      width={16}
      height={9}
      loading="lazy"
      decoding="async"
    />
  );
}

/** The band with nothing to show: paper, no glyph pretending to be a photo. */
export function PlaceCardNoPhoto({ children = null }) {
  return (
    <span className="places-card-img places-card-noimg" aria-hidden="true">{children}</span>
  );
}

const GLYPH = {
  loop: LoopIcon,
  summit: MountainIcon,
  lake: LakeIcon,
  coast: BeachIcon,
  forest: TreeIcon,
  castle: CastleIcon,
  viewpoint: CameraIcon,
  village: VillageIcon,
  hut: HomeIcon,
  rail: TrainIcon,
  lifeguard: ShieldIcon,
  sunset: SunIcon,
  services: CoffeeIcon,
  protected: LeafIcon,
  swim: SwimIcon,
  walks: BootIcon,
  lift: GondolaIcon,
  food: DiningIcon,
};

/**
 * @param className  the section's own card class, kept for the harnesses
 * @param testId     data-testid, where a harness reads one
 * @param media      the photograph (PlaceCardPhoto) or a drawn stand-in
 * @param seal       the rating chip, or the "not scored" word, at the end of
 *                   the name row
 * @param strip      the 6 px data strip (CardStrip), or null
 * @param lead       small facts that lead the hook line, each
 *                   { key, text, cls }: the classes stay what the harnesses
 *                   read (.places-card-km, .places-lcard-swim, ...)
 * @param fill       a filling from lib/cardFillings.js
 * @param hookClass  the class the hook's wrapper keeps for the harnesses
 * @param note       the month line (rule "Month"): undefined draws no row,
 *                   null an empty row of the same height, so every card in
 *                   a grid keeps one height while a month is set
 * @param foot       anything that rides at the end of the icon row
 * @param sharedKey  the key the opened page claims its header photograph
 *                   with (DetailSkeleton's hero.sharedKey); when given, the
 *                   card's photograph grows into the page (lib/sharedElement)
 */
export const PlaceCard = React.memo(function PlaceCard({
  className = '', testId, onClick, media, seal = null, strip = null,
  lead = null, fill, hookClass = 'places-bcard-tags', foot = null, note,
  sharedKey = null,
}) {
  const { title, ref, where, hook = [], values = [], icons = [], gem = null } = fill;
  const parts = [
    ...(lead || []).filter((l) => l && l.text).map((l) => ({ ...l, lead: true })),
    ...hook,
  ];
  const open = sharedKey == null
    ? onClick
    : (e) => openShared(e.currentTarget, sharedKey, () => onClick?.(e));
  return (
    <button type="button" className={`pcard ${className}`} data-testid={testId} onClick={open}>
      <span className="pcard-band">
        {media}
        {strip}
      </span>
      <span className="pcard-body">
        <span className="pcard-head">
          <span className="places-card-name pcard-title">{title}</span>
          {ref && <span className="pcard-ref">{ref}</span>}
          {seal && <span className="pcard-seal">{seal}</span>}
        </span>
        <span className="pcard-where places-bcard-where">
          {where && <MapPinIcon size={13} />}
          {where && <span className="pcard-where-text">{where}</span>}
        </span>
        <span className={`pcard-hook ${hookClass}`}>
          {parts.map((h, i) => (
            <React.Fragment key={h.key || i}>
              {i > 0 ? ', ' : null}
              <span className={[h.cls, h.lead ? 'pcard-lead' : null].filter(Boolean).join(' ') || undefined}
                title={h.title}>
                {h.text}
                {h.est ? <i aria-hidden="true">~</i> : null}
              </span>
            </React.Fragment>
          ))}
        </span>
        <span className="pcard-values places-card-facts">
          {values.map((v) => (
            <span key={v.key} className={`pcard-v${v.none ? ' is-none' : ''}`}>
              <span className={`pcard-v-n${v.cls ? ` ${v.cls}` : ''}`} title={v.none ? undefined : v.title}>{v.value}</span>
              <span className="pcard-v-l" title={v.label}>{v.label}</span>
            </span>
          ))}
        </span>
        {note !== undefined && <span className="pcard-note">{note}</span>}
        <span className="pcard-foot">
          <span className="pcard-icons">
            {icons.map((ic) => {
              const Glyph = GLYPH[ic.code];
              if (!Glyph) return null;
              return (
                <span key={ic.code} className={`pcard-icon${ic.cls ? ` ${ic.cls}` : ''}`}
                  role="img" aria-label={ic.label} title={ic.label}>
                  <Glyph size={20} />
                </span>
              );
            })}
          </span>
          {gem && <span className="pcard-gem">{gem}</span>}
          {foot}
        </span>
      </span>
    </button>
  );
});

/**
 * The loading state of a card grid: cards at their final size on
 * --paper-dim, never a spinner and never three dots. Built from the card's
 * own rows, so nothing moves when the real cards replace them. Still, not
 * breathing (T394, carta-design "Loading": no shimmer, nothing loops).
 */
export function PlaceCardSkeletons({ n = 6, label }) {
  return (
    <>
      <span className="sr-only" role="status">{label}</span>
      {Array.from({ length: n }, (_, i) => (
        <span className="pcard pcard-skel" aria-hidden="true" key={i}>
          <span className="pcard-band" />
          <span className="pcard-body">
            <span className="pcard-head"><span className="pcard-skel-bar is-title" /></span>
            <span className="pcard-where"><span className="pcard-skel-bar is-where" /></span>
            <span className="pcard-hook"><span className="pcard-skel-bar is-hook" /></span>
            <span className="pcard-values">
              <span className="pcard-skel-bar" />
              <span className="pcard-skel-bar" />
              <span className="pcard-skel-bar" />
            </span>
            <span className="pcard-foot" />
          </span>
        </span>
      ))}
    </>
  );
}
