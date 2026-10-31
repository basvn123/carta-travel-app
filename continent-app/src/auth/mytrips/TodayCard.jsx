import React, { useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, ChipGroup, Field, IconButton, Money } from '../../components/ui/index.js';
import {
  SunIcon, PartSunIcon, CloudIcon, FogIcon, RainIcon, DrizzleIcon, SnowIcon, StormIcon,
  BedIcon, CheckIcon, PlusIcon, TicketIcon, CalendarIcon, CameraIcon, FriendsIcon,
} from '../../components/Icons.jsx';
import { useForecast } from '../../lib/weather.js';
import { toEur } from '../../lib/currency.js';
import { formatMoney } from '../../lib/money.js';
import { spendOnDay, tripStops } from '../../lib/myTrips.js';
import { dayPlaceNames } from '../../planner/trip/dayNames.js';
import { ideasOnDay } from '../../planner/trip/ownIdeas.js';
import { useTripDayStore } from '../../planner/trip/useTripDayStore.js';
import { loadMemory, saveMemory, emptyMemory, MAX_PHOTOS } from '../pastTripMemory.js';
import { readPhoto } from '../PastTripForm.jsx';

const SKY = {
  sun: SunIcon, partsun: PartSunIcon, cloud: CloudIcon, fog: FogIcon,
  rain: RainIcon, drizzle: DrizzleIcon, snow: SnowIcon, storm: StormIcon,
};
/** What a spend on the road is, in the past-trip memory's own words. */
const DAY_CATS = ['food', 'transport', 'activities', 'other'];
const DONE_KEY = 'carta.mytrips.done.v1';
const readDone = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}') || {}; } catch { return {}; } };
const writeDone = (v) => { try { localStorage.setItem(DONE_KEY, JSON.stringify(v)); } catch { /* private mode */ } };

/**
 * Today (T924): while a trip runs, the Trips tab opens here. Day n of m and
 * the place; the weather when the forecast answers; the day's plan as a
 * timeline from the day plans (places picked in the day planner, the
 * traveller's own ideas for the day, and booked things put on the day, which
 * carry a ticket mark), each marked done by the traveller, the first not done
 * being next; what was spent today from the expense ledger, against the
 * plan's food and drink a person a day, with a bar by category and Add a
 * spend; then quick tiles for the bookings, tomorrow, photos and the crew.
 * A part with no data is not drawn.
 *
 *   plan, today          the trip row and lib/myTrips.tripToday()
 *   figure               lib/myTrips.tripFigure() (party, foodDayPP)
 *   crewNames            the crew as one line, '' when nobody is named
 */
