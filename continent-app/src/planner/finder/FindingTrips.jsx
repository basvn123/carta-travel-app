import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { CheckIcon } from '../../components/Icons.jsx';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { useKeepTrip, useTripFinder } from './finderHooks.js';
import { stageLines, widenQuestion } from './finderText.js';
import { TripsForYou } from './TripsForYou.jsx';
import { TripCard } from './TripCard.jsx';
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
/**
 * Searching (T797, rebuilt in T867): "Finding trips for the two of you",
 * then the stages of real work, each named from the answers, ticking as
 * the engine finishes it (useTripFinder); the working one carries a live
 * dot. The best trips priced so far show under the stages as cards, so the
 * wait turns into the list. It stands exactly as long as the work: no
 * minimum, no made-up delay. Under reduced motion nothing moves; the
 * stages still tick.
 */
export function FindingTrips({ settings, finder, onBack, onWiden, guide, ui, onOpen, cardRefs, keeper }) {
  const { t, lang } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const when = whenText(t, settings.when, months, bcp47);
  const lines = useMemo(
    () => stageLines(settings, { t, lang, when, data: finder.data, origin: finder.origin, stayTier: finder.stayTier }),
    [settings, finder.data, finder.origin, finder.stayTier, t, lang, when.start, when.end], // eslint-disable-line react-hooks/exhaustive-deps -- when is rebuilt each render from its parts
  );
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

  const working = lines.find((l) => !finder.stages[l.key]);
  const early = finder.early || [];
  return (
    <div className="pf-step tff-load">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} />
      <h2 className="pf-title" tabIndex={-1} ref={titleRef}>{t(`tf.load.title.${kind}`)}</h2>
      <ol className="tff-checks" aria-live="polite">
        {lines.map((l) => {
          const done = finder.stages[l.key];
          const state = done ? 'is-done' : l === working ? 'is-working' : 'is-waiting';
          return (
            <li key={l.key} className={`tff-check ${state}`}>
              <span className="tff-check-mark" aria-hidden="true">{done && <CheckIcon size={12} />}</span>
              <span>{l.text}</span>
              {done && <span className="sr-only">{t('tf.load.done')}</span>}
            </li>
          );
        })}
      </ol>
      {early.length > 0 && (
        <ol className="tff-list tff-early" aria-label={t('tf.load.first')}>
          {early.map((trip) => (
            <li key={trip.id}>
              <TripCard
                trip={trip}
                destinations={finder.data?.destinations}
                onOpen={onOpen}
                ui={ui}
                keep={{ kept: keeper.isKept(trip.id), onKeep: keeper.toggle }}
                ref={(el) => { if (el) cardRefs.current.set(trip.id, el); else cardRefs.current.delete(trip.id); }}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * The finder screen behind question 7 (g:trips): searching, then Trips
 * for you. TripFlow loads it lazily, with lib/recommend, so the Plan tab's
 * first load does not carry the engine.
 *
 *   ui              { NotYet, AirlineMark, useAirlines, airlineName }: TripFlow imports these and
 *                   hands them down. They ship in the Plan tab's chunks
 *                   already; imported from this lazy chunk, rolldown split
 *                   each into a chunk of its own, two more preloads on
 *                   every page (T801 end check).
 *   onBack()        back to question 7
 *   onWiden(id)     reopen one question (the answers line, an empty result)
 *   edits, setEdits the preview's swaps by trip id (kept by TripFlow)
 *   markedId        the trip planned last, marked on the way back
 *   onPlan(plan)    "Plan this trip": the trip's plan (planOf.js)
 *
 * The list shows the moment the trips are ranked: back from the planner
 * the run is memoised, so it is there at once (T867: no minimum stand).
 */
export default function TripFinderScreen({ ui, settings, guide, edits, setEdits, markedId = null, onBack, onWiden, onPlan }) {
  const { lang } = useI18n();
  const finder = useTripFinder(settings);
  const [openId, setOpenId] = useState(null);
  const cardRefs = useRef(new Map());
  const keepWith = { origin: finder.origin?.iata || null, file: finder.input?.flights || null };
  const keeper = useKeepTrip({ destinations: finder.data?.destinations, lang, keepWith });
  const all = (finder.trips || finder.early || []).map((x) => edits[x.id] || x);
  const open = openId ? all.find((x) => x.id === openId) : null;
  const ready = Boolean(finder.trips && finder.trips.length);
  return (
    <>
      {ready ? (
        <TripsForYou
          settings={settings}
          trips={all}
          destinations={finder.data?.destinations}
          originName={settings.from?.name || finder.origin?.name || ''}
          markedId={markedId}
          ui={ui}
          onBack={onBack}
          onReopen={onWiden}
          onOpen={(trip) => setOpenId(trip.id)}
          onPlan={(trip) => onPlan(planOf(trip))}
          cardRefs={cardRefs}
          keeper={keeper}
        />
      ) : (
        <FindingTrips
          settings={settings}
          finder={finder}
          guide={guide}
          onBack={onBack}
          onWiden={onWiden}
          ui={ui}
          onOpen={(trip) => setOpenId(trip.id)}
          cardRefs={cardRefs}
          keeper={keeper}
        />
      )}
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
