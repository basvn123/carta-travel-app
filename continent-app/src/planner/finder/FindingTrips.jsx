import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { CheckIcon } from '../../components/Icons.jsx';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { SLOT_ROWS } from '../../lib/recommend/slots.js';
import { stayTierFor } from '../../lib/recommend/adapters/stay.js';
import { STAGES, useLoaderDone, useTripFinder } from './finderHooks.js';
import { answerChips, joinList, likeLabel, widenQuestion } from './finderText.js';
import { TripsForYou } from './TripsForYou.jsx';
import { TripPreview } from './TripPreview.jsx';
import { planOf } from './planOf.js';
import '../../styles/87-trip-finder.css';

// Decide together (T808) rides in this chunk: App opens it from a link. Its
// own chunk made the bundler split SheetShell out, one more preload a page.
export { default as TogetherSheet } from './TogetherSheet.jsx';
// The kept trips' price since (T807), for the Plan home and My trips.
export { dropsFor } from '../../lib/recommend/kept.js';
// T864, T865: two doors' screens ride in this chunk with the engine they run.
export { FlightFirstScreen, KnowBuildScreen } from './DoorScreens.jsx';

const PARTY_TITLE = { solo: 'solo', couple: 'couple', friends: 'friends', family: 'family', group: 'group' };

/** The four lines of real work, in the traveller's words. */
function checkLines(settings, { t, lang, when, originName }) {
  const g = settings.guide;
  const dates = when.start && when.end ? t('tf.chip.dates', { start: when.start, end: when.end }) : when.start;
  const flights = g.reach === 'overland'
    ? t('tf.load.overland', { city: originName })
    : dates ? t('tf.load.flights', { city: originName, dates }) : t('tf.load.flightsAny', { city: originName });
  const stayRow = SLOT_ROWS.find((r) => r.id === 'stay');
  const tier = stayTierFor({ stayTier: settings.stayTier || null, priority: settings.priority }, stayRow);
  const nights = settings.when.mode === 'exact' && settings.when.start && settings.when.end
    ? Math.max(1, Math.round((Date.parse(`${settings.when.end}T12:00:00Z`) - Date.parse(`${settings.when.start}T12:00:00Z`)) / 86400000))
    : settings.when.nights;
  const likes = g.likes.map((k) => likeLabel(t, k)).map((x) => (lang === 'de' ? x : x.toLocaleLowerCase(lang)));
  return {
    flights,
    stays: t(`tf.load.stays.${tier}`, { n: nights }),
    food: t('tf.load.food'),
    likes: likes.length ? t('tf.load.likes', { likes: joinList(likes, lang) }) : t('tf.load.likesAny'),
  };
}

/**
 * The loader (T797): the answers echoed back as chips, then four checks
 * that tick as the engine finishes each stage. It stands as long as the
 * work, and at least 1.2 s so it can be read; a tap anywhere skips to the
 * trips once they exist. Under reduced motion nothing moves; the checks
 * still tick.
 */
