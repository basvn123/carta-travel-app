import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { loadCoverage } from '../lib/regions.js';
import { LAYER_NOUN } from '../lib/footers.js';
import { stripDashes } from '../lib/format.js';
import { routeTitle } from '../lib/cycleStory.js';
import {
  countryCase, loadNearest, loadNearestOf, OPEN_AS, FAR_KM, IMPOSSIBLE, LAYER_CAT,
} from '../lib/coverageEmpty.js';

/**
 * The coverage empty-state module (T124, widened by T367;
 * docs/ONBOARDING_AND_EMPTY_STATES.md, "The coverage module"; destinations
 * spec 1.6).
 *
 * One component for a list that is empty because of WHERE it is, not because
 * of what the traveller filtered: a country with no lakes, a searched place
 * with no walk in reach. It is prose on paper, not a card: the count line
 * (the place in sans, the count in mono, because only the number is a
 * measured fact), the reason in `--ink`, the three nearest published rows
 * under hairlines, and one secondary button.
 *
 * Two modes:
 *   country  `cc` names the empty country. The reason is the best the wire
 *            holds (lib/coverageEmpty.js countryCase): the microstate table,
 *            the contract's reason code once it lands, the region audit's
 *            `why` until then, else "coverage grows country by country".
 *   radius   `city` names a searched place and `geo` is centred on it. No
 *            reason sentence: the count line says how far nothing reaches.
 *
 * Callers gate it: it is only for a list that is empty with no chip and no
 * search word narrowing it, so it never blames the catalogue for a filter.
 *
 *   layer       'beach' | 'lake' | 'mountain' | 'cycling' | 'trail' | 'itin'
 *   cc          the empty country (country mode), or the searched place's
 *               own country (radius mode), whose rows are left out
 *   city        the searched place's name: radius mode
 *   geo         { lat, lon, near: [cc...] } from countryGeo / pointGeo; the
 *               microstates fall back to their own table without it
 *   countryName (cc) => display name
 *   onOpen      (open-as layer name, row) => void
 *   onSeeOther  (category key) => void, "See Monaco's beaches"
 *   onShowAll   () => void, "Show all countries"
 */

/** The noun each layer's count line uses. */
const NOUN = { ...LAYER_NOUN, itin: 'cov.n.trip' };

/**
 * A catalogue sentence with some of its values set in mono: the measured
 * facts (a count, a distance) are mono, the words around them are not. The
 * sentence is still one catalogue string, so word order survives
 * translation; the mono values are swapped in after the lookup.
 */
export function MonoLine({ t, k, vars, mono = {}, slots = {} }) {
  const marks = {};
  const keys = [...Object.keys(mono), ...Object.keys(slots)];
  // Private-use characters as the markers: no catalogue string holds them.
  keys.forEach((name, i) => { marks[name] = `${i}`; });
  const text = t(k, { ...vars, ...marks });
  const parts = text.split(/(\d+)/);
  return parts.map((p, i) => {
    if (!(i % 2)) return <React.Fragment key={i}>{p}</React.Fragment>;
    const name = keys[Number(p)];
    return name in mono
      ? <span className="mono" key={i}>{mono[name]}</span>
      : <React.Fragment key={i}>{slots[name]}</React.Fragment>;
  });
}

/**
 * The one line a detail-page section keeps when it has nothing to show
 * (docs/ONBOARDING_AND_EMPTY_STATES.md, "The detail-page rule"): what is not
 * there and within what radius, then the nearest published one as a link.
 * When the nearest row measures inside the radius by this file's
 * straight-line reading, the first sentence is dropped and the row is named
 * alone, so the two sentences can never contradict each other; a nearest
 * row further than FAR_KM (across a sea) is not named.
 *
 *   noneKey, noneVars  the first sentence; `km` in noneVars is set in mono
 *   layers             loader layers to search (lib/coverageEmpty.js)
 *   cc, from, skipId   the country file, the page's row or point, its id
 *   radiusKm           the radius the build searched
 *   onOpen             (layer, row) => void
 */
