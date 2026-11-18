import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { ratingWords } from '../../lib/rating.js';
import { formatApprox, formatMoney } from '../../lib/money.js';
import { useDayView } from '../../hooks/useDayView.js';
import { Money } from '../../components/ui/Money.jsx';
import { ScorePlate } from '../../components/ui/Plate.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { isNational } from '../../components/CostSummary.jsx';
import { PriceItems } from '../../components/PriceItems.jsx';
import { closePriceSheet, getPriceSheet, openPriceSheet, usePriceSheet } from '../../components/price/priceSheetStore.js';
import { tabForPart } from '../../lib/price/priceSheet.js';
import { seatsOf } from '../../lib/price/request.js';
import { bedIsThin } from '../../lib/price/display.js';
import { rowFigures, rowUnit } from '../../lib/price/rowFigures.js';
import { partyText } from '../../lib/party.js';
import { priceFigure } from '../../lib/settings/prices.js';
import { useSettings } from '../../components/SettingsLine.jsx';

/**
 * Explore's house parts (G1, house style 2026-11; DESIGN.md "Signature
 * components", the explore lane's decision in .work/2026-11-13-hs-explore).
 *
 * PlaceScore    the Score as the dark plate after a name: the kit's
 *               ScorePlate with a `rating` (K1): "about 8.1", "Not yet", and
 *               the band word in the accessible name.
 * RowFormation  the price row as the house formation (getting there
 *               outlined, the bed solid umber, food and drink beige, then the
 *               day figure, loudest). Every figure, unit and switch is the
 *               one PriceParts shows (T590, T694, T695): the traveller's
 *               price view (per person or the group's stay), a way there the
 *               traveller switched off leaves the row, estimates carry the
 *               tilde, and a press on the day figure opens the items in it
 *               (PriceItems). It formats only; it never prices or sums.
 *               `.xprice` and the `.pparts-*` names stay for the harnesses.
 */

/** K1: the kit's ScorePlate draws it now; the name stays for Explore's callers. */
export function PlaceScore({ rating, size = 'md', className = '' }) {
  return <ScorePlate rating={rating} size={size} className={className} />;
}

/** The band word ("Exceptional") beside the plate, where a row has room. */
export function BandWord({ rating, className = '' }) {
  const { t } = useI18n();
  const w = ratingWords(rating, t);
  if (!w?.word) return null;
  return <span className={`xband ${className}`.trim()} aria-hidden="true">{w.word}</span>;
}

const WAY_ICON = { plane: HouseIcon.flight, train: HouseIcon.train, bus: HouseIcon.bus, car: HouseIcon.car };

function wayOf(cost) {
  const way = cost?.way;
  return way && way.perPerson > 0 && WAY_ICON[way.mode] ? way : null;
}

/** The price parts as the house formation. `weighted` sizes the bed and food
 *  wagons by their euros (rail cards); rows keep them content-sized.
 *  `pressable` (G12, D10, Explore's list and rails only): the figure says its
 *  unit, every wagon is its own button, bed and food sit joined. Opt-in so
 *  My trips and the home story keep the formation they were judged with.
 *  `slot` (pressable only; Explore rails, owner 2026-11-18): 'figure' draws
 *  the day figure alone, 'parts' everything but it, so a rail card can set
 *  the figure on the name's line and the parts under the country. */
export function RowFormation({ cost, t, figRef = null, weighted = false, className = '', pressable = false, place = null, slot = 'all' }) {
  if (pressable) return <ListFormation cost={cost} t={t} figRef={figRef} weighted={weighted} className={className} place={place} slot={slot} />;
  return <PlainFormation cost={cost} t={t} figRef={figRef} weighted={weighted} className={className} />;
}

