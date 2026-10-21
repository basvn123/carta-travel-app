import React, { useEffect, useState } from 'react';
import { MapPinIcon } from '../components/Icons.jsx';
import { thumbAt, isResizable } from '../lib/heroImage.js';
import { openShared } from '../lib/sharedElement.js';
import { useI18n } from '../i18n/index.jsx';
import { Card } from '../components/ui/index.js';

/*
 * PlaceCard, the one card of the Destinations lists (spec 5.1, T179; on the
 * kit Card since T428).
 *
 * Beaches, lakes, mountains, cycle routes and walks all draw through this
 * frame; lib/cardFillings.js decides what goes in it. Since T452 it is the
 * kit's compact row Card (components/ui/Card.jsx), the way Explore draws its
 * list: a 72 px square photograph, the name with the Score beside it, where
 * it is, two measured values, and one line of what it is like (a swimming
 * verdict, a lift, how far from a searched place). The photo tiles stay in
 * the rails above the list, where inspiration leads.
 *
 * What T428 took off (owner, 2026-10-14, "the trail stack also needs to
 * go"): the 6 px data strip under the photograph and the key sentence that
 * explained it, the mono reference chip, and the row of 20 px glyphs, which
 * carried no key (row T444-e). The props stay, so a caller that passes a
 * strip or icons still renders; they are simply not drawn.
 *
 * The outer element keeps each section's old class (.places-bcard,
 * .places-lcard, .places-mcard, .places-tcard, the cycle test ids) and the
 * name keeps .places-card-name, so the layer harnesses find the same card.
 */

// The list is compact rows since T452 (the owner's row decision of
// 2026-10-13, as Explore draws its list): a 72 px square photograph, so the
// two smallest widths on Wikimedia's renderable list are all it needs (250
// covers a 2x screen, the size Explore's rows ask for).
const CARD_WIDTHS = [250, 500];
const PLACE_CARD_SIZES = '72px';

function cardSrcSet(url) {
  if (!isResizable(url)) return undefined;
  return CARD_WIDTHS.map((w) => `${thumbAt(url, w)} ${w}w`).join(', ');
}

/** The photograph, lazy, square. */
export function PlaceCardPhoto({ url }) {
  if (!url) return null;
  return (
    <img
      className="places-card-img"
      src={thumbAt(url, CARD_WIDTHS[0])}
      srcSet={cardSrcSet(url)}
      sizes={PLACE_CARD_SIZES}
      alt=""
      width={1}
      height={1}
      loading="lazy"
      decoding="async"
    />
  );
}

/** No photograph: the sunken ground, never a glyph pretending to be one. */
export function PlaceCardNoPhoto({ children = null }) {
  return (
    <span className="places-card-img places-card-noimg" aria-hidden="true">{children}</span>
  );
}

/**
 * @param className  the section's own card class, kept for the harnesses
 * @param testId     data-testid, where a harness reads one
 * @param media      the photograph (PlaceCardPhoto) or a drawn stand-in
 * @param seal       the Score, or the "not scored" word
 * @param lead       small facts that lead the hook line, each { key, text, cls }
 * @param fill       a filling from lib/cardFillings.js
 * @param hookClass  the class the hook's wrapper keeps for the harnesses
 * @param note       the month line, when the traveller has a month of their own
 * @param foot       a price, where the card has one (a city day)
 * @param sharedKey  the key the opened page claims its header photograph with
 */
export const PlaceCard = React.memo(function PlaceCard({
  className = '', testId, onClick, media, seal = null,
  lead = null, fill, hookClass = 'places-bcard-tags', foot = null, note,
  sharedKey = null,
}) {
  const { title, where, hook = [], values = [], icons = [], gem = null } = fill;
  // The glyph row is gone (T428), but whether a walk or a ride comes back to
  // where it started is a fact people choose by, so it leads the line in words.
  const loop = icons.find((ic) => ic.code === 'loop');
  const parts = [
    ...(lead || []).filter((l) => l && l.text).map((l) => ({ ...l, lead: true })),
    ...(loop ? [{ key: 'loop', cls: 'places-card-loop', text: loop.label }] : []),
    ...hook,
  ].slice(0, 3);
  const open = (e) => {
    const card = e.currentTarget.closest('.card');
    if (sharedKey == null) onClick?.(e);
    else openShared(card, sharedKey, () => onClick?.(e));
  };
  // A row holds what decides a click and no more (T452, owner 2026-10-15:
  // "just enough to attract them"): two measured values, then up to three
  // words of what it is like. The page holds the rest.
  const shown = values.filter((v) => !v.none).slice(0, 2);
  if (gem) parts.push({ key: 'gem', cls: 'pcard-gem', text: gem });
  return (
    <Card
      layout="row"
      className={`pcard ${className}`.trim()}
      data-testid={testId}
      media={media}
      title={<span className="places-card-name pcard-title">{title}</span>}
      onOpen={open}
      rating={seal}
      price={foot}
      meta={(
        <span className="pcard-body">
          {where && (
            <span className="pcard-where places-bcard-where">
              <MapPinIcon size={13} />
              <span className="pcard-where-text">{where}</span>
            </span>
          )}
          {shown.length > 0 && (
            <dl className="pcard-values places-card-facts">
              {shown.map((v) => (
                <div key={v.key} className="pcard-v">
                  <dt className="pcard-v-l">{v.label}</dt>
                  <dd className={`pcard-v-n${v.cls ? ` ${v.cls}` : ''}`} title={v.title}>{v.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {parts.length > 0 && (
            <span className={`pcard-hook ${hookClass}`}>
              {parts.map((h, i) => (
                <React.Fragment key={h.key || i}>
                  {i > 0 ? ', ' : null}
                  <span className={['pcard-part', h.cls, h.lead ? 'pcard-lead' : null].filter(Boolean).join(' ')}
                    title={h.title}>
                    {h.text}
                  </span>
                </React.Fragment>
              ))}
            </span>
          )}
          {note ? <span className="pcard-note">{note}</span> : null}
        </span>
      )}
    />
  );
});

/**
 * The loading state of a card grid: cards at their final shape on the
 * sunken ground, never a spinner. Still, not breathing.
 */
// A skeleton still on screen after this long gets one line that says so
// (brief V5-5): a slow layer is not a failed one.
const SLOW_AFTER_MS = 5000;

export function PlaceCardSkeletons({ n = 6, label }) {
  const { t } = useI18n();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(id);
  }, []);
  return (
    <>
      <span className="sr-only" role="status">{slow ? t('layer.slow') : label}</span>
      {slow && <p className="places-slow" aria-hidden="true">{t('layer.slow')}</p>}
      {Array.from({ length: n }, (_, i) => (
        <span className="card card-row pcard pcard-skel" aria-hidden="true" key={i}>
          <span className="card-media" />
          <span className="card-body">
            <span className="pcard-skel-bar is-title" />
            <span className="pcard-skel-bar is-where" />
            <span className="pcard-skel-bar is-hook" />
          </span>
        </span>
      ))}
    </>
  );
}
