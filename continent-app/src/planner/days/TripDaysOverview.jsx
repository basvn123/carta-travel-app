import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { ScoreChip } from '../../components/RatingBadge.jsx';
import NotYet from '../../components/NotYet.jsx';
import { Button, Card, Chip, ChipGroup, ChoiceRows, IconButton } from '../../components/ui/index.js';
import { BookmarkIcon, CheckIcon, ChevronRightIcon, PlusIcon, SparkIcon } from '../../components/Icons.jsx';
import { formatEst } from '../../lib/money.js';
import { addDays, fmtDate } from '../../lib/dates.js';
import { cityLabel } from '../../lib/placeName.js';
import { usePlannerStore } from '../plannerStore.js';
import { fromDraft } from '../flow/tripSettings.js';
import { buildIdeaSections, poiRowsFor, savedKeys, toggleSaved, placeIdea, dayOfIdea } from './dayIdeas.js';
import { costOverview } from './tripCost.js';
import { useStopIdeas } from './useStopIdeas.js';

const BAR_SHADES = ['--kind-metro', '--kind-city', '--kind-town', '--kind-village'];

/**
 * Your days (T672), the trip's days at a glance and what they can be made of:
 * the trip's money after TravelSpend's tiles (the total, a person a day, the
 * split), every day as a card that opens it, then for the chosen stop the
 * ideas Carta has for it in sections after GetYourGuide's rails (can't miss,
 * top sights, adventures, walks, cycling, the outdoors, food, what is on),
 * each one kept with a tap and put on a day with one more. Kept ideas wait in
 * their own row until they have a day. Sections the data cannot fill yet keep
 * their place with the shared placeholder.
 */
