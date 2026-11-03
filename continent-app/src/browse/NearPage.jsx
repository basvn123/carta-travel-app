import React from 'react';
import { createPortal } from 'react-dom';
import { Chip, ChipGroup, Segmented } from '../components/ui/index.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CLASS_KEY as WATER_KEY } from '../components/WaterQualityBadge.jsx';
import { natureRating } from '../lib/rating.js';
import { featureHref, linkOpener } from '../lib/featureHref.js';
import { trailClimbUp, gradeLabelKey } from '../lib/trailStory.js';
import { clock } from '../lib/routeEffort.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { FeaturePhoto } from './AroundHere.jsx';
import { StoryCard } from './StoryRail.jsx';
import { PageBar } from './PageBar.jsx';
import { cleanName, fmtKm } from './destParts.js';

/**
 * One kind's own page from a place (T1033, owner: "the tabs must lead to a
 * totally new designed page ... with the details right"): Walks near
 * Geneva, Lakes near Ljubljana. Over the place page in its frame (.destp),
 * the bar going back to the place.
 *
 *   the title and how many there are, within what reach
 *   how far, as plain steps (each shown only where it changes the list; the
 *   widest names the rows' real reach), and Nearest / Best rated
 *   every place of the kind as the Explore card (StoryCard: the photograph
 *   with its pills, the words on the page under it), its facts and its
 *   distance; the card opens the place's own page
 */

/** Distance steps over each row's distance from the centre. */
const RADII = [5, 10, 25];

/** The facts a kind is chosen on (the registry's `facts` style), then how
 *  far and which way; a fact the row lacks is left out. */
function kindFacts(f, style, t) {
  const bits = [];
  if (style === 'route') {
    if (f.km_len != null) bits.push(t('dest.trackLong', { km: Math.round(f.km_len) }));
    const up = trailClimbUp(f);
    if (up != null && up >= 20) bits.push(t('dest.ascentUp', { m: Math.round(up) }));
    const mins = f.duration_min ?? f.dur?.min;
    if (mins != null) bits.push(clock(mins));
  } else if (style === 'height' && f.elev_m != null) {
    bits.push(t('ar.high', { m: Math.round(f.elev_m).toLocaleString(t.lang || 'en') }));
  }
  if (f.km != null) bits.push(`${fmtKm(f.km)}${f.bearing ? ` ${f.bearing}` : ''}`);
  return bits.join(', ');
}

/** The pill on the photograph: a route's grade, or the bathing water. */
function kindStatus(f, style, t) {
  if (style === 'route') {
    const g = gradeLabelKey(f);
    return g ? t(g) : null;
  }
  if (style === 'water' && WATER_KEY[f.water]) return t('ar.water', { q: t(WATER_KEY[f.water]) });
  return null;
}

export function NearPage({ cat, city, t, onOpenFeature, onClose }) {
  const panelRef = React.useRef(null);
  const backRef = React.useRef(null);
  useFocusTrap(panelRef, onClose, { initialFocusRef: backRef });
  const [radius, setRadius] = React.useState(null);
  const [sort, setSort] = React.useState('near');

  const near = [...cat.all].sort((x, y) => (x.km ?? 99) - (y.km ?? 99));
  const reach = Math.ceil(Math.max(0, ...near.map((f) => f.km ?? 0)));
  const steps = [];
  let above = near.length;
  for (const km of [...RADII].reverse()) {
    const n = near.filter((f) => f.km != null && f.km <= km).length;
    if (km < reach && n > 0 && n < above) { steps.unshift(km); above = n; }
  }
  const r = steps.includes(radius) ? radius : null;
  const shown = (r == null ? near : near.filter((f) => f.km != null && f.km <= r));
  const rows = sort === 'best'
    ? [...shown].sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || (x.km ?? 99) - (y.km ?? 99))
    : shown;
  const kind = t(`dest.aroundKind.${cat.key}`);
  const title = t('ar.near', { kind, city });

  return createPortal(
    <div ref={panelRef} className="destp pt-page near-page" role="dialog" aria-modal="true" aria-labelledby="near-h">
      <PageBar t={t} backLabel={city} onBack={onClose} backRef={backRef} name={title} nameOn />
      <div className="destp-scroll pt-scroll">
        <div className="pt-wrap near-wrap">
          <header className="near-head">
            <h1 id="near-h" className="near-title">{title}</h1>
            <p className="near-sub">{t('ar.nearSub', { n: rows.length, km: r ?? reach })}</p>
          </header>
          <div className="near-tools">
            {steps.length > 0 && (
              <ChipGroup label={t('ar.howFar')} className="ar-radius">
                {steps.map((km) => (
                  <Chip key={km} kind="choice" selected={r === km} onClick={() => setRadius(km)}>{t('ar.within', { km })}</Chip>
                ))}
                <Chip kind="choice" selected={r == null} onClick={() => setRadius(null)}>{t('ar.within', { km: reach })}</Chip>
              </ChipGroup>
            )}
            {rows.some((f) => f.score != null) && (
              <Segmented size="sm" label={t('ar.sort')} value={sort} onChange={setSort} className="near-sort"
                options={[{ value: 'near', label: t('ar.sortNear') }, { value: 'best', label: t('ar.sortBest') }]} />
            )}
          </div>
          <div className="storyr near-grid">
            {rows.map((f) => {
              const ref = { id: f.id, cc: f.cc };
              const href = onOpenFeature ? featureHref(f.layer, ref) : null;
              const rating = natureRating(f);
              return (
                <StoryCard key={f.key}
                  photo={<FeaturePhoto src={f.thumb} lat={f.lat} lon={f.lon} />}
                  status={kindStatus(f, cat.facts, t)}
                  score={rating?.score != null ? <ScoreChip rating={rating} size="sm" /> : null}
                  title={cleanName(f.name)}
                  href={href || undefined}
                  onOpen={onOpenFeature
                    ? (href ? linkOpener(() => onOpenFeature(f.layer, ref)) : () => onOpenFeature(f.layer, ref))
                    : undefined}
                  meta={kindFacts(f, cat.facts, t)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
