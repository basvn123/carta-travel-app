import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { ratingWords } from '../../lib/rating.js';
import { formatApprox, formatMoney } from '../../lib/money.js';
import { useDayView } from '../../hooks/useDayView.js';
import { Money } from '../../components/ui/Money.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { ScorePlate } from '../../components/ui/Plate.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import NotYet from '../../components/NotYet.jsx';
import { isNational } from '../../components/CostSummary.jsx';
import { PriceItems } from '../../components/PriceItems.jsx';
import {
  closePriceSheet, getPriceSheet, openPriceSheet, refreshPriceSheet, usePriceSheetAnchor,
} from '../../components/price/priceSheetStore.js';
import { priceFigure } from '../../lib/settings/prices.js';
import { useSettings } from '../../components/SettingsLine.jsx';

/**
 * Explore's house parts (G1, house style 2026-11; DESIGN.md "Signature
 * components", the explore lane's decision in .work/2026-11-13-hs-explore).
 *
 * PlaceScore    the Score as the dark plate after a name: the kit's
 *               ScorePlate with a `rating` (K1): "about 8.1", "Not yet", and
 *               the band word in the accessible name.
 * PlaceFigure   a place's one figure and its basis (G12, D10, place-prices
 *               card option A): the figure in the Settings' basis, the
 *               basis words under it, one button that opens the receipt.
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

/** The price parts as the house formation (My trips' saved list). `weighted`
 *  sizes the bed and food wagons by their euros; rows keep them
 *  content-sized. Explore's cards and rows draw PlaceFigure instead (G12,
 *  D10: one figure, its basis, the receipt behind it). */
export function RowFormation({ cost, t, figRef = null, weighted = false, className = '' }) {
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


// The map's rows and cards say the basis short (proposal.md section 9).
const SHORT_BASIS = {
  'price.basis.day': 'price.basisShort.day',
  'price.basis.trip': 'price.basisShort.trip',
  'price.basis.tripOne': 'price.basisShort.tripOne',
};

/**
 * A place's figure in the Settings' basis (G12, D10, place-prices decision
 * section 1): priceFigure over the Settings model, the same call the
 * receipt makes, so a card and its receipt cannot disagree. Explore's
 * Settings context holds the model the figures were priced with.
 *   -> { model, f, basis, short, missing }  basis: the words; short: the
 *      same basis abbreviated for a row or card beside the sheet head that
 *      says it in full ("a day, each", "pro Tag, p. P."); missing: the
 *      spoken name of a way with no figure yet when the figure leaves it out
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared with the rail card (ExploreRails.jsx)
export function usePlaceFigure(cost) {
  const { t } = useI18n();
  const model = useSettings()?.model || null;
  return React.useMemo(() => {
    const f = priceFigure({ cost }, model || {});
    const [key, args] = f.basis;
    const mode = f.parts.wayMode || cost?.way?.mode || 'any';
    const missing = f.notKnown && f.eur != null ? t(`settingsSum.notKnown.${mode}`) : '';
    // A group basis ("a day for 2") is short already.
    const shortKey = SHORT_BASIS[key];
    return { model, f, basis: t(key, args), short: t(shortKey || key, args), missing };
  }, [cost, model, t]);
}

/** The words a screen reader hears for a figure: the amount, its basis and
 *  the way still missing from it. */
// eslint-disable-next-line react-refresh/only-export-components -- shared with the rail card (ExploreRails.jsx)
export function figureSpoken(t, place, fig) {
  const price = fig.f.eur == null ? t('price.notMeasured') : formatMoney(fig.f.eur);
  const base = t('card.priceAria', { place: place?.city || place?.name || '', price, basis: fig.f.eur == null ? '' : fig.basis }).trim();
  return fig.missing ? `${base}. ${fig.missing}` : base;
}

/**
 * The door to a place's receipt (components/price/PriceSheet.jsx). A card
 * is one stretched link, so the button keeps its press to itself: opening
 * the receipt never opens the place. A second press closes it. While the
 * receipt is open it follows this card's figures, so a lever or a Settings
 * step shows its effect there at once.
 */
export function ReceiptButton({ place, cost, model, label, className = '', children }) {
  const ref = React.useRef(null);
  const anchor = usePriceSheetAnchor();
  const id = place?.id ?? null;
  React.useEffect(() => {
    if (id != null) refreshPriceSheet(id, { cost, model });
  }, [id, cost, model]);
  const onClick = (e) => {
    e.stopPropagation();
    const button = e.currentTarget;
    if (getPriceSheet()?.anchor === button) { closePriceSheet(); return; }
    openPriceSheet({ place: place || { id: null }, cost, model, anchor: button });
  };
  return (
    <Pressable ref={ref} className={`xreceipt-btn ${className}`.trim()} aria-label={label}
      aria-haspopup="dialog" aria-expanded={!!anchor && anchor === ref.current} onClick={onClick}>
      {children}
    </Pressable>
  );
}

/** The figure itself: loudest, whole euros, "Not yet" without one. No sign
 *  after it (owner, 2026-11-20: the "+" went): the price chain completes the
 *  figure (lib/settings/prices.js), a stay-only trip is said in words in the
 *  receipt and in the accessible name, never on the card. */
export function FigureAmount({ fig, figRef = null, className = '' }) {
  const { f } = fig;
  return (
    <span className={`xfig-amount ${className}`.trim()} ref={figRef}>
      {f.eur == null ? <NotYet /> : <Money value={f.eur} est={false} />}
    </span>
  );
}

/** Explore's list row's price (PlaceRow): the figure over its basis, one
 *  button to the receipt, in the row's day column. `short` draws the
 *  abbreviated basis (the map's rows and cards, under a head that says it
 *  in full); the spoken name keeps the whole basis. */
export function PlaceFigure({ place, t, figRef = null, className = '', short = false }) {
  const fig = usePlaceFigure(place?.cost);
  return (
    <ReceiptButton place={place} cost={place?.cost} model={fig.model} label={figureSpoken(t, place, fig)}
      className={`xprice xfig hs-formation-day ${className}`.trim()}>
      <FigureAmount fig={fig} figRef={figRef} />
      {fig.f.eur != null && <span className="xfig-basis" aria-hidden="true">{short ? fig.short : fig.basis}</span>}
    </ReceiptButton>
  );
}
