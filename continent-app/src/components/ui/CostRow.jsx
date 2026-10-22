/*
 * CostRow and CostSum (T537): the one line every price breakdown draws.
 *
 * Before this the app had five ways to lay out "a label and a figure" (the
 * receipt card's .frr-line, the budget receipt's copy of it, the planner's
 * .plan-line, the trip card's .tprice-line and the Explore hover's .cost-row),
 * with different label sizes, figure weights and no icons on most of them.
 * Now there is one: an icon for what the money buys, the label with an
 * optional second line, and the figure right aligned in tabular numerals.
 *
 *   <dl className="costrows">
 *     <CostRow kind="bed" label="Bed" sub="7 nights" value={<Money value={862.36} precision="cents" />} />
 *     <CostSum label="Total for 2 people" value={...} each="..." />
 *   </dl>
 *
 * kind     what the line pays for; picks the icon (COST_ICON below), and a
 *          line with no kind draws no icon and keeps the label aligned
 * tone     'yours' (the traveller's own figure) or 'missing' (not priced,
 *          the value is words in --text-2, never an amount)
 * Styles: src/styles/04-ui.css (.costrows, .costrow, .costsum).
 */
import React from 'react';
import {
  BedIcon, DiningIcon, BusIcon, TrainIcon, CarIcon, TicketIcon, PiggyIcon, RouteIcon, FerryIcon,
} from '../Icons.jsx';
import { PlaneIcon } from '../TransportIcons.jsx';

// eslint-disable-next-line react-refresh/only-export-components -- the icon table is part of the primitive's contract
export const COST_ICON = {
  bed: BedIcon,
  beds: BedIcon,
  stay: BedIcon,
  food: DiningIcon,
  days: DiningIcon,
  ground: DiningIcon,
  flight: PlaneIcon,
  out: PlaneIcon,
  back: PlaneIcon,
  there: RouteIcon,
  travel: RouteIcon,
  transfers: BusIcon,
  local: BusIcon,
  between: TrainIcon,
  train: TrainIcon,
  bus: BusIcon,
  ferry: FerryIcon,
  fly: PlaneIcon,
  drive: CarIcon,
  car: CarIcon,
  tickets: TicketIcon,
  buffer: PiggyIcon,
};

export function CostRow({ kind = null, label, sub = null, value, tone = null, mark = null, className = '' }) {
  const Icon = kind ? COST_ICON[kind] : null;
  const cls = ['costrow', tone && `is-${tone}`, className].filter(Boolean).join(' ');
  return (
    <div className={cls} data-line={kind || undefined}>
      <dt>
        <span className="costrow-icon" aria-hidden="true">{Icon ? <Icon size={18} /> : null}</span>
        <span className="costrow-text">
          <span className="costrow-label">{label}</span>
          {sub && <span className="costrow-sub">{sub}</span>}
        </span>
      </dt>
      <dd>
        {mark && <span className="costrow-mark">{mark}</span>}
        {value}
      </dd>
    </div>
  );
}

/** The sum under the lines: a 2px ink rule above, the figure at the title
 *  size, and the per-person figure under it when there is a party. */
export function CostSum({ label, value, each = null, live = true, className = '' }) {
  return (
    <div className={`costrow costsum ${className}`.trim()}>
      <dt><span className="costrow-label">{label}</span></dt>
      <dd>
        <span className="costsum-fig" aria-live={live ? 'polite' : undefined}>{value}</span>
        {each && <span className="costsum-each">{each}</span>}
      </dd>
    </div>
  );
}
