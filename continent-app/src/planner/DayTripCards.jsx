import React, { useMemo, useState } from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { SheetShell } from '../browse/SheetShell.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useDismiss } from './DayPlanPanel.jsx';
import { cityLabel } from '../lib/placeName.js';
import { addDays, todayISO, fmtDate } from '../lib/dates.js';
import { MoreIcon, TrashIcon, ChevronRightIcon } from '../components/Icons.jsx';
import { Card, Button } from '../components/ui/index.js';

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

/** "On now", "Tomorrow", "In 5 days", "Past": said in the meta line, never
 *  printed on the photograph (carta-design, never-do 4). */
function statusText(status, t) {
  if (status.kind === 'now') return t('day.tripNow');
  if (status.kind === 'past') return t('day.tripPast');
  if (status.kind === 'soon') return status.inDays <= 1 ? t('day.tripTomorrow') : t('day.tripInDays', { n: status.inDays });
  return '';
}

/** A trip with no name of its own is called by its towns, never "Untitled". */
export function tripName(plan, t) {
  if (plan.label) return plan.label;
  const towns = [...new Set((plan.stops || []).map((st) => cityLabel(st.city || '')).filter(Boolean))];
  if (!towns.length) return t('day.untitledTrip');
  if (towns.length <= 3) return towns.join(', ');
  return t('day.tripTownsMore', { towns: towns.slice(0, 2).join(', '), n: towns.length - 2 });
}

/** Days of the trip still ahead of today, the ones a day plan can be for. */
function daysAhead(plan, today) {
  let n = 0;
  for (const st of plan.stops || []) {
    for (let d = 0; d < stopNights(st); d += 1) {
      const iso = st.arrive_date ? addDays(st.arrive_date, d) : null;
      if (!iso || iso >= today) n += 1;
    }
  }
  return n;
}

function dateRange(p, t) {
  if (!p.start_date) return '';
  if (!p.end_date || p.end_date === p.start_date) return fmtDate(p.start_date, true);
  return t('day.dateRange', { from: fmtDate(p.start_date, true), to: fmtDate(p.end_date, true) });
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
  const label = tripName(plan, t);
  const ahead = daysAhead(plan, today);
  const when = statusText(status, t);
  return (
    <Card
      layout="row"
      className={`dtrow${status.kind === 'past' ? ' is-past' : ''}`}
      media={(
        <HeroImage
          url={coverDest?.image?.url}
          city={coverDest?.city || label}
          iso2={coverDest?.iso2}
          maxWidth={240}
          sizes="72px"
          ratio={[1, 1]}
        />
      )}
      title={label}
      onOpen={() => onPick(plan)}
      meta={(
        <>
          <span>{dateRange(plan, t)}</span>
          {status.kind === 'now' && ahead > 0 && (
            <span>{t(ahead === 1 ? 'day.daysToPlanOne' : 'day.daysToPlan', { n: ahead })}</span>
          )}
          {when && <span className={`dtrow-when ${status.kind}`}>{when}</span>}
        </>
      )}
      actions={<ChevronRightIcon size={18} className="dtrow-go" />}
    />
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

/**
 * "Plan a day of your trip" (T433). The owner found the old block unclear:
 * a sign-in paragraph about "every trip you save becoming a set of days".
 * It now says what it does in its heading, lists each saved trip as one
 * compact row (photo, name, dates, how many of its days are still ahead),
 * and a guest sees one line and one button.
 *
 *   lead  the trip is on now or this week: it sits above the question
 */
export function ContinueTripCards({
  plans, destinations, loading, failed = false, onRetry, signedIn, authConfigured,
  onOpenDay, onRequestAuth, onPlanTrip, lead = false,
}) {
  const { t } = useI18n();
  const [sheetPlan, setSheetPlan] = useState(null);
  const today = todayISO();
  const sorted = useMemo(() => sortTripsByStatus(plans || [], today), [plans, today]);
  // Past trips cannot have a day planned; they stay in My trips.
  const live = sorted.filter((p) => tripStatus(p, today).kind !== 'past');

  // Accounts are off for this deployment: no trips to continue, and no sign-in
  // to offer either.
  if (!authConfigured) return null;

  return (
    <section className={`dayw-section dtsection${lead ? ' is-lead' : ''}`} aria-labelledby="dt-trips-h">
      <h2 className="dayw-section-h" id="dt-trips-h">{t('day.planTripDay')}</h2>

      {!signedIn ? (
        <div className="dtsignin">
          <p className="dtsignin-text">{t('day.signInLine')}</p>
          <Button size="sm" onClick={onRequestAuth}>{t('day.signIn')}</Button>
        </div>
      ) : loading ? (
        <CardSkeletons />
      ) : failed ? (
        <ErrorBlock message={t('state.savedFailed')} onRetry={onRetry} retryLabel={t('layer.retry')} />
      ) : live.length === 0 ? (
        <div className="dtsignin">
          <p className="dtsignin-text">{t('day.noSavedTrips')}</p>
          <Button size="sm" onClick={onPlanTrip}>{t('day.planATrip')}</Button>
        </div>
      ) : (
        <div className="dtrows">
          {live.slice(0, 4).map((p) => (
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
    </section>
  );
}

/** The ⋯ menu on a day-plan card. Delete used to be a bare × sitting beside
 *  the row, one mis-tap from the thing it deletes; behind a menu it takes two
 *  deliberate taps and says what it is in words. */
function CardMenu({ onDelete }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // T409 (brief V5-2): the shared popover hook, so focus enters the menu,
  // the arrows walk it and Escape hands focus back to the button.
  const ref = useDismiss(open, () => setOpen(false));
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
  const [all, setAll] = useState(false);
  if (!plans.length) return null;
  const shown = all ? plans : plans.slice(0, 3);
  return (
    <section className="dayw-section dtsection" aria-labelledby="dt-plans-h">
      <h2 className="dayw-section-h" id="dt-plans-h">{t('day.yourDayPlans')}</h2>
      <div className="dtrows">
        {shown.map((sp) => {
          const dest = destinations[sp.stops?.[0]?.destinationId];
          const days = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
          const label = sp.label || (dest?.city ? cityLabel(dest.city) : t('day.dayPlanFallback'));
          return (
            <Card
              key={sp.id}
              layout="row"
              className="dtrow"
              media={(
                <HeroImage url={dest?.image?.url} city={dest?.city || label} iso2={dest?.iso2} maxWidth={240} sizes="72px" ratio={[1, 1]} />
              )}
              title={label}
              onOpen={() => onOpen(sp)}
              meta={(
                <>
                  <span>{fmtDate(sp.startDate, true)}</span>
                  {days > 1 && <span>{t('day.nDays', { n: days })}</span>}
                </>
              )}
              actions={<CardMenu onDelete={() => onDelete(sp.id)} />}
            />
          );
        })}
      </div>
      {plans.length > 3 && (
        <Button variant="quiet" size="sm" className="dtrows-more" onClick={() => setAll((v) => !v)}>
          {all ? t('dayex.showLess') : t('dayex.showMore', { n: plans.length - 3 })}
        </Button>
      )}
    </section>
  );
}
