import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import NotYet from '../components/NotYet.jsx';
import { catalogue } from '../lib/appData.js';
import { ClimateStrip, ClimateExtras } from './ClimateStrip.jsx';
import { SwimSafety } from './SwimSafety.jsx';
import {
  altitudeSeries, audienceOf, baseClimateUse, waterShoesHint, MIN_ALTITUDE_GAIN_M,
} from '../lib/waterFacts.js';

/**
 * The blocks T631 adds to the lake and beach sheets (explore completeness):
 * the climate of the nearest town, the lake's water detail, and the beach's
 * facilities. Every slot stays when the wire has no value and shows the shared
 * placeholder (components/NotYet.jsx); nothing here invents a value.
 */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** One label and value row, in the sheet's own fact grammar. */
function Row({ id, label, children }) {
  return (
    <div className="bpage-fact" data-testid={id}>
      <dt>{label}</dt>
      <dd>{children || <NotYet />}</dd>
    </div>
  );
}

/* ── Climate on a lake or a beach ───────────────────────────────────────── */

/** The base destination's row, loaded the way useBaseDay loads it. */
function useBaseDestination(baseId) {
  const [dest, setDest] = useState(null);
  useEffect(() => {
    let live = true;
    setDest(null);
    if (!baseId) return undefined;
    catalogue.ensureIds([baseId]).then(() => {
      if (live) setDest(catalogue.snapshot()?.destinations?.[baseId] || null);
    }).catch(() => {});
    return () => { live = false; };
  }, [baseId]);
  return dest;
}

/**
 * The climate of a lake or a beach.
 *
 * Neither layer carries a climate of its own, but both carry `base`: the
 * nearest destination and the straight-line distance to it. That town's
 * NASA POWER normals are real data for a named place, so the sheet shows
 * them under a line that names the town and the distance and says they are
 * the town's, not measured at the water. Past BASE_CLIMATE_MAX_KM the town
 * says nothing about the water and the block shows the placeholder with the
 * reason. `water` is { temps, est } for a lake (the CHELSA model), null for
 * a beach. `placeM` is the height of the lake itself, from which the
 * temperature at the water is derived when it differs from the town's.
 */
export function BaseClimate({ base, kind, water = null, placeM = null, placeName = '' }) {
  const { t } = useI18n();
  const use = baseClimateUse(base);
  const dest = useBaseDestination(use.use ? base.id : null);
  const climate = dest?.climate || null;
  const altitude = climate && placeM != null
    ? altitudeSeries(climate, { m: placeM, name: placeName }) : null;
  const elev = climate?.elev ?? climate?.elev_m;
  const same = climate && placeM != null && elev != null && !altitude
    && Math.abs(placeM - elev) < MIN_ALTITUDE_GAIN_M
    ? { town: base.city } : null;
  return (
    <div className="dsk-part" data-testid="base-climate">
      <h3 className="dsk-sub">{t('wx.climateHead')}</h3>
      {!use.use && (
        <>
          <NotYet line />
          {use.reason === 'far' && (
            <p className="bpage-note" data-testid="base-climate-far">{t('wx.baseFar', { km: use.km })}</p>
          )}
        </>
      )}
      {use.use && (
        <>
          <p className="bpage-note" data-testid="base-climate-label">
            {t('wx.baseClimate', { town: base.city, km: use.km })}
            {' '}
            {t(`wx.baseNote${cap(kind)}`)}
          </p>
          {climate?.m ? (
            <>
              <ClimateStrip climate={climate} figures />
              <ClimateExtras climate={climate} water={water} altitude={altitude} sameLevel={same} />
            </>
          ) : (
            <NotYet line />
          )}
        </>
      )}
    </div>
  );
}

/* ── The lake's water detail ────────────────────────────────────────────── */

const SPORT_KEY = {
  windsurfing: 'wx.sportWindsurfing', sailing: 'wx.sportSailing', water_ski: 'wx.sportWaterSki',
  canoe: 'wx.sportCanoe', rowing: 'wx.sportRowing', scuba_diving: 'wx.sportDiving',
  surfing: 'wx.sportSurfing', fishing: 'wx.sportFishing', swimming: 'wx.sportSwimming',
};

/**
 * Everything a swimmer or a sailor asks about the water of a lake that the
 * facts grid does not: the bathing zones behind the class, the beaches
 * around, the water sports, the ferries, the wind and the swim safety.
 */
