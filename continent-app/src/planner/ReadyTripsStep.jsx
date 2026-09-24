import React, { useEffect, useMemo, useState } from 'react';
import { loadTripsFor, rankTrips, groupTripVariants } from '../lib/trips.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { srcSetFor, fallbackSrc } from '../lib/heroImage.js';
import { NON_PHOTO_IMG } from '../lib/countryCovers.js';
import { isFav } from '../lib/favorites.js';
import { useI18n } from '../i18n/index.jsx';
import { cityLabel, cityKeyName } from '../lib/placeName.js';
import { RouteIcon, CheckIcon, SparkIcon, StarIcon } from '../components/Icons.jsx';

/**
 * The ready-made half of the planner: published itineraries that were composed
 * and checked by pipeline/trips, filtered down to the countries this traveller
 * ticked and the days they actually have.
 *
 * ONE list. It used to be two columns, "Across your countries" and "Inside one
 * country", each with a sentence explaining itself, above a map/list toggle and
 * cards carrying transport, shape, tags, sights, a price per day and a season.
 * Six facts is a comparison table, and nobody compares forty of anything: the
 * card now answers "where does it go, for how long" and the rest of the trip is
 * one tap away on its own page, which is the page Destinations already shows.
 *
 * Near-duplicates collapse. The same route is composed at every length it works
 * at, so "Bruges and Paris" arrived three times with one photograph between
 * them; groupTripVariants folds those into one card with length chips, and the
 * chip nearest the traveller's window is the one already on.
 *
 * Ticking a country off the row above rebuilds the list. That is the whole
 * point of the step: the country picker was a shortlist of maybes, and this is
 * where the maybes turn into a route, so undoing one has to be one tap and has
 * to show its consequence immediately.
 *
 * Nothing here is invented. Every card is a published trip: real stops, real
 * nights, legs the transport engine agreed exist.
 */

/** How many of the traveller's own countries a trip actually visits. */
function coverage(trip, picked) {
  return (trip.countries || []).filter((cc) => picked.has(cc)).length;
}

/**
 * The card's photograph, at the widths Wikimedia will actually render.
 *
 * .wtrip-media was a fixed 128px box fed a single 500px rendering with no
 * srcSet, so a route photograph was cropped to a letterbox on every screen and
 * a phone paid for pixels it drew at a third the size. This is the CardPhoto
 * pattern from the Destinations grid: 500 as the fallback, a srcSet up to 960,
 * and width/height as the ASPECT so the box is reserved before the bytes land.
 */
const TRIP_SIZES = '(max-width: 768px) 92vw, (max-width: 1200px) 45vw, 380px';

function TripPhoto({ url }) {
  if (!url) {
    return (
      <span className="wtrip-img wtrip-noimg" aria-hidden="true"><RouteIcon size={22} /></span>
    );
  }
  return (
    <img
      className="wtrip-img"
      src={fallbackSrc(url, 500)}
      srcSet={srcSetFor(url, 960)}
      sizes={TRIP_SIZES}
      alt=""
      width={25}
      height={12}
      loading="lazy"
      decoding="async"
    />
  );
}

/**
 * The identity of a photograph, for the "no two cards alike" test.
 *
 * A published trip carries its cover as a Wikimedia THUMB url, and the export
 * picks the width per trip, so the same photograph arrives as both
 * ".../960px-Refuge_perafita_andorra.jpg" and ".../500px-Refuge_perafita_
 * andorra.jpg". Those are one picture to anybody looking at the grid, so the
 * width is dropped before they are compared.
 */
function photoKey(url) {
  return String(url || '').replace(/\/\d+px-/, '/');
}

/**
 * The photograph each card gets, decided across the whole list rather than per
 * card, because the two things that can go wrong are both about the list:
 * a trip whose own image is a coat of arms or a locator map, and two cards
 * side by side wearing the same picture.
 *
 * The fallback is the first stop's own destination photograph. A trip CARD
 * names its stops by city, not by catalogue id (only the detail file carries
 * `dest`), so the stops are looked up through a city index built once for the
 * whole list rather than by scanning 3.8k destinations per card.
 */
