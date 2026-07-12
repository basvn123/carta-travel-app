import React from 'react';
import {
  composeTrip, buildFlightLinks, buildAccommodationLink, buildCarRentalLink,
  buildGuideLink, nearbyTrips,
} from './runtime_pricing.js';
import { GemRating, GemIcon } from './GemRating.jsx';
import { kindsForDest } from './trip_kinds.js';

export function DetailPanel({ destination, departDate, returnDate, choices, setChoices, priceMode = 'total', onClose, onOpenLifestyle, onSelect, data, isFavorite, onToggleFavorite, onSaveTrip }) {
  const [saveState, setSaveState] = React.useState('idle'); // idle | saving | saved

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
          {image.page && (
            <a className="panel-hero-credit" href={image.page} target="_blank" rel="noreferrer"
               title={image.credit ? `Wikipedia: ${image.credit}` : 'Source: Wikipedia'}>
              Wikipedia
            </a>
          )}
        </div>
      )}

      <div className={`panel-header ${image?.url ? 'has-hero' : ''}`}>
        <div className="panel-tag">
          {destination.tier === 'gem'
            ? <>GEM · {destination.iso2}</>
            : <>{destination.iata} · {destination.iso2}</>}
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
              {breakdown?.ground_one_way_eur > 0 && ` · €${breakdown.ground_one_way_eur} ground each way`}
              {breakdown?.ground_minutes > 0 && ` · ~${breakdown.ground_minutes} min`}
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
        </div>
      ) : (
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
      )}

      {/* What to do here - shows for every destination, reachable or not. */}
      <ExploreSection destination={destination} data={data} onSelect={onSelect} />
    </div>
  );
}

