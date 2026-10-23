import React from 'react';
import { Button, Card } from '../components/ui/index.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { BootIcon, CompassIcon, MusicIcon, SwimIcon, SparkIcon, MapPinIcon } from '../components/Icons.jsx';
import { FeaturePhoto } from './AroundHere.jsx';
import { safeUrl } from '../lib/format.js';
import { activityLink } from '../lib/activityAffiliates.js';
import { tierForScore } from '../lib/rating.js';
import { featureHref, linkOpener } from '../lib/featureHref.js';
import { cleanName, fmtKm } from './destParts.js';
import { doFacts } from '../lib/doFacts.js';
import { notYet } from '../components/NotYet.jsx';

/**
 * The tiles and lists the destination page's tabs share (T499, moved out of
 * DestinationPage.jsx; the rules are T429's and T446's). Every tile that
 * opens a page is a real link with that page's address (row T491-l), and a
 * plain click opens it in place.
 */

const DO_TYPE_ICON = {
  trail: BootIcon, activity: CompassIcon, festival: MusicIcon,
  swim: SwimIcon, experience: SparkIcon,
};

/** An open section: a heading and its body, no toggle (T429). */
export function Section({ id, title, children, className = '' }) {
  return (
    <section className={`dsec2 ${className}`.trim()} id={`sec-${id}`} aria-labelledby={title ? `h-${id}` : undefined}>
      {title && <h2 className="dsec2-title" id={`h-${id}`}>{title}</h2>}
      {children}
    </section>
  );
}

/** The four facts of a thing to do, each with its slot (T632): subcategory,
 *  entry price, visit time and town. A fact the data does not have yet says
 *  so with the shared placeholder, labelled, so the slot is never blank. */
function DoFactSlots({ item, t }) {
  return doFacts(item, t).map((f) => (
    <span key={f.k} data-testid={`do-fact-${f.k}`} className={f.value == null ? 'not-yet' : undefined}>
      {f.value == null
        ? `${f.label}: ${notYet(t)}`
        : f.k === 'kind' ? f.value : `${f.label}: ${f.value}`}
    </span>
  ));
}

/** A thing to do with a photograph, as a tile. An item with a booking link
 *  opens it; an item the catalogue knows opens its page; the rest are text,
 *  with no link styling, so nothing looks clickable that is not (1.4 part 6). */
export function DoTile({ item, t, monthList, onOpenFeature }) {
  const href = item.link && safeUrl(item.link) ? activityLink(safeUrl(item.link), 'dest-do') : null;
  const featHref = !href && item.ref && onOpenFeature ? featureHref(item.ref.layer, item.ref) : null;
  const opener = href
    ? { title: <a className="card-open" href={href} target="_blank" rel="noreferrer">{item.name}</a>, className: 'ddo2 is-interactive' }
    : featHref
      ? { title: item.name, href: featHref, onOpen: linkOpener(() => onOpenFeature(item.ref.layer, item.ref)), className: 'ddo2' }
      : item.ref && onOpenFeature
        ? { title: item.name, onOpen: () => onOpenFeature(item.ref.layer, item.ref), className: 'ddo2' }
        : { title: item.name, className: 'ddo2' };
  return (
    <Card
      layout="tile"
      {...opener}
      media={<img src={item.photo} alt="" loading="lazy" />}
      meta={(
        <span className="dtile-meta">
          <DoFactSlots item={item} t={t} />
          {item.season?.length > 0 && <span>{monthList(item.season)}</span>}
        </span>
      )}
    />
  );
}

/** The things without a photograph: one hairline list, name and kind, two
 *  columns from 680 px (T446). */
