import React, { useMemo, useRef, useState } from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { SheetShell } from '../browse/SheetShell.jsx';
import { useI18n } from '../i18n/index.jsx';
import { cityLabel } from '../lib/placeName.js';
import { addDays, todayISO, fmtDate } from '../lib/dates.js';
import { MoreIcon, TrashIcon, RouteIcon, ChevronRightIcon } from '../components/Icons.jsx';

/**
 * "Continue a trip" (D2).
 *
 * A saved trip is the single most likely answer to "which day am I planning",
 * and it used to be offered as a bordered text row with a 46px thumb. That row
 * said the trip's name and a date range, which is what a filing system needs,
 * not what a traveller recognises. These cards lead with the photograph of the
 * first stop and say, in one badge, whether the trip is happening now, how
 * soon it starts, or that it is already over.
 *
 * Everything the cards render rides on the rows fetchTripPlans already
 * returns: it carries `stops` with per-stop dates, cities, countries and
 * destination ids (tripPlanStorage.js), so no second fetch is needed to draw a
 * cover, the stop chips or the day list.
 */

/** Nights a stop covers, at least one: arrive 12 Oct, depart 14 Oct is 2. */
export function stopNights(st) {
  const from = st.arrive_date;
  const to = st.depart_date;
  if (!from || !to || to <= from) return 1;
  return Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000));
}

/**
 * Where a trip sits relative to today: 'now' while it is running, 'soon' with
 * the number of days until it starts, or 'past' once it is over. Past trips
 * sort last and render muted, because a trip you cannot travel any more is
 * still worth reopening but is never the answer to "plan a day".
 */
export function tripStatus(p, today = todayISO()) {
  const from = p.start_date;
  const to = p.end_date || p.start_date;
  if (!from) return { kind: 'none', inDays: null };
  if (to && to < today) return { kind: 'past', inDays: null };
  if (from <= today) return { kind: 'now', inDays: 0 };
  const inDays = Math.round((new Date(from) - new Date(today)) / 86400000);
  return { kind: 'soon', inDays };
}

/** Trips first by how soon they are, past ones last, in their own order. */
export function sortTripsByStatus(plans, today = todayISO()) {
  const rank = { now: 0, soon: 1, none: 2, past: 3 };
  return [...plans].sort((a, b) => {
    const sa = tripStatus(a, today);
    const sb = tripStatus(b, today);
    if (rank[sa.kind] !== rank[sb.kind]) return rank[sa.kind] - rank[sb.kind];
    if (sa.kind === 'past') return (b.end_date || '').localeCompare(a.end_date || '');
    return (a.start_date || '').localeCompare(b.start_date || '');
  });
}

/** True when a trip is running now or starts within the week. */
export function hasImminentTrip(plans, today = todayISO()) {
  return plans.some((p) => {
    const s = tripStatus(p, today);
    return s.kind === 'now' || (s.kind === 'soon' && s.inDays <= 7);
  });
}

function StatusBadge({ status }) {
  const { t } = useI18n();
  if (status.kind === 'now') return <span className="dtcard-badge now">{t('day.tripNow')}</span>;
  if (status.kind === 'past') return <span className="dtcard-badge past">{t('day.tripPast')}</span>;
  if (status.kind === 'soon') {
    const label = status.inDays <= 1
      ? t('day.tripTomorrow')
      : t('day.tripInDays', { n: status.inDays });
    return <span className="dtcard-badge soon">{label}</span>;
  }
  return null;
}

/** "Bruges 2n → Paris 3n", with each stop's flag. Capped so a fourteen-stop
 *  interrail trip does not wrap the card into a paragraph. */
function StopChips({ stops, max = 3 }) {
  const { t } = useI18n();
  const shown = stops.slice(0, max);
  const rest = stops.length - shown.length;
  return (
    <div className="dtcard-stops">
      {shown.map((st, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="dtcard-arrow" aria-hidden="true">→</span>}
          <span className="dtcard-stop">
            {st.country && <CountryFlag country={st.country} size={11} />}
            <b>{cityLabel(st.city)}</b>
            <small>{t('day.nightsShort', { n: stopNights(st) })}</small>
          </span>
        </React.Fragment>
      ))}
      {rest > 0 && <span className="dtcard-stop more">{t('day.plusNStops', { n: rest })}</span>}
    </div>
  );
}

