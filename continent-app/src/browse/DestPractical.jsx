import React from 'react';
import { safeUrl } from '../lib/format.js';
import { formatMoney } from '../lib/money.js';
import { monthName } from '../lib/dates.js';
import { minutesText } from '../lib/journeys.js';
import { Button } from '../components/ui/index.js';
import { AirlineMark } from '../components/flights/Flights.jsx';
import { Fold } from './Fold.jsx';
import { RatingBreakdown } from './RatingBreakdown.jsx';
import { WhyItMatches, useFit } from './WhyItMatches.jsx';
import { showMatch } from '../lib/match.js';
import { Neighbourhoods } from './Neighbourhoods.jsx';
import { PracticalSlots, practicalSlotRows } from './DestPracticalSlots.jsx';
import { PSection } from './PageTemplate.jsx';
import { cleanName, fmtKm } from './destParts.js';
import {
  PersonIcon, ParkingIcon, SunIcon, RainIcon, SnowIcon, ShoeIcon, SwimIcon, BootIcon, PlugIcon,
  BottleIcon, JacketIcon, BackpackIcon, CheckIcon, StarIcon, SparkIcon, LinkIcon, BusIcon, CalendarIcon,
  DownloadIcon, TrainIcon, CarIcon, ExternalIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

/**
 * The place page's last three sections (T912, the owner's approved one-page
 * spec, 2026-10-30; they were the Practical tab, T499):
 *
 *   DestStay      Where to stay: the neighbourhoods' typical night as bars,
 *                 with who each area suits, then Search stays
 *   DestGetting   Getting there from the traveller's home: the flight, the
 *                 train, the coach and the car, each with its time and its
 *                 return a person, the cheapest marked; priced by the same
 *                 models as the Explore card (lib/travelWay.js, the sweep)
 *   DestPractical the quick facts (d.essentials), the airport, getting
 *                 around and the rhythm, the PDF, the links out, why it
 *                 rates, the match, parking and packing, and the sources and
 *                 photo credits
 *
 * A row, a cell or a section without data is not drawn.
 */
const PACK_GLYPH = {
  shoes: ShoeIcon, daypack: BackpackIcon, sun: SunIcon, bottle: BottleIcon,
  swim: SwimIcon, rain: RainIcon, winter: SnowIcon, layers: JacketIcon,
  evening: JacketIcon, modest: JacketIcon, boots: BootIcon, plug: PlugIcon,
};
const WAY_ICON = { plane: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon };
const TIPS = ['round', '5-10', '10-15', 'included', 'none'];
const TAP = ['safe', 'bottled', 'varies'];

export function DestStay({ p }) {
  const { t, city, sleep, exits } = p;
  const hasSleep = !!(sleep?.neighbourhoods?.length > 0 || sleep?.beds || sleep?.curve);
  const search = exits.find((x) => x.key === 'bk') || exits.find((x) => x.key === 'ab') || null;
  if (!hasSleep && !search) return null;
  return (
    <PSection id="pt-stay" title={t('destx.jump.stay')}>
      {hasSleep && <Neighbourhoods sleep={sleep} t={t} />}
      {search && (
        <div className="pt-out">
          <a className="pt-linkbtn" href={search.href} target="_blank" rel="noreferrer noopener">
            <ExternalIcon size={14} />
            <span>{t('destx.searchStays', { city })}</span>
          </a>
          <p className="pt-muted">{t('prov.bookingNote')}</p>
        </div>
      )}
    </PSection>
  );
}

export function DestGetting({ p }) {
  const { t, ways, view } = p;
  if (!ways?.rows?.length) return null;
  const unit = view.total ? t('price.unitReturnGroup') : t('card.unitReturn');
  const label = (w) => (w.mode === 'plane'
    ? (w.iata ? t('destx.flyToIata', { iata: w.iata }) : t('way.plane'))
    : t(`way.${w.mode}`));
  const sub = (w) => {
    if (w.mode === 'plane') {
      return [
        w.dep && w.arr ? t('destx.flightTimes', { dep: w.dep, arr: w.arr }) : null,
        Number.isFinite(w.minutes) ? minutesText(w.minutes) : null,
      ].filter(Boolean).join(', ');
    }
    return Number.isFinite(w.hours) ? t('destx.aboutTime', { time: minutesText(Math.round(w.hours * 60)) }) : '';
  };
  return (
    <PSection id="pt-getting" title={ways.from ? t('destx.gettingFrom', { place: ways.from }) : t('detail.gettingThere')}
      note={t('destx.gettingNote')}>
      <ul className="pt-ways">
        {ways.rows.map((w) => {
          const Icon = WAY_ICON[w.mode];
          const cheapest = ways.rows.length > 1 && w.mode === ways.cheapest;
          return (
            <li key={w.mode} className={`pt-way${cheapest ? ' is-best' : ''}`}>
              <span className="pt-way-icon" aria-hidden="true"><Icon size={18} /></span>
              <span className="pt-way-main">
                <span className="pt-way-name">
                  {w.airline && <AirlineMark code={w.airline} size="sm" />}
                  {label(w)}
                  {cheapest && <span className="pt-best">{t('destx.cheapest')}</span>}
                </span>
                {sub(w) && <small>{sub(w)}</small>}
              </span>
              <span className="pt-way-fig">
                <b>{formatMoney(view.way(w.perPerson), { precision: 'whole' })}</b>
                <small>{unit}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </PSection>
  );
}

/** The quick facts from d.essentials, each only when the dossier has it. */
function quickFacts(p) {
  const { t, lang, d, bookAhead } = p;
  const e = d?.essentials || {};
  const out = [];
  const langs = (e.languages || []).filter((x) => typeof x === 'string' && x);
  if (langs.length) {
    let names = langs;
    try {
      const dn = new Intl.DisplayNames([lang], { type: 'language' });
      names = langs.map((code) => dn.of(code) || code);
    } catch { /* the codes stand */ }
    let value = names.join(', ');
    try { value = new Intl.ListFormat(lang, { type: 'conjunction' }).format(names); } catch { /* the join stands */ }
    out.push({ k: 'lang', label: t('destx.qf.language'), value: value.charAt(0).toLocaleUpperCase(lang) + value.slice(1) });
  }
  if (e.currency) {
    let cur = e.currency;
    try { cur = new Intl.DisplayNames([lang], { type: 'currency' }).of(e.currency) || e.currency; } catch { /* the code stands */ }
    out.push({ k: 'money', label: t('destx.qf.money'), value: cur.charAt(0).toLocaleUpperCase(lang) + cur.slice(1) });
  }
  if (TIPS.includes(e.tipping)) out.push({ k: 'tip', label: t('destx.qf.tipping'), value: t(`destx.tip.${e.tipping}`) });
  const plugs = (e.plugs || []).filter((x) => /^[A-N]$/.test(String(x)));
  if (plugs.length) {
    out.push({
      k: 'plugs', label: t('destx.qf.plugs'),
      value: Number.isFinite(e.volts)
        ? t('destx.plugsVolts', { types: plugs.join(', '), volts: e.volts })
        : t('destx.plugs', { types: plugs.join(', ') }),
    });
  }
  if (TAP.includes(e.tap_water)) out.push({ k: 'tap', label: t('destx.qf.tap'), value: t(`destx.tap.${e.tap_water}`) });
  if (e.emergency) out.push({ k: 'sos', label: t('destx.qf.emergency'), value: String(e.emergency) });
  if (bookAhead.length) out.push({ k: 'book', label: t('destx.qf.bookAhead'), value: bookAhead.join(', ') });
  return out;
}

/** The sources and photo credits, every one we owe, in one fold. */
function Credits({ p }) {
  const { t, d, hasRoutes, guideUrl } = p;
  const photos = (d?.gallery || []).filter((g) => g?.author || g?.licence);
  const rows = (d?.credits || []).filter((c) => c?.name);
  if (!photos.length && !rows.length && !hasRoutes && !guideUrl) return null;
  return (
    <details className="pt-fold">
      <summary>{t('destx.sources')}</summary>
      <ul>
        {photos.map((g) => {
          const href = safeUrl(g.page);
          const text = [g.caption, [g.author, g.licence].filter(Boolean).join(', ')].filter(Boolean).join(': ');
          return <li key={g.url}>{href ? <a href={href} target="_blank" rel="noreferrer">{text}</a> : text}</li>;
        })}
        {rows.map((c) => {
          const href = safeUrl(c.url);
          const text = [c.name, c.licence && c.licence !== 'see site' ? c.licence : null].filter(Boolean).join(', ');
          return <li key={c.key || c.name}>{href ? <a href={href} target="_blank" rel="noreferrer">{text}</a> : text}</li>;
        })}
        {hasRoutes && <li>{t('dest.routesCredit')}</li>}
        {guideUrl && <li><a href={guideUrl} target="_blank" rel="noreferrer">{t('detail.readGuide')}</a></li>}
      </ul>
    </details>
  );
}

export function DestPractical({ p }) {
  const {
    t, lang, city, destination, getting, rhythm, verdict, verdictBand, fmtScore,
    packs, month, parking, exits, isOpen, toggle, exportPdf, pdfBusy, pdfReady,
    aroundStat, airportText, carDayEur,
  } = p;
  const matchFit = useFit(destination, month);
  const qf = quickFacts(p);
  const hasPark = !!(parking && (parking.spots?.length > 0 || parking.park_ride || parking.web));
  const webPark = parking?.web || null;
  const cityNamed = new Set((webPark?.car_parks || []).map((c) => (c.name || '').toLowerCase()));
  const parkSearch = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`parking ${city}`)}`;
  const fmtDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${iso}T00:00:00Z`));
    } catch { return iso; }
  };
  const aroundBits = [
    aroundStat?.value || null,
    getting?.why && lang === 'en' ? getting.why : null,
    Number.isFinite(carDayEur) && carDayEur > 0
      ? t('destx.carHire', { price: formatMoney(carDayEur, { precision: 'whole', locale: lang }) }) : null,
  ].filter(Boolean);
  const cells = [
    airportText && { key: 'air', Icon: PlaneIcon, title: t('destx.airport'), text: airportText },
    aroundBits.length > 0 && { key: 'around', Icon: BusIcon, title: t('dest.keyAround'), text: aroundBits.join(' ') },
    rhythm && lang === 'en' && { key: 'rhythm', Icon: CalendarIcon, title: t('destx.rhythm'), text: rhythm },
  ].filter(Boolean);
  const slots = practicalSlotRows(p).length > 0;
  const outs = exits.filter((x) => x.key !== 'bk' && x.key !== 'ab');

  return (
    <PSection id="pt-practical" title={t('destx.jump.practical')}>
      {qf.length > 0 && (
        <dl className="pt-qf">
          {qf.map((f) => (
            <div key={f.k}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(cells.length > 0 || slots) && (
        <div className="pt-cells is-icons">
          {cells.map(({ key, Icon, title, text }) => (
            <div className="pt-cell" key={key}>
              <span className="pt-cell-icon" aria-hidden="true"><Icon size={16} /></span>
              <b className="pt-cell-title">{title}</b>
              <p className="pt-cell-text">{text}</p>
            </div>
          ))}
          <PracticalSlots p={p} />
        </div>
      )}

      <div className="pt-dl">
        <Button variant="secondary" size="sm" onClick={exportPdf} disabled={pdfBusy || !pdfReady}
          loading={pdfBusy} iconStart={<DownloadIcon size={16} />}>
          {pdfBusy ? t('dest.pdfBuilding') : t('dest.pdf')}
        </Button>
      </div>

      {outs.length > 0 && (
        <div className="pt-out">
          <div className="pt-outs">
            {outs.map(({ key, href, label, Icon }) => (
              <a key={key} className="pt-linkbtn" href={href} target="_blank" rel="noreferrer noopener">
                <Icon size={14} />
                <span>{label}</span>
              </a>
            ))}
          </div>
          <p className="pt-muted">{t('prov.bookingNote')}</p>
        </div>
      )}

      <div className="destp-folds pt-folds">
        {/* The verdict, with its argument. The Score in the head opens it. */}
        {verdict?.score != null && (
          <Fold level={3}
            id="sec-rating"
            icon={StarIcon}
            title={t('dest.ratingTitle', { score: fmtScore(verdict.score) })}
            summary={verdictBand}
            open={isOpen('rating')}
            onToggle={() => toggle('rating')}
          >
            <RatingBreakdown
              rating={verdict}
              destId={destination.id}
              t={t}
              countryLine={verdict.country_rank === 1
                ? t('card.topOf', { country: destination.country })
                : verdict.country_badge
                  ? t('card.rankIn', { n: verdict.country_rank, country: destination.country })
                  : null}
            />
          </Fold>
        )}

        {/* T765: the personal match, one bar per pick and every conflict. */}
        {showMatch(matchFit) && (
          <Fold level={3}
            id="sec-match"
            icon={SparkIcon}
            title={t('fit.title')}
            summary={t('fit.pct', { pct: matchFit.pct })}
            open={isOpen('match')}
            onToggle={() => toggle('match')}
          >
            <WhyItMatches place={destination} month={month} />
          </Fold>
        )}

        {/* Parking and what to bring: the two practical lists, one fold. */}
        {(hasPark || packs.length > 0) && (
          <Fold level={3}
            id="sec-practical"
            icon={BackpackIcon}
            title={t('dest.practicalTitle')}
            summary={packs.length > 0 ? t('dest.packSummaryFor', { month: monthName(month, lang, true) }) : ''}
            open={isOpen('practical')}
            onToggle={() => toggle('practical')}
          >
            {packs.length > 0 && (
              <div className="destp-pack">
                <h4 className="destp-subhead">{t('explore.packTitle')}</h4>
                <div className="xp-packs">
                  {packs.map((key) => {
                    const Glyph = PACK_GLYPH[key] || PersonIcon;
                    return (
                      <span key={key} className="xp-pack">
                        <Glyph size={16} />
                        <span>{t(`explore.pack.${key}`)}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {hasPark && (
              <div className="destp-parking">
                <h4 className="destp-subhead">{t('explore.parkTitle')}</h4>
                {webPark && (
                  <div className="dpark-web">
                    <p className="dpark-web-head"><CheckIcon size={12} />{t('dest.parkChecked', { date: fmtDate(webPark.checked) })}</p>
                    {webPark.restricted && <p className="dpark-web-line is-warn">{t('dest.parkRestricted')}</p>}
                    {webPark.car_parks?.length > 0 && (
                      <p className="dpark-web-line">
                        <b>{t('dest.parkCityNamed')}:</b> {webPark.car_parks.map((c) => cleanName(c.name)).join(', ')}
                      </p>
                    )}
                    {webPark.park_ride_names?.length > 0 && (
                      <p className="dpark-web-line"><b>{t('explore.park.park_ride')}:</b> {webPark.park_ride_names.map(cleanName).join(', ')}</p>
                    )}
                    {safeUrl(webPark.official_url) && (
                      <a className="dpark-web-link" href={safeUrl(webPark.official_url)} target="_blank" rel="noreferrer noopener"><LinkIcon size={12} />{t('dest.parkOfficial')}</a>
                    )}
                  </div>
                )}
                <ul className="destp-park-list">
                  {(parking.spots || []).map((s) => {
                    const confirmed = s.name && cityNamed.has(s.name.toLowerCase());
                    return (
                      <li className="destp-park" key={`${s.lat}|${s.lon}`}>
                        <span className="destp-park-main">
                          <span className="destp-park-name">
                            {s.name ? cleanName(s.name) : t('explore.parkUnnamed')}
                            {confirmed && <span className="dpark-ok"><CheckIcon size={10} />{t('dest.parkVerified')}</span>}
                          </span>
                          <span className="destp-park-sub">
                            {s.fee === 'no' && <span className="destp-park-free">{t('explore.parkFree')}</span>}
                            {s.fee === 'yes' && <span>{t('explore.parkPaid')}</span>}
                            {s.capacity != null && <span>{t('explore.parkSpaces', { n: s.capacity })}</span>}
                            {Number.isFinite(s.walk_min) && <span>{t('dest.walkMin', { n: s.walk_min })}</span>}
                          </span>
                        </span>
                        {s.nav && (
                          <span className="destp-park-nav">
                            <a href={s.nav.gmaps} target="_blank" rel="noreferrer noopener">{t('dest.navGmaps')}</a>
                            <a href={s.nav.waze} target="_blank" rel="noreferrer noopener">{t('dest.navWaze')}</a>
                          </span>
                        )}
                      </li>
                    );
                  })}
                  {parking.park_ride?.nav && (
                    <li className="destp-park is-pr" key="pr">
                      <span className="destp-park-main">
                        <span className="destp-park-name">{parking.park_ride.name || t('explore.park.park_ride')}</span>
                        <span className="destp-park-sub">
                          <span>{t('explore.park.park_ride')}</span>
                          <span>{fmtKm((parking.park_ride.dist_m || 0) / 1000)}</span>
                        </span>
                      </span>
                      <span className="destp-park-nav">
                        <a href={parking.park_ride.nav.gmaps} target="_blank" rel="noreferrer noopener">{t('dest.navGmaps')}</a>
                        <a href={parking.park_ride.nav.waze} target="_blank" rel="noreferrer noopener">{t('dest.navWaze')}</a>
                      </span>
                    </li>
                  )}
                </ul>
                <a className="destp-exit dpark-search" href={parkSearch} target="_blank" rel="noreferrer noopener"><ParkingIcon size={16} /><span>{t('dest.parkSearch')}</span></a>
                {/* The OpenStreetMap credit the ODbL asks for stays. */}
                <p className="xp-source">{t('dest.parkSource')}</p>
              </div>
            )}
          </Fold>
        )}
      </div>

      <Credits p={p} />
    </PSection>
  );
}
