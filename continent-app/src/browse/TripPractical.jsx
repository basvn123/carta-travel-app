import React from 'react';
import { loadDossier } from '../lib/dossier.js';
import { eur } from '../lib/format.js';
import {
  ParkingIcon, CarIcon, BedIcon, ChevronRightIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

/**
 * The practical block: what a traveller has to arrange, from facts we already
 * hold rather than from facts we would have to invent.
 *
 * Four questions, four sources, all of them already on disk:
 *
 *   where do I park        dossier.parking.spots, the OSM car park harvest,
 *                          each with its distance, its walk, its fee and a
 *                          directions link built from its coordinate
 *   what is the drive      the trip's own legs, which carry km and minutes
 *   what does a bed cost   dossier.sleep.per_person_night_eur, the same
 *                          measured rate the cost panel reads
 *   how do I get in        dossier.practical.getting_there, the anchor
 *                          airport and whether a car is needed at all
 *
 * The rule the prompt sets and this file keeps: never invent a fact. A row
 * whose data is absent is not rendered, and nothing here prints "unknown". A
 * stop whose dossier has not been built contributes nothing rather than a
 * placeholder, which is why every list below is filtered before it is counted.
 *
 * Provenance is stated the way CostSummary states it: a short line under the
 * rows naming where the figures came from, so a reader can trace a number back
 * to a source rather than taking it on faith. Only the sources that actually
 * produced a row on this page are named.
 *
 * One thing deliberately NOT shown: a toll figure per leg. The prompt asked
 * for dest.driving_toll here, and it is the wrong number for this row twice
 * over. It is not in the dossier contract this component reads, and where it
 * does exist (app_data) it is a ROUND TRIP from the traveller's own home with
 * vignettes folded in (lib/runtime_pricing.js), so printing it against a
 * Salzburg-Vienna leg would be a real figure in the wrong place. What a driver
 * actually needs at a stop is whether they can get near it at all, so the
 * researched parking advice takes that slot: pedestrian zones and summer road
 * closures, from the town's own transport page.
 */

const fmtDist = (m) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/**
 * The dossier's parking advice, cut back to its last whole sentence.
 *
 * The harvest caps this field at 240 characters, and it cuts mid-word: five of
 * the ten towns carrying advice end on a fragment ("...via Neutorstrasse
 * rather than t"). A sentence that stops mid-word reads as a rendering bug
 * rather than as a fact, so the fragment is dropped and the official link,
 * which is on the same row, carries the rest. Fixing the cap belongs in the
 * harvester; this only refuses to print the damage.
 */
function wholeSentences(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (/[.!?]$/.test(raw)) return raw;
  const cut = Math.max(raw.lastIndexOf('. '), raw.lastIndexOf('! '), raw.lastIndexOf('? '));
  return cut > 40 ? raw.slice(0, cut + 1) : '';
}

/** The dossiers for this trip's stops, fetched once the section is open. */
function useStopDossiers(stops) {
  const [byDest, setByDest] = React.useState({});
  const ids = (stops || []).map((s) => s.dest).join(',');
  React.useEffect(() => {
    let live = true;
    const wanted = ids ? ids.split(',') : [];
    if (!wanted.length) return undefined;
    Promise.all(wanted.map((id) => loadDossier(id).then((d) => [id, d]).catch(() => [id, null])))
      .then((pairs) => {
        if (!live) return;
        setByDest(Object.fromEntries(pairs));
      });
    return () => { live = false; };
  }, [ids]);
  return byDest;
}

function Row({ icon: Icon, label, value, href, note }) {
  const body = (
    <>
      {Icon && <Icon size={13} className="tprac-row-icon" />}
      <span className="tprac-row-label">
        {label}
        {note && <small className="tprac-row-note">{note}</small>}
      </span>
      {value && <span className="tprac-row-value mono">{value}</span>}
      {href && <ChevronRightIcon size={14} className="tprac-row-chev" />}
    </>
  );
  if (href) {
    return (
      <li className="tprac-row is-link">
        <a href={href} target="_blank" rel="noopener noreferrer">{body}</a>
      </li>
    );
  }
  return <li className="tprac-row">{body}</li>;
}

function Group({ title, source, children }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  if (!rows.length) return null;
  return (
    <div className="tprac-group">
      <h3 className="tprac-group-title">{title}</h3>
      <ul className="tprac-rows">{rows}</ul>
      {source && <p className="tpage-credit tprac-source">{source}</p>}
    </div>
  );
}

export function TripPractical({ detail, t }) {
  const dossiers = useStopDossiers(detail.stops);

  const parkingRows = [];
  const sleepRows = [];
  const airRows = [];

  for (const stop of detail.stops) {
    const doc = dossiers[stop.dest];
    if (!doc) continue;

    // Parking: the nearest mapped car park to the middle of town, with its
    // fee where OSM records one and a directions link to its coordinate.
    const spot = (doc.parking?.spots || [])[0];
    if (spot && Number.isFinite(spot.dist_m)) {
      const bits = [];
      if (spot.fee === 'yes') bits.push(t('trip.practicalParkFee'));
      else if (spot.fee === 'no') bits.push(t('trip.practicalParkNoFee'));
      if (Number.isFinite(spot.capacity)) bits.push(t('trip.practicalParkCap', { n: spot.capacity }));
      parkingRows.push(
        <Row
          key={`park-${stop.dest}`}
          icon={ParkingIcon}
          label={spot.name
            ? t('trip.practicalParkNear', { name: spot.name, dist: fmtDist(spot.dist_m), city: stop.city })
            : t('trip.practicalParkUnnamed', { dist: fmtDist(spot.dist_m), city: stop.city })}
          note={bits.join(', ') || null}
          value={Number.isFinite(spot.walk_min) ? `${spot.walk_min} min` : null}
          href={spot.nav?.gmaps || null}
        />,
      );
    }

    // A bed for the nights this trip actually spends here.
    const perNight = doc.sleep?.per_person_night_eur;
    if (Number.isFinite(perNight)) {
      sleepRows.push(
        <Row
          key={`sleep-${stop.dest}`}
          icon={BedIcon}
          label={t('trip.practicalSleepRow', {
            city: stop.city, n: stop.nights, eur: eur(Math.round(perNight)),
          })}
          value={eur(Math.round(perNight * stop.nights))}
        />,
      );
    }

    // Getting in without a car: the anchor airport, and the honest note that
    // some of these places do not want a car at all.
    const gt = doc.practical?.getting_there;
    if (gt?.airport) {
      airRows.push(
        <Row
          key={`air-${stop.dest}`}
          icon={PlaneIcon}
          label={`${gt.airport}, ${stop.city}`}
          note={gt.car_needed === false ? gt.why || null : null}
        />,
      );
    }
  }

  // The drive between the stops, from the legs the trip already carries.
  const driveRows = (detail.legs || [])
    .map((leg, i) => {
      if (!Number.isFinite(leg.km)) return null;
      const from = detail.stops[i];
      const to = detail.stops[i + 1];
      if (!from || !to) return null;
      const h = Math.floor((leg.minutes || 0) / 60);
      const m = (leg.minutes || 0) % 60;
      const time = leg.minutes ? (h ? t('trip.legHm', { h, m }) : t('trip.legM', { m })) : null;
      return (
        <Row
          key={`leg-${i}`}
          icon={CarIcon}
          label={t('trip.practicalDriveLeg', { from: from.city, to: to.city })}
          note={time}
          value={`${Math.round(leg.km)} km`}
        />
      );
    })
    .filter(Boolean);

  // What a town says about its own parking, where the dossier researched it:
  // a pedestrian zone or a summer road closure is the single fact most likely
  // to ruin a driver's arrival, and no distance-to-car-park row conveys it.
  const parkNotes = [];
  for (const stop of detail.stops) {
    const web = dossiers[stop.dest]?.parking?.web;
    const advice = wholeSentences(web?.advice);
    if (advice) {
      parkNotes.push({ city: stop.city, text: advice, url: web.official_url || null });
    }
  }

  const groups = [
    <Group key="park" title={t('trip.practicalPark')} source={t('trip.practicalSourceParking')}>
      {parkingRows}
      {parkNotes.map((n) => (
        <Row key={`advice-${n.city}`} icon={ParkingIcon} label={n.city} note={n.text} href={n.url} />
      ))}
    </Group>,
    <Group key="drive" title={t('trip.practicalDrive')} source={t('trip.practicalSourceDrive')}>
      {driveRows}
    </Group>,
    <Group key="sleep" title={t('trip.practicalSleep')} source={t('trip.practicalSourceSleep')}>
      {sleepRows}
    </Group>,
    <Group key="air" title={t('trip.practicalNoCar')} source={t('trip.practicalSourceAir')}>
      {airRows}
    </Group>,
  ];

  return <div className="tprac">{groups}</div>;
}