function dateRange(p) {
  if (!p.start_date) return '';
  const end = p.end_date && p.end_date !== p.start_date ? ` → ${fmtDate(p.end_date)}` : '';
  return `${fmtDate(p.start_date)}${end}`;
}

/**
 * One trip. The photo is the cover of the first stop that has one, because a
 * trip whose first stop happens to be missing a catalogue photo is not a trip
 * without a face.
 */
function TripCard({ plan, destinations, onPick }) {
  const { t } = useI18n();
  const today = todayISO();
  const status = tripStatus(plan, today);
  const stops = plan.stops || [];
  const coverStop = stops.find((st) => destinations[st.destination_id]?.image?.url) || stops[0];
  const coverDest = coverStop ? destinations[coverStop.destination_id] : null;
  const label = plan.label || t('day.untitledTrip');
  return (
    <button
      type="button"
      className={`dtcard${status.kind === 'past' ? ' past' : ''}`}
      onClick={() => onPick(plan)}
    >
      <span className="dtcard-photo">
        <HeroImage
          url={coverDest?.image?.url}
          city={coverDest?.city || label}
          iso2={coverDest?.iso2}
          className="dtcard-img"
          maxWidth={960}
          sizes="(max-width: 768px) 82vw, 320px"
          ratio={[16, 9]}
        />
        <span className="dtcard-scrim" aria-hidden="true" />
        <StatusBadge status={status} />
        <span className="dtcard-title">{label}</span>
      </span>
      <span className="dtcard-body">
        {dateRange(plan) && <span className="dtcard-dates">{dateRange(plan)}</span>}
        {stops.length > 0 && <StopChips stops={stops} />}
        <span className="dtcard-go">
          {t('day.planADay')}<ChevronRightIcon size={13} />
        </span>
      </span>
    </button>
  );
}

/**
 * "Which day?" Every day of the trip, grouped under its stop and named in
 * full ("Day 1 · Mon 12 Oct · Bruges"), so picking one answers both the stay
 * question and the date question at once: the flow skips straight past them.
 * Days already gone are disabled rather than hidden, because seeing that day 1
 * and 2 are behind you is how you know which day 3 is.
 */