export function LakeWater({ lake }) {
  const { t, lang } = useI18n();
  const zones = lake.water?.zones || [];
  const beaches = lake.beaches || [];
  const sports = lake.sports || [];
  const ferryTag = (lake.services || []).includes('ferry');
  const stops = lake.ferry?.stops;
  const nf = (n) => {
    try { return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n); } catch { return String(n); }
  };
  return (
    <div className="dsk-part" data-testid="lake-water">
      <SwimSafety
        rule={lake.swim?.rule || null}
        depthM={lake.size?.depthM || null}
        hazards={lake.hazards || []}
        lifeguard={null}
      />
      <h3 className="dsk-sub">{t('wx.zonesHead')}</h3>
      {zones.length > 0 ? (
        <ul className="ss-zones" data-testid="lake-zones">
          {zones.map((z) => (
            <li key={`${z.n}-${z.km}`}>
              {t('wx.zoneLine', { name: z.n, cls: t(`lake.water${z.q}`), km: nf(z.km) })}
            </li>
          ))}
        </ul>
      ) : <NotYet line />}
      <h3 className="dsk-sub">{t('wx.lakeBeachesHead')}</h3>
      {beaches.length > 0 ? (
        <ul className="ss-zones" data-testid="lake-beaches">
          {beaches.map((b) => (
            <li key={b.id}>{t('wx.beachLine', { name: b.n, km: nf(b.km) })}</li>
          ))}
        </ul>
      ) : <NotYet line />}
      <h3 className="dsk-sub">{t('wx.sportsHead')}</h3>
      <dl>
        <Row id="lake-sports" label={t('wx.sportsMapped')}>
          {sports.length > 0 && sports.map((s) => (SPORT_KEY[s] ? t(SPORT_KEY[s]) : null)).filter(Boolean).join(', ')}
        </Row>
        <Row id="lake-wind-profile" label={t('wx.windProfile')} />
        <Row id="lake-thermal" label={t('wx.thermalWinds')} />
        <Row id="lake-sport-zones" label={t('wx.sportZones')} />
      </dl>
      <h3 className="dsk-sub">{t('wx.ferryHead')}</h3>
      <dl>
        <Row id="lake-ferry" label={t('wx.ferryService')}>
          {ferryTag && (stops ? t('wx.ferryStops', { n: stops }) : t('wx.ferryTag'))}
        </Row>
        <Row id="lake-ferry-lines" label={t('wx.ferryLines')} />
      </dl>
    </div>
  );
}

/* ── The beach's facilities ─────────────────────────────────────────────── */

/**
 * The beach facts a family or a dog owner decides on. A tag the wire does
 * not carry is unknown, not absent: the slot shows the placeholder and never
 * a "no". Toilets, showers and food come from a proximity sweep (within a few
 * minutes of the sand), so the value says "nearby".
 */
export function BeachFacilities({ beach }) {
  const { t } = useI18n();
  const services = beach.services || [];
  const nearby = (code) => services.includes(code) && t('wx.nearby');
  const yes = (flag) => flag === true && t('wx.yes');
  const shoes = waterShoesHint(beach.surface);
  const aud = audienceOf(beach);
  return (
    <div className="dsk-part" data-testid="beach-facilities">
      <SwimSafety
        rule={null}
        depthM={null}
        hazards={[]}
        lifeguard={beach.lifeguard ? true : null}
      />
      <h3 className="dsk-sub">{t('wx.bfHead')}</h3>
      <dl>
        <Row id="bf-fee" label={t('wx.bfAccess')}>{beach.fee && t(`wx.fee${cap(beach.fee)}`)}</Row>
        <Row id="bf-toilets" label={t('wx.bfToilets')}>{nearby('toilets')}</Row>
        <Row id="bf-showers" label={t('wx.bfShowers')}>{nearby('showers')}</Row>
        <Row id="bf-food" label={t('wx.bfFood')}>{nearby('food')}</Row>
        <Row id="bf-rentals" label={t('wx.bfRentals')}>{yes(beach.rentals)}</Row>
        <Row id="bf-pool" label={t('wx.bfPool')}>{yes(beach.pool)}</Row>
        <Row id="bf-kidspool" label={t('wx.bfKidsPool')}>{yes(beach.kidsPool)}</Row>
        <Row id="bf-dog" label={t('wx.bfDog')}>{beach.dog && t(`wx.dog${cap(beach.dog)}`)}</Row>
        <Row id="bf-shade" label={t('wx.bfShade')}>{beach.shade && t(`wx.shade${cap(beach.shade)}`)}</Row>
        <Row id="bf-operator" label={t('wx.bfOperator')}>{beach.operator}</Row>
        <Row id="bf-shoes" label={t('wx.bfShoes')}>{shoes && t(`wx.shoes${cap(shoes)}`)}</Row>
        <Row id="bf-entry-surface" label={t('wx.bfEntrySurface')} />
        <Row id="bf-lido-entry" label={t('wx.bfLidoEntry')} />
        <Row id="bf-lido-sunbed" label={t('wx.bfLidoSunbed')} />
        <Row id="bf-lido-book" label={t('wx.bfLidoBook')} />
        <Row id="bf-walk-pier" label={t('wx.bfWalkPier')} />
        <Row id="bf-walk-centre" label={t('wx.bfWalkCentre')} />
      </dl>
      <h3 className="dsk-sub">{t('wx.audHead')}</h3>
      <dl>
        <Row id="aud-family" label={t('wx.audFamily')}>{yes(aud.family)}</Row>
        <Row id="aud-luxury" label={t('wx.audLuxury')}>{yes(aud.luxury)}</Row>
        <Row id="aud-quiet" label={t('wx.audQuiet')}>{yes(aud.quiet)}</Row>
        <Row id="aud-dog" label={t('wx.audDog')}>{yes(aud.dog)}</Row>
      </dl>
    </div>
  );
}
