import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import {
  ClockIcon, RouteIcon, MountainIcon, BootIcon, SunIcon, SwimIcon, ShieldIcon, RoadIcon,
  BikeIcon, CalendarIcon, LakeIcon, CompassIcon, MapPinIcon, BusIcon, ListDayIcon, BedIcon,
  BeachIcon, GondolaIcon, LoopIcon, TrainIcon, FriendsIcon, PlaneIcon,
} from '../components/Icons.jsx';

/**
 * The fact band of a detail page (T386, rebuilt T430; carta-design "Detail
 * page grammar").
 *
 * Four to six facts, open, directly under the head: a 16 px line icon, the
 * label over the value, the value in tabular figures with its unit. No card,
 * no colour, no control: it is what a traveller decides on, so nothing about
 * it folds. The cells come from lib/detailSkeleton.js keyFactCells, which
 * keeps the page's order and leaves a missing fact out (T430: never "Not
 * recorded").
 *
 * A cell may carry `note`, one short line under the value, and `icon`, a key
 * of FACT_ICONS when its own key does not name the right drawing. `lead` is
 * one verdict that leads the band in its own words (the lake's swim verdict,
 * which can hurt somebody and so is never a cell among others). `foot` is
 * one visible line under the band for a mark the cells carry.
 */
export const FACT_ICONS = {
  time: ClockIcon, hours: ClockIcon,
  km: RouteIcon, dist: RouteIcon, length: RouteIcon, distance: RouteIcon,
  asc: MountainIcon, ascent: MountainIcon, climb: MountainIcon, elev: MountainIcon, descent: MountainIcon,
  high: MountainIcon, peak: MountainIcon, ele: MountainIcon, prom: MountainIcon, highest: MountainIcon,
  way: BootIcon, waymarked: BootIcon, diff: BootIcon,
  season: SunIcon, months: SunIcon,
  water: SwimIcon, swim: SwimIcon,
  lifeguard: ShieldIcon,
  surface: RoadIcon, paved: RoadIcon,
  bike: BikeIcon,
  days: CalendarIcon,
  area: LakeIcon, depth: LakeIcon, lake: LakeIcon,
  faces: CompassIcon, iso: CompassIcon,
  access: MapPinIcon, start: MapPinIcon, gateway: MapPinIcon,
  stops: BusIcon, transit: TrainIcon,
  stages: ListDayIcon,
  sleep: BedIcon, beds: BedIcon,
  beach: BeachIcon, sand: BeachIcon,
  lift: GondolaIcon,
  loop: LoopIcon,
  // T912, T913: the place and trip pages' facts row.
  crowds: FriendsIcon, sights: ClockIcon, around: BusIcon, airport: PlaneIcon, fly: PlaneIcon,
  bases: MapPinIcon, best: SunIcon,
};

export function KeyFacts({ cells, lead = null, foot = null, className = '' }) {
  const { t } = useI18n();
  const hasCells = Array.isArray(cells) && cells.length > 0;
  if (!hasCells && !lead) return null;
  return (
    <section className={`dsk-keyfacts ${className}`.trim()} id="dsk-sec-facts" data-slot="keyfacts" aria-label={t('detail.keyFacts')}>
      {lead}
      {hasCells && (
        <dl className="dsk-kf-list">
          {cells.map((c) => {
            const Icon = FACT_ICONS[c.icon || c.key] || null;
            return (
              <div key={c.key} className="dsk-kf" data-fact={c.key}>
                <dt className="dsk-kf-label">
                  {Icon && <span className="dsk-kf-icon" aria-hidden="true"><Icon size={16} /></span>}
                  <span>{c.label}</span>
                </dt>
                <dd className={`dsk-kf-value${c.mono ? ' mono' : ''}`}>
                  {c.value}
                  {c.note ? <span className="dsk-kf-note">{c.note}</span> : null}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {foot ? <p className="dsk-kf-foot">{foot}</p> : null}
    </section>
  );
}

export default KeyFacts;