export function NearestLine({ noneKey, noneVars = {}, layers, cc, from, skipId = null, radiusKm, onOpen }) {
  const { t, lang } = useI18n();
  const [hit, setHit] = React.useState(null);
  const fromKey = from ? `${from.id ?? ''}|${from.lat ?? ''}|${from.lon ?? ''}` : '';
  React.useEffect(() => {
    let live = true;
    setHit(null);
    if (!from || !cc) return undefined;
    loadNearestOf(layers, cc, from, skipId).then((h) => { if (live) setHit(h); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value key: fromKey and the joined layer list stand for from and layers, which callers rebuild every render
  }, [cc, fromKey, layers.join(','), skipId]);
  const nf = (v) => new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(v);
  const { km, ...rest } = noneVars;
  // Measured today inside the radius: the build's "none" no longer holds for
  // this wire, so the line names the row instead of claiming the radius.
  const inside = !!hit && hit.km <= radiusKm;
  // Further than a border, across a sea: naming it helps nobody (Lanzarote's
  // nearest walk is on the mainland, 1,073 km away).
  const showNear = !!hit && hit.km <= FAR_KM;
  return (
    <div className="sec-none" data-testid="section-none">
      {!inside && <p><MonoLine t={t} k={noneKey} vars={rest} mono={km == null ? {} : { km: nf(km) }} /></p>}
      {showNear && (
        <p className="sec-none-near">
          <MonoLine t={t} k="cov.nearestOne" vars={{}}
            mono={{ km: nf(hit.km) }}
            slots={{
              name: onOpen
                ? <button type="button" className="sec-none-link" onClick={() => onOpen(hit.layer, hit.row)}>{rowName(hit.layer, hit.row, t)}</button>
                : rowName(hit.layer, hit.row, t),
            }} />
        </p>
      )}
    </div>
  );
}

function rowName(layer, row, t) {
  if (layer === 'cycling') return stripDashes(routeTitle(row, t));
  if (layer === 'itin') return (row.cities || []).map((c) => c.city).join(', ');
  return stripDashes(row.name || row.ref || '');
}

export function CoverageEmpty({
  layer, cc, city = null, geo = null, countryName, onOpen, onSeeOther = null, onShowAll = null,
}) {
  const { t, lang } = useI18n();
  // undefined while the audit is in flight, so the reason is not first said
  // as "coverage grows" and then corrected; null when it did not load.
  const [coverage, setCoverage] = React.useState(undefined);
  const [near, setNear] = React.useState(null);
  const radius = !!city;
  React.useEffect(() => {
    let live = true;
    loadCoverage().then((c) => { if (live) setCoverage(c || null); })
      .catch(() => { if (live) setCoverage(null); });
    return () => { live = false; };
  }, []);
  const geoKey = geo ? `${geo.lat},${geo.lon},${(geo.near || []).join(',')}` : '';
  React.useEffect(() => {
    let live = true;
    setNear(null);
    loadNearest(layer, cc, geo).then((r) => { if (live) setNear(r); })
      .catch(() => { if (live) setNear([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value key: geoKey is geo by its centre and neighbours, so a parent that rebuilds the same geo each render does not refetch
  }, [layer, cc, geoKey]);

  const nf = (v) => new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(v);
  const noun = t(NOUN[layer] || 'cov.n.trail');
  const place = cc ? countryName(cc) : t('cov.europe');
  const c = radius ? null : countryCase(coverage, layer, cc);
  const far = near && near.length > 0 && near[0].km > FAR_KM;
  const rows = near && near.length > 0 && !far ? near : [];
  const otherNoun = c?.other ? t(NOUN[Object.keys(LAYER_CAT).find((k) => LAYER_CAT[k] === c.other)]) : '';
  // One button. Where the layer cannot exist here, the other layer is the
  // way on; where a country filter emptied the list, all countries are.
  const seeOther = c?.other && onSeeOther && (IMPOSSIBLE.has(c.key) || !onShowAll);

  return (
    <div className="cov-empty" data-testid="coverage-empty"
      data-code={c?.code || (radius ? 'radius' : 'empty')} data-reason={c?.key || ''}>
      {radius ? (
        // "Within 84 km" is true because the nearest published row is 84.6
        // km away; under a kilometre there is no honest radius to state.
        (rows.length > 0 && Math.floor(rows[0].km) >= 1) ? (
          <p className="cov-empty-count">
            <MonoLine t={t} k="cov.radiusLine" vars={{ things: noun, city }}
              mono={{ km: nf(Math.floor(rows[0].km)) }} />
          </p>
        ) : rows.length === 0 ? (
          <p className="cov-empty-count">{t('cov.radiusNone', { things: noun, city })}</p>
        ) : null
      ) : (
        <>
          <p className="cov-empty-count">
            <MonoLine t={t} k="cov.countLine" vars={{ place, things: noun }} mono={{ n: nf(0) }} />
          </p>
          <p className="cov-empty-why">
            {(coverage !== undefined || c.micro) && t(`cov.reason.${c.key}`, {
              place,
              things: noun,
              area: c.area == null ? '' : nf(c.area),
              m: c.m == null ? '' : nf(c.m),
              holder: c.holder || '',
            })}
          </p>
        </>
      )}
      {rows.length > 0 && (
        <>
          <p className="cov-empty-head">{t('cov.nearestHead')}</p>
          <ul className="cov-near">
            {rows.map(({ row, km }) => (
              <li key={`${row.cc}:${row.id}`}>
                <button type="button" className="cov-near-row"
                  onClick={() => onOpen(OPEN_AS[layer] || layer, row)}>
                  <span className="cov-near-name">{rowName(layer, row, t)}</span>
                  <span className="cov-near-meta">
                    {countryName(row.cc)} <span className="mono">{nf(km)} km</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {far && (
        <p className="cov-empty-far">
          <MonoLine t={t} k="cov.nearestFar" vars={{ country: countryName(near[0].row.cc) }}
            mono={{ km: nf(near[0].km) }} />
        </p>
      )}
      {seeOther ? (
        <button type="button" className="cov-empty-btn" onClick={() => onSeeOther(c.other)}>
          {t('cov.seeOther', { place, things: otherNoun })}
        </button>
      ) : onShowAll ? (
        <button type="button" className="cov-empty-btn" onClick={onShowAll}>
          {t('cov.showAll')}
        </button>
      ) : null}
    </div>
  );
}

export default CoverageEmpty;