export function DoList({ items, t, monthList, onOpenFeature }) {
  if (!items.length) return null;
  return (
    <ul className="ddo-list">
      {items.map((item) => {
        const TypeIcon = DO_TYPE_ICON[item.type] || CompassIcon;
        const href = item.link && safeUrl(item.link) ? activityLink(safeUrl(item.link), 'dest-do') : null;
        const featHref = !href && item.ref && onOpenFeature ? featureHref(item.ref.layer, item.ref) : null;
        const body = (
          <>
            <TypeIcon size={16} className="ddo-list-icon" />
            <span className="ddo-list-main">
              <span className="ddo-list-name">{item.name}</span>
              <span className="ddo-list-meta">
                <DoFactSlots item={item} t={t} />
                {item.season?.length > 0 && <span>{monthList(item.season)}</span>}
              </span>
            </span>
          </>
        );
        return (
          <li key={item.key}>
            {href ? (
              <a className="ddo-list-row" href={href} target="_blank" rel="noreferrer">{body}</a>
            ) : featHref ? (
              <a className="ddo-list-row" href={featHref}
                onClick={linkOpener(() => onOpenFeature(item.ref.layer, item.ref))}>{body}</a>
            ) : item.ref && onOpenFeature ? (
              <Button variant="quiet" block className="ddo-list-row"
                onClick={() => onOpenFeature(item.ref.layer, item.ref)}>{body}</Button>
            ) : (
              <span className="ddo-list-row is-static">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "What to see": the highlights as a hairline list, for a place with no
 *  things to do (1.4 sketch 4.4). Text, not links: a highlight has no page. */
export function SightList({ items, lang }) {
  if (!items.length) return null;
  return (
    <ul className="ddo-list dsee-list">
      {items.map((h, i) => (
        <li key={h.id || `${i}:${h.name}`}>
          <span className="ddo-list-row is-static">
            <MapPinIcon size={16} className="ddo-list-icon" />
            <span className="ddo-list-main">
              <span className="ddo-list-name">{h.name}</span>
              {((h.kind && lang === 'en') || h.dist_km != null) && (
                <span className="ddo-list-meta">
                  {h.kind && lang === 'en' && <span>{h.kind}</span>}
                  {h.dist_km != null && <span>{fmtKm(h.dist_km)}</span>}
                </span>
              )}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A trail, ride, peak, lake or beach in reach, as a tile that is a link to
 *  its own page (row T491-l). */
export function OutdoorTile({ f, t, onOpenFeature }) {
  const ref = { id: f.id, cc: f.cc };
  const href = onOpenFeature ? featureHref(f.layer, ref) : null;
  return (
    <Card
      layout="tile"
      className="dout"
      media={<FeaturePhoto src={f.thumb} lat={f.lat} lon={f.lon} />}
      title={cleanName(f.name)}
      href={href || undefined}
      onOpen={onOpenFeature
        ? (href ? linkOpener(() => onOpenFeature(f.layer, ref)) : () => onOpenFeature(f.layer, ref))
        : undefined}
      meta={(
        <span className="dtile-meta">
          <span>{t(`dest.layerKind.${f.layer}`)}</span>
          {f.km != null && <span>{`${fmtKm(f.km)}${f.bearing ? ` ${f.bearing}` : ''}`}</span>}
          {f.km_len != null && <span>{t('dest.trackLong', { km: Math.round(f.km_len) })}</span>}
        </span>
      )}
      rating={f.score != null ? <ScoreChip rating={{ score: f.score, tier: f.tier ?? 0 }} size="sm" /> : null}
    />
  );
}

/** A day trip: a catalogue place (a link to its page) or a composed trip. */
export function TripTile({ tr, t, onSelect, onOpenItin }) {
  const itin = tr.kind === 'composed_trip';
  const opener = itin
    ? (onOpenItin ? { onOpen: () => onOpenItin(tr.id) } : {})
    : { href: featureHref('dest', tr), onOpen: linkOpener(() => onSelect?.(tr.id)) };
  return (
    <Card
      layout="tile"
      className="dtrip2"
      {...opener}
      media={<FeaturePhoto src={tr.image?.url} lat={tr.lat} lon={tr.lon} />}
      title={cleanName(tr.name)}
      meta={(
        <span className="dtile-meta">
          {itin ? (
            <span>{t('dest.tripDays', { n: tr.days || 0 })}</span>
          ) : tr.travel?.minutes != null && (
            // A time from the trip model, not a routed one, is an estimate
            // and says so (T446).
            <span>
              {tr.travel.source === 'routed'
                ? t('dest.minutesBy', { n: tr.travel.minutes, mode: t(`mode.${tr.travel.mode}`) })
                : `~${t('dest.minutesBy', { n: tr.travel.minutes, mode: t(`mode.${tr.travel.mode}`) })} ${t('money.est')}`}
            </span>
          )}
          {tr.dist_km != null && <span>{`${tr.dist_km} km`}</span>}
        </span>
      )}
      rating={tr.rating?.score != null
        ? <ScoreChip rating={{ score: tr.rating.score, tier: tierForScore(tr.rating.score) }} size="sm" />
        : null}
    />
  );
}
