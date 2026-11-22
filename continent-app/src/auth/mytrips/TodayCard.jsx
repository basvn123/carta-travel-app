import React, { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton, Money } from '../../components/ui/index.js';
import {
  SunIcon, PartSunIcon, CloudIcon, FogIcon, RainIcon, DrizzleIcon, SnowIcon, StormIcon,
  BedIcon, CheckIcon, TicketIcon, CalendarIcon, CameraIcon, FriendsIcon, HeartIcon,
} from '../../components/Icons.jsx';
import { useForecast } from '../../lib/weather.js';
import { tripStops } from '../../lib/myTrips.js';
import { dayPlaceNames } from '../../planner/trip/dayNames.js';
import { ideasOnDay } from '../../planner/trip/ownIdeas.js';
import { useTripDayStore } from '../../planner/trip/useTripDayStore.js';
import { loadMemory, saveMemory, emptyMemory, MAX_PHOTOS } from '../pastTripMemory.js';
import { readPhoto } from '../PastTripForm.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { ChevronRightIcon } from '../../components/Icons.jsx';
import { WalletGlyph } from './spend/icons.jsx';

// G15: the Uitgaven page loads with its own chunk, when it is opened.
const SpendPage = lazy(() => import('./spend/SpendPage.jsx'));

const SKY = {
  sun: SunIcon, partsun: PartSunIcon, cloud: CloudIcon, fog: FogIcon,
  rain: RainIcon, drizzle: DrizzleIcon, snow: SnowIcon, storm: StormIcon,
};
const DONE_KEY = 'carta.mytrips.done.v1';
const readDone = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}') || {}; } catch { return {}; } };
const writeDone = (v) => { try { localStorage.setItem(DONE_KEY, JSON.stringify(v)); } catch { /* private mode */ } };

/**
 * Today (T924): while a trip runs, the Trips tab opens here. Day n of m and
 * the place; the weather when the forecast answers; the day's plan as a
 * timeline from the day plans (places picked in the day planner, the
 * traveller's own ideas for the day, and booked things put on the day, which
 * carry a ticket mark), each marked done by the traveller, the first not done
 * being next; the quiet "Uitgaven" row (G15), which opens the spending page
 * with today's spends, the food plan tick, adding by keypad, speech or a
 * receipt, and the Reiskas; then quick tiles for the bookings, tomorrow,
 * photos and the crew.
 * A part with no data is not drawn.
 *
 *   plan, today          the trip row and lib/myTrips.tripToday()
 *   figure               lib/myTrips.tripFigure() (party, foodDayPP)
 *   crewNames            the crew as one line, '' when nobody is named
 */
export function TodayCard({
  plan, today, destinations = {}, figure = null, todayIso, crewNames = '', spendLabels = {},
  title = '', img = null, userId = null, openSpend = false,
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

  // Uitgaven (G15): the page holds the spends, the food plan and the kas.
  const [spendOpen, setSpendOpen] = useState(openSpend);

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

  // The memory row's counts: photos in the trip's memory, notes kept per day.
  const memPhotos = (loadMemory(plan.id)?.photos || []).length;
  const memNotes = Object.values(extras.dayNotes || {}).filter((x) => String(x || '').trim()).length;

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
        {/* House style: no eyebrow above the heading; the day count follows
            the title as its first fact. */}
        {/* G12 Phase C: the title with the country's flag, the day count under it. */}
        <div className="mt-today-h">
          <h3 className="mt-today-title" id="mt-today-h">{dayWords ? t('mt.todayPlaceWords', { place: city, words: dayWords }) : city}</h3>
          {dest?.country && <CountryFlag country={dest.country} size={18} />}
        </div>
        <p className="mt-today-kicker">{t('mt.todayDay', { n: today.dayNum, of: today.of })}</p>
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
        <Pressable type="button" className="mt-spend-door" onClick={() => setSpendOpen(true)} aria-haspopup="dialog">
          <span className="mt-spend-door-ico"><WalletGlyph size={18} /></span>
          <span className="mt-spend-door-t">{t('sp.title')}</span>
          <ChevronRightIcon size={18} />
        </Pressable>
        {spendOpen && (
          <Suspense fallback={null}>
            <SpendPage
              planId={plan.id}
              extras={extras}
              saveExtras={saveExtras}
              todayIso={todayIso}
              startIso={plan.start_date || null}
              title={title || city}
              img={img}
              groupSize={Math.max(1, figure?.party || plan.choices?.groupSize || 1)}
              plannedFood={figure?.foodDayPP || null}
              userId={userId}
              onClose={() => setSpendOpen(false)}
              onCrew={onCrew}
            />
          </Suspense>
        )}

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
        {/* The memory page so far: the photos and notes the trip holds. */}
        <Pressable className="mt-disc-row" onClick={onOpenTrip}>
          {/* Desktop only: the icon lines the row up with the quick rows above (owner review 2026-11-22). */}
          <HeartIcon size={20} className="mt-disc-row-ico" />
          <span className="mt-disc-row-t">{t('mt.memPage')}</span>
          <span className="mt-disc-row-s">{[
            t(memPhotos === 1 ? 'mt.memPhotos1' : 'mt.memPhotosN', { n: memPhotos }),
            t(memNotes === 1 ? 'mt.memNotes1' : 'mt.memNotesN', { n: memNotes }),
          ].join(', ')}</span>
          <ChevronRightIcon size={18} />
        </Pressable>
      </div>
    </section>
  );
}
