import React from 'react';
import {
  composeTrip, buildFlightLinks, buildAccommodationLink, buildCarRentalLink,
  fareCoverageRanges,
} from '../lib/runtime_pricing.js';
import { kindsForDest } from '../lib/trip_kinds.js';
import { BestTimePanel } from './BestTimePanel.jsx';
import { eur, safeUrl, PRICE_SOURCE_LABELS, ACCOM_SOURCE_LABELS } from '../lib/format.js';
import { ReceiptIcon, CalendarIcon, BedIcon, DiningIcon, CarIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

const fmtDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Small underlined text-button, used for the outbound links under each cost
// line (Airbnb, KAYAK, Skyscanner) and the "Adjust lifestyle" action.
function TextLink({ href, onClick, children }) {
  const props = href ? { href, target: '_blank', rel: 'noreferrer' } : { onClick, type: 'button' };
  const Tag = href ? 'a' : 'button';
  return <Tag className="detail-text-link" {...props}>{children}</Tag>;
}

export function DetailPanel({ destination, departDate, returnDate, choices, setChoices, priceMode = 'total', onClose, onOpenLifestyle, onSelect, data, isFavorite, onToggleFavorite, onSaveTrip, onShiftDates }) {
  const [saveState, setSaveState] = React.useState('idle'); // idle | saving | saved
  const [activeTab, setActiveTab] = React.useState('breakdown'); // breakdown | best-time

  // Land back on the breakdown whenever the user picks a different destination.
  React.useEffect(() => { setActiveTab('breakdown'); }, [destination?.id]);

  if (!destination) {
    return <div className="panel" aria-hidden="true" />;
  }

  const handleSaveTrip = async () => {
    if (!onSaveTrip || saveState === 'saving') return;
    setSaveState('saving');
    try {
      await onSaveTrip(destination);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('idle');
    }
  };

  const breakdown = composeTrip(destination, departDate, returnDate, choices);
  const anchor = breakdown?.anchor_airport || destination.iata;
  const kinds = kindsForDest(destination.categories);
  const image = destination.image;

  return (
    <div className="panel open">
      <button className="panel-close" onClick={onClose} aria-label="Close">x</button>

      {/* The most impressive image of the region (Wikipedia lead photo). */}
      {image?.url && (
        <div className="panel-hero" style={{ backgroundImage: `url(${image.url})` }}>
          <div className="panel-hero-shade" />
          {safeUrl(image.page) && (
            <a className="panel-hero-credit" href={safeUrl(image.page)} target="_blank" rel="noreferrer"
               title={image.credit ? `Wikipedia: ${image.credit}` : 'Source: Wikipedia'}>
              Wikipedia
            </a>
          )}
        </div>
      )}

      <div className={`panel-header ${image?.url ? 'has-hero' : ''}`}>
        <div className="panel-tag">
          {destination.tier === 'gem'
            ? <>GEM, {destination.iso2}</>
            : <>{destination.iata}, {destination.iso2}</>}
        </div>
        <div className="panel-action-row">
          {onToggleFavorite && (
            <button
              className={`panel-fav ${isFavorite ? 'on' : ''}`}
              onClick={onToggleFavorite}
              aria-label={isFavorite ? 'Remove from shortlist' : 'Add to shortlist'}
              title={isFavorite ? 'Remove from shortlist' : 'Add to shortlist'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
                fill={isFavorite ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <polygon points="12 2 15.1 8.6 22 9.3 16.8 14 18.3 21 12 17.3 5.7 21 7.2 14 2 9.3 8.9 8.6" />
              </svg>
              <span>{isFavorite ? 'Shortlisted' : 'Shortlist'}</span>
            </button>
          )}
          {onSaveTrip && (
            <button
              className={`panel-fav ${saveState === 'saved' ? 'on' : ''}`}
              onClick={handleSaveTrip}
              disabled={saveState === 'saving'}
              aria-label="Save this trip to your account"
              title="Save this trip to your account"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
                fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              <span>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save trip'}</span>
            </button>
          )}
        </div>
        <h2 className="panel-city">{destination.city}</h2>
        <div className="panel-country">
          {destination.country}
          {destination.tier === 'gem' && anchor && (
            <span className="panel-via">
              via {anchor}
              {breakdown?.ground_one_way_eur > 0 && `, €${breakdown.ground_one_way_eur} ground each way`}
              {breakdown?.ground_minutes > 0 && `, ~${breakdown.ground_minutes} min`}
            </span>
          )}
        </div>
        {destination.blurb && destination.tier === 'gem' && (
          <div className="panel-blurb">{destination.blurb}</div>
        )}
        {kinds.length > 0 && (
          <div className="panel-kinds">
            {kinds.map((k) => (
              <span key={k.key} className="panel-kind">{k.label}</span>
            ))}
          </div>
        )}
      </div>

      {!breakdown ? (
        <div className="panel-section">
          <p style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>
            {destination.no_ryanair_route
              ? 'No Ryanair route to this destination.'
              : 'No fare data for these dates.'}
          </p>
          {!destination.no_ryanair_route && (() => {
            const ranges = fareCoverageRanges(destination);
            if (ranges.length === 0) return null;
            return (
              <p className="panel-fare-coverage">
                Fare data is available {ranges.length === 1 ? 'for' : 'in these periods'}:{' '}
                {ranges.map((r, i) => (
                  <span key={r.start}>
                    {i > 0 && ', '}
                    {fmtDate(r.start)} - {fmtDate(r.end)}
                  </span>
                ))}
              </p>
            );
          })()}
        </div>
      ) : (
        <>
          <div className="tabs panel-tabs">
            <button
              className={`tab tab-iconed ${activeTab === 'breakdown' ? 'active' : ''}`}
              onClick={() => setActiveTab('breakdown')}
            >
              <ReceiptIcon size={12} /> Breakdown
            </button>
            <button
              className={`tab tab-iconed ${activeTab === 'best-time' ? 'active' : ''}`}
              onClick={() => setActiveTab('best-time')}
            >
              <CalendarIcon size={12} /> Best time to go
            </button>
          </div>

          {activeTab === 'breakdown' ? (
            <BreakdownTab
              destination={destination}
              breakdown={breakdown}
              departDate={departDate}
              returnDate={returnDate}
              choices={choices}
              setChoices={setChoices}
              priceMode={priceMode}
              onOpenLifestyle={onOpenLifestyle}
              data={data}
              anchor={anchor}
            />
          ) : (
            <BestTimePanel
              destination={destination}
              departDate={departDate}
              returnDate={returnDate}
              breakdown={breakdown}
              choices={choices}
              data={data}
              onShiftDates={onShiftDates}
            />
          )}
        </>
      )}
    </div>
  );
}

/** A grouped block of cost rows: icon-led header with the group subtotal on
 *  the right, rows inside. Mirrors the lifestyle panel's card treatment so
 *  transport / stay / on-the-ground read as three clearly distinct buckets. */
function CostGroup({ icon, title, subtitle, subtotal, children }) {
  return (
    <div className="cost-group">
      <div className="cost-group-head">
        <span className="cost-group-icon">{icon}</span>
        <span className="cost-group-title">
          {title}
          {subtitle && <small>{subtitle}</small>}
        </span>
        {subtotal != null && <span className="cost-group-val">{eur(subtotal)}</span>}
      </div>
      <div className="cost-group-body">{children}</div>
    </div>
  );
}

function BreakdownTab({ destination, breakdown, departDate, returnDate, choices, setChoices, priceMode, onOpenLifestyle, anchor, data }) {
  const group = Math.max(1, choices.group_size || 1);

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

  // Group subtotals for the three buckets, in the active price mode.
  const transportSubtotal = breakdown.transport_mode === 'car'
    ? show(breakdown.driving?.total)
    : show((breakdown.fare_total || 0)
        + (breakdown.baggage_total || 0)
        + (breakdown.transfer_total || 0)
        + (breakdown.rental_total || 0));
  const staySubtotal = acc ? show(breakdown.accom_total) : null;
  const groundSubtotal = g ? show(groundGroup(breakdown.ground_per_person)) : null;

  // Skyscanner verification link, kept inside the Getting-there group.
  const flightLink = (() => {
    if (breakdown.transport_mode !== 'plane' || breakdown.fare_total == null) return null;
    const origin = breakdown.origin;
    const destIata = destination.iata || anchor;
    if (!origin || !destIata || !departDate || !returnDate) return null;
    return buildFlightLinks({ origin, destIata, departDate, returnDate }).skyscanner || null;
  })();

  // Local unit rates: what everyday things actually cost here. Surfaced so the
  // on-the-ground estimate is as inspectable as the Airbnb nightly base rate.
  const unitRates = destination.costs ? [
    ['Dinner out', destination.costs.meal_mid_eur],
    ['Casual meal', destination.costs.meal_cheap_eur],
    ['Beer / wine out', destination.costs.drink_out_eur],
    ['Coffee', destination.costs.coffee_eur],
    ['Groceries / day', destination.costs.grocery_day_eur],
  ].filter(([, v]) => v > 0) : [];

  return (
    <>
      <div className="panel-section">
        <div className="section-title section-title-iconed">
          <ReceiptIcon size={12} /> Trip total {priceMode === 'pp' ? '(per person)' : ''}
        </div>

        {/* ── Getting there ── */}
        <CostGroup
          icon={breakdown.transport_mode === 'car' ? <CarIcon size={15} /> : <PlaneIcon size={15} />}
          title="Getting there"
          subtitle={breakdown.transport_mode === 'car' ? 'Drive from home' : 'Ryanair round-trip'}
          subtotal={transportSubtotal}
        >
          {/* Plane vs car comparison (only when drivable) */}
          {breakdown.drivable && setChoices && (
            <div className="mode-toggle">
              <button
                className={`mode-pill ${breakdown.transport_mode === 'plane' ? 'on' : ''}`}
                disabled={breakdown.plane_grand_total == null}
                onClick={() => setChoices({ ...choices, transport_mode: 'plane' })}
              >
                <span className="mode-pill-top">Fly</span>
                <span className="mode-pill-val">
                  {breakdown.plane_grand_total != null ? eur(show(breakdown.plane_grand_total)) : 'no route'}
                </span>
              </button>
              <button
                className={`mode-pill ${breakdown.transport_mode === 'car' ? 'on' : ''}`}
                onClick={() => setChoices({ ...choices, transport_mode: 'car' })}
              >
                <span className="mode-pill-top">Drive, {breakdown.driving.road_km} km</span>
                <span className="mode-pill-val">{eur(show(breakdown.car_grand_total))}</span>
              </button>
            </div>
          )}

          {breakdown.transport_mode === 'car' ? (
            <>
              <div className="total-row">
                <span className="label">
                  Drive ({breakdown.driving.cars} {breakdown.driving.cars === 1 ? 'car' : 'cars'})
                  <small>
                    {breakdown.driving.road_km} km each way, ~{breakdown.driving.drive_hours_one_way}h,
                    {' '}€{breakdown.driving.fuel_price_eur_per_l.toFixed(2)}/L
                  </small>
                </span>
                <span className="val">{eur(show(breakdown.driving.total))}</span>
              </div>
              <GroundLine label="Fuel" v={show(breakdown.driving.fuel_total)} eur={eur} />
              {breakdown.driving.toll_total > 0 && (
                <GroundLine label="Tolls / vignette" v={show(breakdown.driving.toll_total)} eur={eur} />
              )}
            </>
          ) : (
            <>
              <div className="total-row">
                <span className="label">
                  Flight ({destination.iata || anchor || '?'})
                  <small>
                    {destination.tier === 'gem' && anchor
                      ? `Round-trip via ${anchor}`
                      : 'Round-trip Ryanair fare'}
                  </small>
                </span>
                <span className="val">{eur(show(breakdown.fare_total))}</span>
              </div>
              {breakdown.baggage_per_person > 0 && (
                <div className="total-row sub-row">
                  <span className="label">
                    + {data?.meta?.baggage_options?.[choices.baggage_key]?.label || 'Baggage'}
                    <small>
                      {`€${(choices.baggage_per_direction_eur || 0).toFixed(0)} × 2 directions`}
                      {priceMode === 'total' && ` × ${group} people`}
                    </small>
                  </span>
                  <span className="val">{eur(show(breakdown.baggage_total))}</span>
                </div>
              )}
              {breakdown.transfer_total > 0 && (
                <div className="total-row sub-row">
                  <span className="label">
                    + Airport transfer{anchor ? ` from ${anchor}` : ''}
                    <small>
                      {`€${breakdown.transfer_one_way_eur.toFixed(0)} × 2 directions`}
                      {priceMode === 'total' && ` × ${group} people`}
                      {breakdown.ground_minutes > 0 ? `, ~${breakdown.ground_minutes} min each way` : ''}
                    </small>
                  </span>
                  <span className="val">{eur(show(breakdown.transfer_total))}</span>
                </div>
              )}
              {breakdown.rental && (
                <div className="total-row">
                  <span className="label">
                    Rental car at destination
                    <small>
                      {breakdown.rental.cars} {breakdown.rental.cars === 1 ? 'car' : 'cars'} ×
                      {' '}{breakdown.rental.days} days, €{breakdown.rental.rate.toFixed(0)}/day
                      {breakdown.rental.season > 1 ? ', incl. summer season' : ''}
                      {breakdown.rental.discount_pct > 0 ? `, -${breakdown.rental.discount_pct}% weekly` : ''}
                    </small>
                  </span>
                  <span className="val">{eur(show(breakdown.rental_total))}</span>
                </div>
              )}
            </>
          )}

          <CarAdvisory lt={breakdown.local_transport} mode={breakdown.transport_mode} />

          <div className="cost-group-links">
            {flightLink && <TextLink href={flightLink}>Check this fare on Skyscanner</TextLink>}
            {(() => {
              const carLink = buildCarRentalLink({
                city: destination.city,
                iata: destination.iata,
                departDate,
                returnDate,
              });
              return carLink ? <TextLink href={carLink}>Compare rental cars on KAYAK</TextLink> : null;
            })()}
          </div>
        </CostGroup>

        {/* ── Your stay ── */}
        {acc && (
          <CostGroup
            icon={<BedIcon size={15} />}
            title={`Your stay, ${breakdown.nights} ${breakdown.nights === 1 ? 'night' : 'nights'}`}
            subtitle={`Entire home${accomSourceLabel ? `, ${accomSourceLabel}` : ''}${breakdown.accom_entire_home_night_eur ? `, ~€${Math.round(breakdown.accom_entire_home_night_eur)}/night base` : ''}`}
            subtotal={staySubtotal}
          >
            <GroundLine label="Lodging"      v={show(groundGroup(acc.lodging))}  eur={eur} />
            <GroundLine label="Cleaning fee" v={show(groundGroup(acc.cleaning))} eur={eur} />
            <GroundLine label="Service fee"  v={show(groundGroup(acc.service))}  eur={eur} />
            {acc.season !== 1 && (
              <div className="total-row sub-row">
                <span className="label" style={{ fontWeight: 400, fontStyle: 'italic' }}>
                  {acc.season > 1 ? 'incl. summer season' : 'incl. off-season'}
                  {acc.los < 1 ? ' & weekly discount' : ''}
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
                return airbnb ? <TextLink href={airbnb}>Find real listings on Airbnb</TextLink> : null;
              })()}
            </div>
          </CostGroup>
        )}

        {/* ── On the ground ── */}
        {g && (
          <CostGroup
            icon={<DiningIcon size={15} />}
            title={`On the ground, ${breakdown.nights} ${breakdown.nights === 1 ? 'night' : 'nights'}`}
            subtitle={`Your lifestyle${sourceLabel ? `, ${sourceLabel}` : ''}`}
            subtotal={groundSubtotal}
          >
            <GroundLine label="Dinners out"  v={show(groundGroup(g.dinners))}  eur={eur} rate={destination.costs?.meal_mid_eur} />
            <GroundLine label="Casual meals" v={show(groundGroup(g.lunches))}  eur={eur} rate={destination.costs?.meal_cheap_eur} />
            {g.fastfood > 0 && <GroundLine label="Fast food / street" v={show(groundGroup(g.fastfood))} eur={eur} rate={destination.costs?.fastfood_eur} />}
            <GroundLine label="Bar drinks"   v={show(groundGroup(g.drinks))}   eur={eur} rate={destination.costs?.drink_out_eur} />
            {g.clubbing > 0 && <GroundLine label="Club nights" v={show(groundGroup(g.clubbing))} eur={eur} />}
            <GroundLine label="Coffees"      v={show(groundGroup(g.coffees))}  eur={eur} rate={destination.costs?.coffee_eur} />
            <GroundLine label="Groceries"    v={show(groundGroup(g.groceries))} eur={eur} />
            {unitRates.length > 0 && (
              <p className="cost-local-rates">
                Local rates: {unitRates.map(([lbl, v], i) => (
                  <span key={lbl}>{i > 0 && ' · '}{lbl} €{v}</span>
                ))}
              </p>
            )}
            <div className="cost-group-links">
              <TextLink onClick={onOpenLifestyle}>Adjust lifestyle</TextLink>
            </div>
          </CostGroup>
        )}

        {/* ── Grand total: styled like the lifestyle panel's summary card, with
              the per-person figure always visible and emphasised. ── */}
        <div className="cost-total-card">
          <div className="cost-total-main">
            <span className="cost-total-label">
              Total per person
              <small>{breakdown.nights} {breakdown.nights === 1 ? 'night' : 'nights'}, everything in</small>
            </span>
            <span className="cost-total-val">{eur(breakdown.grand_total / group)}</span>
          </div>
          {group > 1 && (
            <div className="cost-total-sub">
              <span>Whole group ({group} people)</span>
              <span>{eur(breakdown.grand_total)}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// "Is a car needed here?" advisory - the second car layer.
function CarAdvisory({ lt, mode }) {
  if (!lt) return null;
  const dot = lt.car_needed ? '#d98324' : '#3a9d6b';
  let text;
  if (lt.car_needed) {
    text = mode === 'car'
      ? `Car recommended here - and you'll have your own. ${lt.reason}`
      : `Car recommended here - a rental is included above. ${lt.reason}`;
  } else {
    text = `No car needed. ${lt.reason}`;
  }
  return (
    <div className="car-advisory">
      <span className="car-advisory-dot" style={{ background: dot }} />
      <span>{text}</span>
    </div>
  );
}

function GroundLine({ label, v, eur, rate }) {
  return (
    <div className="total-row sub-row">
      <span className="label" style={{ fontWeight: 400 }}>
        {label}
        {rate > 0 && <small>€{rate} each, local rate</small>}
      </span>
      <span className="val">{eur(v)}</span>
    </div>
  );
}
