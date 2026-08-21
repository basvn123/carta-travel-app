import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftIcon, ShareIcon, RouteIcon, LoopIcon, BedIcon, TrainIcon,
  CarIcon, BusIcon, CalendarIcon, MapPinIcon, AlertIcon, CheckIcon,
  ClockIcon, ReceiptIcon, LinkIcon, MountainIcon, LakeIcon, BeachIcon,
  BootIcon, SunIcon, PlusIcon,
} from '../components/Icons.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { useI18n } from '../i18n/index.jsx';
import { eur } from '../lib/format.js';
import { loadTrip, tripShareUrl } from '../lib/trips.js';
import {
  tripHeadline, transportLabel, seasonLabel, tripWhy, tripWarnings,
  dayTitle, legLine, themeLabel, cardThumb, countryNames,
} from '../lib/tripStory.js';

/**
 * One published trip as a page of its own.
 *
 * The order is the order a person reads a plan in, and each block answers one
 * question with data rather than with an adjective:
 *
 *   where does it go     the route on a real map, the stops numbered, the day
 *                        trips as pushpins around the base they belong to
 *   what is it           the shape, the days, the nights per stop, the months
 *   how do you move      every leg with its mode, its hours and its fare, all
 *                        of them labelled as estimates because they are
 *   what do you do       day by day, with a photograph of every named sight
 *   what does it cost    stay plus travel, for two people, per day
 *   what did we check    ten checks it passed, and every one it could not
 *
 * The last block is the one that makes the rest believable, so it is a
 * section rather than a footnote. Everything published here has been through
 * pipeline/trips/validate_trips.py; a trip that fails a hard check is not in
 * the wire at all, and a soft warning ships on the trip and prints here.
 *
 * The map is lazy for the same reason the trail page's is: maplibre is a
 * large dependency and nobody pays for it until they open a trip.
 */

const TripMap = lazy(() => import('../map/TripMap.jsx').then((m) => ({ default: m.TripMap })));

const MODE_ICON = { rail: TrainIcon, car: CarIcon, mixed: BusIcon, train: TrainIcon, bus: BusIcon };
const AROUND_ICON = { mountain: MountainIcon, lake: LakeIcon, beach: BeachIcon, trail: BootIcon };
const SHAPE_ICON = { base: BedIcon, chain: RouteIcon, loop: LoopIcon };

/** One measured fact. `word` moves it out of the mono column: "By train" and
 *  "Best May to Sep" are prose, and the mono face is for figures only. */
function Fact({ icon: Icon, value, label, word = false }) {
  return (
    <div className="tpage-fact itin-fact">
      {Icon && <Icon size={14} className="itin-fact-icon" />}
      <span className={`tpage-fact-val ${word ? 'is-word' : ''}`}>{value}</span>
      <span className="tpage-fact-label">{label}</span>
    </div>
  );
}

/** One named sight, with its photograph and its one line of description. */
function Sight({ poi }) {
  return (
    <li className="itin-sight">
      {poi.img
        ? <img className="itin-sight-img" src={cardThumb(poi.img)} alt="" loading="lazy" />
        : <span className="itin-sight-img itin-sight-noimg" aria-hidden="true" />}
      <span className="itin-sight-text">
        <span className="itin-sight-name">{poi.name}</span>
        {poi.desc && <span className="itin-sight-desc">{poi.desc}</span>}
      </span>
    </li>
  );
}