function tripPhotos(trips, destinations) {
  const byCity = new Map();
  for (const d of Object.values(destinations || {})) {
    if (!d?.city || !d.image?.url) continue;
    const key = `${cityKeyName(d.city).toLowerCase()}|${d.iso2 || ''}`;
    if (!byCity.has(key)) byCity.set(key, d.image.url);
  }
  const stopPhoto = (c) => byCity.get(`${cityKeyName(c.city || '').toLowerCase()}|${c.cc || ''}`) || '';

  const used = new Set();
  const out = new Map();
  for (const trip of trips) {
    const own = trip.img?.url || '';
    // The trip's own photograph first, unless it is a crest, a flag or a
    // locator map. Then each stop in turn: two trips through the same country
    // often share a cover, but they rarely share their whole route, so walking
    // the stops finds a different file rather than settling for a repeat.
    const candidates = [
      own && !NON_PHOTO_IMG.test(own) ? own : '',
      ...(trip.cities || trip.stops || [])
        .map(stopPhoto)
        .filter((u) => u && !NON_PHOTO_IMG.test(u)),
    ].filter(Boolean);
    // A repeat still beats the no-image placeholder, so the first candidate is
    // the fallback when every one of them is already on another card.
    const url = candidates.find((u) => !used.has(photoKey(u))) || candidates[0] || '';
    if (url) used.add(photoKey(url));
    out.set(trip.id, url);
  }
  return out;
}

/**
 * One trip, as a card.
 *
 * Photograph, how long it takes, where it goes, and two ways on. The lengths
 * this route was also composed at sit under the route as chips, and choosing
 * one swaps which trip the card IS, so the buttons below always act on what
 * the card is currently showing.
 */