function PlainFormation({ cost, t, figRef, weighted, className }) {
  const view = useDayView();
  const way = view.request.excluded?.includes('flight') ? null : wayOf(cost);
  const day = cost && Number.isFinite(cost.dayEur);
  if (!day && !way) return null;
  // An estimate is spoken as "about {price}", the tilde's meaning in words.
  const say = (eur, est) => (est ? t('money.estSpoken', { price: formatMoney(eur) }) : formatMoney(eur));

  let go = null;
  if (way) {
    const Icon = WAY_ICON[way.mode];
    const plane = way.mode === 'plane';
    const eur = view.way(way.perPerson);
    const fig = plane ? formatMoney(eur) : formatApprox(eur);
    const spoken = plane
      ? t('card.flightSpoken', { price: fig })
      : t('card.waySpoken', { mode: t(`way.${way.mode}`), price: say(eur, true) });
    go = (
      <span className="hs-wagon is-go pparts-part" data-part="way" title={spoken}>
        <Icon size={13} />
        <span className="pparts-fig money" aria-hidden="true">{fig}</span>
        <span className="sr-only">{spoken}</span>
      </span>
    );
  }

  const part = (key, kind, eur, est, Icon, spokenKey) => {
    if (!Number.isFinite(eur)) return null;
    const shown = view.day(eur);
    const spoken = t(spokenKey, { price: say(shown, est) });
    return (
      <span className={`hs-wagon is-${kind} pparts-part`} data-part={key} title={spoken}
        style={weighted ? { '--ww': Math.max(1, Math.round(shown)) } : undefined}>
        <Icon size={13} />
        <span className="pparts-fig money" aria-hidden="true">{formatMoney(shown)}</span>
        <span className="sr-only">{spoken}</span>
      </span>
    );
  };
  const bed = part('bed', 'bed', cost?.stayEur, cost?.stayLevel !== 'city', HouseIcon.bed, 'card.bedSpoken');
  const food = part('food', 'food', cost?.foodEur, cost?.foodLevel !== 'city', HouseIcon.food, 'card.foodSpoken');

  return (
    <span className={`hs-formation xprice xform${weighted ? ' is-weighted' : ''}${className ? ` ${className}` : ''}`}>
      {/* The day figure first: a screen reader hears the price before its
          parts; CSS draws it last, the loudest thing at the row's end. */}
      {day && (
        <span className="hs-formation-day pparts-total" ref={figRef}>
          {/* T695: a press on the amount opens the items in it, with switches. */}
          <PriceItems cost={cost} way={wayOf(cost)}>
            <Money value={view.day(cost.dayEur)} est={isNational(cost)} />
          </PriceItems>
          {/* The unit is said once on screen (the list head); a screen
              reader hears it with every figure. */}
          <span className="sr-only"> {view.unit}</span>
        </span>
      )}
      {(go || bed || food) && (
        <span className="xform-parts pparts-list">
          {go}
          {(bed || food) && <span className="hs-formation-train">{bed}{food}</span>}
        </span>
      )}
    </span>
  );
}

/**
 * Explore's list formation (G12, D10; explore-polish decision changes 3, 5
 * and 6). The owner read the old row as loose numbers with a unit said once
 * far away, so here:
 *   - the figure carries its unit ("/day", or "/day for 2" in the group
 *     view, never "total": the flight and local transport are not in it);
 *   - bed and food sit joined, with a "+" only when the whole euros on screen
 *     add up to the figure (rowFigures), so the sum shown is never wrong;
 *   - the way there stands apart with the return mark, the word "return"
 *     from a 600 px list;
 *   - the figure and each wagon are buttons that open the price sheet on
 *     the tab that explains them (components/price/PriceSheet.jsx);
 *   - a bed on few listings gets a dot, said in the name and the title too,
 *     since colour alone is no message.
 */