export function TodayCard({
  plan, today, destinations = {}, figure = null, todayIso, crewNames = '', spendLabels = {},
  onPlanDay, onOpenTrip, onCrew, onPhotoAdded,
}) {
  const { t } = useI18n();
  const stops = useMemo(() => tripStops(plan), [plan]);
  const dests = useMemo(() => stops.map((s) => destinations[s.id]).filter(Boolean), [stops, destinations]);
  const store = useTripDayStore(plan.id, dests);
  const { extras, assignments, prefs, fetched, saveExtras } = store;
  const dest = destinations[today.stop?.id] || null;
  const city = dest?.city || (plan.cities || [])[today.stopIndex] || '';
  const lat = dest?.city_lat ?? dest?.lat;
  const lon = dest?.city_lon ?? dest?.lon;
  const rows = useForecast(lat, lon, true);
  const sky = Array.isArray(rows) ? rows.find((r) => r.date === todayIso) : null;
  const Sky = sky ? (SKY[sky.kind] || CloudIcon) : null;

  // The day's plan, in the order the planner keeps it.
  const [done, setDone] = useState(readDone);
  const doneHere = done[plan.id]?.[today.dayNum] || [];
  const items = useMemo(() => {
    const picks = assignments?.[today.stopIndex]?.[today.dayIndex] || [];
    const places = dayPlaceNames({ dest, picks, fetched, customs: prefs?.customPois?.[dest?.id] || [] })
      .map((name) => ({ key: `p:${name}`, name }));
    const own = ideasOnDay(extras, today.dayNum).map((x) => ({ key: `i:${x.id}`, name: x.text }));
    const booked = (extras.dayExtras?.[today.dayNum] || []).filter((a) => a?.name).map((a) => ({
      key: `b:${a.id || a.name}`, name: a.name, booked: true, eur: Number.isFinite(a.eur) ? a.eur : null,
    }));
    return [...places, ...own, ...booked];
  }, [assignments, today, dest, fetched, prefs, extras]);
  const nextKey = items.find((x) => !doneHere.includes(x.key))?.key || null;
  const toggleDone = (key) => {
    const cur = readDone();
    const day = cur[plan.id]?.[today.dayNum] || [];
    const nextDay = day.includes(key) ? day.filter((k) => k !== key) : [...day, key];
    const next = { ...cur, [plan.id]: { ...(cur[plan.id] || {}), [today.dayNum]: nextDay } };
    writeDone(next);
    setDone(next);
  };
  const dayWords = String(extras.dayNotes?.[today.dayNum] || '').trim();

  // What was spent today, a person, against the plan's food and drink.
  const head = Math.max(1, figure?.party || plan.choices?.groupSize || 1);
  const spent = useMemo(() => spendOnDay(extras.expenses, todayIso, toEur), [extras.expenses, todayIso]);
  const pp = spent.total / head;
  const foodPP = (spent.byCat.food || 0) / head;
  const plannedFood = figure?.foodDayPP || null;
  const cats = Object.entries(spent.byCat).filter(([, v]) => v > 0);

  // Add a spend: one line in the trip's own expense ledger, dated today.
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ desc: '', amount: '', cat: 'food' });
  const amount = Number(String(form.amount).replace(',', '.'));
  const addSpend = (e) => {
    e.preventDefault();
    if (!(amount > 0)) return;
    saveExtras({
      ...extras,
      expenses: [...(extras.expenses || []), {
        id: `${Date.now()}`, desc: form.desc.trim() || spendLabels[form.cat] || '', amount, currency: 'EUR',
        paidBy: 0, sharers: null, date: todayIso, cat: form.cat,
      }],
    });
    setForm({ desc: '', amount: '', cat: form.cat });
    setAdding(false);
  };

  // Photos go to the trip's memory, marked with the day they were taken.
  const fileRef = useRef(null);
  const [photoNote, setPhotoNote] = useState('');
  const addPhotos = async (list) => {
    const files = [...(list || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const mem = loadMemory(plan.id) || emptyMemory();
    const photos = [...(mem.photos || [])];
    let added = 0;
    for (const f of files) {
      if (photos.length >= MAX_PHOTOS) { setPhotoNote(t('saved.pastPhotoCap', { n: MAX_PHOTOS })); break; }
      try {
        photos.push({ id: `ph${Date.now()}${added}`, src: await readPhoto(f), caption: '', day: today.dayNum });
        added += 1;
      } catch { setPhotoNote(t('saved.pastPhotoFailed')); }
    }
    if (added) {
      saveMemory(plan.id, { ...mem, photos, cover: mem.cover || photos[0].id }, spendLabels);
      setPhotoNote(t(added === 1 ? 'mt.photoAdded1' : 'mt.photoAddedN', { n: added, day: today.dayNum }));
      onPhotoAdded?.();
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  // The quick tiles hold only what the trip holds.
  const bookedCount = Object.values(extras.bookings || {}).filter((b) => b && (b.ref || (b.price != null && b.price !== '') || b.url)).length;
  const tmr = today.tomorrow;
  const tmrDest = tmr ? destinations[tmr.stop?.id] : null;
  const tmrFirst = tmr ? [
    ...dayPlaceNames({ dest: tmrDest, picks: assignments?.[tmr.stopIndex]?.[tmr.dayIndex] || [], fetched, customs: prefs?.customPois?.[tmrDest?.id] || [] }),
    ...ideasOnDay(extras, tmr.dayNum).map((x) => x.text),
    ...(extras.dayExtras?.[tmr.dayNum] || []).map((a) => a?.name).filter(Boolean),
  ][0] : null;
  const tmrLine = !tmr ? '' : tmr.moves && tmrDest?.city ? t('mt.tomorrowTo', { city: tmrDest.city })
    : tmrFirst || t('mt.tomorrowFree');

  return (
    <section className="mt-today" aria-labelledby="mt-today-h">
      <div className="mt-today-main">
        <p className="mt-today-kicker">{t('mt.todayDay', { n: today.dayNum, of: today.of })}</p>
        <h3 className="mt-today-title" id="mt-today-h">{dayWords ? t('mt.todayPlaceWords', { place: city, words: dayWords }) : city}</h3>
        <p className="mt-today-facts">
          {sky && Number.isFinite(sky.hi) && (
            <span><Sky size={16} />{t('mt.todayWeather', { t: Math.round(sky.hi) })}</span>
          )}
          {city && <span><BedIcon size={16} />{t('mt.stayingIn', { place: city })}</span>}
        </p>

        {items.length > 0 ? (
          <ol className="mt-tl" aria-label={t('mt.todayPlan')}>
            {items.map((x) => {
              const isDone = doneHere.includes(x.key);
              const state = isDone ? 'done' : x.key === nextKey ? 'next' : 'later';
              return (
                <li key={x.key} className={`mt-tl-item is-${state}`}>
                  <span className="mt-tl-dot" aria-hidden="true" />
                  <span className="mt-tl-text">
                    <span className="mt-tl-name">{x.name}</span>
                    <span className="mt-tl-sub">
                      {state === 'next' && <span className="mt-tl-next">{t('mt.next')}</span>}
                      {state === 'done' && <span>{t('mt.done')}</span>}
                      {x.booked && <span className="mt-tl-ticket"><TicketIcon size={14} />{t('mt.booked')}</span>}
                      {x.eur != null && <Money value={x.eur} precision="cents" />}
                    </span>
                  </span>
                  <IconButton
                    label={t(isDone ? 'mt.markNotDone' : 'mt.markDone', { name: x.name })}
                    pressed={isDone}
                    onClick={() => toggleDone(x.key)}
                  >
                    <CheckIcon size={16} />
                  </IconButton>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-today-empty">{t('mt.todayNothing')}</p>
        )}
        <div className="mt-today-acts">
          <Button variant="primary" iconStart={<CalendarIcon size={18} />} onClick={() => onPlanDay?.(today.stopIndex, today.dayIndex)}>
            {t(items.length ? 'mt.openToday' : 'mt.planToday')}
          </Button>
          <Button onClick={onOpenTrip}>{t('saved.openTrip')}</Button>
        </div>
      </div>

      <div className="mt-today-side">
        <section className="mt-spend" aria-labelledby="mt-spend-h">
          <h4 className="mt-spend-h" id="mt-spend-h">{t('mt.spendToday')}</h4>
          {spent.total > 0 ? (
            <>
              <p className="mt-spend-fig">
                <Money value={pp} precision="cents" />
                <span>{t('mt.aPerson')}</span>
              </p>
              {plannedFood > 0 && (
                <p className="mt-spend-plan">{t('mt.foodVsPlan', { spent: formatMoney(foodPP), plan: formatMoney(plannedFood) })}</p>
              )}
              <span className="mt-spend-bar" aria-hidden="true">
                {cats.map(([c, v]) => <i key={c} className={`is-${c}`} style={{ flexGrow: v }} />)}
              </span>
              <ul className="mt-spend-legend">
                {cats.map(([c, v]) => (
                  <li key={c}><i className={`is-${c}`} aria-hidden="true" />{spendLabels[c] || c} <Money value={v / head} precision="cents" /></li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-spend-none">{t('mt.spendNone')}</p>
          )}
          {adding ? (
            <form className="mt-spend-form" onSubmit={addSpend}>
              <ChipGroup label={t('mt.spendKind')} className="mt-chips">
                {DAY_CATS.map((c) => (
                  <Chip key={c} kind="choice" selected={form.cat === c} onClick={() => setForm((f) => ({ ...f, cat: c }))}>{spendLabels[c] || c}</Chip>
                ))}
              </ChipGroup>
              <div className="mt-spend-fields">
                <Field label={t('mt.spendWhat')} value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} />
                <Field label={t('mt.spendAmount')} inputMode="decimal" value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d.,]/g, '') }))} />
              </div>
              <p className="mt-spend-help">{t('mt.spendWhole', { n: head })}</p>
              <div className="mt-spend-foot">
                <Button type="submit" disabled={!(amount > 0)}>{t('mt.spendAdd')}</Button>
                <Button variant="quiet" onClick={() => setAdding(false)}>{t('pf.cancel')}</Button>
              </div>
            </form>
          ) : (
            <Button size="sm" iconStart={<PlusIcon size={16} />} onClick={() => setAdding(true)}>{t('mt.addSpend')}</Button>
          )}
        </section>

        <div className="mt-quick">
          {bookedCount > 0 && (
            <Button className="mt-qk" onClick={onOpenTrip}>
              <TicketIcon size={20} /><span className="mt-qk-t">{t('mt.qkBookings')}</span>
              <span className="mt-qk-s">{t(bookedCount === 1 ? 'mt.qkBookings1' : 'mt.qkBookingsN', { n: bookedCount })}</span>
            </Button>
          )}
          {tmr && (
            <Button className="mt-qk" onClick={() => onPlanDay?.(tmr.stopIndex, tmr.dayIndex)}>
              <CalendarIcon size={20} /><span className="mt-qk-t">{t('mt.qkTomorrow')}</span>
              <span className="mt-qk-s">{tmrLine}</span>
            </Button>
          )}
          <Button className="mt-qk" onClick={() => fileRef.current?.click()}>
            <CameraIcon size={20} /><span className="mt-qk-t">{t('mt.qkPhotos')}</span>
            <span className="mt-qk-s">{t('mt.qkPhotosDay', { n: today.dayNum })}</span>
          </Button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
          {crewNames && (
            <Button className="mt-qk" onClick={onCrew}>
              <FriendsIcon size={20} /><span className="mt-qk-t">{t('mt.qkCrew')}</span>
              <span className="mt-qk-s">{crewNames}</span>
            </Button>
          )}
        </div>
        <p className="mt-today-note" role="status">{photoNote}</p>
      </div>
    </section>
  );
}