function WhichDaySheet({ plan, destinations, onClose, onPick }) {
  const { t } = useI18n();
  const today = todayISO();
  const groups = useMemo(() => (plan.stops || []).map((st, stopIndex) => {
    const nights = stopNights(st);
    const dest = destinations[st.destination_id];
    const name = cityLabel(st.city || dest?.city || '');
    const days = [];
    for (let d = 0; d < nights; d += 1) {
      const iso = st.arrive_date ? addDays(st.arrive_date, d) : null;
      days.push({ dayIndex: d, iso, past: Boolean(iso && iso < today) });
    }
    return { stopIndex, name, country: st.country || dest?.country || '', days };
  }), [plan, destinations, today]);

  // Day numbers run across the whole trip, not per stop: "day 5" is what the
  // traveller counts, and restarting at 1 in every city makes two different
  // days share a name.
  let counter = 0;
  return (
    <SheetShell title={t('day.whichDay')} onClose={onClose} className="dtday-sheet">
      <div className="dtday-groups">
        {groups.map((g) => (
          <div className="dtday-group" key={g.stopIndex}>
            <div className="dtday-groupname">
              {g.country && <CountryFlag country={g.country} size={12} />}
              <span>{g.name}</span>
            </div>
            <div className="dtday-chips">
              {g.days.map((d) => {
                counter += 1;
                const n = counter;
                return (
                  <button
                    key={`${g.stopIndex}:${d.dayIndex}`}
                    type="button"
                    className="dtday-chip"
                    disabled={d.past}
                    aria-disabled={d.past}
                    onClick={() => onPick({ stopIndex: g.stopIndex, dayIndex: d.dayIndex })}
                  >
                    <b>{t('day.dayN', { n })}</b>
                    {d.iso && <small>{fmtDate(d.iso, true)}</small>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </SheetShell>
  );
}

/** Two grey cards while the trips are on their way, so the section keeps its
 *  height instead of shunting the question up the page when they land. */
function CardSkeletons({ n = 2 }) {
  return (
    <div className="dtcards" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div className="dtcard skeleton" key={i}>
          <span className="dtcard-photo" />
          <span className="dtcard-body">
            <span className="dtskel-line w40" />
            <span className="dtskel-line w70" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function ContinueTripCards({
  plans, destinations, loading, signedIn, authConfigured,
  onOpenDay, onRequestAuth, onPlanTrip,
}) {
  const { t } = useI18n();
  const [sheetPlan, setSheetPlan] = useState(null);
  const today = todayISO();
  const sorted = useMemo(() => sortTripsByStatus(plans || [], today), [plans, today]);

  // Accounts are off for this deployment: no trips to continue, and no sign-in
  // to offer either.
  if (!authConfigured) return null;

  return (
    <div className="day-landing-section dtsection">
      <div className="trip-block-title">{t('day.continueATrip')}</div>

      {!signedIn ? (
        /* A note in grey type asking somebody to sign in is the weakest thing
           on the page. The offer is a card of its own, with the reason on it
           and the button inside it. */
        <div className="dtsignin">
          <span className="dtsignin-ico" aria-hidden="true"><RouteIcon size={20} /></span>
          <div className="dtsignin-text">
            <b>{t('day.signInTitle')}</b>
            <p>{t('day.signInBody')}</p>
          </div>
          <button type="button" className="dtsignin-btn" onClick={onRequestAuth}>
            {t('day.signIn')}
          </button>
        </div>
      ) : loading ? (
        <CardSkeletons />
      ) : sorted.length === 0 ? (
        <div className="dtempty">
          <p>{t('day.noSavedTrips')}</p>
          <button type="button" className="dtempty-btn" onClick={onPlanTrip}>
            {t('day.planATrip')}
          </button>
        </div>
      ) : (
        <div className="dtcards">
          {sorted.map((p) => (
            <TripCard key={p.id} plan={p} destinations={destinations} onPick={setSheetPlan} />
          ))}
        </div>
      )}

      {sheetPlan && (
        <WhichDaySheet
          plan={sheetPlan}
          destinations={destinations}
          onClose={() => setSheetPlan(null)}
          onPick={({ stopIndex, dayIndex }) => {
            const id = sheetPlan.id;
            setSheetPlan(null);
            onOpenDay(id, stopIndex, dayIndex);
          }}
        />
      )}
    </div>
  );
}

/** The ⋯ menu on a day-plan card. Delete used to be a bare × sitting beside
 *  the row, one mis-tap from the thing it deletes; behind a menu it takes two
 *  deliberate taps and says what it is in words. */
function CardMenu({ onDelete }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div className="dtmenu" ref={ref}>
      <button
        type="button"
        className="dtmenu-btn"
        aria-label={t('day.moreActions')}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <MoreIcon size={15} />
      </button>
      {open && (
        <div className="dtmenu-pop" role="menu">
          <button
            type="button"
            role="menuitem"
            className="dtmenu-item danger"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
          >
            <TrashIcon size={13} />{t('day.deleteDayPlan')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "Your day plans": the standalone plans this device holds. Same card, a
 * shallower 4:3 photo, because these are single days rather than trips and
 * should not out-shout the trips above them.
 */
export function DayPlanCards({ plans, destinations, onOpen, onDelete }) {
  const { t } = useI18n();
  if (!plans.length) return null;
  return (
    <div className="day-landing-section dtsection">
      <div className="trip-block-title">{t('day.yourDayPlans')}</div>
      <div className="dtcards small">
        {plans.map((sp) => {
          const dest = destinations[sp.stops?.[0]?.destinationId];
          const days = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
          const label = sp.label || dest?.city || t('day.dayPlanFallback');
          return (
            <div className="dtcard-wrap" key={sp.id}>
              <button type="button" className="dtcard" onClick={() => onOpen(sp)}>
                <span className="dtcard-photo ratio43">
                  <HeroImage
                    url={dest?.image?.url}
                    city={dest?.city || label}
                    iso2={dest?.iso2}
                    className="dtcard-img"
                    maxWidth={960}
                    sizes="(max-width: 768px) 82vw, 320px"
                    ratio={[4, 3]}
                  />
                  <span className="dtcard-scrim" aria-hidden="true" />
                  <span className="dtcard-title">{label}</span>
                </span>
                <span className="dtcard-body">
                  <span className="dtcard-dates">
                    {fmtDate(sp.startDate)}
                    {days > 1 ? t('day.nDaysSuffix', { n: days }) : ''}
                    {(sp.stops?.length || 1) > 1 ? t('day.nCitiesSuffix', { n: sp.stops.length }) : ''}
                  </span>
                  <span className="dtcard-go">
                    {t('day.openPlan')}<ChevronRightIcon size={13} />
                  </span>
                </span>
              </button>
              <CardMenu onDelete={() => onDelete(sp.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