function TripCard({ trip, photo, chosen, starred, onPick, onOpen, t }) {
  // Which variant the card is showing. It starts on the one groupTripVariants
  // preselected (nearest the window) and only moves when the traveller says so.
  const [shownId, setShownId] = useState(trip.id);
  const variants = trip.variants || [trip];
  const shown = variants.find((v) => v.id === shownId) || trip;
  // The group is rebuilt whenever the countries or the window change, so the
  // preselection can move under a card that is still mounted.
  useEffect(() => { setShownId(trip.id); }, [trip.id]);

  return (
    <div className={`wtrip ${chosen ? 'on' : ''}`}>
      <div className="wtrip-media">
        <TripPhoto url={photo} />
        <span className="wtrip-scrim" aria-hidden="true" />
        <span className="wtrip-days">
          <b>{shown.days}</b> {t(shown.days === 1 ? 'trip.dayWord' : 'trip.daysWord')}
        </span>
        {chosen && <span className="wtrip-check"><CheckIcon size={12} /></span>}
        {/* The list already puts starred trips first; without a mark on the
            card that ordering is invisible and reads as an arbitrary shuffle. */}
        {starred && !chosen && (
          <span className="wtrip-star" title={t('ready.starred')}><StarIcon size={12} /></span>
        )}
      </div>
      <div className="wtrip-body">
        <p className="wtrip-route">
          {(shown.cities || []).map((c, i) => (
            <React.Fragment key={`${c.city}-${i}`}>
              {i > 0 && <span className="wtrip-arrow" aria-hidden="true">&rarr;</span>}
              <span className="wtrip-city">
                <CountryFlag country={c.cc} size={10} />
                {cityLabel(c.city)}
              </span>
            </React.Fragment>
          ))}
        </p>

        {variants.length > 1 && (
          <div className="wtrip-lens" role="group" aria-label={t('ready.lengthsLabel')}>
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`wtrip-len ${v.id === shown.id ? 'on' : ''}`}
                onClick={() => setShownId(v.id)}
                aria-pressed={v.id === shown.id}
              >
                {v.id === shown.id ? t('ready.lenDays', { n: v.days }) : v.days}
              </button>
            ))}
          </div>
        )}

        <div className="wtrip-acts">
          <button type="button" className="wtrip-choose" onClick={() => onPick(shown)}>
            {chosen ? <><CheckIcon size={13} /> {t('ready.chosen')}</> : t('ready.choose')}
          </button>
          <button type="button" className="wtrip-what" onClick={() => onOpen(shown)}>
            {t('ready.whatsThere')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReadyTripsStep({
  countries, allCountries, windowNights, selectedId, onPick, onToggleCountry, onBuildOwn,
  onRestorePick, onOpenTrip, destinations = null, favorites = null,
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState(null);   // null = loading
  const [anyLength, setAnyLength] = useState(false);
  // How many cards the list is showing. A country pair can offer hundreds of
  // trips and nobody scrolls that; the button says how many are still behind
  // it, so the list is short without the shortening being a secret.
  const [shown, setShown] = useState(12);

  const picked = useMemo(() => {
    const set = new Set();
    for (const c of allCountries) if (countries.has(c.country)) set.add(c.iso2);
    return set;
  }, [countries, allCountries]);
  const ccKey = [...picked].sort().join(',');

  useEffect(() => {
    let live = true;
    setRows(null);
    if (!picked.size) { setRows([]); return undefined; }
    setShown(12);
    loadTripsFor([...picked]).then((list) => { if (live) setRows(list || []); });
    return () => { live = false; };
  }, [ccKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A trip is offered when it visits at least one country still ticked. Length
  // follows the window from the first step, one day either side, because a
  // seven day trip is a perfectly good eight day trip with a slow morning in
  // it; "any length" opens that up when the window is unusual.
  const days = windowNights > 0 ? windowNights + 1 : null;
  const { list, hidden } = useMemo(() => {
    const all = (rows || []).filter((trip) => coverage(trip, picked) > 0);
    const fitted = rankTrips(all, { days: anyLength ? null : days });
    // Favourited first, then the trips that answer more of the shortlist, then
    // the score. A starred trip is the traveller's own earlier decision and
    // outranks anything the ranking has to say about it.
    const grouped = groupTripVariants(fitted, anyLength ? null : days);
    const starred = (trip) => ((trip.variants || [trip])
      .some((v) => isFav(favorites, 'trip', v.id)) ? 1 : 0);
    grouped.sort((a, b) => starred(b) - starred(a)
      || coverage(b, picked) - coverage(a, picked)
      || b.score - a.score
      || a.id.localeCompare(b.id));
    return { list: grouped, hidden: all.length - fitted.length };
  }, [rows, picked, days, anyLength, favorites]);

  // One photograph per card, chosen across the list so no two cards match.
  const photos = useMemo(() => tripPhotos(list, destinations), [list, destinations]);

  // A restored draft carries the chosen trip's id, not the card: the card
  // lives in the published country file this step has just fetched. Hand the
  // full card back up the first time the id is seen, so the wizard can render
  // its name and load its stops.
  useEffect(() => {
    if (!onRestorePick || !selectedId || !rows) return;
    const card = rows.find((x) => x.id === selectedId);
    if (card) onRestorePick(card);
  }, [rows, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = rows != null && list.length === 0;
  // The countries this list is for, named in the title rather than in a
  // sentence under it.
  const pickedNames = allCountries.filter((c) => countries.has(c.country)).map((c) => c.country);

  return (
    <div className="wready">
      {/* The shortlist, still editable, with its consequence one row below. */}
      <div className="wready-chips">
        {allCountries.filter((c) => countries.has(c.country)).map((c) => (
          <button
            key={c.country}
            className="wready-chip on"
            onClick={() => onToggleCountry(c.country)}
            title={t('ready.dropCountry', { country: c.country })}
          >
            <CountryFlag country={c.iso2} size={12} />
            {c.country}
            <span className="wready-chip-x" aria-hidden="true">&times;</span>
          </button>
        ))}
      </div>

      {rows == null && <p className="guide-empty">{t('ready.loading')}</p>}

      {empty && (
        <div className="wready-empty">
          <p>{t('ready.noneFit', { days: days || windowNights })}</p>
          <div className="wready-empty-actions">
            {!anyLength && days && (
              <button className="guide-back" onClick={() => setAnyLength(true)}>{t('ready.showAnyLength')}</button>
            )}
            <button className="guide-back" onClick={() => onBuildOwn('custom')}>{t('ready.buildOwn')}</button>
          </div>
        </div>
      )}

      {!empty && rows != null && (
        <>
          <h3 className="wready-title">
            <span>{t('ready.listTitle', { countries: pickedNames.join(', ') })}</span>
            <span className="wready-col-n">{list.length}</span>
          </h3>

          <div className="wready-grid">
            {list.slice(0, shown).map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                photo={photos.get(trip.id)}
                chosen={(trip.variants || [trip]).some((v) => v.id === selectedId)}
                starred={(trip.variants || [trip]).some((v) => isFav(favorites, 'trip', v.id))}
                onPick={onPick}
                onOpen={onOpenTrip}
                t={t}
              />
            ))}
          </div>

          {list.length > shown && (
            <button className="wready-more" onClick={() => setShown((n) => n + 12)}>
              {t('ready.showMore', { n: list.length - shown })}
            </button>
          )}
        </>
      )}

      {!empty && rows != null && (hidden > 0 || anyLength) && (
        <p className="wready-note">
          {anyLength
            ? t('ready.anyLengthOn', { days: days || windowNights })
            : t('ready.hiddenByLength', { n: hidden, days })}
          <button className="wready-link" onClick={() => setAnyLength(!anyLength)}>
            {anyLength ? t('ready.backToMyDays') : t('ready.showAnyLength')}
          </button>
        </p>
      )}

      {/* The end of the list, and the other way out of it. */}
      {rows != null && !empty && (
        <button className="wready-own-card" onClick={() => onBuildOwn('custom')}>
          <SparkIcon size={15} />
          <span>{t('ready.orBuildOwn')}</span>
          <b>{t('ready.buildOwnGo')}</b>
        </button>
      )}
    </div>
  );
}
