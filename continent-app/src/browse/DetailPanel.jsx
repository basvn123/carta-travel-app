import React from 'react';
import {
  composeTrip, buildFlightLinks, buildAccommodationLink, buildCarRentalLink,
  fareCoverageRanges, viaNearestAirport,
} from '../lib/runtime_pricing.js';
import { knownFor } from '../lib/knownFor.js';
import { ScoreChip, HiddenGemTag, tierClass } from '../components/RatingBadge.jsx';
import { BestTimePanel } from './BestTimePanel.jsx';
import { eur, safeUrl, PRICE_SOURCE_LABELS, ACCOM_SOURCE_LABELS } from '../lib/format.js';
import { ReceiptIcon, CalendarIcon, BedIcon, DiningIcon, CarIcon, InfoIcon } from '../components/Icons.jsx';
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

  const breakdown = composeTrip(destination, departDate, returnDate, choices, data?.destinations);
  const anchor = breakdown?.anchor_airport || destination.iata;
  // Show the anchor airport as a city name, not an IATA code.
  const anchorCity = anchor ? (data?.destinations?.[anchor]?.city || anchor) : null;
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
        <div className="panel-tag">Destination</div>
        <h2 className="panel-city">{destination.city}</h2>
        {destination.rating?.score != null && (
          <div className="panel-rating-row">
            <ScoreChip rating={destination.rating} size="lg" />
            {destination.rating.label && (
              <span className={`rating-label ${tierClass(destination.rating)}`}>
                {destination.rating.label}
              </span>
            )}
            {destination.rating.hidden_gem && <HiddenGemTag size="lg" />}
          </div>
        )}
        <div className="panel-country">
          {destination.country}
          {destination.tier === 'gem' && anchorCity && (
            <span className="panel-via">
              via {anchorCity}
              {breakdown?.ground_one_way_eur > 0 && `, €${breakdown.ground_one_way_eur} ground each way`}
              {breakdown?.ground_minutes > 0 && `, ~${breakdown.ground_minutes} min`}
            </span>
          )}
        </div>
        {knownFor(destination) && (
          <div className="panel-knownfor">{knownFor(destination)}</div>
        )}
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
      </div>

      {!breakdown ? (
        <div className="panel-section">
          <p style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>
            {(() => {
              const originCity = data?.meta?.origins?.[data?.meta?.selected_origin]?.city || 'your airport';
              const flyable = Object.keys(destination.routes || {}).length > 0;
              return flyable
                ? `No fare for these dates flying from ${originCity}.`
                : `No Ryanair flights from ${originCity} to ${destination.city}, and too far to drive.`;
            })()}
          </p>
          {Object.keys(destination.routes || {}).length > 0 && (() => {
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
          <ViaAirportOptions
            destination={destination}
            data={data}
            departDate={departDate}
            returnDate={returnDate}
            choices={choices}
            onSelect={onSelect}
          />
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
              key={destination.id}
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
              anchorCity={anchorCity}
              onSelect={onSelect}
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
function InfoButton({ open, onClick, label = 'How this is calculated' }) {
  return (
    <button
      type="button"
      className={`cost-info-btn ${open ? 'open' : ''}`}
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <InfoIcon size={12} />
    </button>
  );
}

function BreakdownTab({ destination, breakdown, departDate, returnDate, choices, setChoices, priceMode, onOpenLifestyle, anchor, anchorCity, data, onSelect }) {
  const group = Math.max(1, choices.group_size || 1);
  const originCity = data?.meta?.origins?.[data?.meta?.selected_origin]?.city || 'your airport';
  // The traveller asked to fly but no fare exists for these dates, so the
  // price shown is a DRIVE - say so loudly instead of a quiet "drive from
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
          <ReceiptIcon size={12} /> Trip total {priceMode === 'pp' ? '(per person)' : ''}
        </div>

        {/* ── Getting there ── */}
        <CostGroup
          icon={breakdown.transport_mode === 'car' ? <CarIcon size={15} /> : <PlaneIcon size={15} />}
          title="Getting there"
          subtitle={breakdown.transport_mode === 'car'
            ? (flyFellBack ? `No flight these dates, drive from ${originCity}` : `Drive from ${originCity}`)
            : 'Ryanair round-trip'}
          subtotal={transportSubtotal}
          open={openGroups.transport}
          onToggle={() => toggleGroup('transport')}
        >
          {flyFellBack && (
            <>
              <p className="cost-info-pop cost-fallback-note">
                There's no Ryanair fare from {originCity} to {destination.city} for these dates,
                so this price is for driving. To still fly, try the nearby airports below or shift your dates.
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
              {breakdown.driving.toll_notes?.length > 0 && (
                <p className="cost-info-pop">
                  Includes {breakdown.driving.toll_notes.join(', ')}, per car, priced per country crossed.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="total-row">
                <span className="label">
                  Flight
                  <small>
                    {destination.tier === 'gem' && anchorCity
                      ? `Round-trip Ryanair fare via ${anchorCity}`
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
                    + Airport transfer{anchorCity ? ` from ${anchorCity}` : ''}
                    <small>
                      {`€${breakdown.transfer_one_way_eur.toFixed(0)} × 2 directions`}
                      {priceMode === 'total' && ` × ${group} people`}
                      {breakdown.ground_minutes > 0 ? `, ~${breakdown.ground_minutes} min each way` : ''}
                    </small>
                  </span>
                  <span className="val">{eur(show(breakdown.transfer_total))}</span>
                </div>
              )}
            </>
          )}

          <CarAdvisory lt={breakdown.local_transport} mode={breakdown.transport_mode} />

          <div className="cost-group-links">
            {flightLink && <TextLink href={flightLink}>Check this fare on Skyscanner</TextLink>}
          </div>
        </CostGroup>

        {/* ── Rental car at the destination (own group: it's a whole-stay cost,
              not part of the journey there) ── */}
        {rentalSubtotal != null && (
          <CostGroup
            icon={<CarIcon size={15} />}
            title="Rental car at destination"
            subtitle={`${breakdown.rental.cars} ${breakdown.rental.cars === 1 ? 'car' : 'cars'}, ${breakdown.rental.days} days`}
            subtotal={rentalSubtotal}
            open={openGroups.rental}
            onToggle={() => toggleGroup('rental')}
          >
            <div className="total-row">
              <span className="label">
                Rental
                <small>
                  {breakdown.rental.cars} {breakdown.rental.cars === 1 ? 'car' : 'cars'} ×
                  {' '}{breakdown.rental.days} days, €{breakdown.rental.rate.toFixed(0)}/day
                  {breakdown.rental.season > 1 ? ', incl. summer season' : ''}
                  {breakdown.rental.discount_pct > 0 ? `, -${breakdown.rental.discount_pct}% weekly` : ''}
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
                return carLink ? <TextLink href={carLink}>Compare rental cars on KAYAK</TextLink> : null;
              })()}
            </div>
          </CostGroup>
        )}

        {/* ── Your stay ── */}
        {acc && (
          <CostGroup
            icon={<BedIcon size={15} />}
            title={`Your stay, ${breakdown.nights} ${breakdown.nights === 1 ? 'night' : 'nights'}`}
            subtotal={staySubtotal}
            open={openGroups.stay}
            onToggle={() => toggleGroup('stay')}
            infoButton={<InfoButton open={infoOpen === 'stay'} onClick={() => toggleInfo('stay')} />}
            infoPanel={infoOpen === 'stay' && (
              <InfoFacts rows={[
                ['Type', 'Entire home'],
                ['Base rate', breakdown.accom_entire_home_night_eur ? `~€${Math.round(breakdown.accom_entire_home_night_eur)} per night` : null],
                ['Nights', String(breakdown.nights)],
                ['Fees', 'Cleaning and service fees included'],
                ['Adjusted for', 'Season and length of stay'],
                ['Source', accomSourceLabel],
              ]} />
            )}
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
            subtotal={groundSubtotal}
            open={openGroups.ground}
            onToggle={() => toggleGroup('ground')}
            infoButton={<InfoButton open={infoOpen === 'ground'} onClick={() => toggleInfo('ground')} />}
            infoPanel={infoOpen === 'ground' && (
              <InfoFacts rows={[
                ['Based on', 'Your lifestyle settings'],
                ['Covers', 'Meals, drinks, nights out, groceries'],
                ['Rates', sourceLabel],
              ]} />
            )}
          >
            <GroundLine label="Dinners out"  v={show(groundGroup(g.dinners))}  eur={eur} rate={destination.costs?.meal_mid_eur} />
            <GroundLine label="Casual meals" v={show(groundGroup(g.lunches))}  eur={eur} rate={destination.costs?.meal_cheap_eur} />
            {g.fastfood > 0 && <GroundLine label="Fast food / street" v={show(groundGroup(g.fastfood))} eur={eur} rate={destination.costs?.fastfood_eur} />}
            <GroundLine label="Bar drinks"   v={show(groundGroup(g.drinks))}   eur={eur} rate={destination.costs?.drink_out_eur} />
            {g.clubbing > 0 && <GroundLine label="Club nights" v={show(groundGroup(g.clubbing))} eur={eur} />}
            {g.coffees > 0 && <GroundLine label="Coffees" v={show(groundGroup(g.coffees))} eur={eur} rate={destination.costs?.coffee_eur} />}
            <GroundLine label="Groceries"    v={show(groundGroup(g.groceries))} eur={eur} />
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
// The stored reasons join clauses with a bare dash ("… public transport -
// skip the car"); rewrite that as two sentences for display.
function cleanReason(s) {
  return String(s || '').replace(/\s+[-–—]\s+(\w)/g, (m, c) => `. ${c.toUpperCase()}`);
}

function CarAdvisory({ lt, mode }) {
  if (!lt) return null;
  const dot = lt.car_needed ? '#d98324' : '#3a9d6b';
  const reason = cleanReason(lt.reason);
  let text;
  if (lt.car_needed) {
    text = mode === 'car'
      ? `Car recommended here, and you'll have your own. ${reason}`
      : `Car recommended here, a rental is included above. ${reason}`;
  } else {
    text = `No car needed. ${reason}`;
  }
  return (
    <div className="car-advisory">
      <span className="car-advisory-dot" style={{ background: dot }} />
      <span>{text}</span>
    </div>
  );
}

/** "Fly to the nearest airport instead": real-fare alternatives for a
 *  destination with no direct flight on these dates - fly into a nearby
 *  airport we DO have a fare for, then drive/taxi the last stretch. */
function ViaAirportOptions({ destination, data, departDate, returnDate, choices, onSelect }) {
  const options = viaNearestAirport(destination, data?.destinations, departDate, returnDate, choices);
  if (!options.length) return null;
  return (
    <div className="via-airport">
      <div className="via-airport-title"><PlaneIcon size={11} /> Fly to a nearby airport instead</div>
      {options.map((o) => (
        <div className="via-airport-row" key={o.id}>
          <span className="via-airport-main">
            <b>{o.city}</b>
            <small>
              flight {eur(o.fare_per_person)}/p, then {o.road_km} km
              (~{o.drive_hours_one_way}h, ~{eur(o.leg_eur_pp_one_way)}/p each way)
            </small>
          </span>
          <span className="via-airport-est">~{eur(o.total_pp_est)}/p</span>
          {onSelect && (
            <button className="via-airport-open" onClick={() => onSelect(o.id)} title={`Open ${o.city}`}>View</button>
          )}
        </div>
      ))}
      <p className="via-airport-note">Flight fares are real stored Ryanair prices; the last stretch is a road estimate.</p>
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