export function TripDaysOverview({
  tripName, stops, planDays, assignments, prefs, itemsForStop, ensurePois, destinations,
  tripPriced, onChange, onOpenDay, onFillDay = null,
}) {
  const { t, lang } = useI18n();
  const draft = usePlannerStore();
  const settings = useMemo(() => fromDraft(draft), [draft]);
  const [si, setSi] = useState(0);
  const [picking, setPicking] = useState(null); // the idea row being put on a day
  const stop = stops[si] || stops[0];
  const destId = stop?.destination_id;
  const dest = stop?.dest;

  useEffect(() => { ensurePois?.(stops.map((s) => s.destination_id)); }, [stops, ensurePois]);

  // ---- the money ----
  const party = tripPriced?.party
    ? Math.max(1, (tripPriced.party.adults || 0) + (tripPriced.party.children || 0) + (tripPriced.party.babies || 0))
    : Math.max(1, settings.party.adults + settings.party.kids);
  const nights = stops.reduce((n, s) => n + (s.nights || 0), 0);
  const money = useMemo(() => costOverview(tripPriced, { party, nights }), [tripPriced, party, nights]);
  const est = (v, precision = 'whole') => formatEst(v, t('money.est'), { precision, locale: lang });

  // ---- the stop's ideas ----
  const stay = dest && Number.isFinite(dest.lat) ? { lat: dest.city_lat ?? dest.lat, lon: dest.city_lon ?? dest.lon } : null;
  const raw = useStopIdeas(destId, dest?.iso2, stay);
  const pool = useMemo(() => (destId ? itemsForStop(stop) : { items: [], walkable: new Set(), limited: true }), [destId, stop, itemsForStop]);
  const customsN = (prefs?.customPois?.[destId] || []).length;
  const baseLen = Math.max(0, pool.items.length - customsN);
  const pois = useMemo(
    () => (pool.limited ? [] : poiRowsFor(pool.items, pool.walkable, destId, stay, destinations)),
    [pool, destId, stay?.lat, stay?.lon, destinations], // eslint-disable-line react-hooks/exhaustive-deps -- stay by value, not the object rebuilt each render
  );
  const stopDates = useMemo(
    () => Array.from({ length: stop?.nights || 0 }, (_, di) => (stop?.arrive_date ? addDays(stop.arrive_date, di) : '')).filter(Boolean),
    [stop?.arrive_date, stop?.nights],
  );
  const sections = useMemo(() => (raw.loading ? null : buildIdeaSections({
    pois,
    trails: raw.trails,
    water: raw.water,
    peaks: raw.peaks,
    cycling: raw.cycling,
    dossier: raw.dossier,
    town: dest ? { id: destId, lat: stay?.lat, lon: stay?.lon, km: 0 } : null,
    dates: stopDates,
    goal: settings.rhythm.goal,
    party: { kids: settings.party.kids, slowWalkers: settings.party.slowWalkers },
  })), [raw, pois, dest, destId, stay?.lat, stay?.lon, stopDates, settings]);
  const kept = savedKeys(prefs, destId);
  const keptRows = prefs?.savedIdeas?.[destId] || [];

  const keep = (row) => onChange({ assignments, prefs: toggleSaved(prefs, destId, row) });
  const put = (row, di) => {
    const r = placeIdea({ assignments, prefs, si, di, destId, baseLen, row });
    onChange({ assignments: r.assignments, prefs: r.prefs });
    setPicking(null);
  };
  const onDay = (row) => dayOfIdea({ assignments, prefs, si, destId, baseLen, row });

  // ---- the days ----
  const dayCards = planDays.map((d, k) => {
    const s = stops[d.si];
    const list = assignments?.[d.si]?.[d.di] || [];
    const items = s ? itemsForStop(s).items : [];
    const photos = list.map((i) => items[i]?.img).filter(Boolean).slice(0, 3);
    const iso = s?.arrive_date ? addDays(s.arrive_date, d.di) : '';
    return { k, si: d.si, di: d.di, n: list.length, photos, iso, city: cityLabel(s?.dest?.city || '') };
  });

  const metaOf = (r) => {
    const parts = [];
    if (r.kind === 'trail' || r.kind === 'cycle') {
      if (r.lenKm != null) parts.push(t('days.lenKm', { n: r.lenKm }));
      if (r.ascentM != null) parts.push(t('days.upM', { n: r.ascentM }));
    } else if (r.kind === 'peak' && r.eleM != null) {
      parts.push(t('days.eleM', { n: r.eleM }));
    } else if (r.kind === 'event' && r.sub) {
      parts.push(r.sub);
    } else if (r.sub && r.kind !== 'do') {
      parts.push(r.sub);
    }
    if (r.km != null && r.km >= 1 && r.kind !== 'do' && r.kind !== 'event') parts.push(t('days.kmAway', { n: Math.round(r.km) }));
    return parts.join(', ');
  };

  const ideaCard = (r) => {
    const day = onDay(r);
    return (
      <li key={r.key} className="tdo-idea">
        <Card
          layout="tile"
          wrap
          media={<HeroImage url={r.photo} city={r.name} iso2={dest?.iso2} className="tdo-idea-img" ratio={[4, 3]} maxWidth={480} />}
          title={r.name}
          meta={(
            <>
              {metaOf(r) && <span className="tdo-idea-meta">{metaOf(r)}</span>}
              {r.desc && <span className="tdo-idea-desc">{r.desc}</span>}
            </>
          )}
          rating={r.rating?.score != null ? <ScoreChip rating={r.rating} /> : null}
          actions={(
            <>
              <IconButton
                label={kept.has(r.key) ? t('days.unkeep', { name: r.name }) : t('days.keep', { name: r.name })}
                pressed={kept.has(r.key)}
                onClick={() => keep(r)}
              >
                <BookmarkIcon size={18} />
              </IconButton>
              <Button
                variant={day >= 0 ? 'secondary' : 'quiet'}
                size="sm"
                iconStart={day >= 0 ? <CheckIcon size={14} /> : <PlusIcon size={14} />}
                onClick={() => setPicking(r)}
              >
                {day >= 0 ? t('days.onDay', { n: dayNumberOf(planDays, si, day) }) : t('days.addToDay')}
              </Button>
            </>
          )}
        />
      </li>
    );
  };

  return (
    <div className="tdo">
      <header className="tdo-head">
        <h1 className="tdo-title">{t('days.title')}</h1>
        {tripName && <p className="tdo-sub">{tripName}</p>}
      </header>

      {money && (
        <section className="tdo-money" aria-labelledby="tdo-money-h">
          <h2 className="sr-only" id="tdo-money-h">{t('days.money')}</h2>
          <div className="tdo-tiles">
            <div className="tdo-tile">
              <span className="tdo-tile-label">{t('days.total')}</span>
              <span className="tdo-tile-fig">{est(money.total, 'cents')}</span>
              <span className="tdo-tile-sub">{party === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: party })}</span>
            </div>
            <div className="tdo-tile">
              <span className="tdo-tile-label">{t('days.perDay')}</span>
              <span className="tdo-tile-fig">{money.perPersonDay != null ? est(money.perPersonDay) : t('data.notYet')}</span>
              <span className="tdo-tile-sub">{t('days.nNights', { n: nights })}</span>
            </div>
          </div>
          {money.parts.length > 1 && (
            <>
              <span className="tdo-bar" aria-hidden="true">
                {money.parts.map((p, i) => (
                  <span key={p.key} style={{ flexGrow: p.share, background: `var(${BAR_SHADES[i % BAR_SHADES.length]})` }} />
                ))}
              </span>
              <dl className="tdo-parts">
                {money.parts.map((p, i) => (
                  <div key={p.key} className="tdo-part">
                    <dt>
                      <span className="tdo-swatch" style={{ background: `var(${BAR_SHADES[i % BAR_SHADES.length]})` }} aria-hidden="true" />
                      {t(`days.part.${p.key}`)}
                    </dt>
                    <dd>{est(p.eur, 'cents')}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {money.missing > 0 && <p className="tdo-note">{t('days.missing', { n: money.missing })}</p>}
        </section>
      )}

      <section className="tdo-days" aria-labelledby="tdo-days-h">
        <h2 className="tdo-h2" id="tdo-days-h">{t('days.yourDays')}</h2>
        <ol className="tdo-daylist">
          {dayCards.map((d) => (
            <li key={d.k}>
              <Button variant="quiet" className="tdo-day" onClick={() => onOpenDay(d.k)} iconEnd={<ChevronRightIcon size={18} className="pf-ico" />}>
                <span className="tdo-day-num">{t('itin.dayN', { n: d.k + 1 })}</span>
                <span className="tdo-day-text">
                  <span className="tdo-day-when">{[d.iso ? fmtDate(d.iso, true) : '', d.city].filter(Boolean).join(', ')}</span>
                  <span className={`tdo-day-n${d.n ? '' : ' is-empty'}`}>
                    {d.n ? t(d.n === 1 ? 'day.statStop' : 'day.statStops', { n: d.n }) : t('days.empty')}
                  </span>
                </span>
                {d.photos.length > 0 && (
                  <span className="tdo-day-photos" aria-hidden="true">
                    {d.photos.map((u) => <img key={u} src={u} alt="" loading="lazy" />)}
                  </span>
                )}
              </Button>
              {!d.n && onFillDay && (
                <Button variant="quiet" size="sm" className="tdo-fill" iconStart={<SparkIcon size={14} />} onClick={() => onFillDay(d.k)}>
                  {t('days.fill')}
                </Button>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="tdo-ideas" aria-labelledby="tdo-ideas-h">
        <h2 className="tdo-h2" id="tdo-ideas-h">{t('days.ideasFor', { city: cityLabel(dest?.city || '') })}</h2>
        {stops.length > 1 && (
          <ChipGroup label={t('days.whichStop')} className="tdo-stops">
            {stops.map((s, i) => (
              <Chip key={`${s.destination_id}-${i}`} kind="choice" selected={i === si} onClick={() => setSi(i)}>
                {cityLabel(s.dest?.city || '')}
              </Chip>
            ))}
          </ChipGroup>
        )}

        {keptRows.length > 0 && (
          <div className="tdo-kept">
            <h3 className="tdo-h3">{t('days.kept', { n: keptRows.length })}</h3>
            <ul className="tdo-kept-list">
              {keptRows.map((r) => {
                const day = onDay(r);
                return (
                  <li key={r.key}>
                    <span className="tdo-kept-name">{r.name}</span>
                    <Button variant="quiet" size="sm" onClick={() => setPicking(r)}>
                      {day >= 0 ? t('days.onDay', { n: dayNumberOf(planDays, si, day) }) : t('days.addToDay')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!sections && <div className="tdo-loading" aria-busy="true"><span className="sr-only">{t('ready.loading')}</span></div>}
        {sections && sections.map((s) => (
          <div key={s.key} className={`tdo-section${s.empty ? ' is-empty' : ''}`}>
            <h3 className="tdo-h3">{t(`days.sec.${s.key}`)}</h3>
            {s.empty ? (
              <NotYet line as="p" className="tdo-notyet" />
            ) : (
              <ul className="tdo-rail">{s.rows.map(ideaCard)}</ul>
            )}
          </div>
        ))}
      </section>

      {picking && (
        <DayPickSheet
          row={picking}
          days={planDays.map((d, k) => ({ ...d, k })).filter((d) => d.si === si)}
          stop={stop}
          current={onDay(picking)}
          onClose={() => setPicking(null)}
          onPick={(di) => put(picking, di)}
        />
      )}
    </div>
  );
}

/** The trip-wide day number of day `di` of stop `si`. */
function dayNumberOf(planDays, si, di) {
  const k = planDays.findIndex((d) => d.si === si && d.di === di);
  return k + 1;
}

/** Which day? A sheet of the stop's days (Wanderlog's add to a day). */
function DayPickSheet({ row, days, stop, current, onClose, onPick }) {
  const { t } = useI18n();
  const [di, setDi] = useState(current >= 0 ? current : (days[0]?.di ?? 0));
  const options = days.map((d) => ({
    value: String(d.di),
    icon: 'CalendarIcon',
    label: t('itin.dayN', { n: d.k + 1 }),
    sub: stop?.arrive_date ? fmtDate(addDays(stop.arrive_date, d.di), true) : '',
  }));
  return (
    <SheetShell title={t('days.pickDay', { name: row.name })} onClose={onClose} className="tdo-pick">
      <ChoiceRows label={t('days.pickDay', { name: row.name })} options={options} value={[String(di)]} onPick={(v) => setDi(Number(v))} />
      <div className="pf-foot">
        <Button variant="primary" block onClick={() => onPick(di)}>{current === di ? t('days.keepHere') : t('days.putHere')}</Button>
      </div>
    </SheetShell>
  );
}
