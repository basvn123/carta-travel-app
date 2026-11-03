import React from 'react';
import { Tabs } from '../components/ui/index.js';
import { AlertIcon, ExternalIcon, ParkingIcon, RouteIcon } from '../components/Icons.jsx';
import { monthName } from '../lib/dates.js';
import { packingReasons } from '../lib/packing.js';
import { fmtKm } from './destParts.js';

/**
 * What to bring and Where to park (T1030, owner: "must be separate, cleanly
 * behind a parking tab and a what to bring tab"). Two tabs in Practical.
 *
 *   What to bring  the packing list for the month as the Practical cards
 *                  (.pcard: the slot, the item, why it is on the list), a
 *                  swipe row on a phone
 *   Where to park  from lib/parkingTruth.js only (the fact-checked subset):
 *                  the zone first (what drivers fear most), then where to
 *                  leave the car (park and ride), then the car parks, each
 *                  with directions; the check's date and the city's page
 *                  at the foot. No prices: they went stale.
 */

const TYPES = new Set(['underground', 'multi-storey', 'surface', 'rooftop']);
const mapsSearch = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

function Bring({ p, glyphs }) {
  const { t, lang, destination, packs, month } = p;
  const why = packingReasons(destination, month);
  const mon = monthName(month, lang, true);
  return (
    <>
      <p className="bf-note">{t('dest.packSummaryFor', { month: mon })}</p>
      <ul className="pcards" aria-label={t('explore.packTitle')}>
        {packs.map((key) => {
          const Glyph = glyphs[key];
          const r = why[key];
          return (
            <li key={key} className="pcard is-bring">
              <span className="pcard-slot" aria-hidden="true">{Glyph && <Glyph size={20} />}</span>
              <p className="pcard-value">{t(`explore.pack.${key}`)}</p>
              {r && <p className="pcard-text">{t(r[0], { ...r[1], month: mon })}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Directions({ t, nav, query }) {
  const gm = nav?.gmaps || mapsSearch(query);
  return (
    <span className="bf-go">
      <a href={gm} target="_blank" rel="noreferrer noopener">{t('dest.navGmaps')}</a>
      {nav?.waze && <a href={nav.waze} target="_blank" rel="noreferrer noopener">{t('dest.navWaze')}</a>}
    </span>
  );
}

function Park({ p, truth }) {
  const { t, lang, city } = p;
  const { restricted, checked, url, rides, named, spots } = truth;
  const fromCentre = (m) => (Number.isFinite(m) ? t('pk.fromCentre', { km: fmtKm(m / 1000) }) : null);
  const fmtDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${iso}T00:00:00Z`));
    } catch { return iso; }
  };
  const spotMeta = (s) => [
    TYPES.has(s.type) ? t(`pk.type.${s.type}`) : null,
    Number.isFinite(s.capacity) ? t('pk.spaces', { n: s.capacity.toLocaleString(lang) }) : null,
    s.fee === 'yes' ? t('explore.parkPaid') : s.fee === 'no' ? t('explore.parkFree') : null,
    fromCentre(s.dist_m),
  ].filter(Boolean).join(', ');

  return (
    <div className="bf-park">
      {restricted && (
        <div className="bf-zone">
          <span className="pcard-slot is-warn" aria-hidden="true"><AlertIcon size={20} /></span>
          <div>
            <h4 className="bf-zone-h">{t('pk.zone')}</h4>
            <p className="bf-zone-text">{t('pk.zoneText')}</p>
          </div>
        </div>
      )}

      {rides.length > 0 && (
        <section className="bf-group" aria-labelledby="bf-ride-h">
          <h4 id="bf-ride-h" className="bf-h">{t('explore.park.park_ride')}</h4>
          <p className="bf-sub">{t('pk.ridesSub')}</p>
          <ul className="bf-rows">
            {rides.map((r) => (
              <li key={r.name} className="bf-row">
                <span className="bf-ico" aria-hidden="true"><RouteIcon size={16} /></span>
                <span className="bf-what">
                  <b>{r.name}</b>
                  {fromCentre(r.dist_m) && <small>{fromCentre(r.dist_m)}</small>}
                </span>
                <Directions t={t} nav={r.nav} query={`${r.name} ${city}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(named.length > 0 || spots.length > 0) && (
        <section className="bf-group" aria-labelledby="bf-cp-h">
          <h4 id="bf-cp-h" className="bf-h">{t('pk.carParks')}</h4>
          <ul className="bf-rows">
            {named.map((c) => (
              <li key={c.name} className="bf-row">
                <span className="bf-ico" aria-hidden="true"><ParkingIcon size={16} /></span>
                <span className="bf-what"><b>{c.name}</b><small>{t('pk.namedByCity')}</small></span>
                <Directions t={t} query={`${c.name} ${city}`} />
              </li>
            ))}
            {spots.map((s) => (
              <li key={`${s.lat}|${s.lon}`} className="bf-row">
                <span className="bf-ico" aria-hidden="true"><ParkingIcon size={16} /></span>
                <span className="bf-what"><b>{s.name}</b><small>{spotMeta(s)}</small></span>
                <Directions t={t} nav={s.nav} query={`${s.name} ${city}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="bf-foot">
        {checked && <span>{t('pk.checked', { date: fmtDate(checked) })}</span>}
        {url && (
          <a href={url} target="_blank" rel="noreferrer noopener">{t('dest.parkOfficial')}<ExternalIcon size={12} /></a>
        )}
        <a href={mapsSearch(`parking ${city}`)} target="_blank" rel="noreferrer noopener">{t('dest.parkSearch')}<ExternalIcon size={12} /></a>
      </p>
    </div>
  );
}

export function BeforeYouGo({ p, truth, glyphs }) {
  const { t, packs } = p;
  const tabs = [
    packs.length > 0 && { id: 'bring', label: t('explore.packTitle') },
    truth && { id: 'park', label: t('explore.parkTitle') },
  ].filter(Boolean);
  const [tab, setTab] = React.useState(tabs[0]?.id);
  if (!tabs.length) return null;
  const on = tabs.some((x) => x.id === tab) ? tab : tabs[0].id;
  return (
    <div className="bf" id="sec-practical">
      <Tabs label={t('dest.practicalTitle')} tabs={tabs} value={on} onChange={setTab} panelId="bf-panel" className="bf-tabs" />
      <div id="bf-panel" role="tabpanel" className="bf-panel">
        {on === 'bring' ? <Bring p={p} glyphs={glyphs} /> : <Park p={p} truth={truth} />}
      </div>
    </div>
  );
}
