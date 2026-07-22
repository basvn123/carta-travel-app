import React, { useMemo } from 'react';
import {
  buildFlightLinks, buildAccommodationLink, buildCarRentalLink, viaNearestAirport,
} from '../lib/runtime_pricing.js';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { WaterQualityBadge } from '../components/WaterQualityBadge.jsx';
import { CrowdingBadge } from '../components/CrowdingBadge.jsx';
import { BestTimePanel } from './BestTimePanel.jsx';
import { eur, PRICE_SOURCE_LABELS, ACCOM_SOURCE_LABELS } from '../lib/format.js';
import { ReceiptIcon, CalendarIcon, BedIcon, DiningIcon, CarIcon, InfoIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { carrierPairName } from '../lib/carriers.js';
import { useI18n } from '../i18n/index.jsx';

// Sub-components of the destination detail panel (the cost-breakdown tab and
// its pieces), lifted out of DetailPanel. Imports are trimmed to what these use.

// Small underlined text-button, used for the outbound links under each cost
// line (Airbnb, KAYAK, Skyscanner) and the "Adjust lifestyle" action.
function TextLink({ href, onClick, children }) {
  const props = href ? { href, target: '_blank', rel: 'noreferrer' } : { onClick, type: 'button' };
  const Tag = href ? 'a' : 'button';
  return <Tag className="detail-text-link" {...props}>{children}</Tag>;
}

function CostGroup({ icon, title, subtitle, subtotal, open, onToggle, infoButton, infoPanel, children }) {
  return (
    <div className="cost-group">
      <div
        className="cost-group-head"
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
        {subtotal != null && <span className="cost-group-val">{eur(subtotal)}</span>}
        <span className="cost-group-caret" aria-hidden="true">{open ? '−' : '+'}</span>
      </div>
      {infoPanel}
      {open && <div className="cost-group-body">{children}</div>}
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

export function BreakdownTab({ destination, breakdown, departDate, returnDate, choices, setChoices, priceMode, onOpenLifestyle, anchor, anchorCity, data, onSelect }) {
  const { t } = useI18n();
  const group = Math.max(1, choices.group_size || 1);
  const originCity = data?.meta?.origins?.[data?.meta?.selected_origin]?.city || t('detail.yourAirport');
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

  // Skyscanner verification link, kept inside the Getting-there group.
  // Which airline(s) the shown round-trip fare belongs to: "Ryanair" unless
  // the merged fare data tagged one of the two days for another carrier.
  const fareCarrier = carrierPairName(
    destination.routes?.[breakdown.origin], departDate, returnDate,
  );

  const flightLink = (() => {
    if (breakdown.transport_mode !== 'plane' || breakdown.fare_total == null) return null;
    const origin = breakdown.origin;
    const destIata = destination.iata || anchor;
    if (!origin || !destIata || !departDate || !returnDate) return null;
    return buildFlightLinks({ origin, destIata, departDate, returnDate }).skyscanner || null;
  })();

  return (
    <>
      <div className="panel-section">
        <div className="section-title section-title-iconed">
          <ReceiptIcon size={12} /> {t('detail.tripTotal')} {priceMode === 'pp' ? t('detail.perPersonSuffix') : ''}
        </div>

        {/* ── Getting there ── */}
        <CostGroup
          icon={breakdown.transport_mode === 'car' ? <CarIcon size={15} /> : <PlaneIcon size={15} />}
          title={t('detail.gettingThere')}
          subtitle={breakdown.transport_mode === 'car'
            ? (flyFellBack ? t('detail.noFlightDriveFrom', { origin: originCity }) : t('detail.driveFrom', { origin: originCity }))
            : t('detail.ryanairRoundTrip', { carrier: fareCarrier })}
          subtotal={transportSubtotal}
          open={openGroups.transport}
          onToggle={() => toggleGroup('transport')}
        >
          {flyFellBack && (
            <>
              <p className="cost-info-pop cost-fallback-note">
                {t('detail.flyFallbackNote', { origin: originCity, city: destination.city })}
              </p>
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
                <p className="cost-info-pop">
                  {t('detail.tollNotes', { notes: breakdown.driving.toll_notes.join(', ') })}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="total-row">
                <span className="label">
                  {t('detail.flight')}
                  <small>
                    {destination.tier === 'gem' && anchorCity
                      ? t('detail.fareViaAnchor', { city: anchorCity, carrier: fareCarrier })
                      : t('detail.fareRoundTrip', { carrier: fareCarrier })}
                  </small>
                </span>
                <span className="val">{eur(show(breakdown.fare_total))}</span>
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
            </>
          )}

          <CarAdvisory lt={breakdown.local_transport} mode={breakdown.transport_mode} />

          <div className="cost-group-links">
            {flightLink && <TextLink href={flightLink}>{t('detail.checkSkyscanner')}</TextLink>}
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
                return carLink ? <TextLink href={carLink}>{t('detail.compareKayak')}</TextLink> : null;
              })()}
            </div>
          </CostGroup>
        )}

        {/* ── Your stay ── */}
        {acc && (
          <CostGroup
            icon={<BedIcon size={15} />}
            title={breakdown.nights === 1
              ? t('detail.stayTitleOne', { n: breakdown.nights })
              : t('detail.stayTitleMany', { n: breakdown.nights })}
            subtotal={staySubtotal}
            open={openGroups.stay}
            onToggle={() => toggleGroup('stay')}
            infoButton={<InfoButton open={infoOpen === 'stay'} onClick={() => toggleInfo('stay')} />}
            infoPanel={infoOpen === 'stay' && (
              <InfoFacts rows={[
                [t('detail.infoType'), t('detail.entireHome')],
                [t('detail.infoBaseRate'), breakdown.accom_entire_home_night_eur ? t('detail.perNightApprox', { n: Math.round(breakdown.accom_entire_home_night_eur) }) : null],
                [t('detail.infoNights'), String(breakdown.nights)],
                [t('detail.infoFees'), t('detail.feesIncluded')],
                [t('detail.infoAdjustedFor'), t('detail.seasonLos')],
                [t('detail.infoSource'), accomSourceLabel],
              ]} />
            )}
          >
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
                const airbnb = buildAccommodationLink({
                  city: destination.city,
                  country: destination.country,
                  departDate,
                  returnDate,
                  groupSize: choices.group_size,
                });
                return airbnb ? <TextLink href={airbnb}>{t('detail.findAirbnb')}</TextLink> : null;
              })()}
            </div>
          </CostGroup>
        )}

        {/* ── On the ground ── */}
        {g && (
          <CostGroup
            icon={<DiningIcon size={15} />}
            title={breakdown.nights === 1
              ? t('detail.groundTitleOne', { n: breakdown.nights })
              : t('detail.groundTitleMany', { n: breakdown.nights })}
            subtotal={groundSubtotal}
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
            <div className="cost-group-links">
              <TextLink onClick={onOpenLifestyle}>{t('detail.adjustLifestyle')}</TextLink>
            </div>
          </CostGroup>
        )}

        {/* ── Grand total: styled like the lifestyle panel's summary card, with
              the per-person figure always visible and emphasised. ── */}
        <div className="cost-total-card">
          <div className="cost-total-main">
            <span className="cost-total-label">
              {t('detail.totalPerPerson')}
              <small>{breakdown.nights === 1
                ? t('detail.nightsEverythingOne', { n: breakdown.nights })
                : t('detail.nightsEverythingMany', { n: breakdown.nights })}</small>
            </span>
            <span className="cost-total-val">{eur(breakdown.grand_total / group)}</span>
          </div>
          {group > 1 && (
            <div className="cost-total-sub">
              <span>{t('detail.wholeGroup', { n: group })}</span>
              <span>{eur(breakdown.grand_total)}</span>
            </div>
          )}
        </div>
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