export function FindingTrips({ settings, finder, onBack, onWiden, guide, onSkip }) {
  const { t, lang } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const when = whenText(t, settings.when, months, bcp47);
  const originName = finder.origin?.name || '';
  const lines = useMemo(() => checkLines({ ...settings, stayTier: finder.input?.stayTier }, { t, lang, when, originName }),
    [settings, finder.input, t, lang, when.start, when.end, originName]); // eslint-disable-line react-hooks/exhaustive-deps -- when is rebuilt each render from its parts
  const chips = answerChips(settings, { t, lang, originName, when, locale: lang });
  const failed = finder.trips && finder.trips.length === 0;
  const kind = PARTY_TITLE[settings.party.kind] || 'solo';

  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, []);

  if (failed) {
    const q = widenQuestion(settings, guide);
    return (
      <div className="pf-step tff-load">
        <SheetHead onBack={onBack} backLabel={t('pf.back')} />
        <h2 className="pf-title" tabIndex={-1} ref={titleRef}>{t('tf.load.failedTitle')}</h2>
        <p className="tff-fail" role="status">{t(finder.error ? 'tf.load.error' : 'tf.load.none')}</p>
        <div className="pf-foot">
          <Button variant="primary" block onClick={() => onWiden(q)}>
            {t(q === 'g:budget' ? 'tf.load.widenBudget' : q === 'g:reach' ? 'tf.load.widenReach' : 'tf.load.widenAny')}
          </Button>
        </div>
      </div>
    );
  }

  const working = STAGES.find((s) => !finder.stages[s]);
  return (
    // A tap anywhere skips once the trips exist; the button below is the
    // same skip for a keyboard.
    <div className="pf-step tff-load" onClick={onSkip}>
      <SheetHead onBack={onBack} backLabel={t('pf.back')} />
      <h2 className="pf-title" tabIndex={-1} ref={titleRef}>{t(`tf.load.title.${kind}`)}</h2>
      {chips.length > 0 && (
        <ul className="tff-chips" aria-label={t('tf.chip.label')}>
          {chips.map((c) => <li key={c.id} className="tff-chip">{c.label}</li>)}
        </ul>
      )}
      <ol className="tff-checks" aria-live="polite">
        {STAGES.map((s) => {
          const state = finder.stages[s] ? 'is-done' : s === working ? 'is-working' : 'is-waiting';
          return (
            <li key={s} className={`tff-check ${state}`}>
              <span className="tff-check-mark" aria-hidden="true">{finder.stages[s] && <CheckIcon size={12} />}</span>
              <span>{lines[s]}</span>
              {finder.stages[s] && <span className="sr-only">{t('tf.load.done')}</span>}
            </li>
          );
        })}
      </ol>
      {finder.trips && (
        <div className="tff-skip">
          <Button variant="quiet" size="sm" onClick={onSkip}>{t('tf.load.show')}</Button>
        </div>
      )}
    </div>
  );
}

/**
 * The finder screen behind question 7 (g:trips): the loader, then Trips
 * for you. TripFlow loads it lazily, with lib/recommend, so the Plan tab's
 * first load does not carry the engine.
 *
 *   ui              { NotYet, AirlineMark, useAirlines, airlineName }: TripFlow imports these and
 *                   hands them down. They ship in the Plan tab's chunks
 *                   already; imported from this lazy chunk, rolldown split
 *                   each into a chunk of its own, two more preloads on
 *                   every page (T801 end check).
 *   onBack()        back to question 7
 *   onWiden(id)     reopen one question (the answers bar, an empty result)
 *   edits, setEdits the preview's swaps by trip id (kept by TripFlow)
 *   markedId        the trip planned last, marked on the way back
 *   onPlan(plan)    "Plan this trip": the trip's plan (planOf.js)
 */
export default function TripFinderScreen({ ui, settings, guide, edits, setEdits, markedId = null, onBack, onWiden, onPlan }) {
  const finder = useTripFinder(settings);
  const ready = Boolean(finder.trips);
  // Back from the planner the trips are already known: no loader again.
  const { done, skip } = useLoaderDone(ready, markedId ? 0 : 1200);
  const [openId, setOpenId] = useState(null);
  const cardRefs = useRef(new Map());
  if (!done || !finder.trips.length) {
    return <FindingTrips settings={settings} finder={finder} guide={guide} onBack={onBack} onWiden={onWiden} onSkip={skip} />;
  }
  const trips = finder.trips.map((x) => edits[x.id] || x);
  const open = openId ? trips.find((x) => x.id === openId) : null;
  const keepWith = { origin: finder.origin?.iata || null, file: finder.input?.flights || null };
  return (
    <>
      <TripsForYou
        settings={settings}
        trips={trips}
        destinations={finder.data?.destinations}
        originName={finder.origin?.name || ''}
        markedId={markedId}
        ui={ui}
        onBack={onBack}
        onReopen={onWiden}
        onOpen={(trip) => setOpenId(trip.id)}
        onPlan={(trip) => onPlan(planOf(trip))}
        cardRefs={cardRefs}
        keepWith={keepWith}
      />
      {open && (
        <TripPreview
          trip={open}
          settings={settings}
          destinations={finder.data?.destinations}
          ui={ui}
          keepWith={keepWith}
          onClose={() => setOpenId(null)}
          onPlan={(trip) => { setOpenId(null); onPlan(planOf(trip)); }}
          onEdit={(next) => setEdits((e) => ({ ...e, [open.id]: next }))}
        />
      )}
    </>
  );
}