function ListFormation({ cost, t, figRef, weighted, className, place, slot = 'all' }) {
  const view = useDayView();
  const req = view.request;
  const way = wayOf(cost);
  const shownWay = req.excluded?.includes('flight') ? null : way;
  const day = rowFigures(cost, { group: view.total, seats: seatsOf(req) });
  // G12 (D10): under "The whole trip" the figure is the Settings model's
  // (lib/settings grandTotal: nights x day + the way there), with the bed
  // and food over the nights; a way with no figure leaves the stay part
  // marked "+". A day keeps the row's own figures (rowFigures).
  const model = useSettings()?.model || null;
  const pf = model && model.priceSpan === 'trip' ? priceFigure({ cost }, model) : null;
  const fig = pf
    ? { ...day, day: pf.eur, bed: pf.parts.bed, food: pf.parts.food, plus: false, open: pf.notKnown && pf.eur != null }
    : day;
  if (fig.day == null && !shownWay) return null;
  if (slot === 'figure' && fig.day == null) return null;
  const withFigure = slot !== 'parts';
  const withParts = slot !== 'figure';
  const g = fig.group;
  const people = g ? partyText(t, req.group) : '';
  const say = (eur, est) => (est ? t('money.estSpoken', { price: formatMoney(eur) }) : formatMoney(eur));
  const [unitKey, unitArgs] = pf ? pf.unit : rowUnit(fig);

  let go = null;
  if (shownWay) {
    const Icon = WAY_ICON[shownWay.mode];
    const plane = shownWay.mode === 'plane';
    const eur = view.way(shownWay.perPerson);
    const spoken = plane
      ? t(g ? 'card.flightSpokenGroup' : 'card.flightSpoken', { price: formatMoney(eur), people })
      : t(g ? 'card.waySpokenGroup' : 'card.waySpoken', { mode: t(`way.${shownWay.mode}`), price: say(eur, true), people });
    go = (
      <SheetTrigger place={place} cost={cost} className="xform-item" triggerClass="hs-wagon is-go pparts-part xform-btn"
        label={spoken} title={spoken} part="way">
        <Icon size={13} />
        <span className="pparts-fig money" aria-hidden="true">{formatMoney(eur)}</span>
        {plane && <HouseIcon.ret size={12} className="xform-ret" />}
        {plane && <span className="xform-ret-word" aria-hidden="true">{t('card.unitReturn')}</span>}
      </SheetTrigger>
    );
  }

  const thin = bedIsThin(cost);
  const wagon = (key, kind, eur, est, Icon, personKey, groupKey) => {
    if (eur == null) return null;
    const isThin = key === 'bed' && thin;
    const base = t(g ? groupKey : personKey, { price: say(eur, est), people });
    const spoken = isThin ? `${base}. ${t('price.bedThin')}` : base;
    return (
      <SheetTrigger place={place} cost={cost} className="xform-item" triggerClass={`hs-wagon is-${kind} pparts-part xform-btn`}
        label={spoken} title={spoken} part={key}
        style={weighted ? { '--ww': Math.max(1, Math.round(eur)) } : undefined}>
        <Icon size={13} />
        <span className="pparts-fig money" aria-hidden="true">{formatMoney(eur)}</span>
        {isThin && <span className="xform-thin" aria-hidden="true" />}
      </SheetTrigger>
    );
  };
  const bed = wagon('bed', 'bed', fig.bed, cost?.stayLevel !== 'city', HouseIcon.bed, 'card.bedSpoken', 'card.bedSpokenGroup');
  const food = wagon('food', 'food', fig.food, cost?.foodLevel !== 'city', HouseIcon.food, 'card.foodSpoken', 'card.foodSpokenGroup');
  const est = isNational(cost);

  return (
    <span className={`hs-formation xprice xform is-pressable${weighted ? ' is-weighted' : ''}${className ? ` ${className}` : ''}`}>
      {withFigure && fig.day != null && (
        <span className="hs-formation-day pparts-total" ref={figRef}>
          <SheetTrigger place={place} cost={cost} triggerClass="xform-fig" part="day"
            label={pf ? `${say(fig.day, est)} ${t(unitKey, unitArgs)}` : t(g ? 'card.dayFigSpokenGroup' : 'card.dayFigSpoken', { price: say(fig.day, est), people })}>
            <Money value={fig.day} est={est} />
            {fig.open && <span className="xform-open" aria-hidden="true">+</span>}
            <span className="xform-unit" aria-hidden="true">{t(unitKey, unitArgs)}</span>
          </SheetTrigger>
        </span>
      )}
      {withParts && (go || bed || food) && (
        <span className="xform-parts pparts-list">
          {/* On a rail card the figure stands on the name's line, so the
              two parts it is made of come first and the return fare,
              outside it, after them (slot 'parts'). */}
          {slot !== 'parts' && go}
          {(bed || food) && (
            <span className="hs-formation-train hs-wagon-pair">
              {bed}
              {bed && food && fig.plus && <span className="xform-plus" aria-hidden="true">+</span>}
              {food}
            </span>
          )}
          {slot === 'parts' && go}
        </span>
      )}
    </span>
  );
}

/**
 * One part of a list row as the door to the price sheet (D10). A card is one
 * stretched link, so the button keeps its click to itself: opening the price
 * never opens the place. A second press on the same part closes the sheet.
 */
function SheetTrigger({ place, cost, part, children, className = '', triggerClass = '', label, title, style }) {
  const sheet = usePriceSheet();
  const [el, setEl] = React.useState(null);
  const onOpen = (button) => {
    if (!el) setEl(button);
    if (getPriceSheet()?.anchor === button) { closePriceSheet(); return; }
    openPriceSheet({ place: place || { id: null }, cost, tab: tabForPart(part), anchor: button });
  };
  return (
    <PriceItems cost={cost} className={className} triggerClass={triggerClass} label={label} title={title}
      part={part} style={style} onOpen={onOpen} expanded={!!sheet && !!el && sheet.anchor === el}>
      {children}
    </PriceItems>
  );
}
