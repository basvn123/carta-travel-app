import React, { useMemo } from 'react';
import {
  buildFlightLinks, buildAccommodationLink, buildCarRentalLink, viaNearestAirport,
  offeredStayTiers, STAY_TIER_FIELD,
} from '../lib/runtime_pricing.js';
import { eur, PRICE_SOURCE_LABELS, ACCOM_SOURCE_LABELS } from '../lib/format.js';
import { BedIcon, DiningIcon, CarIcon, InfoIcon, AlertIcon, LifestyleIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { carrierPairName } from '../lib/carriers.js';
import { BagCheck } from '../components/BagCheck.jsx';
import { estPrefix, FareTag, BookingNote, flightBreakdownProv } from '../components/FareProvenance.jsx';
import { useI18n } from '../i18n/index.jsx';

// Sub-components of the destination detail panel (the cost-breakdown tab and
// its pieces), lifted out of DetailPanel. Imports are trimmed to what these use.

/** The action at the foot of a cost group: verify this price with the people
 *  who actually sell it, or change the assumption behind it. These used to be
 *  small underlined text links, easy to scan straight past even though they
 *  are the only way out of an estimate and into a real booking.
 *
 *  variant: 'primary'   filled - the canonical place to check this line
 *           'secondary' outlined - a further comparison site
 *           'action'    pill - an in-app action, no navigation
 */
function CostAction({ href, onClick, variant = 'primary', icon, children }) {
  const props = href ? { href, target: '_blank', rel: 'noreferrer' } : { onClick, type: 'button' };
  const Tag = href ? 'a' : 'button';
  return (
    <Tag className={`cost-action is-${variant}`} {...props}>
      {icon}
      <span>{children}</span>
      {href && <span className="cost-action-out" aria-hidden="true">↗</span>}
    </Tag>
  );
}

/** A caution inside a cost group (no flight on these dates, a vignette you
 *  must buy before you drive). Amber and icon-led, because these are the lines
 *  that cost money or block the trip if they're read as decoration. */
function CostWarning({ children }) {
  return (
    <div className="cost-warning">
      <AlertIcon size={14} />
      <span>{children}</span>
    </div>
  );
}

function CostGroup({ icon, title, subtitle, subtotal, valueSub, open, onToggle, infoButton, infoPanel, headRef, children }) {
  return (
    <div className="cost-group">
      <div
        className="cost-group-head"
        ref={headRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
        }}
      >
        <span className="cost-group-icon">{icon}</span>
        <span className="cost-group-title">
          {title}
          {subtitle && <small>{subtitle}</small>}
        </span>
        {infoButton}
        {subtotal != null && (
          <span className="cost-group-money">
            <span className="cost-group-val">{eur(subtotal)}</span>
            {/* The route, the nights, the rate: the one fact that says what
                this figure is FOR, in the column where the eye already is. */}
            {valueSub && <small className="cost-group-valsub">{valueSub}</small>}
          </span>
        )}
        <span className="cost-group-caret" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
      {infoPanel}
      {/* Mounted while closed so open/close animates; visibility (via
          .acc-fold) keeps the collapsed rows out of the tab order. */}
      <div className="acc-fold" aria-hidden={!open}>
        <div className="acc-fold-inner">
          <div className="cost-group-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Structured label/value rows for the info popovers, so "how is this
 *  calculated" reads as a small table instead of one dense paragraph. */
function InfoFacts({ rows }) {
  return (
    <div className="cost-info-facts">
      {rows.filter(([, v]) => v != null && v !== '').map(([label, value]) => (
        <div className="cost-info-fact" key={label}>
          <span className="cost-info-fact-label">{label}</span>
          <span className="cost-info-fact-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

// Small toggle button + text popover, used for "how is this calculated"
// asides that would otherwise clutter the (now-collapsed-by-default) group
// header. Stops propagation so it doesn't also toggle the group open/closed.
function InfoButton({ open, onClick, label }) {
  const { t } = useI18n();
  const lbl = label || t('detail.howCalculated');
  return (
    <button
      type="button"
      className={`cost-info-btn ${open ? 'open' : ''}`}
      aria-expanded={open}
      aria-label={lbl}
      title={lbl}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <InfoIcon size={12} />
    </button>
  );
}

export function BreakdownTab({ destination, breakdown, departDate, returnDate, choices, setChoices, priceMode, onOpenLifestyle, anchor, anchorCity, data, onSelect, bookSignal = 0, footer = null }) {
  const { t } = useI18n();
  const group = Math.max(1, choices.group_size || 1);
  const originCity = data?.meta?.origins?.[data?.meta?.selected_origin]?.city || t('detail.yourAirport');
  // A drive is measured from the traveller's own town once they have named it,
  // so the receipt must say that town and not the departure airport's city.
  const driveFromCity = breakdown.drive_from || originCity;
  // The traveller asked to fly but no fare exists for these dates, so the
  // price shown is a DRIVE, say so loudly instead of a quiet "drive from
  // home", and offer real fly-via-nearby-airport alternatives.
  const flyFellBack = breakdown.requested_mode === 'plane' && breakdown.transport_mode === 'car';

  // Groups are collapsed by default to keep the panel scannable; the subtotal
  // stays visible on the header either way. "info" popovers (calc logic,
  // local rates) are independent of open/closed so they're reachable without
  // expanding a whole section.
  const [openGroups, setOpenGroups] = React.useState({ transport: false, rental: false, stay: false, ground: false });
  const toggleGroup = (key) => setOpenGroups((o) => ({ ...o, [key]: !o[key] }));

  // "Start booking" (the panel's one primary action) lands here: open the leg
  // you book first and put it under the reader's eye. It deliberately does not
  // open an airline in a new tab, the links inside the group do that, next to
  // the bag rules that decide whether the fare is really the fare.
  const transportHeadRef = React.useRef(null);
  React.useEffect(() => {
    if (!bookSignal) return;
    setOpenGroups((o) => ({ ...o, transport: true }));
    const el = transportHeadRef.current;
    if (!el) return;
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [bookSignal]);
  const [infoOpen, setInfoOpen] = React.useState(null); // 'stay' | 'ground' | 'rates' | null
  const toggleInfo = (key) => setInfoOpen((v) => (v === key ? null : key));

  // Flight values are group totals; ground values are per-person. Convert ground
  // to group totals so a single show()/divide handles both consistently.
  const show = (groupTotal) => {
    if (groupTotal == null) return null;
    return priceMode === 'pp' ? groupTotal / group : groupTotal;
  };
  const g = breakdown.ground;
  const acc = breakdown.accommodation;
  const groundGroup = (perPerson) => (perPerson == null ? null : perPerson * group);

  const sourceLabel = PRICE_SOURCE_LABELS[breakdown.price_source] || null;
  const accomSourceLabel = ACCOM_SOURCE_LABELS[breakdown.accom_source] || null;

  // Group subtotals, in the active price mode. "Getting there" holds ONLY the
  // journey itself: the drive cost in car mode, the flight stack in plane mode.
  // A rental car at the destination is a whole-stay cost, so it gets its own
  // group below instead of inflating the getting-there figure.
  const transportSubtotal = breakdown.transport_mode === 'car'
    ? show(breakdown.driving?.total)
    : show((breakdown.fare_total || 0)
        + (breakdown.baggage_total || 0)
        + (breakdown.transfer_total || 0));
  const rentalSubtotal = breakdown.transport_mode === 'plane' && breakdown.rental
    ? show(breakdown.rental_total) : null;
  const staySubtotal = acc ? show(breakdown.accom_total) : null;
  const groundSubtotal = g ? show(groundGroup(breakdown.ground_per_person)) : null;

  // Fare verification link, kept inside the Getting-there group.
  // Which airline(s) the shown round-trip fare belongs to: "Ryanair" unless
  // the merged fare data tagged one of the two days for another carrier.
  const fareCarrier = carrierPairName(
    destination.routes?.[breakdown.origin], departDate, returnDate,
  );
  // Provenance of the shown fare: an estimate-band price (no stored day for
  // these dates) is always EST; otherwise the hydrated route's contract A
  // fields drive the age chip + estimate styling.
  const flightFareProv = flightBreakdownProv(breakdown, destination.routes?.[breakdown.origin]);
  const fareEstimated = !!breakdown.fare_estimated;

  const flightLinks = (() => {
    if (breakdown.transport_mode !== 'plane' || breakdown.fare_total == null) return [];
    const origin = breakdown.origin;
    const destIata = destination.iata || anchor;
    if (!origin || !destIata || !departDate || !returnDate) return [];
    // subId 'detail' attributes the click to this panel in the affiliate
    // dashboard, separately from any other surface that links out later.
    return buildFlightLinks({
      origin, destIata, departDate, returnDate, subId: 'detail',
    }).links;
  })();

  return (
    <>
      <div className="panel-section">
        {/* No "trip total" heading here any more: the price card at the top of
            the panel already says what this column adds up to, and saying it
            twice cost a phone screen the first cost row. */}

        {/* ── Getting there ── */}
        <CostGroup
          icon={breakdown.transport_mode === 'car' ? <CarIcon size={15} /> : <PlaneIcon size={15} />}
          title={t('detail.gettingThere')}
          subtitle={breakdown.transport_mode === 'car'
            ? (flyFellBack ? t('detail.noFlightDriveFrom', { origin: driveFromCity }) : t('detail.driveFrom', { origin: driveFromCity }))
            : (fareEstimated ? t('detail.estimatedRoundTrip') : t('detail.ryanairRoundTrip', { carrier: fareCarrier }))}
          subtotal={transportSubtotal}
          valueSub={breakdown.transport_mode === 'car'
            ? (breakdown.driving?.road_km ? t('detail.kmEachWay', { km: breakdown.driving.road_km }) : null)
            : (breakdown.origin && (anchor || destination.iata)
              ? `${breakdown.origin} → ${anchor || destination.iata}` : null)}
          open={openGroups.transport}
          onToggle={() => toggleGroup('transport')}
          headRef={transportHeadRef}
        >
          {flyFellBack && (
            <>
              <CostWarning>
                {t('detail.flyFallbackNote', { origin: originCity, city: destination.city })}
              </CostWarning>
              <ViaAirportOptions
                destination={destination}
                data={data}
                departDate={departDate}
                returnDate={returnDate}
                choices={choices}
                onSelect={onSelect}
              />
            </>
          )}
          {breakdown.transport_mode === 'car' ? (
            <>
              <div className="total-row">
                <span className="label">
                  {breakdown.driving.cars === 1
                    ? t('detail.driveCarsOne', { n: breakdown.driving.cars })
                    : t('detail.driveCarsMany', { n: breakdown.driving.cars })}
                  <small>
                    {t('detail.driveMeta', {
                      km: breakdown.driving.road_km,
                      hours: breakdown.driving.drive_hours_one_way,
                    })}
                  </small>
                </span>
                <span className="val">{eur(show(breakdown.driving.total))}</span>
              </div>
              <GroundLine label={t('detail.fuel')} v={show(breakdown.driving.fuel_total)} eur={eur} />
              {breakdown.driving.toll_total > 0 && (
                <GroundLine label={t('detail.tolls')} v={show(breakdown.driving.toll_total)} eur={eur} />
              )}
              {breakdown.driving.toll_notes?.length > 0 && (
                <CostWarning>
                  {t('detail.tollNotes', { notes: breakdown.driving.toll_notes.join(', ') })}
                </CostWarning>
              )}
            </>
          ) : (
            <>
              <div className="total-row">
                <span className="label">
                  {t('detail.flight')}
                  <FareTag prov={flightFareProv} />
                  <small>
                    {fareEstimated
                      ? (destination.tier === 'gem' && anchorCity
                        ? t('detail.fareEstimatedViaAnchor', { city: anchorCity })
                        : t('detail.fareEstimated'))
                      : (destination.tier === 'gem' && anchorCity
                        ? t('detail.fareViaAnchor', { city: anchorCity, carrier: fareCarrier })
                        : t('detail.fareRoundTrip', { carrier: fareCarrier }))}
                  </small>
                </span>
                <span className="val">{`${estPrefix(flightFareProv)}${eur(show(breakdown.fare_total))}`}</span>
              </div>
              {breakdown.baggage_per_person > 0 && (
                <div className="total-row sub-row">
                  <span className="label">
                    + {data?.meta?.baggage_options?.[choices.baggage_key]?.label || t('detail.baggage')}
                    <small>
                      {t('detail.perTwoDirections', { n: (choices.baggage_per_direction_eur || 0).toFixed(0) })}
                      {priceMode === 'total' && t('detail.timesPeople', { n: group })}
                    </small>
                  </span>
                  <span className="val">{eur(show(breakdown.baggage_total))}</span>
                </div>
              )}
              {breakdown.transfer_total > 0 && (
                <div className="total-row sub-row">
                  <span className="label">
                    {anchorCity ? t('detail.transferFrom', { city: anchorCity }) : t('detail.transfer')}
                    <small>
                      {t('detail.perTwoDirections', { n: breakdown.transfer_one_way_eur.toFixed(0) })}
                      {priceMode === 'total' && t('detail.timesPeople', { n: group })}
                      {breakdown.ground_minutes > 0 ? t('detail.minEachWay', { n: breakdown.ground_minutes }) : ''}
                    </small>
                  </span>
                  <span className="val">{eur(show(breakdown.transfer_total))}</span>
                </div>
              )}
              {/* The chosen tier as this route's airlines' actual bag rules:
                  Ryanair and Wizz do not agree on a centimetre, and the gate
                  fee is where that surprise gets expensive. */}
              <BagCheck flight={{
                combinable: true,
                into_carrier: destination.routes?.[breakdown.origin]?.outbound_carrier?.[departDate],
                out_of_carrier: destination.routes?.[breakdown.origin]?.return_carrier?.[returnDate],
                baggage: choices.baggage_key,
              }}
              />
            </>
          )}

          <CarAdvisory lt={breakdown.local_transport} mode={breakdown.transport_mode} />

          <div className="cost-group-links">
            {/* First link carries the full phrase and the filled treatment, any
                further comparison site follows as a quieter outlined button. */}
            {flightLinks.map((l, i) => (
              <CostAction key={l.provider} href={l.href} variant={i === 0 ? 'primary' : 'secondary'}>
                {i === 0
                  ? t('detail.checkFareOn', { provider: l.provider })
                  : t('detail.orCompareOn', { provider: l.provider })}
              </CostAction>
            ))}
            {flightLinks.length > 0 && <BookingNote />}
          </div>
        </CostGroup>

        {/* ── Rental car at the destination (own group: it's a whole-stay cost,
              not part of the journey there) ── */}
        {rentalSubtotal != null && (
          <CostGroup
            icon={<CarIcon size={15} />}
            title={t('detail.rentalTitle')}
            subtitle={breakdown.rental.cars === 1
              ? t('detail.rentalSubOne', { cars: breakdown.rental.cars, days: breakdown.rental.days })
              : t('detail.rentalSubMany', { cars: breakdown.rental.cars, days: breakdown.rental.days })}
            subtotal={rentalSubtotal}
            open={openGroups.rental}
            onToggle={() => toggleGroup('rental')}
          >
            <div className="total-row">
              <span className="label">
                {t('detail.rental')}
                <small>
                  {breakdown.rental.cars === 1
                    ? t('detail.rentalMetaOne', { cars: breakdown.rental.cars, days: breakdown.rental.days, rate: breakdown.rental.rate.toFixed(0) })
                    : t('detail.rentalMetaMany', { cars: breakdown.rental.cars, days: breakdown.rental.days, rate: breakdown.rental.rate.toFixed(0) })}
                  {breakdown.rental.season > 1 ? t('detail.inclSummer') : ''}
                  {breakdown.rental.discount_pct > 0 ? t('detail.weeklyDiscount', { pct: breakdown.rental.discount_pct }) : ''}
                </small>
              </span>
              <span className="val">{eur(show(breakdown.rental_total))}</span>
            </div>
            <div className="cost-group-links">
              {(() => {
                const carLink = buildCarRentalLink({
                  city: destination.city,
                  iata: destination.iata,
                  departDate,
                  returnDate,
                });
                return carLink ? (
                  <>
                    <CostAction href={carLink}>{t('detail.compareKayak')}</CostAction>
                    <BookingNote />
                  </>
                ) : null;
              })()}
            </div>
          </CostGroup>
        )}

        {/* ── Your stay ── */}
        {acc && (() => {
          const servedTier = breakdown.stay_tier || 'home';
          const tiers = destination.accommodation?.tiers || null;
          // Per-tier nightly for the chip hints: dorm is per bed, the rest per room.
          const tierOptions = offeredStayTiers(data?.meta);
          const tierRate = Object.fromEntries(tierOptions.map((k) => [
            k, k === 'home' ? breakdown.accom_entire_home_night_eur
              : tiers?.[STAY_TIER_FIELD[k]],
          ]));
          const baseRate = servedTier === 'home'
            ? breakdown.accom_entire_home_night_eur : acc.tier_rate_eur;
          const linkLabel = servedTier === 'dorm' || servedTier === 'private'
            ? t('detail.findHostelworld')
            : servedTier.startsWith('hotel')
              ? t('detail.findHotels') : t('detail.findAirbnb');
          return (
          <CostGroup
            icon={<BedIcon size={15} />}
            title={breakdown.nights === 1
              ? t('detail.stayTitleOne', { n: breakdown.nights })
              : t('detail.stayTitleMany', { n: breakdown.nights })}
            subtitle={t(`stay.${servedTier}`)}
            subtotal={staySubtotal}
            valueSub={baseRate ? t('detail.perNightApprox', { n: Math.round(baseRate) }) : null}
            open={openGroups.stay}
            onToggle={() => toggleGroup('stay')}
            infoButton={<InfoButton open={infoOpen === 'stay'} onClick={() => toggleInfo('stay')} />}
            infoPanel={infoOpen === 'stay' && (
              <InfoFacts rows={[
                [t('detail.infoType'), t(`stay.${servedTier}`)],
                [t('detail.infoBaseRate'), baseRate ? t('detail.perNightApprox', { n: Math.round(baseRate) }) : null],
                [t('detail.infoNights'), String(breakdown.nights)],
                [t('detail.infoFees'), servedTier === 'home' ? t('detail.feesIncluded') : t('detail.noPlatformFees')],
                [t('detail.infoAdjustedFor'), servedTier === 'home' ? t('detail.seasonLos') : t('detail.seasonOnly')],
                [t('detail.infoSource'), servedTier === 'home' ? accomSourceLabel : t('detail.stayTierSource')],
              ]} />
            )}
          >
            {/* How expensive to sleep. Tapping a tier re-prices the whole map,
                not just this destination; unmeasured tiers stay tappable but
                say they will fall back (honesty over a dead button). */}
            <div className="stay-tier-row" role="group" aria-label={t('filter.stay')}>
              {tierOptions.length > 1 && tierOptions.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`stay-tier-chip${servedTier === k ? ' on' : ''}`}
                  title={k !== 'home' && !tierRate[k] ? t('detail.stayTierUnmeasuredTitle') : undefined}
                  onClick={() => setChoices({ ...choices, stay_tier: k })}
                >
                  <span>{t(`stay.${k}`)}</span>
                  {tierRate[k] > 0 && <b>{Math.round(tierRate[k])}</b>}
                </button>
              ))}
            </div>
            {breakdown.stay_tier_fallback && (
              <CostWarning>{t('detail.stayTierFallback', { tier: t(`stay.${acc.tier_requested}`) })}</CostWarning>
            )}
            <GroundLine label={t('detail.lodging')}     v={show(groundGroup(acc.lodging))}  eur={eur} />
            <GroundLine label={t('detail.cleaningFee')} v={show(groundGroup(acc.cleaning))} eur={eur} />
            <GroundLine label={t('detail.serviceFee')}  v={show(groundGroup(acc.service))}  eur={eur} />
            {acc.season !== 1 && (
              <div className="total-row sub-row">
                <span className="label" style={{ fontWeight: 400, fontStyle: 'italic' }}>
                  {acc.season > 1 ? t('detail.inclSummerStay') : t('detail.inclOffSeason')}
                  {acc.los < 1 ? t('detail.weeklyDiscountSuffix') : ''}
                </span>
                <span className="val" />
              </div>
            )}
            <div className="cost-group-links">
              {(() => {
                const link = buildAccommodationLink({
                  city: destination.city,
                  country: destination.country,
                  departDate,
                  returnDate,
                  groupSize: choices.group_size,
                  stayTier: servedTier,
                });
                return link ? (
                  <>
                    <CostAction href={link}>{linkLabel}</CostAction>
                    <BookingNote />
                  </>
                ) : null;
              })()}
            </div>
          </CostGroup>
          );
        })()}

        {/* ── On the ground ── */}
        {g && (
          <CostGroup
            icon={<DiningIcon size={15} />}
            title={breakdown.nights === 1
              ? t('detail.groundTitleOne', { n: breakdown.nights })
              : t('detail.groundTitleMany', { n: breakdown.nights })}
            subtitle={t('detail.groundSub')}
            subtotal={groundSubtotal}
            valueSub={breakdown.nights > 0
              ? t('detail.perDayApprox', { n: Math.round(groundSubtotal / breakdown.nights) }) : null}
            open={openGroups.ground}
            onToggle={() => toggleGroup('ground')}
            infoButton={<InfoButton open={infoOpen === 'ground'} onClick={() => toggleInfo('ground')} />}
            infoPanel={infoOpen === 'ground' && (
              <InfoFacts rows={[
                [t('detail.infoBasedOn'), t('detail.lifestyleSettings')],
                [t('detail.infoCovers'), t('detail.coversList')],
                [t('detail.infoRates'), sourceLabel],
              ]} />
            )}
          >
            <GroundLine label={t('detail.dinnersOut')}  v={show(groundGroup(g.dinners))}  eur={eur} rate={destination.costs?.meal_mid_eur} />
            <GroundLine label={t('detail.casualMeals')} v={show(groundGroup(g.lunches))}  eur={eur} rate={destination.costs?.meal_cheap_eur} />
            {g.fastfood > 0 && <GroundLine label={t('detail.fastFood')} v={show(groundGroup(g.fastfood))} eur={eur} rate={destination.costs?.fastfood_eur} />}
            <GroundLine label={t('detail.barDrinks')}   v={show(groundGroup(g.drinks))}   eur={eur} rate={destination.costs?.drink_out_eur} />
            {g.clubbing > 0 && <GroundLine label={t('detail.clubNights')} v={show(groundGroup(g.clubbing))} eur={eur} />}
            {g.coffees > 0 && <GroundLine label={t('detail.coffees')} v={show(groundGroup(g.coffees))} eur={eur} rate={destination.costs?.coffee_eur} />}
            <GroundLine label={t('detail.groceries')}   v={show(groundGroup(g.groceries))} eur={eur} />
            {/* This one control re-prices every line above it, so it reads as a
                real button rather than a footnote. */}
            <div className="cost-group-links">
              <CostAction variant="action" onClick={onOpenLifestyle} icon={<LifestyleIcon size={13} />}>
                {t('detail.adjustLifestyle')}
              </CostAction>
            </div>
          </CostGroup>
        )}

        {/* ── The sum of the rows above. The big per-person figure now leads
              the panel (see the price card in DetailPanel), so this is the
              plain arithmetic that closes the receipt, still stuck to the foot
              of the panel so the number never scrolls away while the groups
              above are being read. ── */}
        <div className="cost-total-sticky">
          <div className="cost-total-card">
            <div className="cost-total-main">
              <span className="cost-total-label">
                {t('detail.total')}
                <small>{priceMode === 'pp' ? t('detail.perPersonSuffix') : t('detail.wholeGroup', { n: group })}</small>
              </span>
              <span className="cost-total-val">
                {eur(priceMode === 'pp' ? breakdown.grand_total / group : breakdown.grand_total)}
              </span>
            </div>
            {group > 1 && (
              <div className="cost-total-sub">
                <span>{priceMode === 'pp' ? t('detail.wholeGroup', { n: group }) : t('detail.totalPerPerson')}</span>
                <span>{eur(priceMode === 'pp' ? breakdown.grand_total : breakdown.grand_total / group)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Doors into the Explore tab, passed in by the panel: they belong at
            the end of the receipt, not above it. */}
        {footer}
      </div>
    </>
  );
}

// "Is a car needed here?" advisory, the second car layer.
// The stored reasons join clauses with a bare dash ("… public transport, // skip the car"); rewrite that as two sentences for display.
function cleanReason(s) {
  return String(s || '').replace(/\s+[-–—]\s+(\w)/g, (m, c) => `. ${c.toUpperCase()}`);
}

function CarAdvisory({ lt, mode }) {
  const { t } = useI18n();
  if (!lt) return null;
  const dot = lt.car_needed ? '#d98324' : '#3a9d6b';
  const reason = cleanReason(lt.reason);
  let text;
  if (lt.car_needed) {
    text = mode === 'car'
      ? t('detail.carRecOwn', { reason })
      : t('detail.carRecRental', { reason });
  } else {
    text = t('detail.noCarNeeded', { reason });
  }
  return (
    <div className="car-advisory">
      <span className="car-advisory-dot" style={{ background: dot }} />
      <span>{text}</span>
    </div>
  );
}

/** "Fly to the nearest airport instead": real-fare alternatives for a
 *  destination with no direct flight on these dates, fly into a nearby
 *  airport we DO have a fare for, then drive/taxi the last stretch. */
export function ViaAirportOptions({ destination, data, departDate, returnDate, choices, onSelect }) {
  const { t } = useI18n();
  // viaNearestAirport scans every one of the ~24,800 destinations (haversine +
  // fare lookup each), so memoize it: DetailPanel re-renders on unrelated app
  // state (search keystrokes, slider drags) and this result never changes then.
  const options = useMemo(
    () => viaNearestAirport(destination, data?.destinations, departDate, returnDate, choices),
    [destination, data, departDate, returnDate, choices],
  );
  if (!options.length) return null;
  return (
    <div className="via-airport">
      <div className="via-airport-title"><PlaneIcon size={11} /> {t('detail.viaTitle')}</div>
      {options.map((o) => (
        <div className="via-airport-row" key={o.id}>
          <span className="via-airport-main">
            <b>{o.city}</b>
            <small>
              {t('detail.viaMeta', {
                fare: eur(o.fare_per_person),
                km: o.road_km,
                h: o.drive_hours_one_way,
                leg: eur(o.leg_eur_pp_one_way),
              })}
            </small>
          </span>
          <span className="via-airport-est">{t('detail.viaEst', { total: eur(o.total_pp_est) })}</span>
          {onSelect && (
            <button className="via-airport-open" onClick={() => onSelect(o.id)} title={t('detail.openCity', { city: o.city })}>{t('detail.view')}</button>
          )}
        </div>
      ))}
      <p className="via-airport-note">{t('detail.viaNote')}</p>
    </div>
  );
}

function GroundLine({ label, v, eur, rate }) {
  const { t } = useI18n();
  return (
    <div className="total-row sub-row">
      <span className="label" style={{ fontWeight: 400 }}>
        {label}
        {rate > 0 && <small>{t('detail.eachLocalRate', { rate })}</small>}
      </span>
      <span className="val">{eur(v)}</span>
    </div>
  );
}