export function TripPage({ trip: card, data, onClose, onOpenInPlanner, onSelectDest }) {
  const { t } = useI18n();
  const [detail, setDetail] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setFailed(false);
    loadTrip(card.id).then((d) => {
      if (!live) return;
      if (d) setDetail(d); else setFailed(true);
    });
    return () => { live = false; };
  }, [card.id]);

  const names = useMemo(() => countryNames(data), [data]);

  // Stops as numbered pins, day trips as photo pushpins around them. TripMap
  // reads {lat, lon, city, plain, img}: `plain` is the pushpin, which is what
  // a day out is, because it is not a place you sleep.
  const pins = useMemo(() => {
    if (!detail) return [];
    const stops = detail.stops.map((s) => ({
      lat: s.lat, lon: s.lon, city: s.city,
    }));
    const outs = (detail.daytrips || []).map((d) => ({
      lat: d.lat, lon: d.lon, city: d.city, plain: true, img: d.img ? cardThumb(d.img) : null,
    }));
    return stops.concat(outs);
  }, [detail]);

  const onShare = async () => {
    const url = tripShareUrl(card);
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ title: trip.name || card.id, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }
    } catch { /* the traveller cancelled the sheet */ }
  };

  const trip = detail || card;
  // A shared link carries only an id, so until the detail lands there is no
  // day count, no cost and no route to print. Everything above the fold reads
  // from `trip`, which is the card when there is one and the detail once it
  // arrives, and stays out of the way when it is neither.
  const ready = !!(detail || (card && card.days));
  const Shape = SHAPE_ICON[trip.archetype] || RouteIcon;
  const Mode = MODE_ICON[trip.transport] || TrainIcon;
  const why = detail ? tripWhy(detail, t) : [];
  const warnings = detail ? tripWarnings({ warned: detail.checks?.warned }, t) : [];
  const season = seasonLabel(detail
    ? { season: detail.season.best, seasonBasis: detail.season.basis }
    : (card.season ? card : { season: [] }), t);
  const themes = (trip.themes || []).map((x) => themeLabel(x, t)).filter(Boolean);

  return (
    <div className="tpage itin-page" role="dialog" aria-modal="true">
      <div className="tpage-bar">
        <button type="button" className="tpage-back" onClick={onClose}>
          <ArrowLeftIcon size={15} />
          <span>{t('trip.back')}</span>
        </button>
        <span className="tpage-bar-title on">
          {ready ? tripHeadline(trip, t) : t('trip.loading')}
        </span>
        <button type="button" className="tpage-bar-act" onClick={onShare}
          aria-label={t('trip.shareLink')}>
          <ShareIcon size={15} />
        </button>
      </div>

      <div className="tpage-scroll">
        <div className="tpage-hero itin-hero">
          {detail ? (
            <Suspense fallback={<div className="itin-map-wait" />}>
              <TripMap
                stops={pins}
                padBottom={0}
                fitPadding={40}
                fitMaxZoom={9}
                scrollZoom={false}
                selectedIndex={selected}
                onSelectStop={setSelected}
              />
            </Suspense>
          ) : (
            <div className="itin-map-wait">
              {failed ? t('trip.detailGone') : t('trip.loading')}
            </div>
          )}
        </div>

        <div className="tpage-col">
          <div className="tpage-head">
            <h1 className="tpage-title">
              {ready ? tripHeadline(trip, t) : t('trip.loading')}
            </h1>
            <div className="tpage-sub itin-sub">
              {(trip.countries || []).map((cc) => (
                <span key={cc} className="itin-country">
                  <CountryFlag country={cc} size={12} />
                  {names[cc] || cc}
                </span>
              ))}
              {trip.score != null && (
                <RatingBadge rating={{ score: trip.score }} size="xs" showGem={false} />
              )}
            </div>
            {themes.length > 0 && (
              <div className="itin-themes">
                {themes.map((th) => <span key={th} className="itin-theme">{th}</span>)}
              </div>
            )}
          </div>

          {ready && (
          <div className="tpage-facts itin-facts">
            <Fact icon={CalendarIcon} value={trip.days} label={t('trip.factDays')} />
            <Fact icon={BedIcon} value={trip.nights} label={t('trip.factNights')} />
            <Fact icon={Shape} value={(trip.cities || trip.stops || []).length}
              label={t('trip.factStops')} />
            <Fact icon={Mode} value={transportLabel(trip, t)} label={t('trip.factGetting')} word />
            {trip.cost && (
              <Fact icon={ReceiptIcon} value={eur(trip.cost.per_day_eur)}
                label={t('trip.factPerDay')} />
            )}
            {season && <Fact icon={SunIcon} value={season} label={t('trip.factSeason')} word />}
          </div>
          )}

          {onOpenInPlanner && detail && (
            <button type="button" className="itin-use" onClick={() => onOpenInPlanner(detail || card)}>
              <PlusIcon size={15} />
              <span>{t('trip.openInPlanner')}</span>
            </button>
          )}
          {copied && <p className="itin-copied">{t('trip.linkCopied')}</p>}

          {why.length > 0 && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">{t('trip.whyTitle')}</h2>
              <ul className="itin-why">
                {why.map((w) => <li key={w.k}>{w.line}</li>)}
              </ul>
              {detail?.follows && (
                <p className="itin-follows">
                  <LinkIcon size={12} />
                  <a href={detail.follows.url} target="_blank" rel="noopener noreferrer">
                    {detail.follows.title}
                  </a>
                </p>
              )}
            </section>
          )}

          {/* The route: every stop with its nights, every leg with its mode,
              its hours and its fare. A trip that cannot show this is a list
              of cities, not an itinerary. */}
          {detail && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">{t('trip.routeTitle')}</h2>
              <ol className="itin-route">
                {detail.stops.map((s, i) => (
                  <React.Fragment key={s.dest}>
                    <li className={`itin-stop ${selected === i ? 'on' : ''}`}>
                      <button type="button" className="itin-stop-hit"
                        onClick={() => setSelected(selected === i ? null : i)}>
                        <span className="itin-stop-no">{i + 1}</span>
                        {s.img
                          ? <img className="itin-stop-img" src={cardThumb(s.img)} alt="" loading="lazy" />
                          : <span className="itin-stop-img itin-sight-noimg" aria-hidden="true" />}
                        <span className="itin-stop-text">
                          <span className="itin-stop-name">
                            {s.city}
                            <RatingBadge rating={{ score: s.rating }} size="xs" showGem={false} />
                          </span>
                          <span className="itin-stop-meta">
                            <CountryFlag country={s.iso2} size={10} />
                            {names[s.iso2] || s.iso2}
                            <span className="itin-dot" aria-hidden="true" />
                            {t(s.nights === 1 ? 'trip.nightCountOne' : 'trip.nightCountMany', { n: s.nights })}
                            {s.walk_km ? (
                              <>
                                <span className="itin-dot" aria-hidden="true" />
                                {t('trip.walkRadius', { km: s.walk_km })}
                              </>
                            ) : null}
                          </span>
                        </span>
                      </button>
                      {onSelectDest && (
                        <button type="button" className="itin-stop-open"
                          onClick={() => onSelectDest(s.dest)}>
                          {t('trip.openPlace')}
                        </button>
                      )}
                      {selected === i && s.around?.length > 0 && (
                        <ul className="itin-around">
                          {s.around.map((a) => {
                            const Icon = AROUND_ICON[a.kind] || MapPinIcon;
                            return (
                              <li key={`${a.kind}-${a.id}`}>
                                <Icon size={12} />
                                <span>{a.name}</span>
                                <span className="itin-around-km">{t('trip.kmAway', { km: a.km })}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                    {detail.legs[i] && (
                      <li className="itin-leg">
                        {React.createElement(MODE_ICON[detail.legs[i].mode] || TrainIcon, { size: 13 })}
                        <span>{legLine(detail.legs[i], t)}</span>
                        {detail.legs[i].home && (
                          <span className="itin-leg-home">{t('trip.legHome')}</span>
                        )}
                        <span className="itin-est">{t('trip.estimate')}</span>
                      </li>
                    )}
                  </React.Fragment>
                ))}
              </ol>
            </section>
          )}

          {/* Days out, for a trip that keeps one bed. */}
          {detail && detail.daytrips.length > 0 && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">
                {t('trip.outsTitle', { city: detail.stops[0].city })}
              </h2>
              <div className="itin-outs">
                {detail.daytrips.map((d) => {
                  const Icon = MODE_ICON[d.mode] || TrainIcon;
                  return (
                    <div key={d.dest} className="itin-out">
                      {d.img
                        ? <img className="itin-out-img" src={cardThumb(d.img)} alt="" loading="lazy" />
                        : <span className="itin-out-img itin-sight-noimg" aria-hidden="true" />}
                      <div className="itin-out-body">
                        <div className="itin-out-head">
                          <span className="itin-out-name">{d.city}</span>
                          <RatingBadge rating={{ score: d.rating }} size="xs" showGem={false} />
                        </div>
                        <div className="itin-out-meta">
                          <Icon size={12} />
                          <span>{t('trip.outTime', { min: d.minutes, km: d.km })}</span>
                          <span className="itin-dot" aria-hidden="true" />
                          <span>{t('trip.outOnSite', { h: d.on_site_h })}</span>
                        </div>
                        <ul className="itin-out-sights">
                          {d.highlights.map((h) => (
                            <li key={h.name}>{h.name}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Day by day. Every named sight carries its own photograph, which
              is the difference between a plan and a paragraph. */}
          {detail && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">{t('trip.daysTitle')}</h2>
              <ol className="itin-days">
                {detail.plan.map((day) => {
                  const stop = detail.stops[day.stop];
                  const out = day.daytrip
                    ? detail.daytrips.find((x) => x.dest === day.daytrip) : null;
                  const pool = out ? out.highlights : stop.highlights;
                  const items = day.items
                    .map((n) => pool.find((h) => h.name === n))
                    .filter(Boolean);
                  return (
                    <li key={day.d} className={`itin-day is-${day.kind}`}>
                      <div className="itin-day-head">
                        <span className="itin-day-no">{day.d}</span>
                        <span className="itin-day-title">{dayTitle(day, detail, t)}</span>
                      </div>
                      {day.kind === 'travel' && detail.legs[day.stop - 1] && (
                        <p className="itin-day-leg">
                          <ClockIcon size={12} />
                          {legLine(detail.legs[day.stop - 1], t)}
                        </p>
                      )}
                      {items.length > 0 && (
                        <ul className="itin-sights">
                          {items.map((p) => <Sight key={p.name} poi={p} />)}
                        </ul>
                      )}
                      {items.length === 0 && day.kind === 'depart' && (
                        <p className="itin-day-note">{t('trip.departNote', { city: stop.city })}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {/* What it costs, and for whom. */}
          {detail && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">{t('trip.costTitle')}</h2>
              <ul className="itin-cost">
                <li>
                  <span>{t('trip.costStay', { n: detail.nights })}</span>
                  <b>{eur(detail.cost.stay_eur)}</b>
                </li>
                <li>
                  <span>{t('trip.costTravel')}</span>
                  <b>{eur(detail.cost.legs_eur)}</b>
                </li>
                <li className="itin-cost-sum">
                  <span>{t('trip.costPerDay')}</span>
                  <b>{eur(detail.cost.per_day_eur)}</b>
                </li>
              </ul>
              <p className="tpage-credit">{t('trip.costNote')}</p>
            </section>
          )}

          {/* What we checked. The block that makes the rest believable. */}
          {detail && (
            <section className="tpage-sec itin-checks">
              <h2 className="tpage-sec-title">{t('trip.checksTitle')}</h2>
              <p className="itin-check-pass">
                <CheckIcon size={13} />
                {t('trip.checksPassed', { n: (detail.checks?.passed || []).length })}
              </p>
              {warnings.length > 0 ? (
                <ul className="itin-warns">
                  {warnings.map((w) => (
                    <li key={w.code}><AlertIcon size={12} /><span>{w.line}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="itin-check-clean">{t('trip.checksClean')}</p>
              )}
              <p className="tpage-credit">{t('trip.checksCredit')}</p>
            </section>
          )}

          {detail?.gallery?.length > 0 && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">{t('trip.galleryTitle')}</h2>
              <div className="itin-gallery">
                {detail.gallery.map((g) => (
                  <figure key={g.url} className="itin-shot">
                    <img src={cardThumb(g.url)} alt="" loading="lazy" />
                    <figcaption>{g.name || g.city}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="tpage-credit">{t('trip.galleryCredit')}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