// "Things to do" + a clean travel-guide link + the best side-trips nearby.
function ExploreSection({ destination, data, onSelect }) {
  const items = destination.activities?.items || [];
  const guide = buildGuideLink({ city: destination.city });
  const nearby = data ? nearbyTrips({ ...destination, id: destination.id }, data.destinations) : [];

  if (items.length === 0 && !guide && nearby.length === 0) return null;

  return (
    <div className="panel-section">
      <div className="section-title">Things to do in {destination.city}</div>

      {items.length > 0 ? (
        <ul className="todo-list">
          {items.map((it, i) => {
            const row = (
              <>
                <span className="todo-name">{it.name}</span>
                {it.kind && <span className="todo-kind">{it.kind}</span>}
              </>
            );
            return (
              <li key={i} className="todo-item">
                {it.link
                  ? <a href={it.link} target="_blank" rel="noreferrer" className="todo-link">{row}</a>
                  : row}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="footnote" style={{ marginTop: 0 }}>
          See the full guide for sights and activities.
        </p>
      )}

      {guide && (
        <a className="todo-guide" href={guide} target="_blank" rel="noreferrer">
          Explore {destination.city} - what to do, see &amp; eat -&gt;
        </a>
      )}

      {nearby.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>Best trips from here</div>
          <div className="nearby-grid">
            {nearby.map((n) => (
              <button key={n.id} className="nearby-card" onClick={() => onSelect && onSelect(n.id)}
                      title={`${n.city}, ${n.country} - ~${n.km} km away`}>
                <div className="nearby-thumb"
                     style={n.image ? { backgroundImage: `url(${n.image})` } : undefined}>
                  {!n.image && <span className="nearby-thumb-fallback">{n.city.slice(0, 1)}</span>}
                </div>
                <div className="nearby-meta">
                  <span className="nearby-city">{n.city}</span>
                  <span className="nearby-sub">
                    {n.km} km
                    {n.gems ? <> · <GemIcon size={9} /> {n.gems}</> : null}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownTab({ destination, breakdown, departDate, returnDate, choices, setChoices, priceMode, onOpenLifestyle, anchor, data }) {
  const group = Math.max(1, choices.group_size || 1);
  const eur = (n) => (n == null ? '-' : `€${Math.round(n).toLocaleString('en-GB')}`);

  // Flight values are group totals; ground values are per-person. Convert ground
  // to group totals so a single show()/divide handles both consistently.
  const show = (groupTotal) => {
    if (groupTotal == null) return null;
    return priceMode === 'pp' ? groupTotal / group : groupTotal;
  };
  const g = breakdown.ground;
  const acc = breakdown.accommodation;
  const groundGroup = (perPerson) => (perPerson == null ? null : perPerson * group);

  const sourceLabel = {
    numbeo_city: 'city prices',
    numbeo_direct: 'country prices',
    pli_scaled: 'estimated prices',
  }[breakdown.price_source] || null;

  const accomSourceLabel = {
    inside_airbnb_city: 'Airbnb city rates',
    inside_airbnb_country: 'Airbnb country rates',
    airbnb_pli_scaled: 'estimated Airbnb rates',
  }[breakdown.accom_source] || null;

  return (
    <>
      <div className="panel-section">
        <div className="section-title">Trip total {priceMode === 'pp' ? '· per person' : ''}</div>

        {/* Getting there: plane vs car comparison (only when drivable) */}
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
              <span className="mode-pill-top">Drive · {breakdown.driving.road_km} km</span>
              <span className="mode-pill-val">{eur(show(breakdown.car_grand_total))}</span>
            </button>
          </div>
        )}

        {/* Transport line - depends on the chosen mode */}
        {breakdown.transport_mode === 'car' ? (
          <>
            <div className="total-row">
              <span className="label">
                Drive ({breakdown.driving.cars} {breakdown.driving.cars === 1 ? 'car' : 'cars'})
                <small>
                  {breakdown.driving.road_km} km each way · ~{breakdown.driving.drive_hours_one_way}h ·
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
            {/* Flights */}
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
            {/* Airport -> destination transfer (bus/shuttle), when the flight lands
                at an anchor airport rather than the destination itself. */}
            {breakdown.transfer_total > 0 && (
              <div className="total-row sub-row">
                <span className="label">
                  + Airport transfer{anchor ? ` from ${anchor}` : ''}
                  <small>
                    {`€${breakdown.transfer_one_way_eur.toFixed(0)} × 2 directions`}
                    {priceMode === 'total' && ` × ${group} people`}
                    {breakdown.ground_minutes > 0 ? ` · ~${breakdown.ground_minutes} min each way` : ''}
                  </small>
                </span>
                <span className="val">{eur(show(breakdown.transfer_total))}</span>
              </div>
            )}
            {/* Rental car at the destination (only when flying + a car is needed there) */}
            {breakdown.rental && (
              <div className="total-row" style={{ marginTop: 6 }}>
                <span className="label">
                  Rental car at destination
                  <small>
                    {breakdown.rental.cars} {breakdown.rental.cars === 1 ? 'car' : 'cars'} ×
                    {' '}{breakdown.rental.days} days · €{breakdown.rental.rate.toFixed(0)}/day
                    {breakdown.rental.season > 1 ? ' · incl. summer season' : ''}
                    {breakdown.rental.discount_pct > 0 ? ` · -${breakdown.rental.discount_pct}% weekly` : ''}
                  </small>
                </span>
                <span className="val">{eur(show(breakdown.rental_total))}</span>
              </div>
            )}
          </>
        )}

        {/* Is a car needed at the destination? */}
        <CarAdvisory lt={breakdown.local_transport} mode={breakdown.transport_mode} />

        {/* Car-rental booking link - offered for every destination, whether or not a
            car is needed there (the rental cost line above only shows when it is). */}
        {(() => {
          const carLink = buildCarRentalLink({
            city: destination.city,
            iata: destination.iata,
            departDate,
            returnDate,
          });
          return carLink ? (
            <a
              href={carLink}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block', marginTop: 8, background: 'none',
                border: 'none', padding: 0, color: 'var(--accent)',
                font: 'inherit', fontSize: 12, cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Compare rental cars on KAYAK
            </a>
          ) : null;
        })()}

        {/* Accommodation (Airbnb estimate) */}
        {acc && (
          <>
            <div className="total-row" style={{ marginTop: 6 }}>
              <span className="label">
                Accommodation · {breakdown.nights} {breakdown.nights === 1 ? 'night' : 'nights'}
                <small>
                  Entire home{accomSourceLabel ? ` · ${accomSourceLabel}` : ''}
                  {breakdown.accom_entire_home_night_eur
                    ? ` · ~€${Math.round(breakdown.accom_entire_home_night_eur)}/night base`
                    : ''}
                </small>
              </span>
              <span className="val">{eur(show(breakdown.accom_total))}</span>
            </div>
            <GroundLine label="Lodging"     v={show(groundGroup(acc.lodging))}  eur={eur} />
            <GroundLine label="Cleaning fee" v={show(groundGroup(acc.cleaning))} eur={eur} />
            <GroundLine label="Service fee"  v={show(groundGroup(acc.service))}  eur={eur} />
            {acc.season !== 1 && (
              <div className="total-row sub-row">
                <span className="label" style={{ fontWeight: 400, fontStyle: 'italic' }}>
                  {acc.season > 1 ? 'incl. summer season' : 'incl. off-season'}
                  {acc.los < 1 ? ` & weekly discount` : ''}
                </span>
                <span className="val" />
              </div>
            )}
            {(() => {
              const airbnb = buildAccommodationLink({
                city: destination.city,
                country: destination.country,
                departDate,
                returnDate,
                groupSize: choices.group_size,
              });
              return airbnb ? (
                <a
                  href={airbnb}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-block', marginTop: 8, background: 'none',
                    border: 'none', padding: 0, color: 'var(--accent)',
                    font: 'inherit', fontSize: 12, cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Find real listings on Airbnb
                </a>
              ) : null;
            })()}
          </>
        )}

        {/* On the ground */}
        {g && (
          <>
            <div className="total-row" style={{ marginTop: 6 }}>
              <span className="label">
                On the ground · {breakdown.nights} {breakdown.nights === 1 ? 'night' : 'nights'}
                <small>
                  Your lifestyle{sourceLabel ? ` · ${sourceLabel}` : ''}
                </small>
              </span>
              <span className="val">{eur(show(groundGroup(breakdown.ground_per_person)))}</span>
            </div>
            <GroundLine label="Dinners out"        v={show(groundGroup(g.dinners))}  eur={eur} />
            <GroundLine label="Casual meals"       v={show(groundGroup(g.lunches))}  eur={eur} />
            {g.fastfood > 0 && <GroundLine label="Fast food / street" v={show(groundGroup(g.fastfood))} eur={eur} />}
            <GroundLine label="Bar drinks"         v={show(groundGroup(g.drinks))}   eur={eur} />
            {g.clubbing > 0 && <GroundLine label="Club nights" v={show(groundGroup(g.clubbing))} eur={eur} />}
            <GroundLine label="Coffees"            v={show(groundGroup(g.coffees))}  eur={eur} />
            <GroundLine label="Groceries"          v={show(groundGroup(g.groceries))} eur={eur} />
            <button
              onClick={onOpenLifestyle}
              style={{
                marginTop: 8, background: 'none', border: 'none', padding: 0,
                color: 'var(--accent)', font: 'inherit', fontSize: 12,
                cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Adjust lifestyle
            </button>
          </>
        )}

        <div className="total-row grand">
          <span className="label">
            Total
            {priceMode === 'pp' && <small>per person</small>}
          </span>
          <span className="val">{eur(show(breakdown.grand_total))}</span>
        </div>
      </div>

      {departDate && returnDate && breakdown.transport_mode === 'plane' && breakdown.fare_total != null && (
        <FlightBookingSection
          destination={destination}
          departDate={departDate}
          returnDate={returnDate}
          breakdown={breakdown}
          choices={choices}
          anchor={anchor}
        />
      )}
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

function GroundLine({ label, v, eur }) {
  return (
    <div className="total-row sub-row">
      <span className="label" style={{ fontWeight: 400 }}>{label}</span>
      <span className="val">{eur(v)}</span>
    </div>
  );
}

function FlightBookingSection({ destination, departDate, returnDate, breakdown, choices, anchor }) {
  // Use the airport the priced fare actually departs from (CRL or BRU) so the
  // Skyscanner search matches the price we show - no hard-coded Brussels default.
  const origin = breakdown?.origin;
  const destIata = destination.iata || anchor;
  if (!origin || !destIata) return null;

  const links = buildFlightLinks({ origin, destIata, departDate, returnDate });
  if (!links.skyscanner) return null;

  return (
    <div className="panel-section">
      <div className="section-title">Verify the flight price</div>
      <p className="footnote" style={{ marginTop: 0, marginBottom: 12 }}>
        The cheapest Ryanair fare we found, per person. Open Skyscanner below to check the same dates yourself.
        {destination.tier === 'gem' && anchor && (
          <> You'll fly into <strong>{destIata}</strong>, around {breakdown.ground_minutes || '?'} min from {destination.city}.</>
        )}
      </p>
      <div className="book-row">
        <a className="book-btn" href={links.skyscanner} target="_blank" rel="noreferrer">
          <span>
            Search on Skyscanner
            <small style={{ display: 'block', fontSize: 10, opacity: .7, marginTop: 2 }}>
              {origin} -&gt; {destIata} · {departDate} -&gt; {returnDate}
            </small>
          </span>
          <span className="arrow">-&gt;</span>
        </a>
      </div>
    </div>
  );
}
